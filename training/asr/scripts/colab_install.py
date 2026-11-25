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


CHECK = """
import torch, k2
assert torch.cuda.is_available(), "torch cannot see the GPU"
k2v = getattr(k2, "__dev_version__", "") or getattr(k2, "__version__", "")
print("OK: torch", torch.__version__, "| k2", k2v, "| GPU", torch.cuda.get_device_name(0))
"""


def works() -> bool:
    return subprocess.run([sys.executable, "-c", CHECK]).returncode == 0


def install_k2(w: dict) -> bool:
    """This k2 build only. --no-deps so it never swaps torch; --force-reinstall replaces a k2 built for another CUDA."""
    return pip("--no-deps", "--force-reinstall", w["url"])


def install_torch(version: str, cuda: str) -> bool:
    """Exactly torch <version>+cu<cuda>. The +cuXYZ pin matters: plain torch==2.9.0 is already met by
    2.9.0+cu130, so pip would keep the wrong CUDA build."""
    cu = "cu" + cuda.replace(".", "")
    return pip(f"torch=={version}+{cu}", "--index-url", f"https://download.pytorch.org/whl/{cu}")


def main() -> None:
    py = f"cp{sys.version_info.major}{sys.version_info.minor}"
    if works():
        print("torch and k2 already work together; nothing to do.")
        return
    html = urllib.request.urlopen(INDEX, timeout=60).read().decode("utf-8", errors="replace")
    wheels = k2_wheels(html, py)
    if not wheels:
        sys.exit(f"No k2 CUDA wheels for Python {py} at {INDEX}")
    pip("graphviz")  # k2's one other dependency, since k2 itself goes in with --no-deps

    have = installed_torch()
    have_cuda = have[1] if have else ""
    if have:
        print(f"Installed: torch {have[0]}, CUDA {have_cuda or 'none'}; Python {py}")
        w = k2_for(wheels, *have) if have_cuda else None
        if w and install_k2(w) and works():
            return
        print("No working k2 build for this torch; installing a torch that has one.")

    limit = driver_cuda()
    # Same CUDA as the installed torch first: its CUDA libraries are already on the disk.
    candidates = sorted(wheels, key=lambda w: w["cuda"] != have_cuda)
    tried = set()
    for w in candidates:
        key = (w["torch"], w["cuda"])
        if key in tried or (limit and _ver(w["cuda"]) > limit):
            continue
        tried.add(key)
        if len(tried) > 4:
            break
        print(f"Trying torch {w['torch']} with CUDA {w['cuda']}", flush=True)
        if not install_torch(w["torch"], w["cuda"]):
            continue
        # They were built for the old torch. Training does not use them; fastai/timm warnings are harmless.
        subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "-q", "torchvision", "torchaudio"])
        if install_k2(w) and works():
            return
    sys.exit("Could not find a torch and k2 that work together here. See https://k2-fsa.github.io/k2/installation/")


if __name__ == "__main__":
    main()
