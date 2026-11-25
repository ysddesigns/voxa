"""
Code-switched speech: making it for training, and scoring a model on it.

Nigerians rarely keep one language through a meeting. In the North people move between Hausa and
English inside a sentence ("To, abu na gaba on the agenda shine budget"); in the South between
Pidgin and English. Almost no transcribed recordings of this exist, so a model trained only on
single-language clips learns that a clip stays in one language. When the language changes, it
forces the new words into the old language's spelling, and whole stretches come out wrong.

Two things fix that, and Voxa uses both:

1. Real code-switched recordings (the cs-* sets): meetings transcribed by people, and the Donate
   prompts that mix languages. Only these teach switches inside a phrase.
2. Joined clips (plan() and join() below): a local-language clip and an English clip, cut into one
   training clip with a natural pause between them, sometimes local-English-local. This teaches the
   model that the language can change mid-utterance, from data that already exists in quantity.

The app needs no language detector: one model with one vocabulary covering both languages writes
whichever word it hears.

score_by_language() reports how a model does on each language's words inside mixed sentences. The
overall word error can look fine while every Hausa word in an English sentence is lost.
"""

from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass, field

import numpy as np

RATE = 16000


@dataclass(frozen=True)
class Clip:
    id: str
    language: str
    speaker: str
    text: str
    duration: float


@dataclass
class Mix:
    clips: list[Clip]
    # Pause after each clip but the last, in seconds.
    gaps: list[float] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(c.text for c in self.clips)

    @property
    def duration(self) -> float:
        return sum(c.duration for c in self.clips) + sum(self.gaps)

    @property
    def speaker(self) -> str:
        """One speaker when every piece is the same voice; otherwise all of them, so step 1 can tell."""
        voices = sorted({c.speaker for c in self.clips})
        return voices[0] if len(voices) == 1 else "cs+" + "+".join(voices)

    @property
    def id(self) -> str:
        return "cs-" + "+".join(c.id for c in self.clips)


def plan(
    local: list[Clip],
    english: list[Clip],
    hours: float,
    rng: random.Random,
    max_sec: float = 20.0,
    local_first: float = 0.6,
    sandwich: float = 0.3,
    max_uses: int = 3,
    gap: tuple[float, float] = (0.08, 0.45),
) -> list[Mix]:
    """
    Joined clips totalling about `hours`.

    Each mix starts in the local language with probability `local_first` (most northern meetings run
    in Hausa with English mixed in), switches to the other side, and with probability `sandwich`
    switches back (local, English, local). The same speaker is used for the other side whenever they
    have clips in both languages, because a real switch happens in one voice; a model must not learn
    that a change of voice means a change of language. No clip is used more than `max_uses` times.
    """
    if not local or not english:
        raise ValueError("need clips in both languages")
    by_speaker: dict[str, dict[str, list[Clip]]] = {}
    for side, clips in (("local", local), ("english", english)):
        for c in clips:
            by_speaker.setdefault(c.speaker, {"local": [], "english": []})[side].append(c)
    uses: Counter = Counter()
    pools = {"local": local, "english": english}
    target = hours * 3600
    total = 0.0
    out: list[Mix] = []
    misses = 0

    def pick(side: str, speaker: str | None, room: float, taken: list[Clip]) -> Clip | None:
        own = by_speaker.get(speaker, {}).get(side, []) if speaker else []
        for pool in (own, pools[side]):
            for _ in range(8):
                if not pool:
                    break
                c = rng.choice(pool)
                if c.duration <= room and uses[c.id] < max_uses and c not in taken:
                    return c
        return None

    while total < target and misses < 200:
        sides = ["local", "english"] if rng.random() < local_first else ["english", "local"]
        if rng.random() < sandwich:
            sides.append(sides[0])
        first = pick(sides[0], None, max_sec, [])
        if first is None:
            misses += 1
            continue
        mix = Mix([first])
        for side in sides[1:]:
            pause = round(rng.uniform(*gap), 3)
            c = pick(side, first.speaker, max_sec - mix.duration - pause, mix.clips)
            if c is None:
                break
            mix.gaps.append(pause)
            mix.clips.append(c)
        if len(mix.clips) < 2:
            misses += 1
            continue
        misses = 0
        for c in mix.clips:
            uses[c.id] += 1
        out.append(mix)
        total += mix.duration
    return out


