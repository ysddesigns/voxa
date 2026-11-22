#!/usr/bin/env python3
"""
Step 3: label untranscribed audio with a teacher model (Omnilingual ASR, Apache-2.0).

Input: a Voxa .jsonl of audio with empty "text" (see voxa_asr/sources.py). Each file is cut into
speech pieces by Silero VAD, the teacher transcribes each piece, and pieces that look wrong are
dropped. Output: a .jsonl in the same format with "text" filled in, ready for step 2.

Test speakers are skipped: their audio must never reach training, even through labels.

Pieces are dropped when:
  - the text is empty or has digits
  - it has fewer than 3 or more than 25 letters a second (a sign of a missed or invented stretch)
  - one word repeats 4 or more times in a row (a common teacher failure)

The teacher here is the 300M model through sherpa-onnx, which runs on a CPU or one GPU. A larger
Omnilingual model labels better; swap it in by replacing make_teacher() (keep transcribe()'s
contract). Rerunning appends to the output and skips pieces already written.

  python scripts/03_teacher_label.py --input /data/voxa/unlabelled-ha.jsonl --language ha \
    --model models/omnilingual-300m/model.int8.onnx --tokens models/omnilingual-300m/tokens.txt \
    --vad models/silero_vad.onnx --out data/teacher/ha.jsonl --provider cuda
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voxa_asr.normalize import has_digits, normalize  # noqa: E402
from voxa_asr.sources import read_jsonl  # noqa: E402

import numpy as np  # noqa: E402
import sherpa_onnx  # noqa: E402
from lhotse import Recording  # noqa: E402

RATE = 16000
MIN_SEC, MAX_SEC = 1.0, 20.0
MIN_CPS, MAX_CPS = 3.0, 25.0
WINDOW = 512  # Silero VAD reads 512-sample windows at 16 kHz


def make_teacher(a):
    return sherpa_onnx.OfflineRecognizer.from_omnilingual_asr_ctc(
        model=str(a.model), tokens=str(a.tokens), num_threads=a.threads, provider=a.provider
    )


def transcribe(teacher, samples: np.ndarray) -> str:
    s = teacher.create_stream()
    s.accept_waveform(RATE, samples)
    teacher.decode_stream(s)
    return s.result.text


def make_vad(model: Path) -> sherpa_onnx.VoiceActivityDetector:
    c = sherpa_onnx.VadModelConfig()
    c.silero_vad.model = str(model)
    c.silero_vad.threshold = 0.5
    c.silero_vad.min_silence_duration = 0.4
    c.silero_vad.min_speech_duration = 0.5
    c.silero_vad.max_speech_duration = MAX_SEC
    c.silero_vad.window_size = WINDOW
    c.sample_rate = RATE
    return sherpa_onnx.VoiceActivityDetector(c, buffer_size_in_seconds=MAX_SEC * 3)


def pieces(vad_model: Path, samples: np.ndarray):
    """(start in seconds, samples) for each speech piece. A fresh VAD per file: no state carries over."""
    vad = make_vad(vad_model)
    window = WINDOW
    out = []
    for i in range(0, len(samples) - window + 1, window):
        vad.accept_waveform(samples[i : i + window])
        while not vad.empty():
            out.append((vad.front.start / RATE, np.array(vad.front.samples, dtype=np.float32)))
            vad.pop()
    vad.flush()
    while not vad.empty():
        out.append((vad.front.start / RATE, np.array(vad.front.samples, dtype=np.float32)))
        vad.pop()
    return out


def reason_to_drop(text: str, seconds: float) -> str | None:
    if not text:
        return "empty"
    if has_digits(text):
        return "digits"
    if not (MIN_SEC <= seconds <= MAX_SEC):
        return "length"
    letters = sum(ch.isalpha() for ch in text)
    if not (MIN_CPS <= letters / seconds <= MAX_CPS):
        return "letters per second"
    run, last = 0, None
    for w in text.split():
        run = run + 1 if w == last else 1
        last = w
        if run >= 4:
            return "repeated word"
    return None


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--language", required=True, help="en, pcm, ha, yo or ig (for lines that have none)")
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--tokens", type=Path, required=True)
    p.add_argument("--vad", type=Path, required=True, help="silero_vad.onnx")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--lock", type=Path, default=Path("splits/speakers.json"))
    p.add_argument("--provider", default="cpu", help="cpu or cuda")
    p.add_argument("--threads", type=int, default=4)
    a = p.parse_args()

    lock = json.loads(a.lock.read_text(encoding="utf-8"))
    held_out = {s for group in ("test", "dev") for lang in lock[group].values() for s in lang}

    done = set()
    if a.out.is_file():
        done = {json.loads(line)["id"] for line in a.out.read_text(encoding="utf-8").splitlines() if line.strip()}

    teacher = make_teacher(a)
    stats: Counter = Counter()
    kept_sec = 0.0
    a.out.parent.mkdir(parents=True, exist_ok=True)

    with a.out.open("a", encoding="utf-8") as out:
        for u in read_jsonl(a.input, a.language):
            if u.speaker in held_out:
                stats["held-out speaker"] += 1
                continue
            try:
                rec = Recording.from_file(u.audio).resample(RATE)
                audio = rec.load_audio(offset=u.start, duration=u.duration)[0].astype(np.float32)
            except Exception as e:  # noqa: BLE001 - report and go on
                stats["unreadable audio"] += 1
                print(f"  cannot read {u.audio}: {e}")
                continue
            for start, samples in pieces(a.vad, audio):
                pid = f"{u.id}-t{int(round(start * 100)):07d}"
                if pid in done:
                    continue
                seconds = len(samples) / RATE
                text = normalize(transcribe(teacher, samples))
                why = reason_to_drop(text, seconds)
                if why:
                    stats[why] += 1
                    continue
                row = {
                    "id": pid,
                    "audio": str(u.audio),
                    "text": text,
                    "speaker": u.speaker,
                    "language": u.language,
                    "start": round(u.start + start, 3),
                    "duration": round(seconds, 3),
                    "teacher": "omnilingual-300m-ctc-int8",
                }
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                stats["kept"] += 1
                kept_sec += seconds

    print(f"Kept {stats['kept']} pieces, {kept_sec / 3600:.1f} h. Dropped: " + ", ".join(f"{k} {v}" for k, v in stats.items() if k != "kept"))


if __name__ == "__main__":
    main()
