#!/usr/bin/env bash
# End-to-end cloud training runner for Voxa Nigerian ASR model.
# Designed to run on a Linux GPU instance (RunPod, Lambda Labs, Vast.ai, GCP/AWS).
#
# Usage:
#   # With extracted NaijaVoices dataset (from naijadata.vercel.app):
#   DATA_DIR=/workspace/data bash scripts/train_cloud.sh
#   REGION=north DATA_DIR=/workspace/data bash scripts/train_cloud.sh   # Hausa + English, mixed
#   REGION=south DATA_DIR=/workspace/data bash scripts/train_cloud.sh   # Pidgin + English, mixed
#
# Environment variables:
#   DATA_DIR       Base directory holding datasets (default: data/raw)
#   MODEL_SIZE     Zipformer size: small (default for mobile) or medium
#   STAGE_A_EPOCHS Epochs for Nigerian English + Pidgin (default: 10)
#   STAGE_B_EPOCHS Epochs for all 5 languages (default: 20)
#   VOCAB_SIZE     Target BPE vocabulary size (default: 2000)
#   REGION         all (default: five languages), north (en, pcm, ha, code-switched Hausa-English)
#                  or south (en, pcm, code-switched Pidgin-English). Region models are what Live
#                  should run for meetings: see 06_finetune.sh.
#   SYNTH_HOURS    Hours of joined code-switched clips for a region model (default: 50)
#   STOP_AFTER_PREP  1: stop once the data is prepared (steps 1 to 5), before any training
#
# Datasets downloaded by scripts/fetch_data.py go in DATA_DIR/fetched/*.jsonl.
# DATA_DIR/test-speakers.txt (one speaker id a line) puts those speakers in the test set, always.
# Running this again after it stops (a Colab session ending) carries on: finished steps and
# epochs are skipped, and the word-piece vocabulary is kept, so resumed training stays consistent.
#
# Code-switched recordings are picked up from DATA_DIR too:
#   DATA_DIR/cs-*.jsonl                         transcribed meetings, "language": "cs-ha" or "cs-pcm"
#   DATA_DIR/donated/*/donate/recordings.jsonl  unzipped Donate your voice files

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

MODEL_SIZE="${MODEL_SIZE:-small}"
DATA_DIR="${DATA_DIR:-$HERE/data/raw}"
VOCAB_SIZE="${VOCAB_SIZE:-2000}"
STAGE_A_EPOCHS="${STAGE_A_EPOCHS:-10}"
STAGE_B_EPOCHS="${STAGE_B_EPOCHS:-20}"
REGION="${REGION:-all}"
SYNTH_HOURS="${SYNTH_HOURS:-50}"
case "$REGION" in all|north|south) ;; *) echo "REGION must be all, north or south"; exit 1 ;; esac

echo "=========================================================="
echo " Voxa Offline Nigerian ASR: End-to-End Cloud Trainer"
echo " Target Model Size: $MODEL_SIZE"
echo " Data Directory:    $DATA_DIR"
echo " Vocabulary Size:   $VOCAB_SIZE"
echo " Region:            $REGION"
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

# Local languages this run trains on: a region model never reads Yoruba or Igbo it will not use.
case "$REGION" in
  north) LOCAL_LANGS="ha" ;;
  south) LOCAL_LANGS="" ;;
  *)     LOCAL_LANGS="ha yo ig" ;;
esac

# Check for NaijaVoices (languages: ha, yo, ig): a folder per language, or the compressed
# download's single metadata.csv ("~"-separated, all three languages) in DATA_DIR/naijavoices
for lang in $LOCAL_LANGS; do
  NV_CANDIDATE="$DATA_DIR/naijavoices/$lang"
  if [ -d "$NV_CANDIDATE" ] || [ -f "$NV_CANDIDATE.csv" ]; then
    SOURCES+=(--source "naijavoices:$NV_CANDIDATE:$lang")
  elif [ -f "$DATA_DIR/naijavoices/metadata.csv" ]; then
    SOURCES+=(--source "naijavoices:$DATA_DIR/naijavoices:$lang")
  fi
done

