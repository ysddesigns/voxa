import json
import tempfile
import wave
from pathlib import Path

import numpy as np

from voxa_asr.fetch import RATE, Output, k2_for, k2_wheels, pick, to_16k
from voxa_asr.sources import read_jsonl


def tone(seconds, rate=RATE):
    t = np.arange(int(seconds * rate)) / rate
    return (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def test_pick_finds_columns_case_insensitively_and_names_the_real_ones_when_missing():
    assert pick(["Speaker_ID", "Transcript", "audio"], ("speaker_id", "speaker"), "speaker") == "Speaker_ID"
    assert pick(["a", "b"], ("speaker_id",), "speaker", required=False) is None
    try:
        pick(["audio", "lang"], ("transcript", "text"), "transcript")
    except KeyError as e:
        assert "audio, lang" in str(e)
    else:
        raise AssertionError("expected a KeyError")


def test_to_16k_makes_mono_at_the_right_length():
    stereo = np.stack([tone(2, 48000), tone(2, 48000)], axis=1)
    out = to_16k(stereo, 48000)
    assert out.ndim == 1 and abs(out.size - 2 * RATE) <= 2
    assert to_16k(tone(1), RATE).size == RATE


def test_output_writes_jsonl_the_training_scripts_read_and_resumes():
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        out = Output(folder, "naijavoices-ha", "ha", hours=None)
        assert out.add("a", tone(2, 48000), 48000, "  Ina   kwana ", "nv-1") == "kept"
        assert out.add("b", tone(0.5), RATE, "short", "nv-1") == "length"
        assert out.add("c", tone(2), RATE, "", "nv-1") == "no text"
        assert out.add("d", tone(3), RATE, "Sannu", "nv-2", split="test") == "kept"
        out.mark_done("shard-0")

        rows = list(read_jsonl(folder / "naijavoices-ha.jsonl"))
        assert [r.text for r in rows] == ["Ina kwana", "Sannu"]
        assert rows[0].language == "ha" and rows[0].split is None and rows[1].split == "test"
        with wave.open(str(rows[0].audio)) as w:
            assert w.getframerate() == RATE and w.getnchannels() == 1 and abs(w.getnframes() - 2 * RATE) <= 2

        again = Output(folder, "naijavoices-ha", "ha", hours=None)
        assert again.add("a", tone(2), RATE, "Ina kwana", "nv-1") == "seen"
        assert again.is_done("shard-0") and not again.is_done("shard-1")
        assert abs(again.train_sec - 2) < 0.01 and abs(again.total_sec - 5) < 0.01


def test_output_caps_training_hours_but_not_test_clips():
    with tempfile.TemporaryDirectory() as d:
        out = Output(Path(d), "afrispeech", "en", hours=4 / 3600)
        assert out.add("1", tone(3), RATE, "one", "s") == "kept"
        assert out.add("2", tone(3), RATE, "two", "s") == "kept"
        assert out.full()
        assert out.add("3", tone(3), RATE, "three", "s") == "full"
        assert out.add("4", tone(3), RATE, "four", "s", split="test") == "kept"
        lines = (Path(d) / "afrispeech.jsonl").read_text(encoding="utf-8").splitlines()
        assert [json.loads(x)["text"] for x in lines] == ["one", "two", "four"]


HTML = """
<a href="https://huggingface.co/csukuangfj/k2/resolve/main/ubuntu-cuda/k2-1.24.4.dev20261125+cuda12.6.torch2.9.0-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl">x</a>
<a href="https://huggingface.co/csukuangfj/k2/resolve/main/ubuntu-cuda/k2-1.24.4.dev20261001+cuda12.6.torch2.9.0-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl">x</a>
<a href="https://huggingface.co/csukuangfj/k2/resolve/main/ubuntu-cuda/k2-1.24.4.dev20261125%2Bcuda12.8.torch2.10.0-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl">x</a>
<a href="https://huggingface.co/csukuangfj/k2/resolve/main/ubuntu-cuda/k2-1.24.4.dev20261125+cuda12.6.torch2.9.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl">x</a>
<a href="https://huggingface.co/csukuangfj/k2/resolve/main/macos/k2-1.24.4.dev20261125+cpu.torch2.9.0-cp312-cp312-macosx_11_0_arm64.whl">x</a>
"""


def test_k2_wheels_match_python_torch_and_cuda_and_prefer_the_newest_build():
    wheels = k2_wheels(HTML, "cp312")
    assert [(w["torch"], w["cuda"]) for w in wheels] == [("2.10.0", "12.8"), ("2.9.0", "12.6"), ("2.9.0", "12.6")]
    assert "+cuda12.8" in wheels[0]["url"]
    w = k2_for(wheels, "2.9.0+cu126", "12.6")
    assert w is not None and w["dev"] == 20261125
    assert k2_for(wheels, "2.9.0", "12.8") is None
    assert k2_for(wheels, "2.11.0+cu128", "12.8") is None
