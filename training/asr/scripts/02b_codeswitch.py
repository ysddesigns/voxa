#!/usr/bin/env python3
"""
Step 2b: code-switched training clips, joined from single-language ones (see voxa_asr/codeswitch.py).

Reads step 2's training manifests for the local language and for English, joins pairs (and some
local-English-local triples) into one clip each, and writes them as their own set:

  data/codeswitch/cs-<local>/audio/*.wav                    16 kHz mono
  data/manifests/voxa_cuts_train_cs-<local>-synth.jsonl.gz  name it in --voxa-languages as cs-<local>-synth

Only training clips are used, so locked test and dev speakers never reach these. Joined clips are
training data only: score code-switching on real recordings (the cs-<local> test set).

  python scripts/02b_codeswitch.py --local ha --hours 80     # the North: Hausa and English
  python scripts/02b_codeswitch.py --local pcm --hours 40    # the South: Pidgin and English

About as many hours as the smaller language has is a sensible start: enough to teach switching
without drowning the real single-language clips.
"""

from __future__ import annotations

import argparse
import random
import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voxa_asr.codeswitch import RATE, Clip, join, plan, trim  # noqa: E402

import numpy as np  # noqa: E402
from lhotse import CutSet, Recording, SupervisionSegment  # noqa: E402
from lhotse.cut import MonoCut  # noqa: E402


def clips_of(cuts: CutSet, language: str) -> list[Clip]:
    out = []
    for c in cuts:
        s = c.supervisions[0]
        out.append(Clip(id=c.id, language=language, speaker=s.speaker or c.id, text=s.text, duration=c.duration))
    return out


def write_wav(path: Path, samples: np.ndarray) -> None:
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--local", required=True, choices=["ha", "pcm", "yo", "ig"])
    p.add_argument("--english", default="en", help="the other side of the mix (default: Nigerian English)")
    p.add_argument("--hours", type=float, default=50.0)
    p.add_argument("--local-first", type=float, default=0.6, help="share of clips that start in the local language")
    p.add_argument("--sandwich", type=float, default=0.3, help="share that switch back (local, English, local)")
    p.add_argument("--manifests", type=Path, default=Path("data/manifests"))
    p.add_argument("--out", type=Path, default=Path("data/codeswitch"))
    p.add_argument("--seed", type=int, default=0)
    a = p.parse_args()

    name = f"cs-{a.local}"
    sets = {}
    for lang in (a.local, a.english):
        path = a.manifests / f"voxa_cuts_train_{lang}.jsonl.gz"
        if not path.is_file():
            sys.exit(f"{path} not found: run step 2 with {lang} sources first")
        sets[lang] = CutSet.from_file(path).to_eager()
    index = {c.id: c for cuts in sets.values() for c in cuts}

    rng = random.Random(a.seed)
    mixes = plan(
        clips_of(sets[a.local], a.local),
        clips_of(sets[a.english], a.english),
        hours=a.hours,
        rng=rng,
        local_first=a.local_first,
        sandwich=a.sandwich,
    )
    same_voice = sum(1 for m in mixes if not m.speaker.startswith("cs+"))
    print(f"{name}: {len(mixes)} joined clips planned, {same_voice} of them in one voice")

    audio_dir = a.out / name / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    cuts = []
    seconds = 0.0
    for n, m in enumerate(mixes):
        pieces = [trim(index[c.id].resample(RATE).load_audio()[0].astype(np.float32)) for c in m.clips]
        samples = join(pieces, m.gaps, rng)
        wav = audio_dir / f"{name}-{n:07d}.wav"
        write_wav(wav, samples)
        rec = Recording.from_file(wav, recording_id=f"{name}-rec-{n:07d}")
        cid = f"{name}-{n:07d}"
        sup = SupervisionSegment(
            id=cid,
            recording_id=rec.id,
            start=0.0,
            duration=rec.duration,
            channel=0,
            text=m.text,
            speaker=m.speaker,
            language=name,
            custom={"source": "joined", "pieces": [c.id for c in m.clips]},
        )
        cuts.append(MonoCut(id=cid, start=0.0, duration=rec.duration, channel=0, recording=rec, supervisions=[sup]))
        seconds += rec.duration
        if (n + 1) % 5000 == 0:
            print(f"  {n + 1} written")

    target = a.manifests / f"voxa_cuts_train_{name}-synth.jsonl.gz"
    CutSet.from_cuts(cuts).to_file(target)
    print(f"Wrote {len(cuts)} clips, {seconds / 3600:.1f} h -> {target}")
    print(f"Train with it: --voxa-languages ...,{name}-synth (06_finetune.sh north/south add it when present)")


if __name__ == "__main__":
    main()
