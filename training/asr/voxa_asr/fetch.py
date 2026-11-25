"""
Helpers for scripts/fetch_data.py: turning downloaded datasets into Voxa's jsonl with 16 kHz audio.

Kept apart from the downloading so they can be tested without network or a GPU machine. Every
output is resumable: a Colab session can end at any moment, and running the fetch again carries on
where it stopped instead of downloading everything again.
"""

from __future__ import annotations

import io
import json
import math
import re
import subprocess
import wave
from pathlib import Path
from typing import Iterable, Optional

import numpy as np

RATE = 16000
MIN_SEC, MAX_SEC = 1.0, 20.0

TEXT_COLUMNS = ("transcript", "text", "sentence", "transcription", "raw_transcription", "normalized_text")
SPEAKER_COLUMNS = ("speaker_id", "speaker", "client_id", "user_id", "spk_id")
PATH_COLUMNS = ("path", "audio_path", "file_name", "filename", "audio_id", "audio")


def pick(names: Iterable[str], candidates: tuple[str, ...], what: str, required: bool = True) -> Optional[str]:
    """The first candidate column present (case-insensitive). Raises with the real columns if none is."""
    names = list(names)
    lower = {n.lower(): n for n in names}
    for c in candidates:
        if c in lower:
            return lower[c]
    if required:
        raise KeyError(f"No {what} column: looked for {', '.join(candidates)}; the data has {', '.join(names)}")
    return None


def to_16k(samples: np.ndarray, rate: int) -> np.ndarray:
    """Mono float32 at 16 kHz. Uses scipy's polyphase resampler when present (Colab has it)."""
    x = np.asarray(samples, dtype=np.float32)
    if x.ndim == 2:
        x = x.mean(axis=1)
    if rate == RATE or x.size == 0:
        return x
    try:
        from scipy.signal import resample_poly

        g = math.gcd(int(rate), RATE)
        return resample_poly(x, RATE // g, int(rate) // g).astype(np.float32)
    except ImportError:
        n = int(round(x.size * RATE / rate))
        return np.interp(np.linspace(0, x.size - 1, n), np.arange(x.size), x).astype(np.float32)


def decode(data: bytes) -> tuple[np.ndarray, int]:
    """Audio file bytes to samples. soundfile first (wav, flac, ogg, mp3); ffmpeg for anything else."""
    try:
        import soundfile as sf

        x, rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
        return x, int(rate)
    except Exception:  # noqa: BLE001 - not installed, or a format libsndfile cannot read
        p = subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", str(RATE), "pipe:1"],
            input=data,
            capture_output=True,
        )
        if p.returncode != 0 or not p.stdout:
            raise ValueError(p.stderr.decode(errors="replace")[:200] or "ffmpeg could not decode the audio")
        return np.frombuffer(p.stdout, dtype="<i2").astype(np.float32) / 32768.0, RATE


def safe_id(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip("_")[:120] or "clip"


class Output:
    """
    One fetched dataset: <folder>/<name>.jsonl and its audio in <folder>/<name>/. Lines already
    written are kept and skipped on the next run, and parts (shards, archives) marked finished are not
    downloaded again. `hours` caps the training audio (lines without a split, or split "train").
    """

    def __init__(self, folder: Path, name: str, language: str, hours: Optional[float] = None):
        self.folder = folder
        self.name = name
        self.language = language
        self.limit = hours * 3600 if hours else None
        self.jsonl = folder / f"{name}.jsonl"
        self.audio = folder / name
        self.state_file = folder / f"{name}.state.json"
        self.audio.mkdir(parents=True, exist_ok=True)
        self.ids: set[str] = set()
        self.train_sec = 0.0
        self.total_sec = 0.0
        if self.jsonl.is_file():
            for line in self.jsonl.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                row = json.loads(line)
                self.ids.add(row["id"])
                self.total_sec += row.get("duration", 0.0)
                if row.get("split") in (None, "train"):
                    self.train_sec += row.get("duration", 0.0)
        self.state = json.loads(self.state_file.read_text(encoding="utf-8")) if self.state_file.is_file() else {"done": []}

    def full(self, split: Optional[str] = None) -> bool:
        return split in (None, "train") and self.limit is not None and self.train_sec >= self.limit

    def is_done(self, part: str) -> bool:
        return part in self.state["done"]

    def mark_done(self, part: str) -> None:
        self.state["done"].append(part)
        self.state_file.write_text(json.dumps(self.state), encoding="utf-8")

    def add(self, clip_id: str, samples: np.ndarray, rate: int, text: str, speaker: str, split: Optional[str] = None) -> str:
        """Writes one clip. Returns "kept", or why it was not: "seen", "full", "no text", "length"."""
        clip_id = safe_id(f"{self.name}-{clip_id}")
        if clip_id in self.ids:
            return "seen"
        if self.full(split):
            return "full"
        text = " ".join(str(text or "").split())
        if not text:
            return "no text"
        x = to_16k(samples, rate)
        seconds = x.size / RATE
        if not (MIN_SEC <= seconds <= MAX_SEC):
            return "length"
        path = self.audio / f"{clip_id}.wav"
        pcm = (np.clip(x, -1.0, 1.0) * 32767).astype("<i2")
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        row = {
            "id": clip_id,
            "audio": f"{self.name}/{clip_id}.wav",
            "text": text,
            "speaker": str(speaker),
            "language": self.language,
            "duration": round(seconds, 3),
        }
        if split:
            row["split"] = split
        with self.jsonl.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        self.ids.add(clip_id)
        self.total_sec += seconds
        if split in (None, "train"):
            self.train_sec += seconds
        return "kept"

    def summary(self) -> str:
        return f"{self.jsonl}: {len(self.ids)} clips, {self.total_sec / 3600:.1f} h ({self.train_sec / 3600:.1f} h training)"


# --- k2 wheels (scripts/colab_install.py) ---------------------------------------------------------

_WHEEL = re.compile(
    r'href="(?P<url>[^"]*?k2-(?P<k2>[0-9.]+?)(?:\.dev(?P<dev>[0-9]+))?(?:\+|%2B)cuda(?P<cuda>[0-9.]+)'
    r'\.torch(?P<torch>[0-9.]+)-(?P<py>cp[0-9]+)-[^"]*?x86_64[^"]*?\.whl)"'
)


def _ver(v: str) -> tuple[int, ...]:
    return tuple(int(p) for p in v.split(".") if p.isdigit())


def k2_wheels(html: str, py: str) -> list[dict]:
    """Linux x86_64 CUDA wheels for this Python (e.g. "cp312"), newest torch, CUDA and build first."""
    out = []
    for m in _WHEEL.finditer(html):
        if m.group("py") != py or "linux" not in m.group("url"):
            continue
        out.append({
            "url": m.group("url").replace("%2B", "+"),
            "torch": m.group("torch"),
            "cuda": m.group("cuda"),
            "dev": int(m.group("dev") or 0),
        })
    out.sort(key=lambda w: (_ver(w["torch"]), _ver(w["cuda"]), w["dev"]), reverse=True)
    return out


def k2_for(wheels: list[dict], torch: str, cuda: str) -> Optional[dict]:
    """The newest k2 build for exactly this torch ("2.9.0+cu126" or "2.9.0") and CUDA ("12.6")."""
    base = torch.split("+")[0]
    for w in wheels:
        if w["torch"] == base and w["cuda"] == cuda:
            return w
    return None
