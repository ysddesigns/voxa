#!/usr/bin/env python3
"""
Utility to convert datasets discovered via NaijaData (naijadata.vercel.app)
into formats needed for Voxa model training and vocabulary enrichment.

Supported tasks:
  1. naijavoices: Converts NaijaVoices speech metadata (CSV/TSV/JSON) into Voxa's
     recordings.jsonl format for ASR fine-tuning (step 2 & step 6).
  2. masakhaner: Extracts Nigerian named entities (LOC, PER, ORG) from MasakhaNER
     CoNLL files to enrich hotwords (ListenWords.kt) and ASR BPE vocabularies.
  3. text: Normalizes text corpora (NaijaSenti, MAFAND-MT) for BPE tokenizer training (step 4).

Usage examples:
  # Ingest NaijaVoices metadata:
  python scripts/prepare_naijadata.py naijavoices --meta /path/to/metadata.csv --audio-dir /path/to/audio --out data/naijavoices.jsonl

  # Extract named entities from MasakhaNER:
  python scripts/prepare_naijadata.py masakhaner --conll /path/to/train.txt --out data/hotwords_masakha.txt

  # Ingest text dataset for BPE vocab:
  python scripts/prepare_naijadata.py text --input /path/to/naijasenti.tsv --lang yo --out data/text_yo.txt
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voxa_asr.normalize import has_digits, normalize  # noqa: E402
from voxa_asr.sources import LANGUAGES  # noqa: E402

LANG_MAP = {
    "hausa": "ha",
    "ha": "ha",
    "yoruba": "yo",
    "yo": "yo",
    "igbo": "ig",
    "ig": "ig",
    "pidgin": "pcm",
    "pcm": "pcm",
    "english": "en",
    "en": "en",
}


def cmd_naijavoices(args: argparse.Namespace) -> None:
    meta_path = Path(args.meta)
    audio_dir = Path(args.audio_dir)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if not meta_path.is_file():
        sys.exit(f"Metadata file not found: {meta_path}")

    delimiter = "\t" if meta_path.suffix == ".tsv" else ","
    valid_count = 0
    dropped_count = 0

    with meta_path.open(encoding="utf-8", newline="") as f_in, out_path.open("w", encoding="utf-8") as f_out:
        reader = csv.DictReader(f_in, delimiter=delimiter)
        for i, row in enumerate(reader, 1):
            # Resolve audio file
            audio_rel = row.get("audio") or row.get("file_name") or row.get("path") or f"{i}.wav"
            audio_file = audio_dir / audio_rel
            
            # Resolve text and language
            raw_text = row.get("text") or row.get("sentence") or row.get("transcript") or ""
            raw_lang = (row.get("language") or row.get("lang") or "").lower()
            lang = LANG_MAP.get(raw_lang, raw_lang)

            if lang not in LANGUAGES:
                dropped_count += 1
                continue

            cleaned = normalize(raw_text)
            if not cleaned or (has_digits(raw_text) and not args.keep_digits):
                dropped_count += 1
                continue

            speaker = row.get("speaker") or row.get("speaker_id") or f"nv-{lang}-{i}"
            record = {
                "id": f"nv-{lang}-{i:07d}",
                "audio": str(audio_file.resolve()),
                "text": cleaned,
                "speaker": str(speaker),
                "language": lang,
            }
            if "duration" in row:
                try:
                    record["duration"] = float(row["duration"])
                except ValueError:
                    pass

            f_out.write(json.dumps(record, ensure_ascii=False) + "\n")
            valid_count += 1

    print(f"NaijaVoices conversion complete: {valid_count} written, {dropped_count} skipped -> {out_path}")


def cmd_masakhaner(args: argparse.Namespace) -> None:
    conll_path = Path(args.conll)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if not conll_path.is_file():
        sys.exit(f"CoNLL file not found: {conll_path}")

    entities: set[str] = set()
    current_tokens: list[str] = []
    current_tag: str | None = None

    def flush_entity() -> None:
        nonlocal current_tokens, current_tag
        if current_tokens and current_tag in ("PER", "LOC", "ORG"):
            ent = " ".join(current_tokens).strip()
            # Basic sanity checks: 3+ chars, not digits, no punctuation marks
            if len(ent) >= 3 and not re.search(r"\d", ent):
                entities.add(ent)
        current_tokens = []
        current_tag = None

    with conll_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                flush_entity()
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            token, tag = parts[0], parts[-1]
            if tag.startswith("B-"):
                flush_entity()
                current_tag = tag[2:]
                current_tokens = [token]
            elif tag.startswith("I-") and current_tag == tag[2:]:
                current_tokens.append(token)
            else:
                flush_entity()
        flush_entity()

    sorted_entities = sorted(entities)
    with out_path.open("w", encoding="utf-8") as f:
        for ent in sorted_entities:
            f.write(ent + "\n")

    print(f"Extracted {len(sorted_entities)} entities -> {out_path}")


def cmd_text(args: argparse.Namespace) -> None:
    in_path = Path(args.input)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if not in_path.is_file():
        sys.exit(f"Input file not found: {in_path}")

    count = 0
    with in_path.open(encoding="utf-8") as f_in, out_path.open("w", encoding="utf-8") as f_out:
        for line in f_in:
            line = line.strip()
            if not line:
                continue
            # If TSV/CSV format with multiple columns, pick text column
            if "\t" in line:
                parts = line.split("\t")
                text = parts[-1] if len(parts) > 1 else line
            else:
                text = line

            cleaned = normalize(text)
            if cleaned and not has_digits(text):
                f_out.write(cleaned + "\n")
                count += 1

    print(f"Normalized {count} sentences for language {args.lang or 'unspecified'} -> {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="subcommand", required=True)

    # Subcommand: naijavoices
    nv = sub.add_parser("naijavoices", help="Convert NaijaVoices metadata to Voxa JSONL")
    nv.add_argument("--meta", required=True, help="Path to metadata CSV/TSV")
    nv.add_argument("--audio-dir", required=True, help="Directory containing audio files")
    nv.add_argument("--out", required=True, help="Output JSONL path")
    nv.add_argument("--keep-digits", action="store_true", help="Keep sentences with digits")

    # Subcommand: masakhaner
    mn = sub.add_parser("masakhaner", help="Extract entities from MasakhaNER CoNLL file")
    mn.add_argument("--conll", required=True, help="Path to CoNLL text file")
    mn.add_argument("--out", required=True, help="Output entities text path")

    # Subcommand: text
    tx = sub.add_parser("text", help="Normalize raw text/sentences for BPE vocab training")
    tx.add_argument("--input", required=True, help="Path to input text/tsv file")
    tx.add_argument("--lang", default="", help="Language code (ha, yo, ig, pcm, en)")
    tx.add_argument("--out", required=True, help="Output normalized text path")

    args = parser.parse_args()
    if args.subcommand == "naijavoices":
        cmd_naijavoices(args)
    elif args.subcommand == "masakhaner":
        cmd_masakhaner(args)
    elif args.subcommand == "text":
        cmd_text(args)


if __name__ == "__main__":
    main()
