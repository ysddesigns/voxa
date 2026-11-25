#!/usr/bin/env python3
"""
Step 5: compute the 80-band filterbank features training reads, once, so the GPUs are not kept
waiting on audio decoding.

Reads data/manifests/voxa_cuts_*.jsonl.gz, resamples to 16 kHz, and writes
data/fbank/voxa_cuts_{split}_{language}.jsonl.gz plus the feature files beside them. Training
clips also get speed-perturbed copies (0.9x and 1.1x), which helps most when data is scarce.

  python scripts/05_compute_fbank.py --jobs 16
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from lhotse import CutSet, Fbank, FbankConfig, LilcomChunkyWriter

RATE = 16000


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--manifests", type=Path, default=Path("data/manifests"))
    p.add_argument("--out", type=Path, default=Path("data/fbank"))
    p.add_argument("--jobs", type=int, default=8)
    p.add_argument("--no-speed-perturb", action="store_true")
    a = p.parse_args()

    # One thread per job: the jobs already fill the machine.
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    a.out.mkdir(parents=True, exist_ok=True)
    extractor = Fbank(FbankConfig(num_mel_bins=80, sampling_rate=RATE))

    for path in sorted(a.manifests.glob("voxa_cuts_*.jsonl.gz")):
        target = a.out / path.name
        if target.is_file():
            print(f"skip {target} (already there)")
            continue
        cuts = CutSet.from_file(path).resample(RATE)
        if "_train_" in path.name and not a.no_speed_perturb:
            cuts = cuts + cuts.perturb_speed(0.9) + cuts.perturb_speed(1.1)
        stem = path.name.removesuffix(".jsonl.gz")
        cuts = cuts.compute_and_store_features(
            extractor=extractor,
            # Absolute: training reads these from icefall's folder, not from here.
            storage_path=str((a.out / f"{stem}_feats").resolve()),
            num_jobs=a.jobs,
            storage_type=LilcomChunkyWriter,
        )
        cuts.to_file(target)
        print(f"wrote {target}")


if __name__ == "__main__":
    main()
