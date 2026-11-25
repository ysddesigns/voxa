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

Code-switched speech, where one utterance mixes a local language with English the way people
talk in meetings, has its own codes: cs-ha (Hausa and English, the North), cs-pcm (Pidgin and
English, the South), cs-yo and cs-ig. They are kept apart from the single-language sets so the
speaker lock gives them their own test speakers and step 8 scores them on their own.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional

LANGUAGES = ("en", "pcm", "ha", "yo", "ig")
CODESWITCH = ("cs-ha", "cs-pcm", "cs-yo", "cs-ig")
ALL_LANGUAGES = LANGUAGES + CODESWITCH


def local_language(code: str) -> str:
    """The local language a code-switched set mixes with English ("cs-ha" -> "ha"); others unchanged."""
    return code.removeprefix("cs-")


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
    if language not in ALL_LANGUAGES:
        raise ValueError(f"Unknown language {language!r}: use one of {', '.join(ALL_LANGUAGES)}")
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


LANGUAGE_NAMES = {
    "hausa": "ha", "yoruba": "yo", "igbo": "ig", "pidgin": "pcm", "nigerian pidgin": "pcm",
    "english": "en", "nigerian english": "en",
}


def language_code(value: str) -> str:
    """"Hausa", "hausa" or "ha" -> "ha". Unknown names come back lower-cased."""
    v = value.strip().lower()
    return LANGUAGE_NAMES.get(v, v)


def sniff_delimiter(path: Path) -> str:
    """
    The separator a metadata file uses, from its header line. NaijaVoices' metadata.csv is separated
    by "~" (its card reads it with sep='~'), not by commas, despite the name.
    """
    with path.open(encoding="utf-8", newline="") as f:
        header = f.readline()
    counts = {d: header.count(d) for d in ("~", "\t", ",", "|")}
    best = max(counts, key=counts.get)
    return best if counts[best] else ("\t" if path.suffix == ".tsv" else ",")


def read_naijavoices(folder_or_file: Path, language: str) -> Iterator[Utterance]:
    """
    NaijaVoices (Hugging Face naijavoices/naijavoices-dataset-compressed, or naijadata.vercel.app):
    a metadata file or the folder holding it, with the audio beside it or in audio/.
    Columns: audio/file_name/path, text/sentence/transcript, speaker/speaker_id, language.

    The compressed download has one metadata.csv for Hausa, Yoruba and Igbo together. When rows
    carry a language, only those in `language` are kept, so the same file can be passed once per
    language (naijavoices:/data/nv:ha, naijavoices:/data/nv:yo).
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

    kept = 0
    others: Counter = Counter()
    with meta_file.open(encoding="utf-8", newline="") as f:
        delimiter = sniff_delimiter(meta_file)
        # No quote handling for "~" files: a stray quote mark in one transcript would swallow the rows after it.
        quoting = csv.QUOTE_NONE if delimiter == "~" else csv.QUOTE_MINIMAL
        reader = csv.DictReader(f, delimiter=delimiter, quoting=quoting)
        for i, row in enumerate(reader, 1):
            row_language = (row.get("language") or row.get("lang") or "").strip()
            if row_language and language_code(row_language) != language:
                others[row_language] += 1
                continue
            kept += 1
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
    if not kept and others:
        raise ValueError(
            f"{meta_file}: no rows in {language!r}; the language column holds {', '.join(sorted(others))}. "
            "Add the name to LANGUAGE_NAMES in voxa_asr/sources.py if it is one of ours."
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
    path, language = (Path(head), tail) if head and tail in ALL_LANGUAGES else (Path(rest), "")
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
