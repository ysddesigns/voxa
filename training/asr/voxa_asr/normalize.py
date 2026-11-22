"""
Text clean-up, the same as the app's scorer (words() in src/features/asr-compare/compare.ts).

Lower case, tone marks and dots under letters dropped (Yoruba ẹ -> e), Hausa hooked letters made
plain, punctuation dropped, apostrophes kept inside words. Training text goes through this too, so
the model learns to write exactly what the scorer compares. normalize_cases.json holds the cases
both sides are tested against.
"""

from __future__ import annotations

import re
import unicodedata

_HOOKED = {"ɓ": "b", "ɗ": "d", "ƙ": "k", "ƴ": "y"}
_HOOKED_RE = re.compile("[ɓɗƙƴ]")
_MARKS_RE = re.compile("[̀-ͯ]")
_APOSTROPHES_RE = re.compile("[’']")
_OTHER_RE = re.compile("[^a-z0-9' ]+")
_EDGE_APOSTROPHES_RE = re.compile("^'+|'+$")
_DIGIT_RE = re.compile("[0-9]")


def words(text: str) -> list[str]:
    """The words of text as the scorer sees them."""
    t = unicodedata.normalize("NFD", text.lower())
    t = _MARKS_RE.sub("", t)
    t = _HOOKED_RE.sub(lambda m: _HOOKED[m.group(0)], t)
    t = _APOSTROPHES_RE.sub("'", t)
    t = _OTHER_RE.sub(" ", t)
    out = []
    for w in t.split():
        w = _EDGE_APOSTROPHES_RE.sub("", w)
        if w:
            out.append(w)
    return out


def normalize(text: str) -> str:
    """Cleaned text as one string (what training transcripts are stored as)."""
    return " ".join(words(text))


def has_digits(text: str) -> bool:
    """Transcripts must spell numbers as words: a model cannot learn "300" from someone saying it."""
    return bool(_DIGIT_RE.search(text))
