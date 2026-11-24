# Training Voxa's Nigerian Multilingual Model on Cloud GPU (Colab / RunPod)

This guide walks through training Voxa's offline, on-device streaming Zipformer speech recognition model (**Nigerian English, Pidgin, Yoruba, Hausa, Igbo**) on an NVIDIA GPU instance.

The output is an int8 ONNX pack (`listen-ng`) that drops directly into Voxa to replace Kroko.

---

## 1. Cloud Machine Requirements

* **GPU:** 1x NVIDIA A100 (40 GB / 80 GB) or RTX 4090 / 3090 (24 GB).
* **OS:** Ubuntu 22.04 LTS.
* **Disk:** ~100–200 GB SSD storage.
* **Estimated Runtime:** ~4–8 hours for `small` model size.

---

## 2. Fast Setup (Google Colab / RunPod)

### Step 1: Clone Voxa and Enter Directory
```bash
git clone https://github.com/your-org/voxa.git
cd voxa/voxa/training/asr
```

### Step 2: Install CUDA PyTorch & k2
On Ubuntu / Colab (match your CUDA version, e.g. CUDA 12.1):
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install k2==1.24.4.dev20240223+cuda12.1.torch2.2.0 -f https://k2-fsa.github.io/k2/cuda.html
```

### Step 3: Run Setup
```bash
bash setup.sh
source env.sh
```

---

## 3. Data Preparation with NaijaData

Download **NaijaVoices** from the Explorer tier on [NaijaData](https://naijadata.vercel.app/dataset/naijavoices) and place under `data/raw/naijavoices/`:

```bash
mkdir -p data/raw/naijavoices
# Extract downloads into:
#   data/raw/naijavoices/ha (or metadata.csv)
#   data/raw/naijavoices/yo
#   data/raw/naijavoices/ig
```

Optional: Download **Common Voice Nigerian English**:
```bash
# Extract into data/raw/cv-en
```

---

## 4. Run Automated End-to-End Training

Run the cloud trainer:
```bash
DATA_DIR=data/raw MODEL_SIZE=small bash scripts/train_cloud.sh
```

What this script automates:
1. **Speaker Split Locking (`01_lock_test_speakers.py`):** Ensures clean dev/test evaluation splits.
2. **Lhotse Manifest Creation (`02_prepare.py`):** Normalizes transcripts and discards corrupt/short audio.
3. **Multilingual BPE Tokenizer (`04_train_bpe.py`):** Generates shared 2,000-token subwords across all 5 languages.
4. **Fbank Computation (`05_compute_fbank.py`):** Computes 80-band filterbank features with speed perturbation (0.9x, 1.1x).
5. **Stage A Fine-tuning (`06_finetune.sh`):** Fine-tunes Zipformer transducer on Nigerian English & Pidgin.
6. **Stage B Multilingual Fine-tuning:** Transfers learned acoustic encoder and trains on Yoruba, Hausa, Igbo, Pidgin, and English.
7. **Export to int8 ONNX (`07_export.sh`):** Quantizes and exports `encoder.onnx`, `decoder.onnx`, `joiner.onnx`, `tokens.txt`, and `silero_vad.onnx`.
8. **Evaluation (`08_score.py`):** Measures final Word Error Rate (WER) per language.

---

## 5. Integrating the Trained Model into Voxa

The script outputs the finished pack into `packs/listen-ng/`.

1. **Local Test:** Drop the `packs/listen-ng` folder into your phone's Voxa files directory or test it directly in **Engine Lab** (`AsrCompareCard`).
2. **Production Release:** Upload `packs/listen-ng` to your CDN/Hugging Face repository and update the URL and checksums in `src/features/packs/catalogue.ts`:
   ```typescript
   export const LISTEN_PACK_NG = 'listen-ng';
   ```
Voxa's native engine (`VoxaEngineModule.kt`) automatically detects and uses `listen-ng` when installed!
