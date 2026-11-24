# Voxa listening model training

Scripts to train Voxa's own small live speech model for Nigerian English, Pidgin, Hausa, Yoruba
and Igbo, as set out in the training plan (Voxa — Speech model training plan). The result is a
Listening pack the app already knows how to run: a streaming Zipformer in int8 ONNX for sherpa-onnx.

These scripts are a first draft and have not been run yet. Expect to fix small things on the first run.

## What you need

- A Linux machine with 1 to 4 NVIDIA GPUs (A100 or H100 class; a 24 GB card works with a smaller
  `MAX_DURATION`), about 500 GB of disk, Python 3.10 to 3.12.
- PyTorch and k2 built for the same CUDA version (see the top of `setup.sh`).
- The data: see "Data formats" below. Nothing here downloads datasets for you, because each
  one has its own licence and sign-up.

## Steps

Run everything from `training/asr`.

| Step | Command | What it does |
| --- | --- | --- |
| 0 | `bash setup.sh` then `source env.sh` | Installs tools, fetches icefall at a fixed commit, builds the recipe, downloads the starting models and the teacher |
| 1 | `python scripts/01_lock_test_speakers.py --source ...` | Picks the test and dev speakers once and locks them in `splits/speakers.json`. Commit that file |
| 2 | `python scripts/02_prepare.py --source ...` | Builds lhotse manifests per split and language, with text cleaned exactly as the app scores it |
| 3 | `python scripts/03_teacher_label.py --input ... --language ha ...` | Labels untranscribed audio with Omnilingual; feed its output back to step 2 as `--source jsonl:...` |
| 4 | `python scripts/04_train_bpe.py` | Shared vocabulary for all five languages (multilingual stage only) |
| 5 | `python scripts/05_compute_fbank.py` | Computes features, with speed-perturbed copies of training clips |
| 6 | `bash scripts/06_finetune.sh english medium` | Stage A: Nigerian English and Pidgin, starting from the English model |
| 6 | `bash scripts/06_finetune.sh multilingual medium` | Stage B: all five languages, new vocabulary, encoder carried over from stage A |
| 7 | `bash scripts/07_export.sh english medium 10 3` | Exports an int8 Listening pack and prints its catalogue entry |
| 8 | `python scripts/08_score.py --pack packs/...` | Word error per language on the locked test set. Score the Kroko pack the same way |

Repeat 6 to 8 with `small` for the lite-phone build. After step 8, put the pack in the app's
catalogue as a lab pack and run it in the Engine lab comparison on a 2 GB phone: that measures
speed and memory, which a server cannot.

### Source arguments

`--source kind:path[:language]`, repeatable, in steps 1 and 2:

- `commonvoice:/data/cv-ha:ha`: an extracted Common Voice language folder (`validated.tsv`, `clips/`)
- `commonvoice-ng:/data/cv-en:en`: the Common Voice English folder, keeping only speakers who
  describe their accent as Nigerian (or Yoruba, Hausa, Igbo, Pidgin). The rest is mostly American
  and British speakers
- `fleurs:/data/fleurs/ha_ng:ha`: an extracted FLEURS language folder (`train.tsv`, `audio/train/`, ...)
- `naijavoices:/data/naijavoices/hausa:ha`: an extracted NaijaVoices dataset folder or metadata CSV (`naijadata.vercel.app`)
- `jsonl:/data/voxa/drive.jsonl`: Voxa's own format (below)

Languages: `en` (Nigerian English), `pcm` (Pidgin), `ha`, `yo`, `ig`.

## Data formats

Voxa recordings, teacher labels, and any dataset converted by hand (NaijaVoices, AfriSpeech,
WAXAL, Nigerian Pidgin 1.0) use one JSON object a line:

```json
{"id": "drive-0001", "audio": "audio/0001.wav", "text": "e kaaro gbogbo yin", "speaker": "spk-017", "language": "yo"}
```

- `audio` is relative to the `.jsonl` file's folder. Any format ffmpeg reads; any sample rate.
- `start` and `duration` (seconds) pick a stretch of a longer file; without them the whole file is used.
- `text` may be empty for audio that goes to step 3.
- `speaker` must be stable across sessions: it is what keeps test speakers out of training.
- Spell numbers as words ("three hundred", not "300"). Step 2 drops transcripts with digits.

### Donated recordings

Volunteers record in the app (Settings → Donate your voice) and share a zip,
`voxa-voice-<code>.zip`. Unzip each into its own folder and pass its `recordings.jsonl`:
`--source jsonl:/data/donated/vx-abc123/donate/recordings.jsonl`. Each phone has one random
speaker code, so step 1 can lock whole volunteers into the test set.

## Rules that keep the scores honest

- Lock test speakers (step 1) before any training data is built, and never reuse them. Step 3
  skips their audio too.
- Make decisions on `--split test` only at the end of a stage; tune on `--split dev`.
- Text is cleaned by `voxa_asr/normalize.py`, which must match the app scorer. Both test suites read
  `normalize_cases.json`; change the two together.

## Tests

```bash
python -m pytest tests
```

## Licences

icefall, k2, lhotse and sherpa-onnx are Apache-2.0. The starting checkpoints (k2-fsa project) and
the Omnilingual teacher (Meta) are Apache-2.0. Each dataset has its own licence: see the training
plan's Data section before using one. NaijaVoices and AfriSpeech-200 are non-commercial without a deal.
