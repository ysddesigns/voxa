import random
from collections import Counter

import numpy as np

from voxa_asr.codeswitch import RATE, Clip, WordTagger, join, plan, score_by_language, trim, wrong_reference_words
from voxa_asr.sources import ALL_LANGUAGES, check_language, local_language


def clips(lang, speakers, per=20, sec=4.0):
    return [Clip(f"{lang}-{s}-{i}", lang, s, f"{lang} words {i}", sec) for s in speakers for i in range(per)]


def test_codeswitched_sets_are_known_languages():
    assert check_language("cs-ha") == "cs-ha"
    assert local_language("cs-pcm") == "pcm" and local_language("ha") == "ha"
    assert "cs-ha" in ALL_LANGUAGES


def test_plan_switches_language_in_every_clip_and_stays_in_budget():
    rng = random.Random(1)
    mixes = plan(clips("ha", ["a", "b"]), clips("en", ["c", "d"]), hours=0.1, rng=rng, max_sec=20)
    assert mixes
    assert sum(m.duration for m in mixes) >= 0.1 * 3600
    for m in mixes:
        langs = [c.language for c in m.clips]
        assert len(langs) >= 2 and all(x != y for x, y in zip(langs, langs[1:])), langs
        assert m.duration <= 20
        assert len(m.gaps) == len(m.clips) - 1
        assert m.text == " ".join(c.text for c in m.clips)


def test_plan_keeps_one_voice_when_the_speaker_has_both_languages():
    rng = random.Random(2)
    # Speaker "s" read both Hausa and English (as Donate volunteers do); "x" only English.
    mixes = plan(clips("ha", ["s"]), clips("en", ["s", "x"]), hours=0.05, rng=rng)
    started_in_hausa = [m for m in mixes if m.clips[0].language == "ha"]
    assert started_in_hausa and all(m.speaker == "s" for m in started_in_hausa)


def test_plan_names_every_voice_when_they_differ_and_caps_reuse():
    rng = random.Random(3)
    mixes = plan(clips("ha", ["a"], per=3), clips("en", ["b"], per=3), hours=10, rng=rng, max_uses=2)
    uses = Counter(c.id for m in mixes for c in m.clips)
    assert max(uses.values()) <= 2
    assert all(m.speaker == "cs+a+b" for m in mixes)


def test_trim_and_join_make_one_level_waveform_with_pauses():
    rng = random.Random(4)
    t = np.arange(RATE) / RATE
    loud = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    quiet = (0.03 * np.sin(2 * np.pi * 330 * t)).astype(np.float32)
    padded = np.concatenate([np.zeros(RATE), loud, np.zeros(RATE)]).astype(np.float32)
    trimmed = trim(padded)
    assert RATE <= trimmed.size <= RATE + 0.25 * RATE
    out = join([trimmed, quiet], [0.3], rng)
    assert abs(out.size - (trimmed.size + quiet.size + 0.3 * RATE)) <= 1
    first, second = out[: trimmed.size], out[-quiet.size :]
    level = lambda x: np.sqrt(np.mean(x**2))  # noqa: E731
    # The quiet piece is lifted to within 3 dB of the first, plus the trim's silent edge.
    assert 0.6 < level(second) / level(first) < 1.6
    assert np.max(np.abs(out)) <= 0.95 + 1e-6


def test_wrong_reference_words_marks_substitutions_and_drops():
    wrong, inserted = wrong_reference_words("to abu na gaba on the agenda".split(), "to abuna gaba on the agenda now".split())
    assert wrong == [False, True, True, False, False, False, False]
    assert inserted == 1


def test_score_by_language_separates_hausa_from_english_words():
    tagger = WordTagger({
        "en": Counter("the agenda is on the budget next item".split() * 10),
        "ha": Counter("to abu na gaba shine kuma".split() * 10),
    })
    assert tagger.tag("agenda") == "en" and tagger.tag("shine") == "ha" and tagger.tag("kano") == "unknown"
    ref = "to abu na gaba on the agenda shine budget".split()
    hyp = "to a bun a gaba on the agenda shine budget".split()
    out = score_by_language(ref, hyp, tagger)
    assert out["en"] == [0, 4]
    assert out["ha"][1] == 5 and out["ha"][0] >= 2
