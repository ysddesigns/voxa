# On-device offline TTS for Voxa (React Native / Expo, iOS + Android 8+, 2 GB RAM floor, Nigeria)

Research date: 2026-11-19. 15 tool calls. Most benchmark sources are from 2026, which is good. Pre-2025 items are flagged. No source gave real measurements on a 2 GB / ARMv7 / Android 8 phone. That gap matters most.

## 1. Piper (VITS): sizes, speed, voice licenses, espeak-ng GPL, project status

### Takeaway
Piper is still the fastest neural option on Android (RTF about 0.05–0.08), with about 20–28 MB for x_low/low voices and about 63 MB for medium. But there are three legal traps:
- The active repo (OHF-Voice/piper1-gpl) is GPL-3.0.
- Piper embeds espeak-ng (GPL-3.0) for phonemization, which sherpa-onnx statically links on mobile.
- Many popular voices (lessac, ryan, and anything fine-tuned from them) are non-commercial.

Voices must be picked one by one, using the late-2026 retrained MODEL_CARDs.

### Cited Findings
- **Project status**
  - Development moved from rhasspy/piper (MIT) to OHF-Voice/piper1-gpl, created March 28, 2025 under the Open Home Foundation. rhasspy/piper was archived read-only in October 2025. The new repo is GPL-3.0; secondary sources differ on whether it is GPL-3.0 or GPL-3.0-or-later. — [search summary incl. Gitee mirror / promptquorum review](https://gitee.com/vhow/piper1-gpl); [piper1-gpl releases](https://github.com/OHF-Voice/piper1-gpl/releases)
  - The piper1-gpl README says Piper "embeds espeak-ng for phonemization". It also says the Open Home Foundation is looking for maintainers (voice@openhomefoundation.org). It links LICENSING.md, COMMERCIAL_USE.md, VOICES.md and TRAINING.md. — [piper1-gpl README](https://raw.githubusercontent.com/OHF-Voice/piper1-gpl/main/README.md)
  - A v1.7.0 release added a Japanese phonemizer (OpenJTalk). — [piper1-gpl releases](https://github.com/OHF-Voice/piper1-gpl/releases)
  - A third-party fork, piper-plus, claims to be the only MIT-licensed Piper fork. This claim is unverified. — [ayutaz/piper-plus](https://github.com/ayutaz/piper-plus/)
- **Voice sizes and tiers** (community sources, not official docs)
  - x_low: about 20.6 MB (e.g. zh_CN-huayan-x_low) to about 27.8 MB (vi_VN-vivos-x_low). — [rhasspy/piper-voices voices.json](https://huggingface.co/rhasspy/piper-voices/raw/293cad0539066f86e6bce3b9780c472cc9157489/voices.json)
  - low: 16 kHz, about 28 MB.
  - medium: 22.05 kHz, about 63 MB, about two thirds of the catalogue.
  - high: 22.05 kHz, 63–137 MB.
  - low/x_low configs declare 130 phoneme symbols; medium/high declare 256. — [Voice catalog (third-party)](https://brettkinny.github.io/dotty-stackchan/1.3/voice-catalog/)
- **Speed and size on a real phone** (Samsung Galaxy S10, Exynos 9820, 8 GB, Android 12, 4 threads, sherpa-onnx; Feb 2026)
  - Piper ryan-low: RTF 0.077, median latency 478 ms.
  - Piper amy-low: RTF 0.076, 524 ms.
  - Android System TTS: RTF 0.058, 440 ms. — [VoicePing offline TTS eval, Feb 15 2026](https://voiceping.net/en/blog/research-offline-tts-eval/)
- **Emulator and desktop measurements** (Android 16 x86_64 emulator, Oct 2026; not a real phone)
  - Piper libritts_r medium fp32: 97 MB on disk, TTFA 101 ms, RTF 0.053, +260 MB RSS.
  - Piper libritts_r medium int8: 40 MB, TTFA 405 ms, RTF 0.212, +173 MB RSS.
  - Piper had the highest WER of the English models (about 21.9% vs a noise floor of about 10%).
  - int8 was slower than fp32 on x86. The author says to re-check this on ARM.
  - NNAPI aborted (ANEURALNETWORKS_OP_FAILED). XNNPACK was slower than plain CPU (0.083 vs 0.048). — [muxable/rtchat issue #1500](https://github.com/muxable/rtchat/issues/1500)
- **Voice licenses** (official COMMERCIAL_USE.md)
  - Piper grants no license over voices; rights come from the training data.
  - A voice is commercially usable only if every dataset in its fine-tune chain allows it (CC0, PD, CC BY, CC BY-SA, Apache-2.0, or a custom permissive license).
  - Many voices were retrained in late 2026 to remove the lessac base. Older downloads with the same file name do NOT qualify, so check the MODEL_CARD.
  - These groups are excluded: voices fine-tuned from lessac or ryan, voices built on non-commercial datasets, voices with an undocumented license or base, and voices whose card only says "See URL".
  - rdh-derived medium voices are mostly CC0. hifi_tts_92-derived voices need CC BY 4.0 attribution to Hi-Fi TTS. — [COMMERCIAL_USE.md](https://raw.githubusercontent.com/OHF-Voice/piper1-gpl/main/docs/COMMERCIAL_USE.md)
  - The Oct 2026 review agrees on specific voices:
    - en_US lessac: non-commercial/research only, do not ship.
    - libritts_r medium: dataset CC BY 4.0, but fine-tuned from lessac, so its status is unclear.
    - ru irina: dataset license "Unknown". — [rtchat #1500](https://github.com/muxable/rtchat/issues/1500)
- **espeak-ng in sherpa-onnx**
  - sherpa-onnx is Apache-2.0 and onnxruntime is MIT.
  - espeak-ng is GPL-3.0 and is statically linked into sherpa-onnx's Android and iOS prebuilt libraries, so it ships with every model. The reviewer called this the biggest open question and noted GPLv3 conflicts with App Store terms.
  - The reviewer's options were: accept the risk, build without espeak-ng, or use a different phonemizer. — [rtchat #1500](https://github.com/muxable/rtchat/issues/1500)
  - Apps built on sherpa-onnx that use espeak-ng data have been released as GPLv3. — [biodranik/ttsengine](https://github.com/biodranik/ttsengine)
  - One project avoided the GPL by calling espeak as a separate CLI process. That is not possible inside an iOS app. — [Haiku forum](https://discuss.haiku-os.org/t/haiku-natural-voice-offline-tts-piper-tts/18139)

### Inferences
- For a closed-source paid app, Piper as shipped via sherpa-onnx carries GPL-3.0 exposure through espeak-ng (and through piper1-gpl code if that is used directly). Ways around it:
  - an espeak-free phonemizer (a lexicon plus a small G2P model)
  - pre-phonemized text paths
  - a model family that does not need espeak at runtime (Supertonic, Kitten 2; see section 3)
  - get legal sign-off
- Piper x_low/low voices (about 20–28 MB, 16 kHz) are the smallest neural voices with RTF far below 1. They are the natural Lite-tier candidate if licensing is solved.

### Gaps
- No published RTF for Piper on ARMv7 or a 2 GB Android 8 phone. The only real-phone data is a 2019 flagship (S10).
- The exact piper1-gpl license text (GPL-3.0-only vs -or-later) was not read directly.
- No MOS for Piper tiers found.

## 2. Kokoro-82M

### Takeaway
Kokoro has the best quality per parameter and a clean Apache-2.0 license on weights and training data. But it is too slow for low-end phones:
- RTF 1.13 (fp32) and 2.42 (int8) on a Galaxy S10.
- 400–830 MB RAM.
- A reported int8 garbage-audio bug on ARM.

It is a Pro-tier-only, opt-in voice. The English G2P (misaki) can run without espeak, but then out-of-vocabulary words lose their fallback.

### Cited Findings
- **Model card**
  - 82M params, Apache-2.0.
  - v0.19 (2024-12-25): 1 language, 10 voices. v1.0 (2025-01-27): 8 languages, 54 voices.
  - Trained on a few hundred hours of permissive, public-domain or synthetic audio. — [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
  - Older than 2025 for v0.19; v1.0 is early 2025, so possibly outdated.
- **ONNX file sizes** — [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
  - fp32: 326 MB
  - fp16: 163 MB
  - q8: 92.4 MB
  - q8f16: 86 MB
  - uint8f16: 114 MB
  - q4f16: 154 MB
  - That listing has 28 English voices (American and British accents only).
- **Real-phone results** (Feb 2026) — [VoicePing](https://voiceping.net/en/blog/research-offline-tts-eval/)
  - Galaxy S10 (Android): Kokoro en v0.19 RTF 1.133 (8.2 s median latency); Kokoro int8 multi-lang v1.1 RTF 2.423 (15.3 s).
  - iPad Pro 3rd gen (A12X, 4 GB): Kokoro EN v0.19 RTF 0.621 at 833 MB; Kokoro int8 v1.1 RTF 1.569 at 588 MB.
- **Emulator results** (Oct 2026) — [rtchat #1500](https://github.com/muxable/rtchat/issues/1500)
  - Kokoro multi-lang v1.1 fp32: 427 MB, RTF 0.588, +621 MB RSS.
  - int8: 215 MB, RTF 1.519, +459 MB.
  - Kokoro int8 sometimes outputs whole sentences of garbage audio on ARM; fp32 is unaffected.
  - Verdict: too slow and memory-heavy for a default, so opt-in only.
- **Phonemizer (misaki)**: Apache-2.0. The espeak-ng fallback for out-of-dictionary English words is optional (`fallback=None` works). — [hexgrad/misaki](https://github.com/hexgrad/misaki)
- An HF discussion flags GPL concerns around espeak with Kokoro for closed-source commercial use. — [Kokoro-82M discussion #50](https://huggingface.co/hexgrad/Kokoro-82M/discussions/50)
- Picovoice says Kokoro has no official mobile SDKs (desktop and browser via ONNX only). Picovoice is a competitor. — [Picovoice on-device TTS 2026](https://picovoice.ai/blog/on-device-tts/)

### Inferences
- The ~92 MB q8 download is acceptable for Pro, but real-time speed needs a recent flagship. On 2 GB devices, 400–800 MB RSS is a likely out-of-memory risk.
- Kokoro has no Nigerian-accented voice. Its voices are US/UK only.

### Gaps
- No MOS numbers retrieved. No measurements on a mid-range ARM64 phone. The README did not confirm whether sherpa-onnx's Kokoro path uses espeak-ng (it likely does for multi-lang).

## 3. Other candidates

### Takeaway
The most relevant newer options for Voxa:

| Model | Why it matters | Main caveat |
|---|---|---|
| Kitten TTS v0.8 nano | Apache-2.0, 25–56 MB, RTF about 0.09 on emulator but 0.39 on S10 | — |
| Kitten TTS 2 nano/pico | 4–17 MB per language, pico claims faster than real time on one phone core | New Stellon Labs Community License, needs review |
| Supertonic 3 | 99M params, 145 MB int8, RTF about 0.2, 31 languages, no espeak | OpenRAIL-M use restrictions; no African languages |
| Matcha + Vocos | Strong on iOS (RTF 0.084, 211 MB) | English LJSpeech voice only |

Rule out these:
- XTTS-v2: CPML non-commercial, and Coqui is defunct.
- MMS-TTS: CC-BY-NC, confirmed.
- NeuTTS Air: 748M params, too large.
- F5-TTS and StyleTTS2: no mobile evidence found.

### Cited Findings
- **Kitten TTS (KittenML)** — [KittenML/KittenTTS](https://github.com/KittenML/KittenTTS)
  - Code is Apache-2.0. Models are licensed separately.
  - v0.8 ONNX models: mini 80M/80 MB, micro 40M/41 MB, nano 15M/56 MB fp32, nano int8 25 MB.
  - Kitten TTS 2 models:
    - mini: 82M, 83 MB int8 / 47 MB int4, 16 languages
    - nano: 17M, 17 MB / 8.8 MB per language, 8 languages
    - pico: 7M, 8 MB / 4 MB per language, 8 languages, "faster-than-realtime on a single smartphone CPU thread", 40–50 MB peak memory
    - full: 1.7B
  - Kitten TTS 2 weights are under the "Stellon Labs Community License".
  - The family covers 20 languages including Swahili, but none for Nigeria. It has 115 voices and voice cloning from 5–30 s of audio.
  - The README does not mention espeak.
  - Sizes conflict across sources: a secondary source gives nano int8 as 42 MB with 320 MB peak. — [GetStream blog](https://getstream.io/blog/best-on-device-tts-models/)
  - Oct 2026 review — [rtchat #1500](https://github.com/muxable/rtchat/issues/1500)
    - Kitten v0.8 weights: Apache-2.0.
    - Emulator: nano fp32 78 MB, TTFA 240 ms, RTF 0.093, +186 MB RSS, best WER (12.1%); nano int8 46 MB, RTF 0.286.
    - Recommended Kitten nano fp32 as the English default.
  - Real phone, Feb 2026: Kitten Nano v0.2 fp16 RTF 0.387 on the Galaxy S10; on iPad, RTF 0.368 at 193 MB. — [VoicePing](https://voiceping.net/en/blog/research-offline-tts-eval/)
- **Supertonic 3 (Supertone)** — [Supertone/supertonic-3](https://huggingface.co/Supertone/supertonic-3)
  - About 99M params across its ONNX assets. Runs on ONNX Runtime on CPU.
  - 31 languages (EN, KO, JA, AR, many European languages, HI, ID, VI). No African languages and no English accent options.
  - Adds tags such as `<laugh>`, `<breath>` and `<sigh>`. Preset voices, plus paid custom voices via Voice Builder.
  - Weights: OpenRAIL-M. Sample code: MIT.
  - Oct 2026 review — [rtchat #1500](https://github.com/muxable/rtchat/issues/1500)
    - int8 EN: 145 MB, TTFA 544 ms, RTF 0.203 on emulator, +291 MB RSS.
    - No espeak needed at runtime.
    - Pads output with silence and emits audio only once per message (no sentence streaming).
    - OpenRAIL-M allows commercial use, but use restrictions must be passed on to users and outputs must be disclosed as machine-generated.
    - That project then built a native ONNX Runtime Supertonic engine and dropped sherpa-onnx and espeak. — [rtchat #1502](https://github.com/muxable/rtchat/issues/1502)
- **Matcha-TTS** (sherpa-onnx matcha-icefall LJSpeech) — [VoicePing](https://voiceping.net/en/blog/research-offline-tts-eval/)
  - Galaxy S10 (with HiFiGAN): RTF 0.135, 1.1 s latency.
  - iPad (with Vocos): RTF 0.084, 211 MB. Best open-source model on iOS in that eval.
- **VITS and MeloTTS int8 on iPad**: VITS LJS int8 RTF 2.02, VITS VCTK int8 RTF 2.06, Melo ZH+EN int8 RTF 2.87. All poor. — [VoicePing](https://voiceping.net/en/blog/research-offline-tts-eval/)
- **Meta MMS-TTS**: confirmed CC-BY-NC 4.0 (e.g. facebook/mms-tts-yor, 36.3M params, one checkpoint per language). Not usable in a paid app. — [facebook/mms-tts-yor](https://huggingface.co/facebook/mms-tts-yor)
- **Coqui XTTS-v2**
  - Weights are under CPML 1.0.0, which allows only non-commercial use of the model and its outputs. — [XTTS-v2 LICENSE](https://huggingface.co/coqui/XTTS-v2/commits/v2.0.3/LICENSE.txt)
  - Coqui shut down in January 2024, and licensing emails go unanswered, so no commercial license can be obtained. — [coqui-ai/TTS discussion #4145](https://github.com/coqui-ai/TTS/discussions/4145); [XTTS-v2 discussion #65](https://huggingface.co/coqui/XTTS-v2/discussions/65)
  - These sources are from 2024, but the status has not changed.
  - A community Yoruba XTTS fine-tune exists, but it inherits CPML. — [samuelolubukun/xtts-v2-yoruba-openbible](https://huggingface.co/samuelolubukun/xtts-v2-yoruba-openbible)
- **NeuTTS (Neuphonic)** — [neuphonic/neutts](https://github.com/neuphonic/neutts); [search summary](https://neutts.org/)
  - Air: about 748M params, Apache-2.0.
  - Nano: 229M total / 120M active, NeuTTS Open License 1.0. One source says free commercial use is limited to companies under $5M revenue.
- **Native OS TTS as a fallback**
  - Android System TTS was fastest on the S10 (RTF 0.058).
  - AVSpeechSynthesizer used only 21 MB on iOS. — [VoicePing](https://voiceping.net/en/blog/research-offline-tts-eval/)

### Inferences
- Native TTS cannot meet the "same voices on both platforms" requirement. iOS and Android ship different engines and voices, and Android's engine depends on the device maker (Google, Samsung and others). Offline voice data may not be installed on cheap Android 8 phones. This is general platform knowledge; no source was fetched for it. Native TTS remains a useful zero-download emergency fallback.
- F5-TTS, StyleTTS2 and other diffusion or LM-based models (hundreds of millions of params, multi-step sampling) are unsuitable for 2 GB phones. No mobile benchmarks were found.

### Gaps
- Kitten TTS 2 license terms (Stellon Labs Community License) were not read. Its mobile RTF is unmeasured, apart from the pico claim.
- Supertonic 3 on-disk size per precision is known only from the 145 MB int8 figure. The OpenRAIL-M text was not reviewed.
- The licenses of Matcha-TTS and MeloTTS code and weights were not verified in this session.
- No published MOS figures were found for any candidate. VoicePing explicitly ran no listening tests.

## 4. Engines and runtimes: sherpa-onnx, React Native bindings, streaming

### Takeaway
sherpa-onnx (Apache-2.0) supports VITS/Piper, Matcha, Kokoro, Kitten, ZipVoice, Pocket and Supertonic on Android and iOS. XDcobra/react-native-sherpa-onnx (MIT, v0.3.0, bundles sherpa-onnx 1.12.35) is the most complete React Native binding. It supports Android API 24+ (Android 7) and iOS 13, offers streaming TTS, and needs an Expo dev build, not Expo Go. Sentence and clause chunking is the way to get first audio under 1 second.

### Cited Findings
- sherpa-onnx pretrained TTS families:
  - Matcha (en ljspeech, zh baker)
  - Kokoro (en v0.19 with 11 speakers, multi-lang v1.0 with 53, v1.1 with 103)
  - KittenTTS (nano v0.1/v0.2 fp16, mini v0.1)
  - VITS, including Piper voices, VCTK (109 speakers), LibriTTS-R (904 speakers) and MeloTTS ZH+EN
  - Supertonic and ZipVoice on separate pages
  - Each model has a Raspberry Pi 4 RTF section. — [sherpa-onnx TTS pretrained models](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/index.html)
- **react-native-sherpa-onnx (XDcobra)** — [XDcobra/react-native-sherpa-onnx](https://github.com/XDcobra/react-native-sherpa-onnx)
  - TTS types: auto-detect, VITS, Matcha, Kokoro, KittenTTS, Zipvoice, Pocket, Supertonic.
  - iOS and Android are listed as production ready.
  - Minimum Android API 24, iOS 13, React Native 0.70+.
  - Streaming via `createStreamingTTS()`.
  - MIT license. v0.3.0, which has breaking changes from 0.2.x, bundles sherpa-onnx 1.12.35.
  - It has an Expo config plugin for the iOS background-download setup.
- **Other bindings**
  - react-native-sherpa-onnx-offline-tts: TTS-only, v0.1.5–0.2.4, about 19 weekly downloads. — [npm](https://npmjs.com/package/react-native-sherpa-onnx-offline-tts)
  - @siteed/sherpa-onnx.rn: TTS and STT, in development. — [pkgstats](https://www.pkgstats.com/pkg:@siteed/sherpa-onnx.rn)
  - @kittentts/react-native and react-native-tts-kit: both require an Expo dev build. — [socket.dev](https://socket.dev/npm/package/%40kittentts%2Freact-native); [pkgstats](https://www.pkgstats.com/pkg:react-native-tts-kit)
- **Streaming behaviour** — [rtchat #1500](https://github.com/muxable/rtchat/issues/1500)
  - Kitten, Kokoro and Piper emit audio per sentence or batch. Supertonic emits once per message.
  - The reviewer recommends splitting text on clause punctuation in the app to cut first-audio time.
  - Going from 2 to 4 threads helps fp32 Kokoro and Piper; int8 barely benefits.
  - NNAPI and XNNPACK gave no benefit or failed.
- An Android app built on sherpa-onnx (VoxSherpa) claims about 5 s of compute per minute of audio for Piper and 20–40 s for Kokoro on a flagship. This is anecdotal and unverified. — [VoxSherpa-TTS](https://github.com/CodeBySonu95/VoxSherpa-TTS)

### Inferences
- **Android 8 = API 26**, which is above the binding's API 24 minimum, so it is compatible.
- **First audio under 1 s** looks achievable with Piper low (about 0.5 s on the S10) and Kitten nano fp32 (about 0.24 s on the emulator), if text is chunked into short clauses. Kokoro cannot hit it on low-end devices: the S10 median was over 8 s for a sentence.
- **ARMv7 (32-bit) Android 8 phones**: sherpa-onnx publishes armeabi-v7a builds historically, but this was not confirmed for the RN binding. Treat it as a gap.
- **Licensing**: the prebuilt sherpa-onnx libraries include espeak-ng. An espeak-free custom build, or a direct ONNX Runtime engine (as rtchat chose), may be needed for a clean license.

### Gaps
- No confirmation of armeabi-v7a support or APK size overhead for react-native-sherpa-onnx.
- No published build flag found for compiling sherpa-onnx without espeak-ng.

## 5. Nigerian / West African voices, datasets and fine-tuning

### Takeaway
No permissively licensed, off-the-shelf Nigerian-English neural voice was found in Piper, Kokoro, Kitten or Supertonic. They all ship US/UK or other accents.
- NaijaVoices (about 1,800 h of Igbo, Hausa and Yoruba) is CC BY-NC-SA, so it is non-commercial.
- MMS-TTS is CC-BY-NC.
- The best commercial-friendly routes are:
  - Yoruba: OpenSLR SLR86 (CC BY-SA 4.0) and ÌròyìnSpeech.
  - Nigerian Pidgin: a small Naija-TTS-Dataset (about 5.9 h, license unknown).
  - Recording a proprietary Nigerian-English voice actor (a few hours) and fine-tuning Piper, Kitten or similar.

### Cited Findings
- **NaijaVoices**: about 1,800 h from over 5,000 speakers, about 600 h each for Igbo, Hausa and Yoruba, CC BY-NC-SA 4.0. Interspeech 2025. It contains no Nigerian English. — [arXiv 2505.20564](https://arxiv.org/html/2505.20564); [HF dataset](https://huggingface.co/datasets/naijavoices/naijavoices-dataset)
- **naijavoices/voiceafrica-datasets**: 11 languages, with prompts in the regional lingua franca (English for Nigeria). License not checked. — [HF](https://huggingface.co/datasets/naijavoices/voiceafrica-datasets)
- **Naija-TTS-Dataset** (Mozilla Data Collective): 1,987 clips, about 5 h 54 min of Nigerian Pidgin, intended for TTS. License not found. — [Mozilla Data Collective](https://mozilladatacollective.com/datasets/cmnykldcz010knu0737o8bgh9)
- **Yoruba**
  - OpenSLR SLR86: crowdsourced high-quality Yoruba, CC BY-SA 4.0 (2020). — [OpenSLR 86](https://www.openslr.org/86/)
  - ÌròyìnSpeech: about 42 h from 80 volunteers plus 6 h on Common Voice, text CC-BY-4.0, built for TTS and ASR (LREC 2024). — [ACL Anthology](https://aclanthology.org/2024.lrec-main.812/)
  - A Yoruba-TTS-Dataset (about 5 h 50 min) is also on Mozilla Data Collective. — [MDC](https://mozilladatacollective.com/datasets/cmo1nlaah0071mk077mw0qhpv)
- **MMS-TTS Yoruba** (and per-language Hausa and Igbo checkpoints): CC-BY-NC 4.0. — [facebook/mms-tts-yor](https://huggingface.co/facebook/mms-tts-yor)
- **Fine-tuning**: Piper provides TRAINING.md. Its commercial-use doc requires the whole fine-tune chain to be permissive. Fine-tuning from lessac or ryan taints the voice; rdh-derived CC0 bases are clean. — [piper1-gpl README](https://raw.githubusercontent.com/OHF-Voice/piper1-gpl/main/README.md); [COMMERCIAL_USE.md](https://raw.githubusercontent.com/OHF-Voice/piper1-gpl/main/docs/COMMERCIAL_USE.md)
- **Voice cloning**: Kitten TTS 2 offers cloning from 5–30 s of reference audio, under the Stellon license. — [KittenTTS](https://github.com/KittenML/KittenTTS)

### Inferences
- The fastest compliant path to a Nigerian-accented English voice is to record a contracted Nigerian speaker (owned data, e.g. 2–10 h) and fine-tune a Piper low/medium voice from a CC0 rdh base, or a Kitten/Matcha model.
- espeak-ng's en-US/en-GB phonemes will not capture Nigerian English or Yoruba tones well. A custom lexicon may be needed.
- Tier recommendation (synthesized from the evidence above; needs device validation):
  - **Lite** (2 GB, Android 8, ARMv7/ARM64): Piper x_low/low (about 20–28 MB, RTF about 0.08 on S10) with a licence-clean voice, or Kitten v0.8 nano int8 (25 MB) / Kitten 2 pico or nano (4–17 MB) if its license clears. Use native OS TTS as the zero-download fallback.
  - **Standard**: Kitten v0.8 nano fp32 (56–78 MB, best WER) or Piper medium (about 63 MB). Use Supertonic 3 int8 (145 MB) for multilingual needs if OpenRAIL-M is accepted.
  - **Pro**: Kokoro v1.0 q8 (about 92 MB download, 400–800 MB RAM) on capable devices, as an opt-in high-quality voice. Matcha + Vocos on iOS.
- Resolve espeak-ng GPL before shipping any Piper or Kokoro-via-sherpa build on iOS.

### Gaps
- AfriSpeech: no evidence found that it is TTS-suitable. It is an ASR corpus of accented clinical and general English, and only a citation was found.
- No commercial-licensed Nigerian English TTS voice found. Licenses of the Mozilla Data Collective datasets are unknown.
- No reported results of fine-tuning Kokoro on new accents (Kokoro's training code is not openly documented in the sources read).
