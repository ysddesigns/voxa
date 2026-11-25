#!/usr/bin/env python3
"""
Step 8: word error per language on the locked test sets, for any Listening pack folder.

Runs the pack the way the app does: sherpa-onnx streaming, greedy search, 2 threads, audio fed in
100 ms pieces with 0.5 s of silence at the end. Scores with the app's measure (voxa_asr/wer.py).
Run it on the current Kroko pack too, so every new model is compared with what users have now.

  python scripts/08_score.py --pack packs/english-medium-e10-avg3 --languages en,pcm
  python scripts/08_score.py --pack /data/kroko --languages en --name kroko
  python scripts/08_score.py --pack packs/north-medium-e20-avg3 --languages en,ha,cs-ha

Code-switched sets (cs-ha, cs-pcm, ...) are also scored per language inside the mixed sentences:
each reference word is tagged English or local from how often the training text of each side uses
it, and errors on those words are counted apart. A model that drops every Hausa word inside an
English sentence can still score well overall; this shows it. Words both sides use ("a", names)
count only in the overall figure.

Writes reports/<name>.json with the totals and the worst 20 clips per language (to listen to).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voxa_asr.codeswitch import WordTagger, score_by_language  # noqa: E402
from voxa_asr.normalize import words  # noqa: E402
from voxa_asr.sources import local_language  # noqa: E402
from voxa_asr.wer import Score, score  # noqa: E402

from collections import Counter  # noqa: E402

import numpy as np  # noqa: E402
import sherpa_onnx  # noqa: E402
from lhotse import CutSet  # noqa: E402

RATE = 16000


def load(pack: Path, threads: int, decoding: str) -> sherpa_onnx.OnlineRecognizer:
    return sherpa_onnx.OnlineRecognizer.from_transducer(
        tokens=str(pack / "tokens.txt"),
        encoder=str(pack / "encoder.onnx"),
        decoder=str(pack / "decoder.onnx"),
        joiner=str(pack / "joiner.onnx"),
        num_threads=threads,
        sample_rate=RATE,
        feature_dim=80,
        decoding_method=decoding,
        max_active_paths=4,
    )


def tagger_for(code: str, manifests: Path) -> WordTagger | None:
    """Word counts from the training text of English and of the local language a cs-* set mixes."""
    counts = {}
    for lang in ("en", local_language(code)):
        path = manifests / f"voxa_cuts_train_{lang}.jsonl.gz"
        if not path.is_file():
            print(f"{code}: no {path}, so no per-language breakdown")
            return None
        c: Counter = Counter()
        for cut in CutSet.from_file(path):
            c.update(words(cut.supervisions[0].text))
        counts[lang] = c
    return WordTagger(counts)


def transcribe(r: sherpa_onnx.OnlineRecognizer, samples: np.ndarray) -> str:
    s = r.create_stream()
    step = RATE // 10
    for i in range(0, len(samples), step):
        s.accept_waveform(RATE, samples[i : i + step])
        while r.is_ready(s):
            r.decode_stream(s)
    s.accept_waveform(RATE, np.zeros(RATE // 2, dtype=np.float32))
    s.input_finished()
    while r.is_ready(s):
        r.decode_stream(s)
    return r.get_result(s)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pack", type=Path, required=True)
    p.add_argument("--languages", default="en,pcm,ha,yo,ig,cs-ha,cs-pcm")
    p.add_argument("--manifests", type=Path, default=Path("data/manifests"))
    p.add_argument("--split", default="test", help="test, or dev while tuning (keep test for decisions)")
    p.add_argument("--name", help="report name (default: the pack folder's name)")
    p.add_argument("--threads", type=int, default=2)
    p.add_argument("--decoding", default="greedy_search", help="or modified_beam_search, which Live uses since 24 Nov 2026")
    a = p.parse_args()

    r = load(a.pack, a.threads, a.decoding)
    report = {"pack": str(a.pack), "split": a.split, "decoding": a.decoding, "languages": {}}
    for lang in [x.strip() for x in a.languages.split(",") if x.strip()]:
        path = a.manifests / f"voxa_cuts_{a.split}_{lang}.jsonl.gz"
        if not path.is_file():
            print(f"{lang}: no {path}, skipped")
            continue
        total = Score(0, 0)
        tagger = tagger_for(lang, a.manifests) if lang.startswith("cs-") else None
        by_lang: dict[str, list[int]] = {}
        clips = []
        audio_sec = decode_sec = 0.0
        for cut in CutSet.from_file(path).resample(RATE):
            samples = cut.load_audio()[0].astype(np.float32)
            t0 = time.perf_counter()
            hyp = transcribe(r, samples)
            decode_sec += time.perf_counter() - t0
            audio_sec += cut.duration
            ref = cut.supervisions[0].text
            s = score(ref, hyp)
            total += s
            if tagger:
                for k, (bad, n) in score_by_language(words(ref), words(hyp), tagger).items():
                    tally = by_lang.setdefault(k, [0, 0])
                    tally[0] += bad
                    tally[1] += n
            clips.append({"id": cut.id, "wer": round(s.wer, 3), "ref": ref, "hyp": hyp})
        clips.sort(key=lambda c: -c["wer"])
        report["languages"][lang] = {
            "wer": round(total.wer, 4),
            "errors": total.errors,
            "words": total.ref_words,
            "clips": len(clips),
            "hours": round(audio_sec / 3600, 2),
            "rtf_this_machine": round(decode_sec / audio_sec, 3) if audio_sec else None,
            "worst": clips[:20],
        }
        print(f"{lang}: word error {total.wer:.1%} over {total.ref_words} words, {len(clips)} clips")
        if by_lang:
            inserted = by_lang.pop("inserted", [0, 0])[0]
            report["languages"][lang]["by_word_language"] = {
                k: {"wrong": bad, "words": n, "error": round(bad / n, 4) if n else None} for k, (bad, n) in sorted(by_lang.items())
            }
            report["languages"][lang]["inserted"] = inserted
            for k in ("en", local_language(lang)):
                bad, n = by_lang.get(k, [0, 0])
                if n:
                    print(f"  {k} words inside mixed sentences: {bad / n:.1%} wrong of {n}")

    out = Path("reports") / f"{a.name or a.pack.name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Report: {out}  (speed here is the server's; measure phone speed in the Engine lab)")


if __name__ == "__main__":
    main()
