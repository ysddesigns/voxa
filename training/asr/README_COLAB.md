# Training Voxa's listening model on Google Colab (or any cloud GPU)

## Colab: use the notebook

Open `Voxa_Nigerian_ASR_Training.ipynb` in Colab (File → Upload notebook), choose a T4 GPU, and
run the cells from top to bottom. The notebook explains each step. In short, it:

1. Installs k2 for whatever PyTorch Colab has (`scripts/colab_install.py`), then icefall and the
   starting models (`setup.sh`).
2. Downloads the data from Hugging Face one file at a time, as 16 kHz audio, capped at the hours
   you choose (`scripts/fetch_data.py`):
   - North: NaijaVoices Hausa, FLEURS Hausa, AfriSpeech-200 English with northern accents, Pidgin
   - South: AfriSpeech-200 English with southern accents, Pidgin
3. Adds your own recordings from Google Drive: Donate zips, transcribed meetings, `test-speakers.txt`.
4. Prepares the data, then trains stage A (English and Pidgin) and stage B (the region model).
5. Exports two packs, `listen-ng-<region>` (live captions) and `listen-ng-<region>-full` (after the
   meeting), then scores them.

Checkpoints, the speaker lock, the word-piece vocabulary, packs and scores live in Google Drive.
After a disconnect, run the cells again from the top: finished steps and epochs are skipped.

You need a Hugging Face token, and must accept the terms of NaijaVoices and AfriSpeech-200 on their
pages. Both are non-commercial (CC BY-NC-SA).

## Any other GPU machine (RunPod, Lambda, your own)

```bash
git clone --branch <branch> https://github.com/ysddesigns/voxa.git
cd voxa/training/asr
python scripts/colab_install.py          # k2 to match the installed PyTorch
bash setup.sh && source env.sh
export HF_TOKEN=...                      # after accepting the datasets' terms
python scripts/fetch_data.py pidgin --out /workspace/data/fetched
python scripts/fetch_data.py afrispeech --accents north --hours 40 --out /workspace/data/fetched
python scripts/fetch_data.py naijavoices --language ha --hours 60 --out /workspace/data/fetched
python scripts/fetch_data.py fleurs --code ha_ng --out /workspace/data/fleurs
REGION=north MODEL_SIZE=small DATA_DIR=/workspace/data KEEP_EPOCHS=4 bash scripts/train_cloud.sh
```

On a 24 GB or larger card, set `MAX_DURATION=600`. Every step is described in `README.md`.
