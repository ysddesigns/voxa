#!/usr/bin/env bash
# Step 6: fine-tune with icefall's zipformer/finetune.py, reading Voxa's data (recipe/asr_datamodule.py).
#
#   bash scripts/06_finetune.sh english medium        # stage A: Nigerian English + Pidgin
#   bash scripts/06_finetune.sh multilingual medium   # stage B: all five languages, new vocabulary
#   bash scripts/06_finetune.sh english small         # the same for the lite-phone build
#
# Settings by environment variable (defaults in brackets):
#   GPUS [all visible]  EPOCHS [english 10, multilingual 20]  MAX_DURATION [600 seconds of audio a batch]
#   BASE_LR [english 0.0045, multilingual 0.015]  MUSAN [0: no noise mixing, or 1 with musan_cuts in data/fbank]
#   FROM [stage B: exp/english-<size>/epoch-<EPOCHS of stage A>.pt]  VOCAB [2000]
#
# Stage A keeps the starting model's vocabulary and starts every part of the model from it.
# Stage B changes the vocabulary, so only the encoder (what the model has learnt about sound)
# carries over from stage A; the decoder and joiner start fresh, hence the higher learning rate.
set -euo pipefail

STAGE="${1:?english or multilingual}"
SIZE="${2:?medium or small}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
: "${ICEFALL_ASR_DIR:?source env.sh first}"
source "$HERE/scripts/model_size.sh" "$SIZE"

GPUS="${GPUS:-$(python -c 'import torch; print(torch.cuda.device_count())')}"
MAX_DURATION="${MAX_DURATION:-600}"
MUSAN="${MUSAN:-0}"
EXP="$HERE/exp/$STAGE-$SIZE"

case "$SIZE" in
  medium) BASE_CKPT="$HERE/base/medium/exp/epoch-99.pt" ;;
  small)  BASE_CKPT="$HERE/base/small/exp/epoch-30.pt" ;;
esac

case "$STAGE" in
  english)
    EPOCHS="${EPOCHS:-10}"
    STAGE_ARGS=(
      --bpe-model "$HERE/base/$SIZE/data/lang_bpe_500/bpe.model"
      --finetune-ckpt "$BASE_CKPT"
      --voxa-languages en,pcm --voxa-upper 1
      --base-lr "${BASE_LR:-0.0045}"
    )
    ;;
  multilingual)
    EPOCHS="${EPOCHS:-20}"
    VOCAB="${VOCAB:-2000}"
    FROM="${FROM:-$HERE/exp/english-$SIZE/epoch-10.pt}"
    [ -f "$FROM" ] || { echo "$FROM not found: run stage english first, or set FROM"; exit 1; }
    [ -f "$HERE/data/lang_bpe_$VOCAB/bpe.model" ] || { echo "Run scripts/04_train_bpe.py --vocab-size $VOCAB first"; exit 1; }
    STAGE_ARGS=(
      --bpe-model "$HERE/data/lang_bpe_$VOCAB/bpe.model"
      --finetune-ckpt "$FROM"
      --init-modules encoder_embed,encoder
      --voxa-languages en,pcm,ha,yo,ig --voxa-upper 0
      --base-lr "${BASE_LR:-0.015}"
    )
    ;;
  *) echo "stage must be english or multilingual"; exit 1 ;;
esac

mkdir -p "$EXP"
cd "$ICEFALL_ASR_DIR"
set -x
./voxa_zipformer/finetune.py \
  --world-size "$GPUS" \
  --num-epochs "$EPOCHS" \
  --start-epoch 1 \
  --exp-dir "$EXP" \
  --manifest-dir "$HERE/data/fbank" \
  --do-finetune 1 \
  --use-mux 0 \
  --use-fp16 1 \
  --causal 1 \
  --chunk-size 16,32,64,-1 \
  --left-context-frames 64,128,256,-1 \
  --max-duration "$MAX_DURATION" \
  --enable-musan "$MUSAN" \
  --lr-epochs 100 \
  --lr-batches 100000 \
  "${SIZE_ARGS[@]}" \
  "${STAGE_ARGS[@]}"
