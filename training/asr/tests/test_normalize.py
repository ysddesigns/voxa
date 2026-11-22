import json
from pathlib import Path

from voxa_asr.normalize import has_digits, normalize, words
from voxa_asr.wer import edit_distance, score

CASES = json.loads((Path(__file__).parent.parent / "normalize_cases.json").read_text(encoding="utf-8"))["cases"]


def test_matches_the_app_scorer_cases():
    for c in CASES:
        assert words(c["text"]) == c["words"], c["text"]


def test_normalize_joins_words():
    assert normalize("Ẹ káàárọ̀,  gbogbo yín!") == "e kaaaro gbogbo yin"


def test_digits_are_flagged():
    assert has_digits("we sold 300 bags")
    assert not has_digits("we sold three hundred bags")


def test_edit_distance_counts_each_kind_of_error():
    # "morning" substituted, "everyone" deleted, "now" inserted.
    assert edit_distance("good morning everyone today".split(), "good evening today now".split()) == 3


def test_score_matches_the_app():
    s = score("good morning everyone today", "GOOD EVENING TODAY NOW")
    assert (s.errors, s.ref_words) == (3, 4)
    assert abs(s.wer - 0.75) < 1e-9
    assert score("one two three", "").wer == 1.0