# Check for Common Voice Nigerian English & languages
if [ -d "$DATA_DIR/cv-en" ]; then
  SOURCES+=(--source "commonvoice-ng:$DATA_DIR/cv-en:en")
fi
for lang in $LOCAL_LANGS; do
  if [ -d "$DATA_DIR/cv-$lang" ]; then
    SOURCES+=(--source "commonvoice:$DATA_DIR/cv-$lang:$lang")
  fi
done

# Check for FLEURS
for lang in $LOCAL_LANGS; do
  if [ -d "$DATA_DIR/fleurs/${lang}_ng" ]; then
    SOURCES+=(--source "fleurs:$DATA_DIR/fleurs/${lang}_ng:$lang")
  fi
done

# Check for custom Voxa JSONL
if [ -f "$DATA_DIR/voxa.jsonl" ]; then
  SOURCES+=(--source "jsonl:$DATA_DIR/voxa.jsonl")
fi

# Downloads (scripts/fetch_data.py), code-switched meeting transcripts and donated recordings
for f in "$DATA_DIR"/fetched/*.jsonl "$DATA_DIR"/cs-*.jsonl "$DATA_DIR"/donated/*/donate/recordings.jsonl; do
  [ -f "$f" ] && SOURCES+=(--source "jsonl:$f")
done

if [ ${#SOURCES[@]} -eq 0 ]; then
  echo "ERROR: No datasets detected in $DATA_DIR!"
  echo "Download some with scripts/fetch_data.py --out $DATA_DIR/fetched, or place extracted datasets in $DATA_DIR."
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
  LOCK_ARGS=()
  [ -f "$DATA_DIR/test-speakers.txt" ] && LOCK_ARGS=(--test-speakers "$DATA_DIR/test-speakers.txt")
  python3 scripts/01_lock_test_speakers.py "${SOURCES[@]}" "${LOCK_ARGS[@]}"
else
  echo "==> Step 1: Using existing splits/speakers.json"
fi

# 5. Step 2: Prepare Manifests. Skipped when the sources have not changed since the last run; when
# they have, features are recomputed too (step 5 otherwise keeps any it already has).
STAMP="data/manifests/.sources"
sources_state() {
  # Each source, and the size of its file when it is one (a jsonl grows as fetch_data.py adds clips).
  for s in "${SOURCES[@]}"; do
    echo "$s"
    f="${s#*:}"
    [ -f "$f" ] || f="${f%:*}"
    if [ -f "$f" ]; then stat -c '%s' "$f"; fi
  done
}
NOW="$(sources_state)"
if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$NOW" ] && compgen -G "data/manifests/voxa_cuts_train_*.jsonl.gz" > /dev/null; then
  echo "==> Step 2: Sources unchanged; using existing manifests"
else
  echo "==> Step 2: Preparing Lhotse manifests..."
  python3 scripts/02_prepare.py "${SOURCES[@]}"
  rm -f data/fbank/voxa_cuts_*.jsonl.gz
  printf '%s' "$NOW" > "$STAMP"
fi

# 6. Step 2b: joined code-switched clips (region models only)
case "$REGION" in
  north) LOCAL=ha ;;
  south) LOCAL=pcm ;;
  *) LOCAL="" ;;
esac
if [ -n "$LOCAL" ] && [ ! -f "data/manifests/voxa_cuts_train_cs-$LOCAL-synth.jsonl.gz" ]; then
  echo "==> Step 2b: Joining $SYNTH_HOURS h of $LOCAL-English code-switched clips..."
  python3 scripts/02b_codeswitch.py --local "$LOCAL" --hours "$SYNTH_HOURS"
fi

# 7. Step 4: BPE vocabulary (stage english and south keep the English one). Never rebuilt once made:
# a checkpoint only fits the vocabulary it was trained with.
case "$REGION" in
  all)   BPE_DIR="data/lang_bpe_$VOCAB_SIZE";       BPE_ARGS=() ;;
  north) BPE_DIR="data/lang_bpe_north_$VOCAB_SIZE"; BPE_ARGS=(--languages en,pcm,ha,cs-ha) ;;
  *)     BPE_DIR="" ;;
