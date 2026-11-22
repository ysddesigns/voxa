"""Word error rate, the same measure as score() in src/features/asr-compare/compare.ts."""

from __future__ import annotations

from dataclasses import dataclass

from .normalize import words


@dataclass
class Score:
    errors: int
    ref_words: int

    @property
    def wer(self) -> float:
        return self.errors / self.ref_words if self.ref_words else 0.0

    def __add__(self, other: "Score") -> "Score":
        return Score(self.errors + other.errors, self.ref_words + other.ref_words)


def edit_distance(ref: list[str], hyp: list[str]) -> int:
    """Substitutions + deletions + insertions, one row at a time."""
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, 1):
            cur[j] = min(prev[j - 1] + (r != h), prev[j] + 1, cur[j - 1] + 1)
        prev = cur
    return prev[-1]


def score(reference: str, hypothesis: str) -> Score:
    ref = words(reference)
    return Score(edit_distance(ref, words(hypothesis)), len(ref))
