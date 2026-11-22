#!/usr/bin/env python3
"""
Step 8: word error per language on the locked test sets, for any Listening pack folder.

Runs the pack the way the app does: sherpa-onnx streaming, greedy search, 2 threads, audio fed in
100 ms pieces with 0.5 s of silence at the end. Scores with the app's measure (voxa_asr/wer.py).
Run it on the current Kroko pack too, so every new model is compared with what users have now.

  python scripts/08_score.py --pack packs/english-medium-e10-avg3 --languages en,pcm
  python scripts/08_score.py --pack /data/kroko --languages en --name kroko

Writes reports/<name>.json with the totals and the worst 20 clips per language (to listen to).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voxa_asr.wer import Score, score  # noqa: E402

import numpy as np  # noqa: E402
import sherpa_onnx  # noqa: E402
from lhotse import CutSet  # noqa: E402

RATE = 16000


def load(pack: Path, threads: int) -> sherpa_onnx.OnlineRecognizer:
    return sherpa_onnx.OnlineRecognizer.from_transducer(
        tokens=str(pack / "tokens.txt"),
        encoder=str(pack / "encoder.onnx"),
        decoder=str(pack / "decoder.onnx"),
        joiner=str(pack / "joiner.onnx"),
        num_threads=threads,
        sample_rate=RATE,
        feature_dim=80,
        decoding_method="greedy_search",
    )


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
    p.add_argument("--languages", default="en,pcm,ha,yo,ig")
    p.add_argument("--manifests", type=Path, default=Path("data/manifests"))
    p.add_argument("--split", default="test", help="test, or dev while tuning (keep test for decisions)")
    p.add_argument("--name", help="report name (default: the pack folder's name)")
    p.add_argument("--threads", type=int, default=2)
    a = p.parse_args()

    r = load(a.pack, a.threads)
    report = {"pack": str(a.pack), "split": a.split, "languages": {}}
    for lang in [x.strip() for x in a.languages.split(",") if x.strip()]:
        path = a.manifests / f"voxa_cuts_{a.split}_{lang}.jsonl.gz"
        if not path.is_file():
            print(f"{lang}: no {path}, skipped")
            continue
        total = Score(0, 0)
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

    out = Path("reports") / f"{a.name or a.pack.name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Report: {out}  (speed here is the server's; measure phone speed in the Engine lab)")


if __name__ == "__main__":
    main()
