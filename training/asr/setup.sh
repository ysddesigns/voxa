#!/usr/bin/env bash
# One-time setup on the Linux GPU machine. Run from training/asr:  bash setup.sh
#
# Before this, install PyTorch and k2 for your CUDA version (they must match each other):
#   https://pytorch.org/get-started/locally/  then  https://k2-fsa.github.io/k2/installation/
# This script checks they import, then installs the rest, fetches icefall at a fixed commit,
# builds the Voxa recipe folder, and downloads the starting checkpoints and the teacher model.
set -euo pipefail

ICEFALL_COMMIT=ed16de9534d79252cac51f1729fdcee5699e9758   # icefall master, 18 Nov 2026
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# k2's CUDA wheels have __dev_version__ rather than __version__.
check_torch_k2() {
  python -c "import torch, k2; print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), 'k2', getattr(k2, '__dev_version__', '') or getattr(k2, '__version__', ''))"
}
check_torch_k2 || { echo "Install PyTorch and k2 first: python scripts/colab_install.py (or see the top of this file)."; exit 1; }

pip install lhotse sentencepiece sherpa-onnx onnx onnxruntime soundfile tensorboard

if [ ! -d icefall ]; then
  git clone https://github.com/k2-fsa/icefall.git
fi
git -C icefall fetch --quiet origin "$ICEFALL_COMMIT"
git -C icefall checkout --quiet "$ICEFALL_COMMIT"
pip install -r icefall/requirements.txt
# If one of those packages pulled in a different torch, put a matching k2 back.
check_torch_k2 || { python scripts/colab_install.py && check_torch_k2; }

# The recipe: icefall's zipformer files, with our asr_datamodule.py in place of theirs.
ASR=icefall/egs/librispeech/ASR
rm -rf "$ASR/voxa_zipformer"
mkdir "$ASR/voxa_zipformer"
for f in "$ASR"/zipformer/*; do
  name="$(basename "$f")"
  [ "$name" = asr_datamodule.py ] && continue
  ln -s "../zipformer/$name" "$ASR/voxa_zipformer/$name"
done
ln -s "$HERE/recipe/asr_datamodule.py" "$ASR/voxa_zipformer/asr_datamodule.py"

cat > env.sh <<EOF
# source env.sh in every new shell before running the scripts
export PYTHONPATH="$HERE/icefall:$HERE:\${PYTHONPATH:-}"
export ICEFALL_ASR_DIR="$HERE/$ASR"
EOF

# Starting checkpoints, pinned to one Hugging Face commit each (Apache-2.0, k2-fsa project).
fetch() {  # fetch <url> <file>
  [ -s "$2" ] && return 0
  mkdir -p "$(dirname "$2")"
  curl -fL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"
}
HF=https://huggingface.co
MED=$HF/Zengwei/icefall-asr-librispeech-streaming-zipformer-2023-05-17/resolve/e9bb301533e57188f8d0010a40e0ca55151dacdb
fetch "$MED/exp/pretrained.pt"              base/medium/exp/epoch-99.pt
fetch "$MED/data/lang_bpe_500/bpe.model"    base/medium/data/lang_bpe_500/bpe.model
fetch "$MED/data/lang_bpe_500/tokens.txt"   base/medium/data/lang_bpe_500/tokens.txt
SMALL=$HF/csukuangfj/icefall-asr-librispeech-streaming-zipformer-small-2024-03-18/resolve/915f407a34fe1a92b8346426b1a03ecdf9937cb4
fetch "$SMALL/exp-ctc-rnnt-small/epoch-30.pt" base/small/exp/epoch-30.pt
fetch "$SMALL/data/lang_bpe_500/bpe.model"    base/small/data/lang_bpe_500/bpe.model
fetch "$SMALL/data/lang_bpe_500/tokens.txt"   base/small/data/lang_bpe_500/tokens.txt

# Teacher (step 3) and voice detection: the same files and checksums as the app's packs.
OMNI=$HF/csukuangfj/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12/resolve/6abf1ece20cd2308bdb7d13cd78ec1c44fa4c094
fetch "$OMNI/model.int8.onnx" models/omnilingual-300m/model.int8.onnx
fetch "$OMNI/tokens.txt"      models/omnilingual-300m/tokens.txt
fetch https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad_v5.onnx models/silero_vad.onnx
sha256sum -c <<EOF
e7c4e54ee4c4c47829cc6667d5d00ed8ea7bef1dcfeef0fce766f77752a2726c  models/omnilingual-300m/model.int8.onnx
a7a044c52cb29cbe8b0dc1953e92cefd4ca16b0ed968177b6beab21f9a7d0b31  models/omnilingual-300m/tokens.txt
6b99cbfd39246b6706f98ec13c7c50c6b299181f2474fa05cbc8046acc274396  models/silero_vad.onnx
EOF

echo
echo "Done. Next:  source env.sh  then follow README.md from step 1."
