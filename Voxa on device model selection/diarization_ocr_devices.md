# Voxa supporting research: on-device diarization, offline OCR, Nigerian device landscape and tiering

Research date: 2026-11-19. Items dated before 2025 or not re-verified are flagged.

## (A) On-device speaker diarization: sherpa-onnx, alternatives, live vs post-meeting, realistic accuracy

### Takeaway
sherpa-onnx gives Voxa a cross-platform (Android + iOS) diarization pipeline that is small and fast enough for low-end phones: pyannote segmentation-3.0 at 1.5 MB int8 plus a NeMo TitaNet-small embedder, about 0.11 RTF on one CPU thread. It is offline/batch only, so it runs after the meeting or on finished chunks, not live. Live diarization needs streaming end-to-end models. NVIDIA Streaming Sortformer (117M params, 4 speakers max, NVIDIA Open Model License) has no published mobile benchmarks. FluidAudio (Apache 2.0, iOS CoreML) ships LS-EEND and Sortformer streaming on iOS with an RN wrapper. Expect DER of roughly 15-25% for 3-4 speakers in meetings, and much worse (35-40%+) at 5+ speakers on a single far-field mic.

### Cited Findings
**sherpa-onnx (k2-fsa)**
- Segmentation models offered: `sherpa-onnx-pyannote-segmentation-3-0` (model.onnx 5.7 MB; model.int8.onnx 1.5 MB) and `sherpa-onnx-reverb-diarization-v1` (model.onnx 9.1 MB; int8 2.3 MB). The Reverb model is "accessible under a non-commercial license", so Voxa should avoid it in a commercial app. — [sherpa-onnx diarization models](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html)
- Recommended embedders: 3D-Speaker `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx` and NeMo `nemo_en_titanet_small.onnx`, downloaded from the speaker-recognition-models release. — [sherpa-onnx diarization models](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html)
- RTF measured by sherpa-onnx (56.9 s 4-speaker file, CPU, 1 thread; the host is likely a desktop, not a phone):

  | Segmentation | Embedding | RTF |
  |---|---|---|
  | pyannote-3.0 fp32 | 3D-Speaker | 0.297 |
  | pyannote-3.0 fp32 | NeMo TitaNet-small | 0.119 |
  | pyannote-3.0 int8 | 3D-Speaker | 0.241 |
  | pyannote-3.0 int8 | NeMo TitaNet-small | 0.110 |
  | reverb-v1 int8 | NeMo | 0.170 |

  NeMo was the fastest embedder in every pairing. — [sherpa-onnx diarization models](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html)
