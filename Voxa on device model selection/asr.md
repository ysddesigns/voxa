# On-device offline streaming ASR for Voxa (React Native/Expo, iOS + Android 8+, 2 GB RAM floor)

Research date: 2026-11-19. Roughly 17 searches and fetches. Dates are given wherever a source shows one. Important caveat: **I found no published phone-measured RTF, RAM, battery or thermal data for any sherpa-onnx streaming model.** Most speed numbers come from desktop or server CPUs, an Apple M3, or Qualcomm AI Hub profiling. Treat every phone figure as something to measure on real devices.

## sherpa-onnx streaming models (Zipformer transducer, NeMo FastConformer streaming, Nemotron streaming): sizes, WER, speed

### Takeaway
For the 2 GB Lite tier, a streaming Zipformer transducer in sherpa-onnx (int8) is still the safest default. The 20M English model needs about 42 MB int8, and the larger 2023-06 models need about 70–180 MB int8. All are true streaming and run well under real time on one desktop CPU thread. Two higher-accuracy streaming options appeared in 2026. NVIDIA's Nemotron Speech Streaming 0.6B (about 7.0% average Open ASR WER at 0.56 s chunks, built-in punctuation and capitalisation, 0.67 GB at int4) fits the Pro tier. NeMo's 114M cache-aware FastConformer streaming model fits the Standard tier.

