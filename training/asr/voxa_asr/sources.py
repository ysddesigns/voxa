"""
Reading each dataset into one shape: Utterance rows.

Readers:
  - commonvoice: an extracted Mozilla Common Voice language folder (validated.tsv + clips/).
  - commonvoice-ng: the same, keeping only speakers who describe their accent as Nigerian. Use it on
    the English folder: the full set is mostly American and British speakers.
  - fleurs: an extracted Google FLEURS language folder ({split}.tsv + audio/{split}/).
  - naijavoices: an extracted NaijaVoices folder or metadata CSV/TSV file (from naijadata.vercel.app).
  - jsonl: Voxa's own format, one JSON object a line. Voxa recordings, teacher labels and any
    dataset converted by hand (NaijaVoices, AfriSpeech, WAXAL, Pidgin 1.0) use it:
      {"id": "...", "audio": "path/to/file.wav", "text": "...", "speaker": "...",
       "language": "ha", "start": 0.0, "duration": 4.2}
    "audio" is relative to the .jsonl file's folder. "start" and "duration" are optional
    (the whole file). "text" may be empty for audio waiting for teacher labels.

Languages use these codes everywhere: en (Nigerian English), pcm (Pidgin), ha, yo, ig.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional

LANGUAGES = ("en", "pcm", "ha", "yo", "ig")


@dataclass
class Utterance:
    id: str
    audio: Path
    text: str
    speaker: str
    language: str
    source: str
    start: float = 0.0
    duration: Optional[float] = None
    # A split the dataset fixes itself (FLEURS), or None to follow the speaker lock.
    split: Optional[str] = None


def check_language(language: str) -> str:
    if language not in LANGUAGES:
        raise ValueError(f"Unknown language {language!r}: use one of {', '.join(LANGUAGES)}")
    return language


def is_nigerian_accent(row: dict) -> bool:
    """
    Common Voice speakers describe their own accent: "accents" (free text, newer releases, several
    joined by "|") or "accent" (older releases). Words like "Nigerian English", "Yoruba accent" or
    "Hausa" all count.
    """
    text = f"{row.get('accents') or ''} {row.get('accent') or ''}".lower()
    return any(k in text for k in NIGERIAN_ACCENT_WORDS)


NIGERIAN_ACCENT_WORDS = ("nigeria", "naija", "yoruba", "hausa", "igbo", "pidgin")


def read_commonvoice(folder: Path, language: str, nigerian_only: bool = False) -> Iterator[Utterance]:
    """validated.tsv only: other.tsv and invalidated.tsv hold clips people voted down or never checked."""
    language = check_language(language)
    tsv = folder / "validated.tsv"
    if not tsv.is_file():
        raise FileNotFoundError(f"{tsv} not found: point at the extracted Common Voice language folder")
    with tsv.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            if nigerian_only and not is_nigerian_accent(row):
                continue
            clip = row["path"]
            yield Utterance(
                id=f"cv-{language}-{Path(clip).stem}",
                audio=folder / "clips" / clip,
                text=row["sentence"],
                speaker=f"cv-{row['client_id']}",
                language=language,
                source="commonvoice-ng" if nigerian_only else "commonvoice",
            )


def read_fleurs(folder: Path, language: str) -> Iterator[Utterance]:
    """
    FLEURS has no speaker ids, but its own train, dev and test splits do not share speakers, so
    those splits are kept as they are. Its .tsv files have no header; columns: id, file name,
    raw transcription, normalised transcription, characters, number of samples, gender.
    Check one file before a long run: the layout has changed between releases.
    """
    language = check_language(language)
    found = False
    for split, ours in (("train", "train"), ("dev", "dev"), ("test", "test")):
        tsv = folder / f"{split}.tsv"
        if not tsv.is_file():
            continue
        found = True
        with tsv.open(encoding="utf-8", newline="") as f:
            for cols in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
                if len(cols) < 4:
                    raise ValueError(f"{tsv}: expected at least 4 columns, got {len(cols)}. Check the FLEURS layout.")
                yield Utterance(
                    id=f"fleurs-{language}-{split}-{Path(cols[1]).stem}",
                    audio=folder / "audio" / split / cols[1],
                    text=cols[2],
                    speaker=f"fleurs-{language}-{split}",
                    language=language,
                    source="fleurs",
                    split=ours,
                )
    if not found:
        raise FileNotFoundError(f"No train.tsv, dev.tsv or test.tsv in {folder}")


def read_naijavoices(folder_or_file: Path, language: str) -> Iterator[Utterance]:
    """
    NaijaVoices (naijadata.vercel.app / Hugging Face): CSV/TSV metadata or directory.
    Columns: audio/file_name/path, text/sentence/transcript, speaker/speaker_id.
    """
    language = check_language(language)
    if folder_or_file.is_file():
        meta_file = folder_or_file
        audio_dir = folder_or_file.parent
    else:
        candidates = ["metadata.csv", "metadata.tsv", "train.csv", "validated.tsv"]
        found = None
        for c in candidates:
            p = folder_or_file / c
            if p.is_file():
                found = p
                break
        if not found:
            raise FileNotFoundError(f"No metadata file ({', '.join(candidates)}) found in {folder_or_file}")
        meta_file = found
        audio_dir = folder_or_file / "audio" if (folder_or_file / "audio").is_dir() else folder_or_file

    delimiter = "\t" if meta_file.suffix == ".tsv" else ","
    with meta_file.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for i, row in enumerate(reader, 1):
            clip = row.get("audio") or row.get("file_name") or row.get("path") or f"{i}.wav"
            audio_path = (audio_dir / clip).resolve()
            text = row.get("text") or row.get("sentence") or row.get("transcript") or ""
            speaker = row.get("speaker") or row.get("speaker_id") or f"nv-{language}-{i}"
            duration = None
            if "duration" in row and row["duration"]:
                try:
                    duration = float(row["duration"])
                except ValueError:
                    pass
            yield Utterance(
                id=f"nv-{language}-{i:07d}",
                audio=audio_path,
                text=text,
                speaker=str(speaker),
                language=language,
                source="naijavoices",
                duration=duration,
            )


def read_jsonl(path: Path, language: Optional[str] = None, source: Optional[str] = None) -> Iterator[Utterance]:
    """language: used when a line has none. source: a name for reports (default: the file's name)."""
    base = path.parent
    name = source or path.stem
    with path.open(encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                lang = check_language(row.get("language") or language or "")
                yield Utterance(
                    id=str(row.get("id") or f"{name}-{n}"),
                    audio=(base / row["audio"]).resolve(),
                    text=row.get("text", ""),
                    speaker=str(row["speaker"]),
                    language=lang,
                    source=name,
                    start=float(row.get("start", 0.0)),
                    duration=float(row["duration"]) if row.get("duration") is not None else None,
                    split=row.get("split"),
                )
            except (KeyError, ValueError) as e:
                raise ValueError(f"{path}:{n}: {e}") from e


def read_source(spec: str) -> Iterator[Utterance]:
    """
    One --source argument: "kind:path[:language]".
      commonvoice:/data/cv/ha:ha   commonvoice-ng:/data/cv/en:en
      fleurs:/data/fleurs/yo_ng:yo   jsonl:/data/voxa/drive.jsonl
    """
    kind, _, rest = spec.partition(":")
    # The language, when given, is the last ":" part; paths may contain ":" themselves (C:\...).
    head, _, tail = rest.rpartition(":")
    path, language = (Path(head), tail) if head and tail in LANGUAGES else (Path(rest), "")
    if kind == "commonvoice":
        return read_commonvoice(path, language)
    if kind == "commonvoice-ng":
        return read_commonvoice(path, language, nigerian_only=True)
    if kind == "fleurs":
        return read_fleurs(path, language)
    if kind == "naijavoices":
        return read_naijavoices(path, language)
    if kind == "jsonl":
        return read_jsonl(path, language or None)
    raise ValueError(f"Unknown source kind {kind!r} in {spec!r}: use commonvoice, commonvoice-ng, fleurs, naijavoices or jsonl")
