#!/usr/bin/env bash
# Step 6: fine-tune with icefall's zipformer/finetune.py, reading Voxa's data (recipe/asr_datamodule.py).
#
#   bash scripts/06_finetune.sh english medium        # stage A: Nigerian English + Pidgin
#   bash scripts/06_finetune.sh south medium          # the South: English + Pidgin, mixed in one sentence
#   bash scripts/06_finetune.sh north medium          # the North: English + Hausa, mixed in one sentence
#   bash scripts/06_finetune.sh multilingual medium   # stage B: all five languages, new vocabulary
#   bash scripts/06_finetune.sh english small         # the same for the lite-phone build
#
# Region models (north, south) are what Live should run: one vocabulary covering both languages, so
# the model writes whichever language it hears without being told, and code-switched training sets
# (real cs-<lang> recordings and step 2b's joined cs-<lang>-synth clips) so it expects the switch.
# A small model holding two or three languages is more accurate than the same model holding five.
#
# Settings by environment variable (defaults in brackets):
#   GPUS [all visible]  EPOCHS [english 10, multilingual 20]  MAX_DURATION [600 seconds of audio a batch]
#   USE_FP16 [1; 0 for full precision]
#   BASE_LR [english 0.0045, multilingual 0.015]  MUSAN [0: no noise mixing, or 1 with musan_cuts in data/fbank]
#   START_EPOCH [auto: one after the last epoch-N.pt in the experiment folder, so a run cut short
#     (a Colab session ending) carries on where it stopped; a stage already finished is skipped]
#   KEEP_EPOCHS [0: keep all; N: delete all but the last N epoch files, which are 0.5 to 1.5 GB each.
#     Keep at least the export's AVG + 1]  KEEP_LAST_K [30: mid-epoch checkpoints icefall keeps]
#   FROM [stage B, north, south: exp/english-<size>/epoch-<EPOCHS of stage A>.pt]  VOCAB [2000]
#
# Stage A keeps the starting model's vocabulary and starts every part of the model from it.
# Stage B changes the vocabulary, so only the encoder (what the model has learnt about sound)
# carries over from stage A; the decoder and joiner start fresh, hence the higher learning rate.
set -euo pipefail

STAGE="${1:?english, south, north or multilingual}"
SIZE="${2:?medium or small}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
: "${ICEFALL_ASR_DIR:?source env.sh first}"
source "$HERE/scripts/model_size.sh" "$SIZE"

GPUS="${GPUS:-$(python -c 'import torch; print(torch.cuda.device_count())')}"
MAX_DURATION="${MAX_DURATION:-600}"
MUSAN="${MUSAN:-0}"
USE_FP16="${USE_FP16:-1}"   # 0 trains in full precision: slower, for when fp16 gradients overflow
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
    # The small starting checkpoint has a CTC head; without CTC the model has no place for it, so load
    # every other part by name (a whole-model load would stop at the extra keys).
    if [ "$SIZE" = small ] && [ "$USE_CTC" = 0 ]; then
      STAGE_ARGS+=(--init-modules encoder_embed,encoder,decoder,joiner,simple_am_proj,simple_lm_proj)
    fi
    ;;
  south)
    # Pidgin is spelt with English letters and mostly English words: the English vocabulary covers it,
    # so every part of the model carries over from stage A.
    EPOCHS="${EPOCHS:-10}"
    FROM="${FROM:-$HERE/exp/english-$SIZE/epoch-10.pt}"
    [ -f "$FROM" ] || { echo "$FROM not found: run stage english first, or set FROM"; exit 1; }
    STAGE_ARGS=(
      --bpe-model "$HERE/base/$SIZE/data/lang_bpe_500/bpe.model"
      --finetune-ckpt "$FROM"
      --voxa-languages en,pcm,cs-pcm,cs-pcm-synth --voxa-upper 1
      --base-lr "${BASE_LR:-0.003}"
    )
    ;;
  north)
    # Hausa needs its own word pieces: a new vocabulary from en, pcm, ha and cs-ha text
    # (04_train_bpe.py --languages en,pcm,ha,cs-ha --out data/lang_bpe_north_<VOCAB>).
    EPOCHS="${EPOCHS:-20}"
    VOCAB="${VOCAB:-2000}"
    FROM="${FROM:-$HERE/exp/english-$SIZE/epoch-10.pt}"
    [ -f "$FROM" ] || { echo "$FROM not found: run stage english first, or set FROM"; exit 1; }
    BPE="$HERE/data/lang_bpe_north_$VOCAB/bpe.model"
    [ -f "$BPE" ] || { echo "Run scripts/04_train_bpe.py --vocab-size $VOCAB --languages en,pcm,ha,cs-ha --out data/lang_bpe_north_$VOCAB first"; exit 1; }
    STAGE_ARGS=(
      --bpe-model "$BPE"
      --finetune-ckpt "$FROM"
      --init-modules encoder_embed,encoder
      --voxa-languages en,pcm,ha,cs-ha,cs-ha-synth --voxa-upper 0
      --base-lr "${BASE_LR:-0.015}"
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
  *) echo "stage must be english, south, north or multilingual"; exit 1 ;;
