#!/usr/bin/env python3
"""
Step 2: turn every source into lhotse manifests, split by the speaker lock.

Writes data/manifests/voxa_cuts_{split}_{language}.jsonl.gz for split = train, dev, test. Text is
cleaned the same way the app scores it (voxa_asr/normalize.py). Audio is resampled to 16 kHz when
features are computed (step 5), not here.

Dropped, with a count per reason:
  - empty text (untranscribed audio goes to step 3, teacher labels, instead)
  - digits in the text: a model cannot learn "300" from hearing "three hundred"; fix the
    transcripts, or pass --keep-digits for a check run
  - clips shorter than 1 s or longer than 20 s
  - audio that cannot be read

  python scripts/02_prepare.py \
    --source commonvoice:/data/cv/ha:ha --source fleurs:/data/fleurs/ha_ng:ha \
    --source jsonl:/data/voxa/drive.jsonl --source jsonl:data/teacher/ha.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voxa_asr.normalize import has_digits, normalize  # noqa: E402
from voxa_asr.sources import Utterance, read_source  # noqa: E402

from lhotse import CutSet, Recording, SupervisionSegment  # noqa: E402
from lhotse.cut import MonoCut  # noqa: E402

MIN_SEC, MAX_SEC = 1.0, 20.0


def split_of(u: Utterance, lock: dict) -> str:
    if u.split:
        return u.split
    if u.speaker in lock["test"].get(u.language, ()):
        return "test"
    if u.speaker in lock["dev"].get(u.language, ()):
        return "dev"
    # A voice held out in one language is held out in all. A volunteer locked into the code-switched
    # test set who also read English prompts must not reach training through those.
    if any(u.speaker in s for s in lock["test"].values()):
        return "test"
    if any(u.speaker in s for s in lock["dev"].values()):
        return "dev"
    return "train"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", action="append", required=True, help="kind:path[:language], repeatable")
    p.add_argument("--lock", type=Path, default=Path("splits/speakers.json"))
    p.add_argument("--out", type=Path, default=Path("data/manifests"))
    p.add_argument("--keep-digits", action="store_true")
    a = p.parse_args()

    if not a.lock.is_file():
        sys.exit(f"{a.lock} not found: run scripts/01_lock_test_speakers.py first")
    lock = json.loads(a.lock.read_text(encoding="utf-8"))

    cuts: dict[tuple[str, str], list] = defaultdict(list)
    dropped: Counter = Counter()
    recordings: dict[Path, Recording] = {}
    seconds: Counter = Counter()

    for spec in a.source:
        for u in read_source(spec):
            text = normalize(u.text)
            if not text:
                dropped["empty text"] += 1
                continue
            if has_digits(text) and not a.keep_digits:
                dropped["digits in text"] += 1
                continue
            try:
                rec = recordings.get(u.audio)
                if rec is None:
                    rec = Recording.from_file(u.audio, recording_id=f"rec-{len(recordings)}")
                    recordings[u.audio] = rec
            except Exception as e:  # noqa: BLE001 - any unreadable file is reported and skipped
                dropped["unreadable audio"] += 1
                if dropped["unreadable audio"] <= 5:
                    print(f"  cannot read {u.audio}: {e}")
                continue
            duration = u.duration if u.duration is not None else rec.duration - u.start
            if not (MIN_SEC <= duration <= MAX_SEC):
                dropped["shorter than 1 s or longer than 20 s"] += 1
                continue
            # A supervision's start is relative to its cut, which starts at u.start in the recording.
            sup = SupervisionSegment(
                id=u.id,
                recording_id=rec.id,
                start=0.0,
                duration=duration,
                channel=0,
                text=text,
                speaker=u.speaker,
                language=u.language,
                custom={"source": u.source},
            )
            cut = MonoCut(id=u.id, start=u.start, duration=duration, channel=0, recording=rec, supervisions=[sup])
            split = split_of(u, lock)
            cuts[(split, u.language)].append(cut)
            seconds[(split, u.language)] += duration

    a.out.mkdir(parents=True, exist_ok=True)
    print("Hours per split and language:")
    for (split, lang), items in sorted(cuts.items()):
        path = a.out / f"voxa_cuts_{split}_{lang}.jsonl.gz"
        CutSet.from_cuts(items).to_file(path)
        print(f"  {split:5} {lang:3} {seconds[(split, lang)] / 3600:7.1f} h  {len(items):7} clips  -> {path}")
    if dropped:
        print("Dropped:")
        for reason, n in dropped.most_common():
            print(f"  {n:7}  {reason}")


if __name__ == "__main__":
    main()