### Cited Findings
**Zipformer streaming (English) in sherpa-onnx. Sizes and RTF are from the sherpa-onnx docs, measured on a desktop CPU with a single sample wav:**
- `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` (LibriSpeech-trained). Encoder 41 MB int8 / 85 MB fp32, decoder 527 KB int8, joiner 253 KB int8, so about 42 MB int8 in total. RTF 0.038 int8 / 0.049 fp32 with `num_threads=1`, CPU — [sherpa-onnx Zipformer transducer models](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html)
- `streaming-zipformer-en-2023-06-26` (LibriSpeech). Encoder 68 MB int8 / 250 MB fp32. RTF 0.062 int8 / 0.077 fp32 — [same page](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html)
- `streaming-zipformer-en-2023-06-21` (LibriSpeech + GigaSpeech, so more varied training audio). Encoder 179 MB int8 / 337 MB fp32. RTF 0.062 int8 — [same page](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html)
- `streaming-zipformer-en-2023-02-21`. Encoder 180 MB int8 / 338 MB fp32. RTF 0.096 int8 with 2 threads on 6.6 s of audio — [same page](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html)
- The docs page gives no WER for these packages. A newer Kroko English streaming Zipformer (`sherpa-onnx-streaming-zipformer-en-kroko-2025-08-06`) is registered as a sherpa-onnx pretrained model, but I found no published size or WER for it — [Kroko-ASR card](https://huggingface.co/sheldonrobinson/Kroko-ASR/blob/main/README.md) (search snippet only)
- A third-party fine-tuned streaming Zipformer (Indian English) says production streaming WER runs about 6% higher than icefall batched evaluation, which shows the streaming accuracy penalty (single unverified source) — [HF card](https://huggingface.co/Akshatkasera007/STT-streaming-zipformer-indian-en)

**NeMo cache-aware FastConformer streaming:**
- `stt_en_fastconformer_hybrid_large_streaming_multi`: about 114M params. Selectable look-ahead of 0, 80, 480 or 1040 ms, with average latency about half of each. Transducer WER on LibriSpeech test-other is 5.4 (1040 ms), 5.7 (480 ms), 6.4 (80 ms) and 7.0 (0 ms) — [NVIDIA HF card](https://huggingface.co/nvidia/stt_en_fastconformer_hybrid_large_streaming_multi)
- sherpa-onnx packages `sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-{80ms,480ms,1040ms}` exist in a mirror. I could not verify their contents or sizes — [xumo/onnx_models commit](https://huggingface.co/xumo/onnx_models/commit/1bd73e49eaf99115aeb9365ea1e1a2741a8564e7)

**NVIDIA Nemotron Speech Streaming EN 0.6B (checkpoint released 2026-03-13; Jan 2026 checkpoint on a separate branch):**
- Cache-aware FastConformer (24 layers) with an RNN-T decoder, about 600M params. Trained on about 250k hours of en-US speech. Built-in punctuation and capitalisation. NVIDIA Open Model License (commercial use allowed) — [NVIDIA HF card](https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b)
- Average Open ASR WER (without punctuation/casing) by chunk size, with LibriSpeech clean/other and AMI:
  - 1.12 s: 6.93% average, 2.32 / 4.84, AMI 11.73
  - 0.56 s: 7.07% average, 2.46 / 5.07, AMI 11.88
  - 0.16 s: 7.67% average, 2.56 / 5.57, AMI 14.71
  - 0.08 s: 8.43% average, 2.80 / 6.01, AMI 18.29
  - Source: [NVIDIA HF card](https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b)
- A successor, Nemotron 3.5 ASR Streaming 0.6B covering 40 language-locales, was announced 2026-06-04 — [NVIDIA HF card](https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b). Community CoreML INT8 and LiteRT INT8 conversions exist — [aufklarer CoreML INT8](https://huggingface.co/aufklarer/Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8), [soniqo LiteRT INT8](https://huggingface.co/soniqo/Nemotron-Speech-Streaming-LiteRT)
- Microsoft CoreAI paper (arXiv 2604.14493, April 2026) calls Nemotron-0.6B with int4 k-quant "the strongest candidate for real-time English streaming on resource-constrained hardware":
  - Size: fp32 2.47 GB, int8 1.28 GB, int4 0.67 GB (encoder quantised only; decoder and joiner stay fp32)
  - Average ESB WER at the (7,10,7) setting, which is a 0.56 s chunk: ONNX fp32 8.03%, int8 8.01%, int4 8.20%
  - CPU RTFx about 7.2, measured on a 32-core AMD EPYC server. No phones were tested.
  - At a 0.16 s delay: 8.89% WER and RTFx 2.87
  - The same paper gives chunked Parakeet TDT 0.6B v3 12.83% average WER at a 2.4 s delay (best chunked 9.22%, against 6.32% in batch mode), and CPU RTFx 1.38
  - Source: [arXiv 2604.14493v2](https://arxiv.org/html/2604.14493v2)

### Inferences
- Lite tier (2 GB): the 20M Zipformer int8 (about 42 MB download) or the 2023-06-26 int8 (about 70 MB) should fit comfortably. With desktop single-thread RTF of 0.04–0.06 and low-end ARM cores maybe 5–10x slower, RTF should land around 0.2–0.6 on a Cortex-A53/A55 phone. That is an estimate that needs measuring. The A55 reference of about 74 GOPS in the Moonshine v2 paper gives a sense of the compute headroom.
- Standard tier: the NeMo 114M FastConformer streaming transducer at 480 ms (5.7 test-other) is a large accuracy step up for about 100–130 MB int8. The size is an estimate from param count, not verified.
- Pro tier: Nemotron 0.6B int4 (0.67 GB) or int8 (1.28 GB). The download is too big for the Nigerian mobile-data constraint unless it is optional and Wi-Fi only. Its RAM likely needs 4 GB+ devices.
- LibriSpeech-only Zipformers (20M, 06-26) will likely be weaker on accented and conversational meeting speech than the GigaSpeech-trained 06-21 model or Nemotron. Training-data breadth is the main proxy here.

### Gaps
- No phone-measured RTF, peak RAM, battery or thermal data for any sherpa-onnx streaming model on low-end ARM Android or iPhone.
- No published WER for the sherpa-onnx Zipformer English packages or for Kroko 2025-08-06.
- No streaming Paraformer English numbers. The sherpa-onnx streaming Paraformers I know of are Chinese/English bilingual; not researched.
- Licenses for icefall/sherpa-onnx Zipformer weights are not confirmed in my sources (believed Apache-2.0; verify). The Kroko card shows "license: other".
- Not confirmed whether sherpa-onnx officially packages Nemotron Speech Streaming 0.6B.

## Whisper family on device (whisper.cpp, whisper.rn, distil-whisper, large-v3-turbo, CoreML)

### Takeaway
Whisper is not a streaming model. On device it only gives pseudo-streaming through VAD-sliced chunks. That costs latency and compute, and the Moonshine v2 paper measured Whisper Small at about 1.9 s response latency on an M3, against 148 ms for Moonshine v2 Small. whisper.rn is mature (MIT, Expo via prebuild, CoreML, a RealtimeTranscriber with VAD, and now Parakeet TDT v3 support). It makes most sense as a high-accuracy re-pass or an iOS option, not as the live engine on 2 GB Android phones.

### Cited Findings
- whisper.rn is a React Native binding for whisper.cpp under the MIT license. It supports Whisper and NVIDIA Parakeet TDT 0.6B v3 (`initParakeet`) — [whisper.rn GitHub](https://github.com/mybigday/whisper.rn)
- whisper.rn features — [whisper.rn GitHub](https://github.com/mybigday/whisper.rn):
  - VAD through vad.cpp, with Silero and FireRedVAD models
  - CoreML on iOS 15+ (`.mlmodelc` plus GGML fallback)
  - GPU on by default, and an experimental Hexagon NPU path on Snapdragon SM8450+
  - Expo needs a prebuild
- whisper.rn `RealtimeTranscriber`: VAD (`StreamVad`) with auto-slicing (`audioSliceSec`, `autoSliceOnSpeechEnd`). By default it keeps every per-slice result until stop, so long sessions grow memory without bound. `maxResultsInMemory`, `maxSlicesInMemory` and `maxPromptSlices` must be set for 60-minute meetings — [whisper.rn GitHub](https://github.com/mybigday/whisper.rn)
- whisper.rn Hexagon NPU on a Samsung S25 Ultra: large-v3-turbo q8_0 encode about 612 ms, against about 705 ms for f16. q5 quantisations fall back to CPU. Parakeet GGUF sizes are 356 MB (q4_0) to 1.26 GB (f16). Medium and large models on iOS need the Extended Virtual Addressing entitlement — [whisper.rn GitHub](https://github.com/mybigday/whisper.rn)
- Real-time response latency on an Apple M3 (ONNX Runtime CPU) — [Moonshine v2 paper](https://arxiv.org/html/2602.12241):

  | Model | Latency (ms) | Compute load |
  |---|---|---|
  | Whisper Tiny | 289 | 8.5% |
  | Whisper Base | 553 | 16.2% |
  | Whisper Small | 1940 | 56.8% |
  | Whisper Large v3 | 11286 | 331% |
- Qualcomm AI Hub (TFLite/QNN, not whisper.cpp) — [qualcomm/Whisper-Tiny-En](https://huggingface.co/qualcomm/Whisper-Tiny-En), [qualcomm/Whisper-Small](https://huggingface.co/qualcomm/Whisper-Small), [qualcomm/Whisper-Tiny](https://huggingface.co/qualcomm/Whisper-Tiny):
  - Whisper-Tiny-En encoder on S23 Ultra (8 Gen 2): about 69 ms GPU, about 277 ms NPU
  - Whisper-Small encoder: about 82 ms on 8 Gen 3 NPU
  - Whisper-Tiny decoder: about 1.9 ms per token on 8 Gen 3 NPU
  - These are flagship-only figures
- Accuracy on LibriSpeech test-clean (single vendor, Inscribe, run on a Mac): Whisper Small 3.74%, Base 5.42%, Tiny 7.88%. On harder audio: Whisper Small 7.95% — [GIGAZINE summarising the Inscribe benchmark, 2026-07-14](https://www.gigazine.net/gsc_news/en/20260714-apple-speech-analyzer-benchmark/)

### Inferences
- Whisper's fixed 30 s window means short VAD slices waste encoder compute, which makes Whisper the worst battery choice for 60-minute screen-off sessions on Lite and Standard Android phones. This follows from the latency and compute-load data above. Direct battery measurements are a gap.
- A good use of Whisper or Parakeet through whisper.rn would be an optional post-meeting re-transcription pass on Pro devices, or on iOS with CoreML.

### Gaps
- No whisper.cpp tiny/base RTF on low-end ARM Android (A53/A55) or on specific iPhones.
- No distil-whisper on-device phone numbers, and no Whisper battery/thermal data for long sessions.
- No accented-English WER for Whisper sizes in my sources (another researcher covers this).

## Moonshine, Parakeet TDT / Canary, Kyutai STT, Vosk, and OS engines (Apple SpeechAnalyzer, Android SpeechRecognizer)

### Takeaway
Moonshine v2 Streaming (Feb 2026: Tiny 34M, Small 123M, Medium 245M) is the strongest new low-latency candidate. Small gets 7.84% average Open ASR WER (LibriSpeech 2.49/6.78) with 148 ms response latency on an M3. Parakeet TDT 0.6B v3 is accurate in batch mode but loses about 46% relative WER when chunked for streaming, and its downloads run 356 MB–622 MB+. Kyutai STT is iPhone-only in practice (the 1B model was tested on an iPhone 16 Pro) and too large. Vosk small (40 MB, 9.85% LibriSpeech clean) is outdated. Apple SpeechTranscriber (iOS 26) is fast, free of app size cost and handles long-form audio, but only runs on newer devices and has conflicting accuracy reports. Android's on-device SpeechRecognizer is API 31+ only, is officially "not intended for continuous recognition", and behaves inconsistently across OEMs. That rules it out as the primary engine for Android 8+.

### Cited Findings
**Moonshine:**
- Moonshine v1 (2024): Tiny gives a 5x compute reduction for a 10 s segment with no WER increase over Whisper tiny.en — [arXiv 2410.15608](https://arxiv.org/pdf/2410.15608v2)
- Moonshine v2 Streaming (arXiv 2602.12241, 12 Feb 2026). Sliding-window "ergodic" streaming encoder, 50 Hz frames, 80 ms lookahead, 320 ms conservative finalisation delay. Params: Tiny 33.6M, Small 123.4M, Medium 244.9M. License is described only as "permissive" — [Moonshine v2 paper](https://arxiv.org/html/2602.12241)
- Moonshine v2 WER by size — [Moonshine v2 paper](https://arxiv.org/html/2602.12241):

  | Model | Average Open ASR WER | LibriSpeech clean / other | AMI | Earnings-22 |
  |---|---|---|---|---|
  | Tiny | 12.01% | 4.49 / 12.09 | 19.03 | 20.27 |
  | Small | 7.84% | 2.49 / 6.78 | 12.54 | 13.53 |
  | Medium | 6.65% | 2.08 / 5.00 | 10.68 | 11.90 |
- Moonshine v2 response latency on an M3 CPU: Tiny 50 ms, Small 148 ms, Medium 258 ms. Compute load is 8%, 18% and 29% respectively. No phones were tested. The paper gives an Arm Cortex-A55 at about 74 GOPS as an edge reference — [Moonshine v2 paper](https://arxiv.org/html/2602.12241)
- Model cards: the decoder is autoregressive, so full-output latency grows with transcript length. The Transformers implementation does not yet do fully efficient streaming. Small has an RTFx of 566 on the Open ASR Leaderboard — [moonshine-streaming-small](https://huggingface.co/moonshine-ai/moonshine-streaming-small), [moonshine-streaming-tiny](https://huggingface.co/moonshine-ai/moonshine-streaming-tiny)
- A React Native binding `@siteed/moonshine.rn` (v0.4.0) exists — [jsDelivr README](https://cdn.jsdelivr.net/npm/@siteed/moonshine.rn@0.4.0/README.md). Not evaluated.

**Parakeet TDT 0.6B v3 and Canary:**
- The sherpa-onnx docs list an int8 v3 package. One int8 ONNX distribution has an encoder of about 622 MB — [sherpa NeMo transducer models](https://csukuangfj.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html), [soniqo ONNX INT8](https://huggingface.co/soniqo/Parakeet-TDT-v3-ONNX)
- Soniqo's Android guide claims RTF 0.12 (about 150 ms for 1.5 s) with NNAPI, but names no phone. Vendor claim, unverified — [soniqo Parakeet Android](https://soniqo.audio/guides/parakeet/android)
- Parakeet is an offline (non-streaming) model. Chunked to a 2.4 s delay it reaches 12.83% average WER (best chunked 9.22%, against 6.32% in batch). Canary-1B-v2 is 6.36 GB with a 4.8 s delay and 12.45% WER, so it is unsuitable — [arXiv 2604.14493v2](https://arxiv.org/html/2604.14493v2)

**Kyutai STT:**
- `stt-1b-en_fr` (about 1B params, 0.5 s delay, semantic VAD) was tested on an iPhone 16 Pro through moshi-swift/MLX. `stt-2.6b-en` (2.5 s delay) has no phone test. Semantic VAD is only available in the Rust server — [kyutai-labs/delayed-streams-modeling](https://github.com/kyutai-labs/delayed-streams-modeling), [Kyutai STT](https://kyutai.org/stt)

**Vosk:**
- `vosk-model-small-en-us-0.15`: 40 MB (41.2 MB zip), WER 9.85 on LibriSpeech test-clean and 10.38 on TED-LIUM, Apache 2.0, aimed at Android and Raspberry Pi. The large `en-us-0.22` model is 1.8 GB at 5.69 — [Vosk models](https://alphacephei.com/vosk/models)
- A user calls the small model's performance poor next to Whisper tiny/base. That is opinion — [vosk-api issue #1644](https://github.com/alphacep/vosk-api/issues/1644)

**Apple SpeechAnalyzer / SpeechTranscriber (iOS 26, WWDC 2025):**
- The model is installed through AssetInventory into system storage. It adds nothing to the app's size or run-time memory, and language packs can be preloaded for offline use — [WWDC25 session 277](https://developer.apple.com/videos/play/wwdc2025/277/?time=161), [SpeechAnalyzer guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide)
- Apple names long-form conversational speech as the main improvement — [Argmax blog (vendor)](https://www.argmaxinc.com/blog/apple-and-argmax)
- Device support: `SpeechTranscriber.isAvailable` returns false on some iPhone 11 Pro units. The 16-core Neural Engine theory is one user's hypothesis. DictationTranscriber is the fallback for older devices — [Apple forums thread 806765](https://developer.apple.com/forums/thread/806765), [DictationTranscriber docs](https://developer.apple.com/documentation/speech/dictationtranscriber.md)
- Speed (Mac): 34 minutes of audio in 45 s, against 1 min 41 s for MacWhisper Large V3 Turbo — [MacRumors, June 2025](https://macrumors.com/2025/06/18/apple-transcription-api-faster-than-whisper)
- Accuracy reports conflict:
  - heise: Apple 8% WER against Whisper Large V3 Turbo 1% — [heise](https://heise.de/-10475273)
  - A 15-clip English test: Apple 7.63% against Whisper 3.95% — [ifun.de](https://www.ifun.de/apples-neue-spracherkennung-schnell-aber-weniger-praezise-258151/)
  - Inscribe on LibriSpeech: Apple 2.12% clean and 4.56% on harder audio, against Whisper Small 3.74% and 7.95% — [GIGAZINE 2026-07-14](https://www.gigazine.net/gsc_news/en/20260714-apple-speech-analyzer-benchmark/)

**Android SpeechRecognizer:**
- `createOnDeviceSpeechRecognizer` was added in API 31 (Android 12) — [API 31 diff](https://developer.android.com/sdk/api_diff/31/changes/android.speech.SpeechRecognizer)
- The official reference says the API "is not intended to be used for continuous recognition" because of battery and bandwidth — [SpeechRecognizer reference](https://developer.android.com/reference/android/speech/SpeechRecognizer)
- expo-speech-recognition: continuous mode is not supported on Android 12 and below, and punctuation needs Android 13+ with on-device recognition — [expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition)
- Anecdotal: on Android 15 and earlier, the on-device recognizer often returns ERROR_NETWORK when the phone is offline, and some OEM ROMs lack the on-device service — [xckevin blog](https://xckevin.github.io/en/blog/android-on-device-speech-recognition/)

### Inferences
- OS engines cannot be Voxa's primary engine:
  - Android 8–11 has no on-device API at all.
  - The continuous-use guidance and OEM variance make Android 12+ unreliable.
  - iOS 26 SpeechTranscriber excludes older iPhones, so Voxa would get inconsistent accuracy across devices with no control over model updates.
  - SpeechTranscriber is a strong optional iOS 26+ path, given zero download cost and ANE efficiency.
- Moonshine v2 Tiny or Small could be a Lite/Standard alternative to Zipformer, if an ONNX/sherpa-onnx or moonshine.rn path proves stable on Android. Small's 123M params put int8 at roughly 120–130 MB, which is an estimate.

### Gaps
- No Moonshine v2 phone timings and no confirmed exact license text. Moonshine v1 was MIT; the v2 license is unverified.
- No Parakeet or Kyutai battery data. No official SpeechTranscriber device list or WER.
- No source on whether Android 13–16 on-device recognition is reliable for 60-minute sessions.

## VAD and punctuation/casing restoration (sherpa-onnx)

### Takeaway
Silero VAD (about 2 MB) and TEN VAD (about 306 KB library) are both small. sherpa-onnx ships an English online punctuation and casing model (`sherpa-onnx-online-punct-en-2024-08-06`, CNN-BiLSTM, with an int8 variant) for streaming transcripts. Nemotron already outputs punctuation and casing natively.

### Cited Findings
- `sherpa-onnx-online-punct-en-2024-08-06`: CNN-BiLSTM, runs incrementally on streaming text, ships `model.onnx`, `model.int8.onnx` and `bpe.vocab`. File size was not stated — [sherpa-onnx punctuation pretrained models](https://k2-fsa.github.io/sherpa/onnx/punctuation/pretrained_models.html)
- TEN VAD library is about 306 KB, against 2.16 MB (JIT) or 2.22 MB (ONNX) for Silero VAD. TEN VAD claims lower compute and requires 16 kHz audio — [TEN VAD GitHub](https://github.com/TEN-framework/ten-vad), [Silero review](https://www.cekura.ai/blogs/what-is-silero-vad)
- whisper.rn's vad.cpp supports Silero and FireRedVAD — [whisper.rn](https://github.com/mybigday/whisper.rn)
- Nemotron Speech Streaming outputs punctuation and casing natively — [NVIDIA HF card](https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b)

### Inferences
- For transducer streaming (Zipformer), VAD is optional because sherpa-onnx has endpoint detection. VAD still saves battery by gating compute during silence in long meetings.

### Gaps
- I found no independent accuracy comparison of TEN VAD and Silero for meeting audio, no size or accuracy figure for the punctuation model, and no casing quality data.

## React Native / Expo integration and background constraints

### Takeaway
The main options are XDcobra's `react-native-sherpa-onnx` (MIT, sherpa-onnx 1.12.35, streaming STT with endpointing, native mic capture, model download manager, Expo config plugin, Android API 24+ / iOS 13+, but VAD is not yet supported, planned for 0.7.0, and the project is small at about 45 stars), `whisper.rn` (mature, needs Expo prebuild), and a custom Expo native module that wraps sherpa-onnx's Kotlin/Swift APIs. Android 14+ needs a microphone-type foreground service started while the app is in the foreground. Note that the package's API 24 minimum is Android 7, so it covers the Android 8 floor.

### Cited Findings
- `react-native-sherpa-onnx` (XDcobra) — [GitHub](https://github.com/XDcobra/react-native-sherpa-onnx):
  - Version and platforms: v0.3.0 (breaking changes from 0.2.x), TurboModule, Android API 24+ and iOS 13+, RN 0.70+
  - Features: streaming STT (`createStreamingSTT`) with partial results and endpoint detection, native mic capture with resampling, TTS, and speech enhancement. VAD is planned for 0.7.0 and diarization for 0.5.0.
  - Packaging: runtime model download manager, Play Asset Delivery, Expo config plugin, and int8 models preferred
  - Acceleration: NNAPI, XNNPACK and QNN (QNN needs proprietary Qualcomm libraries) on Android, CoreML on iOS
  - Size and license: the iOS XCFramework is about 80 MB. MIT, but bundled FFmpeg and Shine are LGPL.
  - Maturity: about 45 stars
- Offline-only models such as Whisper and SenseVoice are not supported for streaming in that package — [streaming STT docs](https://www.mintlify.com/xdcobra/react-native-sherpa-onnx/features/streaming-stt)
- Alternatives: `@siteed/sherpa-onnx.rn` (labelled in development), `react-native-sherpa-onnx-offline-stt` (offline only), and `expo-speech-recognition` (wraps OS engines) — [search results](https://www.pkgstats.com/pkg:@siteed/sherpa-onnx.rn), [expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition)
- Android 14+ foreground service rules — [Android FGS types](https://developer.android.com/develop/background-work/services/fgs/service-types):
  - Must declare `foregroundServiceType="microphone"` and hold RECORD_AUDIO
  - Cannot be created from the background (while-in-use restriction) or from BOOT_COMPLETED
  - Intended for "voice recorders"
- I found no documented runtime time limit for the microphone FGS type. The timeout ANR rule applies to other types — [Android 15 FGS changes](https://developer.android.com/about/versions/15/changes/foreground-service-types)
- react-native-sherpa-onnx background model downloads need foreground-service and notification (API 33+) permissions — [GitHub](https://github.com/XDcobra/react-native-sherpa-onnx)

### Inferences
- For a 60-minute screen-off meeting, the safest architecture is native: audio capture plus ASR in a Kotlin foreground service (microphone type, started from the UI) and an iOS background audio session. That would be a custom Expo module, or a fork of react-native-sherpa-onnx with results streamed to JS. Running inference through JS timers would be throttled.
- Recommended per tier (synthesis; measure on devices first):
  - **Lite (2 GB, Android 8+):** sherpa-onnx streaming Zipformer int8. Use the 20M model (about 42 MB) or the 2023-06-26 model (about 70 MB), plus Silero or TEN VAD and online-punct-en int8. Moonshine v2 Tiny is an alternative to evaluate.
  - **Standard (3–4 GB):** Zipformer 2023-06-21 int8 (about 180 MB, GigaSpeech-trained), NeMo FastConformer streaming 114M at 480 ms, or Moonshine v2 Small.
  - **Pro (6 GB+ / recent iPhone):** Nemotron Speech Streaming 0.6B int4 (0.67 GB, native punctuation and casing, optional Wi-Fi download). On iOS 26, SpeechTranscriber as a zero-download option. Optional post-meeting Whisper large-v3-turbo or Parakeet re-pass through whisper.rn.

### Gaps
- No iOS-specific source collected on background audio session limits for 60+ minute recording (`UIBackgroundModes` audio). The report writer should flag this.
- No battery or thermal measurements for any engine over 60-minute sessions. This is the largest open gap and needs in-house testing on Lite devices such as a Cortex-A53, 2 GB Android Go phone.