esac

mkdir -p "$EXP"
KEEP_EPOCHS="${KEEP_EPOCHS:-0}"
KEEP_LAST_K="${KEEP_LAST_K:-30}"

last_epoch() {
  find "$EXP" -maxdepth 1 -name 'epoch-*.pt' 2>/dev/null | sed -E 's/.*epoch-([0-9]+)[.]pt$/\1/' | sort -n | tail -1
}

prune() {
  [ "$KEEP_EPOCHS" -gt 0 ] || return 0
  find "$EXP" -maxdepth 1 -name 'epoch-*.pt' | sed -E 's/.*epoch-([0-9]+)[.]pt$/\1/' | sort -n | head -n "-$KEEP_EPOCHS" |
    while read -r n; do rm -f "$EXP/epoch-$n.pt"; echo "removed old $EXP/epoch-$n.pt"; done
}

START_EPOCH="${START_EPOCH:-auto}"
if [ "$START_EPOCH" = auto ]; then
  LAST="$(last_epoch)"
  START_EPOCH=$(( ${LAST:-0} + 1 ))
fi
if [ "$START_EPOCH" -gt "$EPOCHS" ]; then
  echo "$STAGE-$SIZE: epoch $EPOCHS is already trained in $EXP; nothing to do."
  prune
  exit 0
fi
# icefall starts a fine-tune only at epoch 1 (from --finetune-ckpt). Later epochs resume from
# $EXP/epoch-<N-1>.pt in its normal training mode, with the optimiser and data position restored.
if [ "$START_EPOCH" -gt 1 ]; then
  echo "$STAGE-$SIZE: resuming at epoch $START_EPOCH of $EPOCHS"
  RESUME_ARGS=(--do-finetune 0 --start-epoch "$START_EPOCH")
else
  RESUME_ARGS=(--do-finetune 1 --start-epoch 1)
fi

cd "$ICEFALL_ASR_DIR"
set -x
./voxa_zipformer/finetune.py \
  --world-size "$GPUS" \
  --num-epochs "$EPOCHS" \
  "${RESUME_ARGS[@]}" \
  --exp-dir "$EXP" \
  --manifest-dir "$HERE/data/fbank" \
  --keep-last-k "$KEEP_LAST_K" \
  --use-mux 0 \
  --use-fp16 "$USE_FP16" \
  --causal 1 \
  --chunk-size 16,32,64,-1 \
  --left-context-frames 64,128,256,-1 \
  --max-duration "$MAX_DURATION" \
  --enable-musan "$MUSAN" \
  --lr-epochs 100 \
  --lr-batches 100000 \
  "${SIZE_ARGS[@]}" \
  "${STAGE_ARGS[@]}"
set +x
prune
