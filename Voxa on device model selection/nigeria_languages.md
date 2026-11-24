# Speech technology for Nigerian-accented English, Yoruba, Hausa and Igbo (Voxa on-device)

Research date: 2026-11-19. Roughly 20 searches and fetches. Most figures come from model cards and preprints, not independent replications. Each item is flagged where that matters.

## Q1. How accurate are current ASR models on Nigerian and African-accented English, and how big is the gap to US/UK English?

### Takeaway
Leading open ASR models get under 2.5% WER on LibriSpeech but about 26-33% WER on Nigerian-accented English zero-shot. That is roughly a 13-20x gap. Fine-tuning on African-accented data roughly halves the error (Whisper-small drops from about 49% to 23% on AfriSpeech). Intron's proprietary Sahara V2 reaches about 13% on Nigerian speech, which shows how far domain data can take a model. I found no AfriSpeech numbers for Moonshine, Zipformer, or other phone-class streaming models.

### Cited Findings
- AfriSpeech-MultiBench (Intron and collaborators, IJCNLP-AACL 2025, arXiv Nov 2025) tested 18 recognizers zero-shot on 7 African-accented English corpora. The corpora are AfriSpeech-200, AfriSpeech-Dialog, a Parliamentary set, Med-Conv-Nig (simulated Nigerian doctor-patient conversations), AfriNames, AfriSpeech-Countries and a private call-centre set — [arXiv 2511.14255](https://arxiv.org/html/2511.14255v1); [ACL Anthology](https://aclanthology.org/2025.ijcnlp-long.190)
- Zero-shot WER from Table 3, as LibriSpeech vs. the AfriSpeech-200 subset:
  - Whisper-large-v3: 2.01 vs. 26.49
  - Distil-Whisper-v3.5: 2.37 vs. 27.58
  - Parakeet-tdt-0.6B-v2: 1.69 vs. 30.20
  - Parakeet-tdt-1.1B: 1.40 vs. 28.45
  - Canary-1B-flash: 1.48 vs. 29.77
  - Cloud models on AfriSpeech-200: GPT-4o Transcribe 24.66, Gemini-2.5 Flash 26.54
  - Intron-Sahara V2 (fine-tuned, proprietary): 11.83
  - Source: [arXiv 2511.14255](https://arxiv.org/html/2511.14255v1)
- Nigeria-only WER from Table 6:
  - Whisper-large-v3: 26.53
  - Distil-Whisper-v3.5: 26.69
  - Parakeet-tdt-0.6B-v2: 32.60
  - Parakeet-tdt-1.1B: 28.65
  - Canary-1B-flash: 29.00
  - Gemini-2.5 Flash: 25.90
  - GPT-4o Transcribe: 40.03
  - Intron-Sahara: 15.85
  - Intron-Sahara V2: 12.83
  - The paper says Nigeria, Ghana and South Africa are among the hardest accents, and Kenyan and Ugandan English are the easiest (12-18%) — [arXiv 2511.14255](https://arxiv.org/html/2511.14255v1)
- Named entities, numbers and voice commands (the AfriNames subset) push most models above 40% WER. For example, Whisper-large-v3 gets 43.23 and Parakeet-0.6B gets 41.88 — [arXiv 2511.14255](https://arxiv.org/html/2511.14255v1)
- Hallucination on silence and noise is severe for some models. Parakeet-rnnt-1.1B reaches 211.6% WER on the silence subset and Phi-4-MM reaches 154%. Canary-1B-flash collapses on medical conversation and call-centre audio (93.6 and 88.7). The paper says "hallucinations still remain a big problem for most SOTA models" — [arXiv 2511.14255](https://arxiv.org/html/2511.14255v1)
- The paper's own tables have small inconsistencies (Canary's medical WER differs between tables), and the Sahara models belong to the authors, so they are not independently verified — [arXiv 2511.14255](https://arxiv.org/html/2511.14255v1)
- Community fine-tunes on AfriSpeech-200 (self-reported model cards):
  - Whisper-small: 49.15% WER overall before fine-tuning, 22.94% after. Per-accent WER ranges from about 8% to 62%, and the worst accents are under-represented Nigerian ones — [HF Professor/whisper-small-afrispeech](https://huggingface.co/Professor/whisper-small-afrispeech)
  - Whisper-medium: 43.22% before, 20.13% after (clinical 50.55 → 27.47, general 36.09 → 12.98) — [HF Professor/whisper-medium-afrispeech](https://huggingface.co/Professor/whisper-medium-afrispeech)
- NaijaVox-2.0 is a Whisper-large-v3 LoRA fine-tune (merged, about 2B params in F16, Apache-2.0) that reports 19.6% WER on Nigerian English — [HF Axiveri/NaijaVox-2.0](https://huggingface.co/Axiveri/NaijaVox-2.0)

### Inferences
- Whisper-large-v3 gets 2.0% on LibriSpeech and 26.5% on Nigerian speech, about 13x worse. Parakeet-0.6B goes from 1.7% to 32.6%, about 19x worse. Real meetings with names and numbers will look worse than read-speech benchmarks.
- Distil-Whisper-v3.5 matches large-v3 on Nigerian speech (26.7 vs. 26.5). Among distilled models it is the strongest zero-shot candidate, but at 756M params it is still heavy for a phone.
- Parakeet-0.6B, the usual on-device English pick, is about 6 points worse than Whisper on Nigerian accents and hallucinates on silence. Voxa would need VAD gating and probably accent fine-tuning before it is acceptable.
- At launch, expect roughly 25-35% WER on Nigerian English from any off-the-shelf phone-sized model. Fine-tuning on AfriSpeech-style data plausibly brings that to about 13-23%, based on the Whisper-small and medium cards and on Sahara.

### Gaps
- I found no published AfriSpeech or Nigerian-English WER for Moonshine, the sherpa-onnx Zipformer streaming models, Whisper-tiny/base, or Vosk. Voxa should run its own evaluation on AfriSpeech-200 test plus Med-Conv-Nig.
- No on-device latency figures for African-accented ASR were found. MultiBench does not report edge hardware.
- I found no head-to-head comparison against US vs. UK accented test sets beyond the LibriSpeech column.

## Q2. Which datasets exist, and which licenses allow commercial use?

### Takeaway
The main commercial-friendly sources are Google WAXAL (CC-BY-4.0, about 1,846 hours ASR and 565 hours TTS across 27 African languages), Meta's Omnilingual ASR Corpus (CC-BY-4.0), BibleTTS (CC-BY-SA-4.0) and Common Voice (CC0, but tiny for these languages). The largest Nigeria-specific corpora are non-commercial unless licensed separately: AfriSpeech-200 (CC-BY-NC-SA-4.0) and NaijaVoices (CC-BY-NC-SA-4.0, about 1,800 hours, commercial use by contact).

### Cited Findings
- **AfriSpeech-200**
  - 200 hours of Pan-African accented English: 67,577 clips, 2,463 speakers, 120 accents, 13 countries, clinical plus general domain (TACL 2023, older item) — [AfriSpeech-200 paper](https://ar5iv.labs.arxiv.org/html/2310.00274); [TACL](https://aclanthology.org/2023.tacl-1.93.pdf)
  - License CC BY-NC-SA 4.0. The MultiBench suite is also CC BY-NC-SA 4.0 — [arXiv 2511.14255](https://arxiv.org/pdf/2511.14255)
- **NaijaVoices** (Interspeech 2025)
  - About 1,800 hours (the paper's table says 1,838.54 hours), 5,000+ speakers, Igbo, Hausa and Yoruba — [arXiv 2505.20564](https://arxiv.org/html/2505.20564v3); [Interspeech 2025](https://www.isca-archive.org/interspeech_2025/emezue25_interspeech.html)
  - The HF card says 1,500 hours, about 500 per language. That conflicts with the paper's figure.
  - License CC BY-NC-SA 4.0: free for personal and research use; "For commercial interests, please reach out to us."
  - Gated behind registration. The full set is over 500 GB; a compressed version is 84 GB.
  - Sources: [HF naijavoices-dataset](https://huggingface.co/datasets/naijavoices/naijavoices-dataset); [compressed](https://huggingface.co/datasets/naijavoices/naijavoices-dataset-compressed)
- **Google WAXAL**
  - CC-BY-4.0, explicitly meant for academic and commercial use, hosted at HF google/WaxalNLP — [arXiv 2602.02734](https://arxiv.org/abs/2602.02734); [Google Research pub](https://research.google/pubs/waxal-a-large-scale-multilingual-african-language-speech-corpus/)
  - Google's March 6, 2026 blog gives about 1,846 hours of transcribed natural speech (ASR) and over 565 hours of studio TTS recordings across 27 Sub-Saharan languages. Partners include Makerere, University of Ghana, Digital Umuganda and AIMS Senegal — [Google Research blog](https://research.google/blog/waxal-a-large-scale-open-resource-for-african-language-speech-technology/)
  - Earlier versions listed 21, then 24 languages (also a NeurIPS 2026 poster) — [NeurIPS](https://neurips.cc/virtual/2026/poster/139649)
  - The NaijaVox-2.0 card lists "WaxalNLP (Hausa, Igbo, Yoruba, Pidgin)" in its training data, which suggests WAXAL includes all four Nigerian varieties — [HF NaijaVox-2.0](https://huggingface.co/Axiveri/NaijaVox-2.0)
  - A Hausa Piper voice was trained on WAXAL TTS data, so WAXAL has Hausa TTS recordings — [HF adab-tech/murya-piper-hausa-tts](https://huggingface.co/adab-tech/murya-piper-hausa-tts)
- **Mozilla Common Voice** (now distributed via the Mozilla Data Collective; historically CC0)
  - Hausa v24: 12.62 hours recorded, 4.22 hours validated, 60 speakers — [MDC Hausa 24](https://datacollective.mozillafoundation.org/datasets/cmj8u3p6w00alnxxbby9yqbms)
  - Igbo v24: 13.22 hours recorded, 0.4 hours validated — [MDC Igbo 24](https://datacollective.mozillafoundation.org/datasets/cmj8u3p9a00c5nxxb7jwi217j)
  - Yoruba v25 (released 2026-03-22): 8.14 hours recorded, 5.82 hours validated — [MDC Yoruba 25](https://datacollective.mozillafoundation.org/datasets/cmn29vsoh019amm07d95id0mo)
- **BibleTTS** (Interspeech 2022, older item)
  - CC BY-SA 4.0 on OpenSLR SLR129. Hausa has 86.6 aligned hours and Yoruba 33.3 aligned hours of single-speaker studio-quality audio.
  - It is derived from Open.Bible / Biblica recordings, so attribution and share-alike apply.
  - Sources: [OpenSLR 129](https://www.openslr.org/129); [BibleTTS site](https://masakhane-io.github.io/bibleTTS)
- **Meta Omnilingual ASR Corpus**: CC-BY-4.0, covering 348 under-served languages — [HF omniASR README](https://huggingface.co/facebook/omniASR-LLM-7B/blob/main/README.md)
- **Code-switching and Pidgin data**
  - YECS: a 120-hour, 140-speaker Yoruba-English code-switching corpus (NeurIPS 2026), reported as public. License not verified — [NeurIPS 2026 YECS](https://neurips.cc/virtual/2026/179704)
  - liva-ai code-s: gated, about 10 hours each of English-Pidgin and English-Yoruba — [HF liva-ai/code-s](https://huggingface.co/datasets/liva-ai/code-s)
  - Pidgin ASR Combined aggregates CC-BY-4.0 Pidgin read speech, about 8.6 hours from 10 speakers — [HF pidgin-asr-combined](https://huggingface.co/datasets/michaelodafe/pidgin-asr-combined)
- **Other datasets used in fine-tunes**: FLEURS (yo/ha/ig), IroyinSpeech (Yoruba), "Nigerian Accented English dataset", Nigerian Pidgin 1.0 — [HF NaijaVox-2.0](https://huggingface.co/Axiveri/NaijaVox-2.0)
- **AfriVox-Transcribe**: Intron's African ASR benchmark dataset — [HF intronhealth/afrivox-transcribe](https://huggingface.co/datasets/intronhealth/afrivox-transcribe)

### Inferences
- For a commercial Voxa with no special agreements, build on WAXAL plus BibleTTS (share-alike applies to the data, not necessarily the trained model; get legal review), Common Voice, the Omnilingual corpus and FLEURS. AfriSpeech-200 and NaijaVoices are the best-matched data, but commercial use needs a negotiated license with Intron and NaijaVoices respectively.
- Common Voice is negligible for Igbo (0.4 validated hours) and small for Hausa and Yoruba.

### Gaps
- I could not confirm the per-language WAXAL hour breakdown for Yoruba, Hausa, Igbo and Pidgin; the table on Google's blog is an image. Check the HF google/WaxalNLP card.
- The Lagos-NWU Yoruba corpus license was not found. A comparison table only says 33 speakers and 130 sentences, so it is too small to matter anyway.
- I found no evidence of an "African Voices" dataset distinct from those above, nor a public Intron-released commercial dataset.
- NaijaVoices commercial pricing is unknown.

## Q3. Which Yoruba, Hausa and Igbo ASR and TTS models exist, at what size, under what license, and which can run on a phone?

### Takeaway
Meta MMS covers all three languages for ASR and TTS (VITS models of about 30M params that run well on phones), but it is CC-BY-NC-4.0 and so not usable commercially. Meta's Omnilingual ASR (Nov 2025, Apache-2.0, 300M CTC variant) is the most promising commercial-friendly multilingual base. Community Whisper fine-tunes under Apache-2.0 exist (NaijaVox) but are large. N-ATLAS is mainly a gated Llama-3-8B LLM with a 1,000-user commercial cap. Intron Sahara and Spitch are cloud APIs. YarnGPT (Nigerian-accent TTS, 360M) is Apache-2.0 but probably too heavy for real-time phone TTS. For TTS, an MIT-licensed Hausa Piper voice exists today; Yoruba and Igbo commercial on-device TTS would have to be built.

### Cited Findings
- **Meta MMS** (2023, older item)
  - The mms-1b-all ASR and mms-tts model cards are tagged cc-by-nc-4.0. A June 2023 commit changed mms-1b from CC-BY-SA to CC-BY-NC, stating "MMS models use CC BY-NC 4.0" — [HF mms-1b commit](https://huggingface.co/facebook/mms-1b/commit/a2946eb16e55841b17a7684a9576dc67dc9a885f); [HF mms-tts](https://huggingface.co/facebook/mms-tts/tree/b55ad7a4fea03d87bfa04b5dd85008fbf5d13b2d)
  - Renpiper converts MMS Yoruba TTS to ONNX for sherpa-onnx, but the conversion stays non-commercial — [HF Axiveri/Renpiper-mms-onnx-V1](https://huggingface.co/Axiveri/Renpiper-mms-onnx-V1)
- **Meta Omnilingual ASR** (Nov 10, 2025)
  - Covers 1,600+ languages. Model and code are Apache-2.0; the corpus is CC-BY-4.0 — [Meta AI blog](https://ai.meta.com/blog/omnilingual-asr-advancing-automatic-speech-recognition/); [VentureBeat](https://venturebeat.com/ai/meta-returns-to-open-source-ai-with-omnilingual-asr-models-that-can)
  - Variants: CTC_300M (325M params, 1.3 GiB FP32), CTC_1B (975M), and LLM variants of 1.6B and up — [HF omniASR README](https://huggingface.co/facebook/omniASR-LLM-7B/blob/main/README.md)
  - Hausa usage in Nigerian clinics has been reported — [Slator](https://tech.slator.com/?p=109678)
  - Zero-shot Omnilingual-1B scored 64.9% macro WER on 19 WAXAL languages (not Nigerian ones) — [WAXAL-NET](https://huggingface.co/papers/2606.02375.md)
- **Whisper on Yoruba, Hausa and Igbo**
  - Zero-shot Whisper-large-v3 FLEURS CER is reported as 47.96 for Yoruba, 32.64 for Hausa and 47.69 for Igbo. These come from secondary model cards and are CER, not WER — [HF BuzzASR/yoruba](https://huggingface.co/BuzzASR/yoruba); [hausa](https://huggingface.co/BuzzASR/hausa); [igbo](https://huggingface.co/BuzzASR/igbo)
  - NaijaVox V1 adds custom Igbo language tokens, implying Igbo is not a native Whisper language — [HF NaijaVox-V1](https://huggingface.co/Axiveri/NaijaVox-V1)
  - A self-supervised benchmark found zero-shot multilingual ASR is "substantially degraded" for Nigerian languages — [engrXiv 6650](https://engrxiv.org/preprint/view/6650)
- **NaijaVox (Axiveri)**
  - V1 FLEURS WER: Yoruba 28.8, Hausa 31.0, Igbo 41.9 — [HF NaijaVox-V1](https://huggingface.co/Axiveri/NaijaVox-V1)
  - V2 is a Whisper-large-v3 LoRA merge, about 2B params in F16, Apache-2.0. WER: Pidgin 14.7, Nigerian English 19.6, Yoruba 22.3, Hausa 25.8, Igbo 30.5. It was trained on about 25.9k samples from FLEURS, WAXAL, Common Voice, BibleTTS Hausa, IroyinSpeech and Pidgin data — [HF NaijaVox-2.0](https://huggingface.co/Axiveri/NaijaVox-2.0)
- **SBPN ("Sometin Beta Pass Notin", arXiv May 2026)**
  - A multilingual ASR model for Yoruba, Hausa, Igbo, Pidgin and Nigerian English, built by distilling from monolingual teachers with n-gram LMs plus self-training.
  - Reported as a 29% average relative WER reduction vs. its monolingual baselines, and better than SOTA multilingual models on Common Voice and FLEURS.
  - Sizes are reported as Base 120M and Large 600M (from a search snippet; the abstract page did not state them).
  - No weights or license link were found.
  - Sources: [arXiv 2605.17710](https://arxiv.org/abs/2605.17710); [alphaXiv](https://www.alphaxiv.org/abs/2605.17710)
- **WAXAL-NET (arXiv Jun 2026)**
  - Fine-tuned Whisper-tiny (39M, about 151 MB), Whisper-small (244M, about 967 MB) and MMS-300M CTC (about 1.2 GB) on 19 WAXAL languages.
  - Macro WER after fine-tuning: 38.0 (MMS-300M), 39.9 (small), 44.2 (tiny), against a 64.9 zero-shot best. It releases 57 models.
  - Yoruba, Hausa and Igbo are not among the 19 languages, and no latency figures are given.
  - Source: [HF papers 2606.02375](https://huggingface.co/papers/2606.02375.md)
- **N-ATLAS (NCAIR with Awarri, launched Sept 2025)**
  - Announced as open-source models covering Yoruba, Hausa, Igbo and Nigerian-accented English for speech recognition, transcription and text generation — [iafrica](https://iafrica.com/?p=280457); [TechCabal](https://techcabal.com/2025/09/25/nigerian-government-awarri-launch-n-atlas/)
  - The HF NCAIR1/N-ATLaS repo is a gated, fine-tuned Llama-3-8B LLM (400M+ tokens of instruction data) — [HF NCAIR1/N-ATLaS](https://huggingface.co/NCAIR1/N-ATLaS)
  - TechCabal reports the licence allows free experimentation, but products scaling beyond 1,000 users need formal arrangements. This comes from the search snippet; the TechCabal page returned 403 when fetched — [TechCabal](https://techcabal.com/2025/09/25/nigerian-government-awarri-launch-n-atlas/)
- **Intron Sahara**
  - Proprietary, "trained on thousands of hours of proprietary audio from 18,000+ speakers" — [Intron Sahara launch](https://trendytheme.net/devspoint/intron/?p=5)
  - Sahara-v2 covers 24 African languages ("40,000 voices, 500 accents") — [iafrica](https://iafrica.com/?p=281849)
  - Intron's platform has expanded to 57 languages — [TechCabal](https://techcabal.com/?p=182961)
  - No open weights were found, so it is a cloud API.
- **Spitch**
  - Cloud TTS and STT for Yoruba, Hausa, Igbo, Nigerian English and Amharic, also offered via the Cencori AI Gateway — [Connecting Africa](https://www.connectingafrica.com/ai/cencori-spitch-build-speech-ai-models-for-african-languages); [TechCabal](https://techcabal.com/?p=163520)
  - No offline or on-device offering was found.
- **YarnGPT (Nigerian-accent English TTS)**
  - Built on SmolLM2-360M with 11 voices; the card is apache-2.0 — [HF saheedniyi/YarnGPT](https://huggingface.co/saheedniyi/YarnGPT)
  - YarnGPT2 is 366M params and adds languages — [HF YarnGPT2](https://huggingface.co/saheedniyi/YarnGPT2)
  - The YarnGPT-local variant is CC-BY-NC-SA-4.0 — [HF YarnGPT-local](https://huggingface.co/saheedniyi/YarnGPT-local/blob/main/README.md)
  - The card warns it may not capture the full diversity of Nigerian accents.
- **Other Nigerian TTS models**
  - WAXAL-Piper Hausa: 8 voices, MIT, warm-started from en_US-lessac-medium, grapheme input because espeak-ng has no Hausa voice — [HF murya-piper-hausa-tts](https://huggingface.co/adab-tech/murya-piper-hausa-tts)
  - Chatterbox LoRA (yusasif/NG-Multi-lang): Hausa, Yoruba, Igbo and Nigerian English. Reported CER is about 8.8% for Hausa, 45% for Yoruba and 12% for Nigerian English, and Hausa tone is not modelled — [HF yusasif/NG-Multi-lang](https://huggingface.co/yusasif/NG-Multi-lang)
  - F5-TTS Yoruba with diacritics: CC-BY-NC — [HF naijaml/f5-tts-yoruba](https://huggingface.co/naijaml/f5-tts-yoruba)
  - Spark-TTS African voice: Igbo, Yoruba, Hausa and Pidgin — [HF 9jaLingo](https://huggingface.co/9jaLingo/9jaLingo-TTS-African-ckpt-25k)
  - Accent-aware StyleTTS2 for Nigerian English (NeurIPS 2025 workshop) — [NeurIPS](https://neurips.cc/virtual/2025/133733)
  - Community Whisper-small multilingual Nigerian ASR — [HF yusasif/whisper-small-multilingual](https://huggingface.co/yusasif/whisper-small-multilingual)

### Inferences
- Shippable on-device, commercially licensed options:
  - ASR: Omnilingual CTC_300M, quantized to int8 at roughly 330 MB. It is non-streaming CTC and would need chunking.
  - ASR: Whisper-small or tiny fine-tuned on WAXAL, FLEURS and Common Voice (WAXAL-NET recipe).
  - TTS: Hausa Piper (MIT).
- NaijaVox-2.0, at about 2B params and based on large-v3, is too big for phones; it is useful as a teacher for distillation or pseudo-labelling.
- MMS is technically ideal for phones (VITS TTS and adapters), but NC licensing rules it out unless Meta grants terms.
- N-ATLAS's 1,000-user cap and LLM focus make it unsuitable as Voxa's on-device speech engine.

### Gaps
- I could not verify whether N-ATLAS released separate ASR weights, or their sizes and licence; the TechCabal page was blocked.
- The Omnilingual ASR per-language CER for yor, hau and ibo was not retrieved (see the paper, arXiv 2511.09690).
- Awarri's and Lelapa's offerings for Nigerian languages were not researched in depth. Lelapa focuses on Southern and East African languages, and I found nothing Nigerian-specific.
- The licence of the YarnGPT GitHub code is unconfirmed; the model card says Apache-2.0.
- No Kokoro voice for Nigerian English was found.

## Q4. How do tone marks, diacritics, code-switching and Nigerian Pidgin affect ASR and TTS?

### Takeaway
Yoruba (and Igbo) tone diacritics are lexically essential, and plain-text input is usually undiacritized. TTS therefore needs a diacritic-restoration front end, while current ASR models do better when outputting text without tone marks. Natural code-switching breaks zero-shot Whisper, MMS and Omnilingual. Pidgin is comparatively easy (14.7% WER fine-tuned), but its open data is small and read-speech only.

### Cited Findings
- Undiacritized Yoruba is highly ambiguous: "igba" can mean calabash, time, garden egg or two hundred. Yo-ByT5 (arXiv Oct 2026) targets efficient diacritic restoration and calls diacritic dependency a central unsolved problem — [arXiv 2610.01634](https://arxiv.org/pdf/2610.01634)
- An older TiMBL restorer reached 98% syllable-level and 93% word-level accuracy. Seq2seq restoration was shown at Interspeech 2018 (older item) — [arXiv 1804.00832](https://arxiv.org/pdf/1804.00832); [arXiv 2003.10564](https://arxiv.org/pdf/2003.10564.pdf)
- In a LoResLM 2026 study, MMS-1B-all and Whisper-small "consistently favored non-tone-marked data," with substantially lower error rates than on tone-marked transcripts — [ACL LoResLM 2026](https://preview.aclanthology.org/new-sigs/2026.loreslm-1.14/)
- The Hausa Piper voice uses graphemes because espeak-ng lacks Hausa — [HF murya-piper-hausa-tts](https://huggingface.co/adab-tech/murya-piper-hausa-tts). The Chatterbox LoRA does not model Hausa tone, and Yoruba CER is about 45% — [HF NG-Multi-lang](https://huggingface.co/yusasif/NG-Multi-lang)
- YECS (120 hours of Yoruba-English) reports that Whisper, MMS and Omnilingual ASR fail to generalize to natural code-switching zero-shot — [NeurIPS 2026 YECS](https://neurips.cc/virtual/2026/179704). A switch-aware evaluation paper also exists — [arXiv 2609.11786](https://arxiv.org/pdf/2609.11786)
- The Pidgin ASR Combined card says "casual / conversational Pidgin and heavy code-switching with Yoruba / Igbo / Hausa are not present" — [HF pidgin-asr-combined](https://huggingface.co/datasets/michaelodafe/pidgin-asr-combined)
- The original Nigerian Pidgin ASR work (2020, revised 2025) released a parallel speech-text dataset and model weights — [arXiv 2010.11123](https://arxiv.org/abs/2010.11123v2)
- NaijaVox-2.0 reports Pidgin WER of 14.7%, the best of its five varieties — [HF NaijaVox-2.0](https://huggingface.co/Axiveri/NaijaVox-2.0)

### Inferences
- Yoruba and Igbo TTS in Voxa needs a small on-device diacritizer (a ByT5-small-class model or lighter). Otherwise TTS will mispronounce tones on most user-typed text.
- For Yoruba ASR, a sensible approach is to output undiacritized text by default and optionally restore diacritics afterwards.
- Meetings mixing English, Pidgin and a local language cannot be handled by any single on-device model today. A practical option is to transcribe English and Pidgin with an English model fine-tuned on Nigerian and Pidgin data, and treat the local-language segments as best-effort.

### Gaps
- I found no Igbo-specific diacritic-restoration tool, and no evaluation of tone-mark restoration latency on mobile.
- I found no tri-lingual (English + Pidgin + local language) meeting corpus.

## Q5. How much data and compute does it take to fine-tune a small ASR model or a Piper/Kokoro voice for Nigerian English?

### Takeaway
There is public evidence that full fine-tunes of Whisper-small and Whisper-tiny on tens to hundreds of hours of African speech give large gains: AfriSpeech Whisper-small went from 49 to 23% WER, and WAXAL-NET models reach about 38-44% macro WER on new languages. Adapting Whisper-small to Hausa, Yoruba and Igbo has been done with only 10 hours of NaijaVoices. Piper voices can be warm-started from an English checkpoint, as the Hausa WAXAL voice was. I found no reported GPU-hour figures, and no public Zipformer or Kokoro fine-tune for Nigerian English.

### Cited Findings
- Whisper-small fine-tuned on AfriSpeech-200 (about 200 hours) went from 49.15% to 22.94% WER — [HF whisper-small-afrispeech](https://huggingface.co/Professor/whisper-small-afrispeech)
- An AfricaNLP 2026 paper adapts Whisper-small to Hausa, Yoruba and Igbo using a 10-hour NaijaVoices subset, comparing full fine-tuning with PEFT — [ACL AfricaNLP 2026](https://aclanthology.org/2026.africanlp-main.19.pdf)
- WAXAL-NET fully fine-tuned Whisper-tiny and Whisper-small, and trained MMS-300M CTC with a frozen encoder, per language. The best fine-tuned model is 26.9 points better than the best zero-shot model — [HF papers 2606.02375](https://huggingface.co/papers/2606.02375.md)
- NaijaVox-2.0 used LoRA on Whisper-large-v3 with only about 25.9k utterances across five varieties — [HF NaijaVox-2.0](https://huggingface.co/Axiveri/NaijaVox-2.0)
- The Piper Hausa voice was warm-started from rhasspy en_US-lessac-medium using WAXAL TTS data, with grapheme input — [HF murya-piper-hausa-tts](https://huggingface.co/adab-tech/murya-piper-hausa-tts)
- Faster-whisper CTranslate2 builds already exist for 51 African languages (Sunbird) — [HF Sunbird](https://huggingface.co/Sunbird/faster-whisper-51-african-languages)

### Inferences
- For Nigerian English, a Whisper-small or Distil fine-tune on about 100-200 hours of accented speech is a well-trodden path. With an NC-free source mix (WAXAL Nigerian English if present, Common Voice Nigerian-accent English, own recordings) or a commercial AfriSpeech license from Intron, expect roughly 20-25% WER on AfriSpeech.
- A streaming Zipformer transducer would need the same data plus k2/icefall training. There is no public precedent, so that is an R&D risk.
- A Nigerian-English Piper voice is feasible from a single-speaker studio set of a few hours using the lessac warm-start, following the Hausa precedent. YarnGPT is a possible teacher for synthetic data, subject to its Apache-2.0 card.
- On-device Yoruba, Hausa and Igbo:
  - Hausa is the easiest: the most BibleTTS and Common Voice data, an MIT Piper voice already exists, and the lowest zero-shot CER.
  - Yoruba needs diacritization.
  - Igbo is hardest: the least data, no Whisper token, and the highest WER (30-42% even with large fine-tuned models).

### Gaps
- I found no published GPU-hour or cost figures for these fine-tunes.
- I found no public Zipformer, Moonshine or Kokoro fine-tune for Nigerian English or for Nigerian languages.
- I found no measured on-phone RTF for any Nigerian-language model.