def trim(samples: np.ndarray, keep: float = 0.1, rate: int = RATE) -> np.ndarray:
    """Cuts leading and trailing silence, keeping `keep` seconds, so the pause between pieces is ours."""
    if samples.size == 0:
        return samples
    frame = rate // 100
    n = samples.size // frame
    if n == 0:
        return samples
    energy = np.sqrt(np.mean(samples[: n * frame].reshape(n, frame) ** 2, axis=1))
    loud = np.nonzero(energy > max(energy.max() * 0.05, 1e-4))[0]
    if loud.size == 0:
        return samples
    pad = int(keep * rate)
    start = max(0, loud[0] * frame - pad)
    end = min(samples.size, (loud[-1] + 1) * frame + pad)
    return samples[start:end]


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x**2))) if x.size else 0.0


def join(pieces: list[np.ndarray], gaps: list[float], rng: random.Random, rate: int = RATE) -> np.ndarray:
    """
    One waveform from the pieces. Each piece after the first is brought to the first one's loudness,
    give or take 3 dB, so a jump in level does not give the switch away. The pauses hold faint noise,
    not digital silence, and 10 ms fades stop clicks at the joins.
    """
    if len(gaps) != len(pieces) - 1:
        raise ValueError("one gap between each pair of pieces")
    ref = _rms(pieces[0]) or 0.05
    fade = rate // 100
    ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
    parts: list[np.ndarray] = []
    for i, p in enumerate(pieces):
        p = p.astype(np.float32, copy=True)
        if i:
            level = _rms(p)
            if level > 0:
                p *= (ref / level) * 10 ** (rng.uniform(-3, 3) / 20)
        if p.size > 2 * fade:
            p[:fade] *= ramp
            p[-fade:] *= ramp[::-1]
        parts.append(p)
        if i < len(gaps):
            noise = np.random.default_rng(rng.randrange(2**32)).normal(0, ref * 0.01, int(gaps[i] * rate))
            parts.append(noise.astype(np.float32))
    out = np.concatenate(parts)
    peak = float(np.max(np.abs(out))) if out.size else 0.0
    return out * (0.95 / peak) if peak > 0.95 else out


class WordTagger:
    """
    Which language a word belongs to, from how often each language's training text uses it. A word
    much more common (per million words) in one language is that language's; anything else
    ("a", "da", names) is "shared" and left out of per-language scores.
    """

    def __init__(self, counts: dict[str, Counter], ratio: float = 4.0):
        self.ratio = ratio
        self.rates = {lang: (c, sum(c.values()) or 1) for lang, c in counts.items()}

    def tag(self, word: str) -> str:
        scored = sorted(((c[word] / n, lang) for lang, (c, n) in self.rates.items()), reverse=True)
        if not scored or scored[0][0] == 0:
            return "unknown"
        best, lang = scored[0]
        second = scored[1][0] if len(scored) > 1 else 0.0
        return lang if best >= self.ratio * second else "shared"


def wrong_reference_words(ref: list[str], hyp: list[str]) -> tuple[list[bool], int]:
    """
    For each reference word, whether the model got it wrong (substituted or dropped), and the number of
    words the model added. Same alignment as the app's edit distance, traced back.
    """
    rows, cols = len(ref) + 1, len(hyp) + 1
    d = np.zeros((rows, cols), dtype=np.int32)
    d[:, 0] = np.arange(rows)
    d[0, :] = np.arange(cols)
    for i in range(1, rows):
        for j in range(1, cols):
            d[i, j] = min(d[i - 1, j - 1] + (ref[i - 1] != hyp[j - 1]), d[i - 1, j] + 1, d[i, j - 1] + 1)
    wrong = [False] * len(ref)
    inserted = 0
    i, j = len(ref), len(hyp)
    while i > 0 or j > 0:
        if i > 0 and j > 0 and d[i, j] == d[i - 1, j - 1] + (ref[i - 1] != hyp[j - 1]):
            wrong[i - 1] = ref[i - 1] != hyp[j - 1]
            i, j = i - 1, j - 1
        elif i > 0 and d[i, j] == d[i - 1, j] + 1:
            wrong[i - 1] = True
            i -= 1
        else:
            inserted += 1
            j -= 1
    return wrong, inserted


def score_by_language(ref: list[str], hyp: list[str], tagger: WordTagger) -> dict[str, list[int]]:
    """{language: [wrong words, words]} over the reference words, plus "inserted": [added words, 0]."""
    wrong, inserted = wrong_reference_words(ref, hyp)
    out: dict[str, list[int]] = {}
    for w, bad in zip(ref, wrong):
        tally = out.setdefault(tagger.tag(w), [0, 0])
        tally[0] += int(bad)
        tally[1] += 1
    out["inserted"] = [inserted, 0]
    return out
