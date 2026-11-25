# Model shapes, sourced by 06_finetune.sh and 07_export.sh so training and export always agree.
# Usage: source scripts/model_size.sh <medium|small>  ->  sets SIZE_ARGS (an array)
#
# medium: icefall's default streaming Zipformer, about 65M parameters (the starting model
#         Zengwei/icefall-asr-librispeech-streaming-zipformer-2023-05-17). Standard and pro phones.
# small:  about 23M parameters (csukuangfj/icefall-asr-librispeech-streaming-zipformer-small-2024-03-18,
#         icefall PR 1557), trained with CTC and transducer losses together. Lite (2 GB) phones.
#
# USE_CTC [0]: also train the small model's CTC head. Off by default: on Colab (T4, torch 2.8 and
# 2.13) its gradients reached 1e10 within 50 batches and the run stopped with "grad_scale is too
# small". The app decodes with the transducer only, so the CTC head is not needed. Training and export
# must use the same value (both source this file).
USE_CTC="${USE_CTC:-0}"
case "${1:-}" in
  medium)
    SIZE_ARGS=(--use-transducer 1 --use-ctc 0)
    ;;
  small)
    SIZE_ARGS=(
      --num-encoder-layers 2,2,2,2,2,2
      --feedforward-dim 512,768,768,768,768,768
      --encoder-dim 192,256,256,256,256,256
      --encoder-unmasked-dim 192,192,192,192,192,192
      --use-transducer 1 --use-ctc "$USE_CTC"
    )
    ;;
  *)
    echo "model size must be medium or small" >&2
    return 1 2>/dev/null || exit 1
    ;;
esac
