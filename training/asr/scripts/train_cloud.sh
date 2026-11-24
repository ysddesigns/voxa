#!/usr/bin/env bash
# End-to-end cloud training runner for Voxa Nigerian ASR model.
# Designed to run on a Linux GPU instance (RunPod, Lambda Labs, Vast.ai, GCP/AWS).
#
# Usage:
#   # With extracted NaijaVoices dataset (from naijadata.vercel.app):
#   DATA_DIR=/workspace/data bash scripts/train_cloud.sh
#
# Environment variables:
#   DATA_DIR       Base directory holding datasets (default: data/raw)
#   MODEL_SIZE     Zipformer size: small (default for mobile) or medium
#   STAGE_A_EPOCHS Epochs for Nigerian English + Pidgin (default: 10)
#   STAGE_B_EPOCHS Epochs for all 5 languages (default: 20)
#   VOCAB_SIZE     Target BPE vocabulary size (default: 2000)

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

MODEL_SIZE="${MODEL_SIZE:-small}"
DATA_DIR="${DATA_DIR:-$HERE/data/raw}"
VOCAB_SIZE="${VOCAB_SIZE:-2000}"
STAGE_A_EPOCHS="${STAGE_A_EPOCHS:-10}"
STAGE_B_EPOCHS="${STAGE_B_EPOCHS:-20}"

echo "=========================================================="
echo " Voxa Offline Nigerian ASR: End-to-End Cloud Trainer"
echo " Target Model Size: $MODEL_SIZE"
echo " Data Directory:    $DATA_DIR"
echo " Vocabulary Size:   $VOCAB_SIZE"
echo "=========================================================="

# 1. Environment & Dependencies
if [ ! -f "env.sh" ] || [ ! -d "icefall" ]; then
  echo "==> Running environment setup (setup.sh)..."
  bash setup.sh
fi
source env.sh

# 2. Check GPU
python3 -c "import torch; assert torch.cuda.is_available(), 'CUDA GPU not detected! ASR training requires NVIDIA GPU.'"
echo "==> GPU verified: $(python3 -c 'import torch; print(torch.cuda.get_device_name(0))')"

# 3. Discover Data Sources
SOURCES=()

# Check for NaijaVoices (languages: ha, yo, ig)
for lang in ha yo ig; do
  NV_CANDIDATE="$DATA_DIR/naijavoices/$lang"
  if [ -d "$NV_CANDIDATE" ] || [ -f "$NV_CANDIDATE.csv" ]; then
    SOURCES+=(--source "naijavoices:$NV_CANDIDATE:$lang")
  fi
done

# Check for Common Voice Nigerian English & languages
if [ -d "$DATA_DIR/cv-en" ]; then
  SOURCES+=(--source "commonvoice-ng:$DATA_DIR/cv-en:en")
fi
for lang in ha yo ig; do
  if [ -d "$DATA_DIR/cv-$lang" ]; then
    SOURCES+=(--source "commonvoice:$DATA_DIR/cv-$lang:$lang")
  fi
done

# Check for FLEURS
for lang in ha yo ig; do
  if [ -d "$DATA_DIR/fleurs/${lang}_ng" ]; then
    SOURCES+=(--source "fleurs:$DATA_DIR/fleurs/${lang}_ng:$lang")
  fi
done

# Check for custom Voxa JSONL
if [ -f "$DATA_DIR/voxa.jsonl" ]; then
  SOURCES+=(--source "jsonl:$DATA_DIR/voxa.jsonl")
fi

if [ ${#SOURCES[@]} -eq 0 ]; then
  echo "ERROR: No datasets detected in $DATA_DIR!"
  echo "Please place extracted datasets in $DATA_DIR (e.g. NaijaVoices from naijadata.vercel.app)."
  echo "Expected structure:"
  echo "  $DATA_DIR/naijavoices/ha (or metadata.csv)"
  echo "  $DATA_DIR/naijavoices/yo"
  echo "  $DATA_DIR/naijavoices/ig"
  echo "  $DATA_DIR/cv-en"
  exit 1
fi

echo "==> Detected sources: ${SOURCES[*]}"

# 4. Step 1: Lock Test Speakers (Splits)
if [ ! -f "splits/speakers.json" ]; then
  echo "==> Step 1: Locking test speakers..."
  python3 scripts/01_lock_test_speakers.py "${SOURCES[@]}"
else
  echo "==> Step 1: Using existing splits/speakers.json"
fi

# 5. Step 2: Prepare Manifests
echo "==> Step 2: Preparing Lhotse manifests..."
python3 scripts/02_prepare.py "${SOURCES[@]}"

# 6. Step 4: Train Shared Multilingual BPE Tokenizer
echo "==> Step 4: Training multilingual BPE vocabulary ($VOCAB_SIZE pieces)..."
python3 scripts/04_train_bpe.py --vocab-size "$VOCAB_SIZE"

# 7. Step 5: Compute Filterbank Features
echo "==> Step 5: Computing filterbank features..."
python3 scripts/05_compute_fbank.py --jobs "$(nproc)"

# 8. Step 6: Stage A - Fine-tune on Nigerian English & Pidgin
echo "==> Step 6 (Stage A): Training Nigerian English + Pidgin ($STAGE_A_EPOCHS epochs)..."
EPOCHS="$STAGE_A_EPOCHS" bash scripts/06_finetune.sh english "$MODEL_SIZE"

# 9. Step 6: Stage B - Fine-tune on All 5 Languages
echo "==> Step 6 (Stage B): Training Multilingual ($STAGE_B_EPOCHS epochs)..."
EPOCHS="$STAGE_B_EPOCHS" VOCAB="$VOCAB_SIZE" bash scripts/06_finetune.sh multilingual "$MODEL_SIZE"

# 10. Step 7: Export to ONNX Zipformer Pack
echo "==> Step 7: Exporting to ONNX Listening Pack..."
bash scripts/07_export.sh multilingual "$MODEL_SIZE" "$STAGE_B_EPOCHS" 3

# Link exported pack as packs/listen-ng
PACK_NAME="multilingual-$MODEL_SIZE-e$STAGE_B_EPOCHS-avg3"
if [ -d "packs/$PACK_NAME" ]; then
  rm -rf "packs/listen-ng"
  cp -r "packs/$PACK_NAME" "packs/listen-ng"
  echo "==> Saved ready-to-use pack to packs/listen-ng"
fi

# 11. Step 8: Score Word Error Rate
echo "==> Step 8: Scoring model against locked test speakers..."
python3 scripts/08_score.py --pack "packs/listen-ng" --languages en,pcm,ha,yo,ig --name "voxa-$MODEL_SIZE"

echo "=========================================================="
echo " Training Complete!"
echo " Model pack ready at: $HERE/packs/listen-ng"
echo " Copy packs/listen-ng into Voxa mobile assets or model server."
echo "=========================================================="