esac
if [ -n "$BPE_DIR" ] && [ -f "$BPE_DIR/bpe.model" ]; then
  echo "==> Step 4: Using existing $BPE_DIR"
elif [ -n "$BPE_DIR" ]; then
  echo "==> Step 4: Training $REGION BPE vocabulary ($VOCAB_SIZE pieces)..."
  python3 scripts/04_train_bpe.py --vocab-size "$VOCAB_SIZE" "${BPE_ARGS[@]}" --out "$BPE_DIR"
fi

# 7. Step 5: Compute Filterbank Features
echo "==> Step 5: Computing filterbank features..."
python3 scripts/05_compute_fbank.py --jobs "$(nproc)"

if [ "${STOP_AFTER_PREP:-0}" = 1 ]; then
  echo "==> Data prepared (STOP_AFTER_PREP=1). Run again without it to train."
  exit 0
fi

# 8. Step 6: Stage A - Fine-tune on Nigerian English & Pidgin
echo "==> Step 6 (Stage A): Training Nigerian English + Pidgin ($STAGE_A_EPOCHS epochs)..."
EPOCHS="$STAGE_A_EPOCHS" bash scripts/06_finetune.sh english "$MODEL_SIZE"

# 9. Step 6: Stage B - all five languages, or the region model
case "$REGION" in
  all)   STAGE=multilingual; PACK_ID=listen-ng;       LANGS=en,pcm,ha,yo,ig ;;
  north) STAGE=north;        PACK_ID=listen-ng-north; LANGS=en,pcm,ha,cs-ha ;;
  south) STAGE=south;        PACK_ID=listen-ng-south; LANGS=en,pcm,cs-pcm ;;
esac
[ "$STAGE" = south ] && STAGE_B_EPOCHS="${SOUTH_EPOCHS:-10}"
echo "==> Step 6 (Stage B): Training $STAGE ($STAGE_B_EPOCHS epochs)..."
FROM="$HERE/exp/english-$MODEL_SIZE/epoch-$STAGE_A_EPOCHS.pt" EPOCHS="$STAGE_B_EPOCHS" VOCAB="$VOCAB_SIZE" bash scripts/06_finetune.sh "$STAGE" "$MODEL_SIZE"

# 10. Step 7: Export to ONNX Zipformer Packs: live captions, and a longer look-ahead for after the meeting
echo "==> Step 7: Exporting to ONNX Listening Packs..."
VOCAB="$VOCAB_SIZE" bash scripts/07_export.sh "$STAGE" "$MODEL_SIZE" "$STAGE_B_EPOCHS" 3
VOCAB="$VOCAB_SIZE" CHUNK=64 LEFT=256 bash scripts/07_export.sh "$STAGE" "$MODEL_SIZE" "$STAGE_B_EPOCHS" 3

PACK_NAME="$STAGE-$MODEL_SIZE-e$STAGE_B_EPOCHS-avg3"
if [ -d "packs/$PACK_NAME" ]; then
  rm -rf "packs/$PACK_ID" "packs/$PACK_ID-full"
  cp -r "packs/$PACK_NAME" "packs/$PACK_ID"
  [ -d "packs/$PACK_NAME-c64" ] && cp -r "packs/$PACK_NAME-c64" "packs/$PACK_ID-full"
  echo "==> Saved ready-to-use packs to packs/$PACK_ID (live) and packs/$PACK_ID-full (after the meeting)"
fi

# 11. Step 8: Score Word Error Rate, the way Live decodes (beam search)
echo "==> Step 8: Scoring model against locked test speakers..."
python3 scripts/08_score.py --pack "packs/$PACK_ID" --languages "$LANGS" --decoding modified_beam_search --name "voxa-$REGION-$MODEL_SIZE"
[ -d "packs/$PACK_ID-full" ] && python3 scripts/08_score.py --pack "packs/$PACK_ID-full" --languages "$LANGS" --decoding modified_beam_search --name "voxa-$REGION-$MODEL_SIZE-full"

echo "=========================================================="
echo " Training Complete!"
echo " Model pack ready at: $HERE/packs/$PACK_ID"
echo " Copy packs/$PACK_ID into Voxa mobile assets or model server."
echo "=========================================================="
