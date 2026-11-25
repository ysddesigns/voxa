#!/usr/bin/env python3
"""
Step 1: choose the test and dev speakers, once, and lock them.

Scores mean nothing if a test speaker's voice is also in training, so this runs before any
training data is built, and its output (splits/speakers.json) is never rewritten without --force.
Every later step reads it and keeps those speakers out of training.

Speakers are picked by a stable hash of their id, so the same input always gives the same pick.
Speakers named in --test-speakers (for example the Voxa test-set volunteers) are always test.
A language with few speakers holds back at most --max-share of them for test and dev together (about
15% test, 5% dev), so most of its voices are still trained on: 31 speakers give 5 test, 2 dev.
FLEURS keeps its own splits and is not picked from.

  python scripts/01_lock_test_speakers.py \
    --source commonvoice:/data/cv/ha:ha --source jsonl:/data/voxa/drive.jsonl \
    --test-per-language 30 --dev-per-language 10
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voxa_asr.sources import read_source  # noqa: E402

OUT = Path("splits/speakers.json")
SALT = "voxa-test-speakers-v1"


def rank(speaker: str) -> str:
    return hashlib.sha256(f"{SALT}:{speaker}".encode()).hexdigest()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", action="append", required=True, help="kind:path[:language], repeatable")
    p.add_argument("--test-per-language", type=int, default=30)
    p.add_argument("--dev-per-language", type=int, default=10)
    p.add_argument("--max-share", type=float, default=0.2, help="most of a language's speakers held out (test + dev)")
    p.add_argument("--test-speakers", type=Path, help="a text file, one speaker id a line, always test")
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--force", action="store_true", help="rewrite an existing lock (breaks comparisons with old scores)")
    a = p.parse_args()

    if a.out.exists() and not a.force:
        sys.exit(f"{a.out} already exists. The lock is meant to stay fixed; pass --force only if you mean to start over.")

    fixed = set()
    if a.test_speakers:
        fixed = {s.strip() for s in a.test_speakers.read_text(encoding="utf-8").splitlines() if s.strip()}

    # language -> speaker -> seconds is not known before audio is read, so count utterances instead.
    speakers: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for spec in a.source:
        for u in read_source(spec):
            if u.split is None:
                speakers[u.language][u.speaker] += 1

    lock = {"salt": SALT, "test": {}, "dev": {}}
    for lang, counts in sorted(speakers.items()):
        named = sorted(s for s in counts if s in fixed)
        # Speakers with very few clips say little about a model: prefer those with at least 5.
        pool = sorted((s for s in counts if s not in fixed and counts[s] >= 5), key=rank)
        # Three quarters of the held-out share for test, a quarter for dev; always one test speaker.
        n = len(counts)
        n_test = min(a.test_per_language, max(1, round(n * a.max_share * 0.75)))
        n_dev = min(a.dev_per_language, round(n * a.max_share * 0.25))
        test = named + pool[: max(0, n_test - len(named))]
        dev = pool[len(test) - len(named):][:n_dev]
        lock["test"][lang] = test
        lock["dev"][lang] = dev
        left = len(counts) - len(test) - len(dev)
        print(f"{lang}: {len(counts)} speakers -> test {len(test)}, dev {len(dev)}, training {left}")
        if left < len(test):
            print(f"  warning: {lang} keeps only {left} speakers for training; consider fewer test speakers")

    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Locked {a.out}. Commit it: every training run must use this same file.")


if __name__ == "__main__":
    main()
