import json
import tempfile
from pathlib import Path

from voxa_asr.sources import read_jsonl, read_source


def write_jsonl(folder: Path, rows) -> Path:
    path = folder / "drive.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    return path


def test_jsonl_resolves_audio_beside_the_file_and_reads_optional_fields():
    with tempfile.TemporaryDirectory() as d:
        path = write_jsonl(Path(d), [
            {"id": "a", "audio": "audio/a.wav", "text": "e kaaro", "speaker": "s1", "language": "yo"},
            {"audio": "audio/b.wav", "text": "", "speaker": "s2", "start": 1.5, "duration": 3},
        ])
        rows = list(read_jsonl(path, language="ha"))
        assert rows[0].audio == (Path(d) / "audio" / "a.wav").resolve()
        assert rows[0].language == "yo"
        assert rows[1].id == "drive-2" and rows[1].language == "ha"
        assert (rows[1].start, rows[1].duration) == (1.5, 3.0)


def test_source_spec_takes_a_language_after_the_path_even_with_a_drive_letter():
    with tempfile.TemporaryDirectory() as d:
        path = write_jsonl(Path(d), [{"audio": "x.wav", "text": "hi", "speaker": "s"}])
        rows = list(read_source(f"jsonl:{path}:pcm"))
        assert rows[0].language == "pcm"


def test_commonvoice_ng_keeps_only_nigerian_accents_in_old_and_new_columns():
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        (folder / "validated.tsv").write_text(
            "client_id\tpath\tsentence\taccents\taccent\n"
            "a\t1.mp3\tgood morning\tNigerian English|West African\t\n"
            "b\t2.mp3\thello there\tUnited States English\t\n"
            "c\t3.mp3\thow far\t\tyoruba accent\n"
            "d\t4.mp3\tno accent given\t\t\n",
            encoding="utf-8",
        )
        rows = list(read_source(f"commonvoice-ng:{folder}:en"))
        assert [r.text for r in rows] == ["good morning", "how far"]
        assert rows[0].source == "commonvoice-ng" and rows[0].speaker == "cv-a"
        assert len(list(read_source(f"commonvoice:{folder}:en"))) == 4


def test_unknown_language_is_refused_with_the_line_number():
    with tempfile.TemporaryDirectory() as d:
        path = write_jsonl(Path(d), [{"audio": "x.wav", "text": "hi", "speaker": "s", "language": "fr"}])
        try:
            list(read_jsonl(path))
        except ValueError as e:
            assert ":1:" in str(e)
        else:
            raise AssertionError("expected a ValueError")


def test_naijavoices_source_reads_csv_metadata_and_resolves_audio():
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        (folder / "metadata.csv").write_text(
            "audio,text,speaker,duration\n"
            "clip_01.wav,Ina kwana,spk_ha_01,2.5\n"
            "clip_02.wav,Bawo ni,spk_yo_01,1.8\n",
            encoding="utf-8",
        )
        rows = list(read_source(f"naijavoices:{folder}:ha"))
        assert len(rows) == 2
        assert rows[0].id == "nv-ha-0000001"
        assert rows[0].text == "Ina kwana"
        assert rows[0].speaker == "spk_ha_01"
        assert rows[0].duration == 2.5
        assert rows[0].audio == (folder / "clip_01.wav").resolve()
        assert rows[0].source == "naijavoices"


def test_naijavoices_compressed_metadata_is_tilde_separated_and_holds_every_language():
    # The layout of naijavoices-dataset-compressed: one metadata.csv, "~" between columns.
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        (folder / "metadata.csv").write_text(
            "audio~text~speaker_id~language~age_bracket~gender\n"
            'a1.wav~Ina kwana, yaya "aiki"?~spk-h1~hausa~25-34~female\n'
            "a2.wav~Bawo ni~spk-y1~yoruba~18-24~male\n"
            "a3.wav~Sannu da zuwa~spk-h2~Hausa~35-44~male\n",
            encoding="utf-8",
        )
        rows = list(read_source(f"naijavoices:{folder}:ha"))
        assert [r.text for r in rows] == ['Ina kwana, yaya "aiki"?', "Sannu da zuwa"]
        assert [r.speaker for r in rows] == ["spk-h1", "spk-h2"]
        assert all(r.language == "ha" for r in rows)
        assert [r.text for r in read_source(f"naijavoices:{folder}:yo")] == ["Bawo ni"]
        try:
            list(read_source(f"naijavoices:{folder}:ig"))
        except ValueError as e:
            assert "hausa" in str(e) and "yoruba" in str(e)
        else:
            raise AssertionError("expected a ValueError naming the languages found")
