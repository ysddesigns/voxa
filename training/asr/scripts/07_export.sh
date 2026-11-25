#!/usr/bin/env bash
# Step 7: export a trained model as a Voxa Listening pack (int8 ONNX for sherpa-onnx).
#
#   bash scripts/07_export.sh english medium 10 3
#     -> packs/english-medium-e10-avg3/{encoder,decoder,joiner}.onnx, tokens.txt, silero_vad.onnx
#
# Arguments: stage, size, last epoch, how many epochs to average (3 to 5 usually beats the last
# epoch alone). The streaming settings (chunk 16, left context 128) are those the app was tested
# with: about 0.32 s of delay. The encoder and joiner are int8; the decoder stays float, as in the
# app's current packs, because it is tiny and int8 costs it accuracy.
#
# CHUNK and LEFT (environment) export the same model with a longer look-ahead for the after-meeting
# pass, which re-reads the saved recording and has no need to keep up with speech:
#   CHUNK=64 LEFT=256 bash scripts/07_export.sh north medium 20 3   -> packs/north-medium-e20-avg3-c64
# Training mixed chunk sizes (16 up to full context), so one checkpoint serves both.
#
# It ends by printing the files' checksums and sizes as a catalogue entry for
# src/features/packs/catalogue.ts, to test the model as a lab pack in the Engine lab.
set -euo pipefail

STAGE="${1:?english, south, north or multilingual}"
SIZE="${2:?medium or small}"
EPOCH="${3:?last epoch}"
AVG="${4:-3}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
: "${ICEFALL_ASR_DIR:?source env.sh first}"
source "$HERE/scripts/model_size.sh" "$SIZE"

EXP="$HERE/exp/$STAGE-$SIZE"
CHUNK="${CHUNK:-16}"
LEFT="${LEFT:-128}"
case "$STAGE" in
  english|south) TOKENS="$HERE/base/$SIZE/data/lang_bpe_500/tokens.txt" ;;
  north) TOKENS="$HERE/data/lang_bpe_north_${VOCAB:-2000}/tokens.txt" ;;
  multilingual) TOKENS="$HERE/data/lang_bpe_${VOCAB:-2000}/tokens.txt" ;;
  *) echo "stage must be english, south, north or multilingual"; exit 1 ;;
esac
NAME="$STAGE-$SIZE-e$EPOCH-avg$AVG"
[ "$CHUNK" = 16 ] || NAME="$NAME-c$CHUNK"
OUT="$HERE/packs/$NAME"

cd "$ICEFALL_ASR_DIR"
./voxa_zipformer/export-onnx-streaming.py \
  --exp-dir "$EXP" \
  --tokens "$TOKENS" \
  --epoch "$EPOCH" \
  --avg "$AVG" \
  --use-averaged-model 1 \
  --causal True \
  --chunk-size "$CHUNK" \
  --left-context-frames "$LEFT" \
  --enable-int8-quantization 1 \
  "${SIZE_ARGS[@]}"

SUFFIX="epoch-$EPOCH-avg-$AVG-chunk-$CHUNK-left-$LEFT"
mkdir -p "$OUT"
cp "$EXP/encoder-$SUFFIX.int8.onnx" "$OUT/encoder.onnx"
cp "$EXP/decoder-$SUFFIX.onnx"      "$OUT/decoder.onnx"
cp "$EXP/joiner-$SUFFIX.int8.onnx"  "$OUT/joiner.onnx"
cp "$TOKENS"                        "$OUT/tokens.txt"
cp "$HERE/models/silero_vad.onnx"   "$OUT/silero_vad.onnx"

echo
echo "Pack: $OUT"
echo "Catalogue files (upload the pack, then replace BASE with its pinned URL):"
cd "$OUT"
for f in encoder.onnx decoder.onnx joiner.onnx tokens.txt silero_vad.onnx; do
  printf "        { path: '%s', url: \`\${BASE}/%s\`, sha256: '%s', bytes: %s },\n" \
    "$f" "$f" "$(sha256sum "$f" | cut -d' ' -f1)" "$(stat -c%s "$f")"
done
du -ch ./*.onnx tokens.txt | tail -1