- Input must be 16 kHz, 16-bit mono WAV. All examples use `sherpa-onnx-offline-speaker-diarization` on complete files, and the docs do not mention streaming or online diarization. — [sherpa-onnx diarization models](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html); [sherpa-onnx diarization index](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/index.html)
- The pipeline runs segmentation, then embedding extraction, then clustering over the whole file, with a fixed cluster count or a threshold. — [reverb diarization example script (HF)](https://huggingface.co/csukuangfj/sherpa-onnx-reverb-diarization-v1/raw/main/speaker-diarization-onnx.py)
- APIs exist for C, C++, C#, Dart, Go, Java, JS, Kotlin, Pascal, Python, Rust and Swift, and there are prebuilt Android diarization APKs. — [sherpa-onnx diarization index](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/index.html)
- Prebuilt diarization APKs come in arm64-v8a, armeabi-v7a, x86 and x86_64 builds (about 60 MB each), with pyannote + 3D-Speaker and pyannote + NeMo variants (versions 1.10.27-1.10.35). — [csukuangfj/sherpa-onnx-apk (HF)](https://huggingface.co/csukuangfj/sherpa-onnx-apk/tree/a2f7eea6eec13c56ef360e46a943e7c2f9b7da12/speaker-diarization/1.10.32)
- A third-party mirror lists the pyannote segmentation-3.0 ONNX as MIT. Upstream pyannote/segmentation-3.0 is gated on Hugging Face: users must accept the conditions. — [soniqo Pyannote-Segmentation-ONNX](https://huggingface.co/soniqo/Pyannote-Segmentation-ONNX); [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
- The community react-native-sherpa-onnx wrapper showed real-time diarization as "not yet implemented". Its docs page now returns HTTP 410, so the package's status is uncertain. — [search snippet of mintlify react-native-sherpa-onnx docs](https://www.mintlify.com/XDcobra/react-native-sherpa-onnx/api/diarization)

**pyannote**
- speaker-diarization-3.1 is MIT and pure PyTorch (onnxruntime was removed). DER with no collar and overlap included: AISHELL-4 12.2%, AMI headset mix 18.8%, AMI array1-ch1 22.4%, DIHARD3 full 21.7%, MSDWild 25.3%, AVA-AVD 50.0%. — [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
- The pyannote card says Community-1 is "much better than speaker-diarization-3.1" out of the box. I did not retrieve its license or DER table. — [pyannote/speaker-diarization-community-1](https://huggingface.co/pyannote/speaker-diarization-community-1)
- An independent 2025 benchmark (0.25 s collar) found commercial pyannoteAI best at 11.2% DER and open-source DiariZen at 13.3%. — [Benchmarking Diarization Models, arXiv 2509.26177](https://arxiv.org/html/2509.26177v1)

**NVIDIA Streaming Sortformer v2.1**
- 117M params, NVIDIA Open Model License, maximum 4 speakers. The card says "performance degrades on recordings with 5 and more speakers". — [nvidia/diar_streaming_sortformer_4spk-v2.1](https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2.1)
- Low-latency config: 1.04 s latency, RTF 0.093, measured on an RTX 6000 Ada GPU, not a phone. — [same](https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2.1)
- DER at 1.04 s latency:
  - CALLHOME: 2 spk 6.65, 3 spk 11.25, 4 spk 13.35, 5 spk 22.12, 6 spk 24.51
  - AMI: IHM 16.67, SDM (single distant mic) 20.57
  - AliMeeting: far 15.60
  - NOTSOFAR1: ≤4 spk 17.26, ≥5 spk 36.76
  - DIHARD III: ≥5 spk 41.42
  
  The 30.4 s-latency config is about 1-3 points better on each set. — [same](https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2.1)
- The card mentions a newer Nemotron-3-Diarization that reportedly supports 8 speakers. Not verified. — [same](https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2.1)
- Community ports exist: ONNX at [soniqo/Sortformer-Diarization-4spk-ONNX](https://huggingface.co/soniqo/Sortformer-Diarization-4spk-ONNX) and CoreML at [FluidInference/diar-streaming-sortformer-coreml](https://huggingface.co/FluidInference/diar-streaming-sortformer-coreml).

**FluidAudio (iOS/macOS, CoreML)**
- Apache 2.0 SDK (Sortformer weights stay under the NVIDIA license). Diarization options:
  - Offline: pyannote Community-1 + WeSpeaker + VBx clustering ("Use this for most use cases").
  - Streaming: LS-EEND (default; up to 10 speakers, 100 ms frame updates, 900 ms tentative preview).
  - Streaming: Sortformer (4 speakers, more stable identity).
  - Streaming: pyannote 3.1 + WeSpeaker (needs ≥5 s chunks; not recommended for low latency).
  
  There is an official RN wrapper, `@fluidinference/react-native-fluidaudio`. The README gives no diarization DER or iPhone RTF, and some models need iOS 18+. — [FluidAudio GitHub](https://github.com/FluidInference/FluidAudio)

**Other**
- diart (Python) does real-time diarization with incremental clustering on a rolling buffer updated every 500 ms. It is a design reference, not a mobile library. — [diart GitHub](https://github.com/juanmc2005/StreamingSpeakerDiarization)
- A LiteRT community Android pipeline (pyannote 3.1 recipe) runs segmentation-3.0 on CPU via onnxruntime and the embedder on GPU. — [litert-community/Speaker-Diarization-LiteRT](https://huggingface.co/litert-community/Speaker-Diarization-LiteRT)

### Inferences
- A sherpa-onnx diarization bundle of pyannote-3.0 int8 (1.5 MB) plus TitaNet-small (assumed tens of MB, not verified) is small enough for a Lite tier. At about 0.11 RTF on a desktop thread, a 2-4x slower low-end Helio/Unisoc core suggests roughly 0.25-0.5 RTF. A 60-minute meeting would then take about 15-30 minutes after it ends; this is an estimate, not a measurement.
- Speaker labels during the meeting would have to be approximate. One approach is to run sherpa-onnx on each finished chunk (for example every 30-60 s) and link speakers across chunks by matching embeddings to centroids from earlier chunks. This is custom work; sherpa-onnx does not provide it. A full re-cluster after the meeting can then replace the provisional labels.
- On iOS, FluidAudio's LS-EEND (up to 10 speakers) is the most practical true live diarization. On Android there is no turnkey streaming diarizer for RN. Sortformer ONNX would be a Pro-tier experiment: at 117M params (about 470 MB fp32, about 120 MB int8 by estimate) it is too heavy for 2-3 GB phones.
- One phone mic in a noisy room with 3-6 speakers is closest to AMI SDM, NOTSOFAR1 or DIHARD. Plan for about 18-25% DER with 3-4 speakers and 35-40%+ with 5-6. The UI should let users rename and merge speakers, and should accept an expected speaker count.
- License risks to avoid: Reverb (non-commercial). Sortformer needs a review of the NVIDIA Open Model License for commercial use.

### Gaps
- No published on-phone RTF or memory figures for sherpa-onnx diarization or Sortformer on Helio/Unisoc SoCs. Voxa needs to benchmark these itself.
- File sizes and licenses of the embedders (3D-Speaker ERes2Net, TitaNet-small, WeSpeaker CAM++) were not obtained: the GitHub release asset list failed to load. TitaNet is generally CC-BY-4.0 and 3D-Speaker Apache-2.0, but this is from memory and needs verifying.
- Community-1 license and DER, LS-EEND DER, and FluidAudio iPhone diarization speed were not retrieved.
- No diarization evaluation exists for Nigerian-accented English, Pidgin, Yoruba, Igbo or Hausa.

## (B) Offline OCR: ML Kit v2, Apple Vision/VisionKit, RN Vision Camera plugins, PaddleOCR

### Takeaway
ML Kit Text Recognition v2 (Latin) is the default for Android. The bundled model adds about 4 MB per script per architecture and works offline right after install. The unbundled model adds about 260 KB but is downloaded through Play Services, which is risky on first launch for an offline-first app. Yoruba, Igbo and Hausa are only "mapped" to the Latin model, not officially supported, so tonal and underdot diacritics (ẹ, ọ, ṣ, tone marks) may be dropped. On iOS, Apple Vision (VNRecognizeTextRequest / iOS 18 RecognizeTextRequest) is free and built in, and its language list must be queried at runtime. RN integration is through Vision Camera frame processor plugins such as react-native-vision-camera-mlkit.

### Cited Findings
- **Bundled vs unbundled:** ML Kit text recognition supports both install paths. Bundled models are available offline immediately after install and add to app size; unbundled models do not add to app size. — [ML Kit installation paths](https://developers.google.com/ml-kit/tips/installation-paths?authuser=3)
- **Model size:** about 260 KB per script per architecture unbundled versus about 4 MB per script per architecture bundled. This figure is from Google's general text-recognition Android page, not a v2-specific table. — [ML Kit text recognition Android](https://developers.google.com/ml-kit/vision/text-recognition/android?authuser=0)
- **APK size:** Google recommends Android App Bundles so Play delivers per-ABI APKs, which keeps the ~4 MB per architecture from multiplying. — [Reduce ML Kit app size](https://developers.google.com/ml-kit/tips/reduce-app-size?authuser=8)
- **Language support:** ML Kit v2 lists 31 officially supported Latin-script languages (English, French, Portuguese and others). Hausa (ha), Igbo (ig) and Yoruba (yo) appear only in the "Mapped" table, handled by the Latin model. The page says nothing about diacritic accuracy. — [ML Kit v2 languages](https://developers.google.com/ml-kit/vision/text-recognition/v2/languages)
- **Apple Vision:**
  - The iOS 18 Swift `RecognizeTextRequest` exposes an async `supportedRecognitionLanguages`. Legacy `VNRecognizeTextRequest` uses `supportedRecognitionLanguages(for:revision:)`, and the list depends on fast/accurate level and revision. — [Apple RecognizeTextRequest docs](https://developer.apple.com/documentation/vision/recognizetextrequest.md); [Apple supportedRecognitionLanguages](https://developer.apple.com/documentation/vision/recognizetextrequest/supportedrecognitionlanguages.md)
  - `RecognizeDocumentsRequest` (WWDC25, iOS 26) adds document-structure output. — [Apple RecognizeDocumentsRequest](https://developer.apple.com/documentation/vision/recognizedocumentsrequest.md); [WWDC25 session 272](https://developer.apple.com/videos/play/wwdc2025/272/)
  - Developers reported Swedish missing from the list on iOS 18/18.1 betas, a sign that coverage of less common Latin languages is uneven. — [Apple dev forum](https://developer.apple.com/forums/thread/765905)
- **RN Vision Camera plugins:**
  - react-native-vision-camera-mlkit (pedrol2b): last pushed 2026-02-04. It provides a `useTextRecognition` hook, recommends `runAtTargetFps` and `runAsync` for heavy ML, lets apps include only the models they need, and points to the Vision Camera guide for Expo. — [pedrol2b/react-native-vision-camera-mlkit](https://github.com/pedrol2b/react-native-vision-camera-mlkit)
  - react-native-vision-camera-ocr-plus: a maintained fork for RN 0.76+ and Vision Camera v4+. — [ocr-plus README](https://app.unpkg.com/react-native-vision-camera-ocr-plus@1.0.5/files/README.md)
  - react-native-vision-camera-text-recognition 3.1.1 needs vision-camera 4.5.1 and react-native-worklets-core 1.3.3. — [npm](https://www.npmjs.com/package/react-native-vision-camera-text-recognition)
  - Older vision-camera-ocr packages appear stale. — [aarongrider/vision-camera-ocr](https://github.com/aarongrider/vision-camera-ocr)

### Inferences
- For an offline-first app in Nigeria, bundled ML Kit Latin is the safer choice (about 4 MB per ABI; ARM64 only via AAB). Unbundled depends on Play Services downloading the model while online, and many users install over costly data and may not stay connected.
- Many OCR use cases (snapping a whiteboard or document) do not need live frame processing. A still capture followed by one ML Kit or Vision call avoids worklets and frame-processor dependencies and fits Expo dev builds more easily. Live frame OCR could be reserved for Standard and Pro tiers.
- Yoruba and Igbo diacritics: plan post-OCR normalization or user correction, and test on real samples. Language-model correction of tone marks would be a Pro-tier add-on.
- Neither ML Kit nor Vision runs in Expo Go; both need a development build or config plugin.

### Gaps
- No current source was retrieved for PaddleOCR mobile (PP-OCRv4/v5 mobile model sizes, Apache-2.0 license, Latin/African-language accuracy). PaddleOCR is generally Apache-2.0 with mobile det+rec models of a few MB to about 15 MB; this needs verifying.
- No authoritative Apple Vision language list for iOS 18/26. Whether Yoruba or Igbo diacritics are preserved is unknown for both engines.
- VisionKit `DataScannerViewController` specifics (iOS 16+, A12+ requirement) were not retrieved in this session.
- Current Vision Camera major version and Expo SDK 58 compatibility of these plugins were not confirmed.

## (C) Nigerian device landscape 2025-2026, data and power, and runtime device tiering

### Takeaway
Nigeria is about 87% Android and 13% iOS (StatCounter, Oct 2026). Transsion brands lead: Tecno about 21%, Infinix about 17%, itel about 5% by usage; about 65% of Q2 2025 shipments. Samsung (about 17%), Apple (about 16%) and Xiaomi (about 13%) follow. About 85% of Android usage is on Android 11-16, with Android 15 the largest at 22%. Entry phones such as the itel A50 still ship with 2-3 GB RAM. Data cost about ₦500-800 per GB after the 2025 50% tariff hike (2025 average about ₦575/GB), and grid power is unreliable (several collapses in 2025-26, often under 12 hours a day). Model downloads and battery use therefore matter. Expo SDK 58 / RN 0.88 still support Android 7+, so Android 8 is fine, but Play requires targetSdk 36 since Aug 31, 2026.

### Cited Findings
**Market share and brands**
- OS share, Oct 2026: Android about 86.58%, iOS about 13.31%. — [StatCounter OS Nigeria](https://gs.statcounter.com/os-market-share/mobile/nigeria)
- Vendor usage share from StatCounter, as reported in a search summary (figures not independently verified):
  - Sept 2026: Tecno 20.47%, Samsung 17.2%, Infinix 16.89%, Apple 15.67%, Xiaomi 12.89%, itel 4.8%.
  - Oct 2026: Tecno 21.3%, Infinix 17.43%, itel 5.52%. Samsung was also listed at 17.43%, which may be a transcription error.
  
  — [StatCounter vendor Nigeria](https://gs.statcounter.com/vendor-market-share/mobile-/nigeria)
- Feb 2025 (StatCounter via IntelPoint): Tecno 23.55%, Infinix 21.73%, itel 5.41%, together 50.69%. — [IntelPoint](https://intelpoint.co/insights/tecno-has-the-highest-share-among-phone-brands-in-nigeria-at-23-55-as-of-february-2025/)
- Shipments: Transsion held 65% of Nigeria's Q2 2025 shipments (Canalys). Shipments grew 10% in Q2 and 29% YoY in Q3 2025. — [TechCabal](https://techcabal.com/?p=167210); [TechCabal Nov 2025](https://techcabal.com/2025/11/27/stable-naira-nigeria-smartphone-market-rebound-29-percent/)
- Q4 2025 shipments rose 25% (Omdia). The market relies heavily on entry-level devices and was at risk from cost rises in 2026. — [Legit.ng](https://www.legit.ng/business-economy/technology/1698983-nigerias-smartphone-boom-risk-sharp-shipment-decline-soaring-costs-2026/)
- Four in five smartphones sold in Africa in 2025 cost under $200. — [TechCabal Feb 2026](https://techcabal.com/2026/02/25/in-2025-four-in-five-smartphones-sold-in-africa-cost-under-200/)
- The KPMG/Orange Nigeria Smartphone Study (published Sept 2026) puts smartphone penetration at about 75% and Tecno/Infinix/itel at 25%/24%/10%. — [Arise TV on KPMG](https://www.arise.tv/kpmg-nigerias-smartphone-penetration-climbs-to-75-as-economy-becomes-mobile-first/); [KPMG PDF](https://assets.kpmg.com/content/dam/kpmgsites/ng/pdf/2026/09/Nigeria%20Smartphone%20Study%20-%20Orange%20Group%20and%20KPMG.pdf.coredownload.inline.pdf) (the PDF was too large to fetch, so figures come via secondary coverage)

**Devices and RAM**
- The itel A50 is among the cheapest new phones (about ₦91k-99k) with 2 or 3 GB RAM and 64 GB storage. — [TechCabal best itel 2025](https://techcabal.com/2025/05/29/the-best-itel-phone-in-nigeria-for-2025/)
- Most-searched phones of 2025 include the Tecno Pop 10, Redmi 14C, Tecno Spark 40 and iPhone 17. This measures search interest, not sales. — [Techeconomy](https://techeconomy.ng/most-searched-smartphones-in-nigeria-for-2025/)
- Tecno Pop is the brand's cheapest line. — [TechCabal best Tecno 2025](https://techcabal.com/2025/05/28/best-tecno-phones-in-nigeria-2025/)

**Android version distribution, Oct 2026**
- Android 15 21.62%, 14 15.65%, 16 15.13%, 13 12.13%, 12 11.14%, 11 9%. Together about 84.7%; the remaining about 15% is Android 10 and older or other. — [StatCounter Android version Nigeria](https://gs.statcounter.com/android-version-market-share/mobile-tablet/nigeria)

**Data costs**
- The NCC approved a 50% tariff increase on Jan 20, 2025. The average 1 GB price across operators rose 65% (₦287.5 to ₦475), with MTN going from ₦200 to ₦350 and Airtel from ₦350 to ₦500 (BusinessDay). — [TechCabal Feb 2025](https://techcabal.com/2025/02/17/airtel-nigeria-joins-mtn/); [BusinessDay](https://businessday.ng/?p=949775)
- July 2025 1 GB prices: Airtel ₦800, MTN ₦500, Glo ₦750 (1.1 GB), 9mobile ₦500. Some bundles tripled, for example MTN 15 GB went from ₦2,000 to ₦6,000. The 2025 average was ₦575/GB and national spend ₦7.62tn ($5.58bn). — [TechCabal Sept 2025](https://techcabal.com/2025/09/01/nigeria-data-spend-721bn-monthly/); [TechCabal Feb 2026](https://techcabal.com/2026/02/09/how-nigerians-spent-%E2%82%A620-87billion-daily-on-data-in-2025/)
- These figures conflict with each other (for example MTN 1 GB at ₦350 vs ₦500) because of date and bundle differences. No 2026 per-GB figure was found.

**Power**
- The national grid collapsed on Jan 11, Feb 12, Sept 10 (2,917 MW to 1.5 MW) and Dec 29, 2025, with more collapses in Jan and Aug 2026. — [Nairametrics](https://nairametrics.com/2025/12/29/national-grid-collapses-again-power-supply-drops-to-near-zero-nationwide); [AllAfrica Jan 2026](https://allafrica.com/stories/202601280112.html); [Gazette Aug 2026](https://gazettengr.com/nationwide-blackout-as-national-grid-collapses/)
- Grid supply fell from a 4,600 MW average in 2025 to below 3,500 MW in early 2026. Many states get under 12 hours a day, and some only 4-6 hours. — [Leadership](https://leadership.ng/power-supply-dips-further-amid-gas-shortages-low-water-levels-n6trn-debt/); [AllAfrica Mar 2026](https://allafrica.com/stories/202603240403.html)

**Platform minimums and Play policy**
- Expo SDK support table:

  | Expo SDK | Min Android | compileSdk | targetSdk | Min iOS | React Native |
  |---|---|---|---|---|---|
  | 58 (latest) | 7+ | 37 | 36 | 16.4+ | 0.88 |
  | 57 | 7+ | 36 | 36 | 16.4+ | 0.86 |
  | 56 | 7+ | 36 | 36 | 16.4+ | 0.85 |
  
  Android 8 (API 26) is therefore supported. — [Expo versions](https://docs.expo.dev/versions/latest/)
- `minSdkVersion` can be raised with expo-build-properties (`android.minSdkVersion`). — [expo-build-properties](https://docs.expo.dev/versions/v55.0.0/sdk/build-properties)
- Google Play: new apps and updates must target API 36 (Android 16) from Aug 31, 2026, with an extension to Nov 1, 2026 available on request. Existing apps must target ≥35 to stay visible to new users on newer Android. — [Android target SDK](https://developer.android.com/google/play/requirements/target-sdk); [Play Console help](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-419)

**Runtime capability detection (expo-device)**
- `totalMemory` (bytes), `supportedCpuArchitectures` (e.g. arm64-v8a vs armeabi-v7a), `deviceYearClass`, `platformApiLevel`, `modelName`, `getMaxMemoryAsync()` (JVM heap), and `getPlatformFeaturesAsync()` / `hasPlatformFeatureAsync()`. `isLowRamDevice` is not documented in expo-device. — [expo-device docs](https://docs.expo.dev/versions/latest/sdk/device/)

### Inferences
**Suggested tier thresholds** (designed for this report, not from a source):

| Tier | Detection rule | Target devices |
|---|---|---|
| Lite | totalMemory < 3.5 GB, OR no arm64 ABI, OR Android Go / `ActivityManager.isLowRamDevice()` true (needs a small native module), OR first-run benchmark RTF above threshold | 2-3 GB itel/Tecno Pop/Spark on Unisoc or Helio entry chips |
| Standard | 3.5-6.5 GB, arm64, benchmark passes | 4-6 GB Tecno Spark/Camon, Infinix Hot, Redmi, Samsung A0x/A1x |
| Pro | ≥ 7 GB, arm64, newer SoC or Android 13+; iPhones with ≥6 GB RAM | 8 GB+ phones and recent iPhones |

- Use roughly 3.5 GB and 6.5 GB as cutoffs rather than 4 and 6, because `totalMemory` reports kernel-visible RAM, which is lower than the advertised amount.
- Confirm the RAM-based tier with a 5-10 s first-run micro-benchmark: run the diarization or ASR model on bundled audio, measure RTF, and cache the result. This catches slow Unisoc chips that have generous RAM.
- **Model delivery:** at ₦500-800/GB, an extra 100 MB of model costs a user about ₦50-80. Ship the Lite models in the APK/AAB, and offer Standard/Pro models as optional Wi-Fi downloads (Play Asset Delivery or in-app) with sizes shown in MB and naira.
- **Battery:** with frequent outages, process heavy batch work (full re-diarization) while charging or above a battery threshold, offer a "process later" queue, and avoid always-on GPU/NNAPI during long recordings on Lite devices.
- **64-bit:** Play has required 64-bit native code since 2019 (from memory; not re-verified here). Shipping ARMv7 builds is still possible for 32-bit-only devices, but such devices should default to Lite or be excluded.

### Gaps
- No Nigeria-specific RAM distribution or chipset-share data (Unisoc vs MediaTek Helio) was found. Next places to look are Canalys, IDC, Counterpoint, or GSMA Mobile Economy SSA 2025/2026 (not retrieved).
- No 2026 data prices per GB, and no NCC subscriber/data-usage figures for 2026.
- No source retrieved for Android Go share in Nigeria or Go RAM limits (Go is generally for ≤2 GB devices; from memory).
- The KPMG/Orange study PDF could not be fetched (over 10 MB), so its device-price, RAM and battery findings were not obtained.
- Exact RN 0.88 default minSdk (believed to be 24) was not verified from RN docs, although the Expo table says Android 7+.
