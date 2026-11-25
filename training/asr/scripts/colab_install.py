#!/usr/bin/env python3
"""
Install k2 to match the PyTorch already on this machine (Colab, RunPod, ...).

k2 must be built for the exact PyTorch and CUDA versions in use, or it fails to import. Colab
updates its PyTorch every few months, so a fixed pin breaks. This looks up k2's wheel index:

1. If a k2 build exists for the installed PyTorch and its CUDA version, install it. PyTorch stays.
2. Otherwise install the newest PyTorch that has a k2 build and that this GPU's driver can run, then
   that k2. torchvision and torchaudio are removed, since they would no longer match, and nothing
   here needs them.

Then it checks that torch and k2 import together, with the GPU visible.

  python scripts/colab_install.py
"""

from __future__ import annotations

import re
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voxa_asr.fetch import _ver, k2_for, k2_wheels  # noqa: E402

INDEX = "https://k2-fsa.github.io/k2/cuda.html"


def pip(*args: str) -> bool:
    print("pip", " ".join(args), flush=True)
    return subprocess.run([sys.executable, "-m", "pip", "install", "-q", *args]).returncode == 0


def installed_torch() -> tuple[str, str] | None:
    """(version, cuda) of the installed torch, read in a fresh process so a reinstall is seen."""
    p = subprocess.run(
        [sys.executable, "-c", "import torch; print(torch.__version__); print(torch.version.cuda or '')"],
        capture_output=True,
        text=True,
    )
    if p.returncode:
        return None
    version, cuda = (p.stdout.strip().splitlines() + ["", ""])[:2]
    return version, cuda


def driver_cuda() -> tuple[int, ...]:
    """The highest CUDA version the GPU driver supports, from nvidia-smi ("CUDA Version: 12.4")."""
    try:
        out = subprocess.run(["nvidia-smi"], capture_output=True, text=True).stdout
    except FileNotFoundError:
        return ()
    m = re.search(r"CUDA Version:\s*([0-9.]+)", out)
    return _ver(m.group(1)) if m else ()


def works() -> bool:
    p = subprocess.run(
        [sys.executable, "-c", "import torch, k2; assert torch.cuda.is_available(), 'no GPU'; print('torch', torch.__version__, 'k2', k2.__version__, 'GPU', torch.cuda.get_device_name(0))"],
    )
    return p.returncode == 0


def main() -> None:
    py = f"cp{sys.version_info.major}{sys.version_info.minor}"
    if works():
        print("torch and k2 already work together; nothing to do.")
        return
    html = urllib.request.urlopen(INDEX, timeout=60).read().decode("utf-8", errors="replace")
    wheels = k2_wheels(html, py)
    if not wheels:
        sys.exit(f"No k2 CUDA wheels for Python {py} at {INDEX}")

    have = installed_torch()
    if have:
        print(f"Installed: torch {have[0]}, CUDA {have[1] or 'none'}; Python {py}")
        w = k2_for(wheels, *have) if have[1] else None
        if w and pip(w["url"]) and works():
            return
        print("No k2 build for this torch; installing a torch that has one.")

    limit = driver_cuda()
    tried = set()
    for w in wheels:
        key = (w["torch"], w["cuda"])
        if key in tried or (limit and _ver(w["cuda"]) > limit):
            continue
        tried.add(key)
        if len(tried) > 4:
            break
        cu = "cu" + w["cuda"].replace(".", "")
        if not pip(f"torch=={w['torch']}", "--index-url", f"https://download.pytorch.org/whl/{cu}"):
            continue
        subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "-q", "torchvision", "torchaudio"])
        if pip(w["url"]) and works():
            return
    sys.exit("Could not find a torch and k2 that work together here. See https://k2-fsa.github.io/k2/installation/")


if __name__ == "__main__":
    main()
