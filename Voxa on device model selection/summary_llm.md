# On-device LLMs and runtimes for offline meeting summarization (Voxa, React Native/Expo, iOS + Android, 2 GB RAM and up)

Research date 2026-11-19. Items marked [not re-fetched] were cited from well-known model-card/license URLs without opening them this session (lower confidence).

## Candidate small models: size, RAM, context, speed, license

### Takeaway
2026's strongest candidates are Gemma 4 E2B (Apache-2.0, 2.58 GB LiteRT-LM file, ~52–56 tok/s decode on flagship GPUs), Qwen3.5 0.8B/2B (Apache-2.0, released Mar 2026, 262K native context), and LFM2.5-1.2B (<1 GB RAM, 70 tok/s on S25 Ultra CPU, but a revenue-capped license). Gemma 3 1B (529 MB int4) is the proven older fallback. Gemma 4 E2B's 2.6 GB download is heavy for Nigerian mobile data; a <1 GB download should be the default.

### Cited Findings
- Gemma 4 E2B/E4B are Apache-2.0; LiteRT-LM files 2.58 GB (E2B) and 3.65 GB (E4B); 26B A4B/31B not yet in LiteRT-LM — [Google AI Edge, Gemma 4](https://developers.google.com/edge/litert-lm/models/gemma-4)
- E2B file 2,583 MB; text-only weight footprint "as low as 0.8 GB" with 1.12 GB embeddings memory-mapped; context up to 32K on device / 128K web — [HF gemma-4-E2B-it-litert-lm](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- E2B (1024 prefill / 256 decode / 2048 ctx): S26 Ultra GPU 3,808 prefill, 52.1 decode tok/s, TTFT 0.3 s, 676 MB peak; S26 Ultra CPU 557 / 46.9, TTFT 1.8 s, 1,733 MB; iPhone 17 Pro GPU 2,878 / 56.5, 1,450 MB; iPhone 17 Pro CPU 532 / 25.0, 607 MB; Raspberry Pi 5 CPU 133 / 7.6 — [HF model card](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- E4B: S26 Ultra GPU prefill 1,293 / decode 22; CPU 195 / 18 with 3,283 MB CPU peak; iPhone 17 Pro GPU decode 25 — [Google AI Edge](https://developers.google.com/edge/litert-lm/models/gemma-4)
- Multi-token prediction (MTP): up to 2.2× decode speedup on mobile GPU, 1.5× CPU; a summarization run on S26 Ultra GPU went 51.5 → 91.7 tok/s — [Google blog](https://developers.googleblog.com/blazing-fast-on-device-genai-with-litert-lm/); [HF card](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- Developer anecdote: Gemma 4 ~2–5 tok/s on mid-range Android CPUs (not a benchmark) — [DEV](https://dev.to/samdude/gemma-4-on-android-tricks-for-faster-on-device-inference-3kj5)
- Gemma 3 1B int4 = 529 MB; S24 Ultra GPU 2,585 prefill / 56 decode tok/s, TTFT 4.5 s; another row 322 / 47 (likely CPU) — [HF Gemma3-1B-IT](https://huggingface.co/litert-community/Gemma3-1B-IT); [Google blog](https://developers.googleblog.com/gemma-3-on-mobile-and-web-with-google-ai-edge/) (2025, older)
- Gemma 3 270M ~550 MB memory, Q4_0 QAT builds; pitched for fine-tuned narrow tasks — [LM Studio](https://lmstudio.ai/models/google/gemma-3-270m); [Google blog](https://developers.googleblog.com/en/introducing-gemma-3-270m/)
- Gemma 3n runs in "as little as 2GB (E2B) / 3GB (E4B)"; a user report conflicts, claiming much higher CPU RAM — [Google 3n guide](https://developers.googleblog.com/introducing-gemma-3n-developer-guide/); [HF discussion](https://huggingface.co/google/gemma-3n-E2B-it/discussions/6)
- Gemma 3/3n use Gemma Terms of Use: commercial use allowed, §3.2 use restrictions pass to users, distributions need a "Notice" file; Gemma 4 is separately Apache-2.0 — [Gemma Terms](https://ai.google.dev/gemma/terms)
- Qwen3.5 Small (2 Mar 2026): dense 0.8B/2B/4B/9B, Apache-2.0, natively multimodal, 262K native context; 0.8B/2B positioned for edge — [MarkTechPost](https://www.marktechpost.com/2026/03/02/alibaba-just-released-qwen-3-5-small-models-a-family-of-0-8b-to-9b-parameters-built-for-on-device-applications/); [HF Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B)
- Third-party Q4 sizes (unverified): 0.8B ≈ 0.53 GB; 2B ≈ 1.2–1.28 GB (Q4_K_M); one guide calls 2B the "sweet spot for 6–8 GB phones" — [igllama](https://bkataru.github.io/igllama/showcase/qwen35-small/); [DEV](https://dev.to/alichherawalla/how-to-run-qwen-35-on-your-android-phone-in-2026-locally-no-cloud-58pi)
- LiteRT-LM conversions exist for Qwen3.5 0.8B and 2B; Qualcomm AI Hub has an NPU build of 0.8B — [HF 0.8B](https://huggingface.co/litert-community/Qwen3.5-0.8B); [HF 2B](https://huggingface.co/litert-community/Qwen3.5-2B); [Qualcomm](https://huggingface.co/qualcomm/Qwen3.5-0.8B)
- Qwen3-1.7B Q4_0 on S25 Ultra CPU (llama.cpp): 181 prefill / 40 decode tok/s, 1,306 MB — [Liquid AI blog](https://www.liquid.ai/blog/introducing-lfm2-5-the-next-generation-of-on-device-ai)
- LFM2.5-1.2B: S25 Ultra CPU (llama.cpp Q4_0) 335 prefill / 70 decode, 719 MB; ROG Phone 9 Pro NPU (NexaML) 4,391 / 82 at 0.9 GB — [Liquid AI](https://www.liquid.ai/blog/introducing-lfm2-5-the-next-generation-of-on-device-ai)
- LFM2.5 community LiteRT build on Pixel 8a CPU: ~31 tok/s decode int4, ~19 int8 — [HF](https://huggingface.co/litert-community/LFM2.5-1.2B-Instruct)
- LFM license: LFM Open License v1.0 with a commercial limit for organizations above US$10M revenue — [HF](https://huggingface.co/litert-community/LFM2.5-1.2B-Instruct); Liquid's blog says "deploy without restrictions", so verify the text
- [not re-fetched] Llama 3.2 1B/3B (2024): Llama 3.2 Community License, commercial use under 700M MAU, attribution — [license](https://www.llama.com/llama3_2/license/)
- [not re-fetched] Phi-4-mini 3.8B, MIT — [HF](https://huggingface.co/microsoft/Phi-4-mini-instruct); SmolLM2/SmolLM3 Apache-2.0 — [HF](https://huggingface.co/HuggingFaceTB)
- Cactus: Gemma 3 1B Q4 ~22 tok/s decode on Galaxy Z Fold 4 and Poco F6 — [Cactus docs](https://cactuscompute.com/docs); Qwen3-0.6B int8 CPU 16–20 tok/s on Pixel 6a / iPhone 11, 70+ on iPhone 17 / S25 Ultra — [Cactus HF blog, Oct 2025](https://huggingface.co/blog/rshemet/cactus-on-device-inference)
- Apple Foundation Models (on device): 4,096-token context per session shared by input and output (instructions and tool schemas count); overflow throws `exceededContextWindowSize`, no truncation; iOS 26.4 added `contextSize` and `tokenCount(for:)`; Private Cloud Compute offers 32K but is not offline — [TN3193](https://developer.apple.com/tutorials/data/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window.md); [InfoQ Mar 2026](https://infoq.com/news/2026/03/apple-foundation-models-context); [Apple forums](https://developer.apple.com/forums/thread/833642)
- ML Kit GenAI Summarization (Gemini Nano via AICore): beta 1.0.0-beta1, no SLA; API 26+; not on unlocked bootloaders; input < ~4,000 tokens (~3,000 words); output 1–3 bullets; English, Japanese, Korean only; CONVERSATION input type `name: message`; auto-truncate keeps first 4K tokens; Google suggests 4K chunks — [ML Kit Summarization](https://developers.google.com/ml-kit/genai/summarization/android)
- Gemini Nano devices (all flagships; check with `checkFeatureStatus()`): nano-v4 Pixel 11, Galaxy S25/S26/Z Fold7/Fold8/Flip8, realme GT 7 Pro/GT 7T, Sharp AQUOS R11; nano-v3 Pixel 10; nano-v2 Pixel 9 and some OEMs — [ML Kit GenAI overview](https://developers.google.com/ml-kit/genai)

### Inferences
- 10,000 words ≈ 13–14K tokens, beyond Apple FM / ML Kit 4K and the 2K used in most LiteRT benchmarks: every LLM path needs chunked map-reduce.
- Apple FM and Gemini Nano reach only a small high-end share of Nigerian users: a zero-download bonus, not the main path. ML Kit's 1–3 bullets are too little for key points plus action items.
- Approximate downloads: Gemma 3 270M ~0.25–0.3 GB; Qwen3.5 0.8B ~0.5 GB; Gemma 3 1B 0.53 GB; LFM2.5 1.2B Q4 ~0.7–0.8 GB (estimate); Qwen3.5 2B ~1.2 GB; Gemma 4 E2B 2.6 GB; E4B 3.65 GB. Default ≤ ~0.8 GB, optional Wi-Fi download.
- Apache-2.0 models (Gemma 4, Qwen3/3.5, SmolLM) carry the lowest license risk; LFM revenue cap and Llama attribution/MAU terms need review.

### Gaps
- No independent phone tok/s for Qwen3.5 0.8B/2B; no official GGUF sizes. No official Gemma 4 E2B mid-range numbers. Phi-4-mini, SmolLM3, Llama 3.2 phone speeds not verified. Apple on-device model size (~3B, 2-bit) not re-verified ([arXiv 2507.13575](https://arxiv.org/pdf/2507.13575v2)).

## Runtimes: maturity, acceleration, Expo compatibility

### Takeaway
llama.rn (llama.cpp, GGUF) has the broadest React Native coverage: CPU everywhere, Metal on iOS, OpenCL on Adreno 700+, experimental Hexagon NPU. react-native-executorch (Software Mansion) has the most Expo-friendly API (`useLLM`) and a curated model list. LiteRT-LM has the best Gemma 4 / Qwen3.5 numbers but no React Native binding was found (custom Expo module needed). Cactus has a React Native SDK in beta.

### Cited Findings
- llama.rn: OpenCL supported/tested on Adreno 700+ via `n_gpu_layers > 0`; Hexagon NPU experimental via `devices: ['HTP0']`; prebuilt Android libraries by default, build-from-source option — [README mirror](https://cdn.jsdelivr.net/npm/cui-llama.rn@1.12.2/README.md); [llama.cpp Snapdragon docs](https://raw.githubusercontent.com/ggml-org/llama.cpp/HEAD/docs/backend/snapdragon/README.md)
- No official llama.rn Expo config plugin found; the turbollama.rn fork says Expo builds need `expo-build-properties` for iOS and OpenCL — [pkgstats](https://www.pkgstats.com/pkg:turbollama.rn). A dev client is required, not Expo Go (inference).
- react-native-executorch: v0.1 launched with Llama 3.2 1B/3B (QLoRA, SpinQuant); v0.4 added Qwen 3, Qwen 2.5, SmolLM2, Phi-4-mini, Hammer 2.1; newer docs list LFM2.5 1.2B and a model registry; docs warn low-end devices may not fit LLMs — [SWM intro](https://swmansion.com/blog/introducing-react-native-executorch-2bdb87592884); [v0.4](https://swmansion.com/blog/react-native-executorch-release-v0-4-0-262d4013ac10); [useLLM](https://docs.swmansion.com/react-native-executorch/docs/hooks/natural-language-processing/useLLM); [registry](https://docs.swmansion.com/react-native-executorch/docs/next/utilities/model-registry)
- react-native-executorch sizes (third-party mirror): Qwen3 0.6B 8da4w ~400 MB; Llama 3.2 1B QLoRA ~500 MB — [mintlify](https://www.mintlify.com/software-mansion/react-native-executorch/llm/available-models)
- LiteRT-LM: CLI, Python, Kotlin, Swift, C++ APIs; GPU (OpenCL, Metal) and NPU builds; no React Native support mentioned — [Google AI Edge](https://developers.google.com/edge/litert-lm/models/gemma-4)
- Cactus v1 SDK beta: React Native, Flutter, Kotlin Multiplatform bindings, optional cloud fallback, better low-end performance — [InfoQ Dec 2025](https://www.infoq.com/news/2025/12/cactus-on-device-inference)
- NexaML gives the top LFM2.5 numbers on Qualcomm NPU — [Liquid AI](https://www.liquid.ai/blog/introducing-lfm2-5-the-next-generation-of-on-device-ai)
- Cortex-A76/A77 phones decode only 2–4 tok/s with llama.cpp or MLC on models >1B — [arXiv 2410.03613](https://arxiv.org/html/2410.03613v5)
- NPUs are not always faster than CPUs stage by stage — [arXiv 2605.27435](https://arxiv.org/html/2605.27435)

### Inferences
- Default: llama.rn + GGUF (widest coverage, one format on both platforms). Alternative: react-native-executorch for a curated list and hooks. Wrap LiteRT-LM in an Expo module only if Gemma 4 or Android GPU/MTP speed is the priority.
- GPU prefill is 5–7× CPU (3,808 vs 557 tok/s); prefill dominates long transcripts, so GPU/NPU offload matters most.

### Gaps
- No measured app binary-size increase for any runtime. MLC LLM, MediaPipe LLM Inference (superseded by LiteRT-LM), ONNX Runtime GenAI not researched. Unconfirmed whether llama.rn has a 2026 Expo plugin or Hexagon is GA.

## Long transcripts: chunked map-reduce, time, thermal

### Takeaway
Split a 13–14K-token transcript into 3–4 chunks of 3–4K tokens, extract per-chunk JSON (key points, action items), then merge. Estimated ~30–60 s on a flagship GPU and ~2–5 min on a mid-range Android CPU (derived from benchmarks, not measured end to end).

### Cited Findings
- ML Kit recommends 4K-token segments or truncation — [ML Kit](https://developers.google.com/ml-kit/genai/summarization/android)
- Apple's 4,096-token budget is shared input/output — [TN3193](https://developer.apple.com/tutorials/data/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window.md)
- Snapdragon 7 Gen 3, 1B Q4_K_M: 18–25 tok/s decode CPU, 22–30 Vulkan — [Ertas](https://www.ertas.ai/zh/blog/llm-android-benchmarks-snapdragon-tensor) (vendor blog; English version conflicts)
- Pixel 8a LFM2.5 int4 31 tok/s decode — [HF](https://huggingface.co/litert-community/LFM2.5-1.2B-Instruct); S25 Ultra CPU LFM2.5 335/70, Qwen3 1.7B 181/40 — [Liquid AI](https://www.liquid.ai/blog/introducing-lfm2-5-the-next-generation-of-on-device-ai); S26 Ultra GPU Gemma 4 E2B 3,808/52 — [HF](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- "Tiny Titans" (Dialpad; QMSum + real ASR business meetings): most fine-tuned <2B models trail zero-shot ≥7B models; FLAN-T5-780M is the exception, matching or beating many — [arXiv 2402.00841](https://arxiv.org/html/2402.00841v2)
- Non-reasoning LLMs beat reasoning LLMs on QMSum query-focused summarization (suggests turning off Qwen "thinking") — [arXiv 2507.02145](https://arxiv.org/pdf/2507.02145)

### Inferences
- Mid-range: ~1B on CPU, ~200 tok/s prefill, 15–25 tok/s decode; 14K in, ~1,200 out (4×200 map + 400 reduce) → ~70 s prefill + 50–80 s decode ≈ 2–3 min; a 2–3B model about twice that. Flagship GPU: ~5 s prefill + ~25 s decode, under 1 min.
- Run in an Android foreground service / iOS background task with progress; pause on critical thermal or battery state. Optionally merge map outputs in code rather than a second LLM pass.

### Gaps
- No measured end-to-end 1-hour-meeting summary time on a phone; no thermal/battery data for 2–5 min runs; no 2025–2026 evaluation of Gemma 3/4, Qwen3.5, LFM2.5 at 1–3B on QMSum/AMI.

## Extractive "Quick summary" and device tiers

### Takeaway
TextRank scores ~35–37 ROUGE-1 on AMI: usable but redundant for spontaneous speech; ClusterRank improves on it. Split: under ~3 GB RAM = extraction + rule-based action items; 4 GB+ = 0.5–1.2B LLM; 6–8 GB+ = 2B-class or Gemma 4 E2B.

### Cited Findings
- TextRank on AMI: ROUGE-1 35.25, ROUGE-2 6.90, ROUGE-SU4 13.62 — [arXiv 1805.05271](https://arxiv.org/pdf/1805.05271)
- TextRank + BM25 37.39 ROUGE-1 vs 36.27 vanilla — [arXiv 1606.07829](https://arxiv.org/pdf/1606.07829)
- ClusterRank (cluster utterances before the graph) significantly beats TextRank on AMI — [Garg et al., Interspeech 2009](https://www.isca-archive.org/interspeech_2009/garg09_interspeech.html)
- Action items/decisions are treated as dialogue-act tasks on AMI; no TextRank action-item results found — [arXiv 2104.12324](https://arxiv.org/pdf/2104.12324.pdf)
- Memory reference: Gemma 3 270M ~550 MB; LFM2.5 Q4 719 MB; Qwen3-1.7B Q4 1.3 GB; Gemma 4 E2B 0.6–1.7 GB peak; E4B up to 3.3 GB; Gemma 3n E2B/E4B 2/3 GB (sources above)

### Inferences (recommended tiers)
| RAM | Mode | Model / approach | Download |
|---|---|---|---|
| 2–3 GB | Quick only | TextRank/ClusterRank with TF-IDF/BM25 or MiniLM embeddings, MMR de-duplication, rule-based action items | 0–~25 MB |
| 3–4 GB | Quick default; Smart opt-in on Adreno 700+ / recent iPhones | Gemma 3 270M (fine-tuned) or Qwen3.5 0.8B Q4, 2K chunks | 0.25–0.5 GB |
| 4–6 GB | Smart | LFM2.5 1.2B Q4 (check license), Qwen3.5 0.8B or Gemma 3 1B int4 | 0.5–0.8 GB |
| 6–8 GB+ | Smart, higher quality | Qwen3.5 2B Q4 or Gemma 4 E2B on GPU | 1.2–2.6 GB, Wi-Fi only |
| Apple Intelligence / Gemini Nano devices | Smart, zero download | Apple FM or Nano Prompt API with 4K chunks | 0 |

- Quick-summary action-item rules: commitment/modal phrases ("I'll", "we will", "need to", "let's", "can you", "please", "follow up", "action item"); speaker or second-person subject + verb; date/time expressions ("by Friday", "tomorrow"); label as "possible action items".
- Always show the Quick summary instantly, as fallback if the LLM runs out of memory and while Smart is running.

### Gaps
- No ROUGE comparison of 0.5–1B on-device LLMs vs TextRank on AMI/QMSum; no mobile benchmarks for small encoder extractive models; RAM thresholds inferred, not measured; no Helio G99 tok/s data.
