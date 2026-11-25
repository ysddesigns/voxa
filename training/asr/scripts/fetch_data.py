#!/usr/bin/env python3
"""
Download training data from Hugging Face into Voxa's jsonl format, with 16 kHz mono audio.

Built for Colab: a dataset is fetched one file at a time and each file is deleted once it has
been converted, so the full download never has to fit on the disk. Every command can be run again
after a session ends, and it carries on where it stopped. --hours caps the training audio, which
is what decides how long training takes.

  python scripts/fetch_data.py naijavoices --language ha --hours 60 --out /content/data/fetched
  python scripts/fetch_data.py afrispeech --accents hausa,hausa-fulani,fulani,kanuri --hours 40 --out /content/data/fetched
  python scripts/fetch_data.py pidgin --out /content/data/fetched
  python scripts/fetch_data.py openslr70 --out /content/data/fetched
  python scripts/fetch_data.py fleurs --code ha_ng --out /content/data/fleurs

Gated datasets (NaijaVoices, AfriSpeech-200) need you to accept their terms on the Hugging Face
page once, and a token (HF_TOKEN, or `huggingface-cli login`). Both are CC BY-NC-SA: research use;
commercial use needs a licence from their owners.

Column names are found from the data itself. If a dataset changes its layout, the command stops and
prints the columns it found, rather than writing empty transcripts.
"""

from __future__ import annotations

import argparse
import csv
import os
import random
import shutil
import sys
import tarfile
import tempfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voxa_asr.fetch import PATH_COLUMNS, SPEAKER_COLUMNS, TEXT_COLUMNS, Output, decode, pick  # noqa: E402

from huggingface_hub import HfApi, hf_hub_download  # noqa: E402
from huggingface_hub.errors import GatedRepoError  # noqa: E402

NAIJAVOICES = "naijavoices/naijavoices-dataset"
AFRISPEECH = "intronhealth/afrispeech-200"
PIDGIN = "michaelodafe/pidgin-asr-combined"
FLEURS = "google/fleurs"
NV_FOLDERS = {"ha": "hausa", "yo": "yoruba", "ig": "igbo"}

# Nigerian accents in AfriSpeech-200 (English read by speakers of these languages).
NORTH_ACCENTS = "hausa,hausa-fulani,fulani,kanuri,nupe,gbagyi,ebira,igala,idoma,tiv,berom,angas"
SOUTH_ACCENTS = "yoruba,igbo,pidgin,edo,ijaw,urhobo,isoko,esan,ibibio,efik,ikwere,izon"


def token() -> str | None:
    return os.environ.get("HF_TOKEN") or None


def download(repo: str, filename: str, into: Path) -> Path:
    return Path(hf_hub_download(repo, filename, repo_type="dataset", token=token(), local_dir=str(into)))


def report(out: Output, stats: Counter) -> None:
    print(out.summary())
    skipped = Counter({k: v for k, v in stats.items() if k != "kept"})
    if skipped:
        print("  not kept: " + ", ".join(f"{k} {v}" for k, v in skipped.most_common()))


# --- parquet datasets with an audio column (NaijaVoices, Pidgin ASR Combined) ----------------------


def parquet_rows(path: Path):
    """Rows of one parquet file as dicts, a few hundred at a time, with the audio column found."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    f = pq.ParquetFile(path)
    schema = f.schema_arrow
    audio = next((x.name for x in schema if pa.types.is_struct(x.type) and x.type.get_field_index("bytes") >= 0), None)
    if audio is None:
        raise KeyError(f"{path.name}: no audio column (a struct with bytes); columns: {', '.join(schema.names)}")
    names = [n for n in schema.names if n != audio]
    text = pick(names, TEXT_COLUMNS, "transcript")
    speaker = pick(names, SPEAKER_COLUMNS, "speaker", required=False)
    print(f"  {path.name}: audio={audio} text={text} speaker={speaker or '(none)'}  columns: {', '.join(schema.names)}")
    for batch in f.iter_batches(batch_size=256):
        for row in batch.to_pylist():
            yield row, audio, text, speaker


def audio_bytes(row: dict, column: str) -> bytes:
    value = row.get(column) or {}
    data = value.get("bytes")
    if not data:
        raise ValueError(f"no audio bytes (path {value.get('path')!r})")
    return data


def cmd_naijavoices(a) -> None:
    out = Output(a.out, f"naijavoices-{a.language}", a.language, a.hours)
    folder = NV_FOLDERS[a.language]
    files = sorted(f for f in HfApi(token=token()).list_repo_files(NAIJAVOICES, repo_type="dataset") if f.startswith(f"{folder}-batch-") and f.endswith(".parquet"))
    if not files:
        sys.exit(f"No {folder}-batch-*/*.parquet in {NAIJAVOICES}")
    # Shards from every batch, in a fixed shuffled order: a capped download still gets many voices.
    random.Random(0).shuffle(files)
    stats: Counter = Counter()
    for name in files:
        if out.full():
            break
        if out.is_done(name):
            continue
        with tempfile.TemporaryDirectory(dir=a.out) as tmp:
            print(f"{name} ({out.train_sec / 3600:.1f} of {a.hours or 'all'} h)")
            path = download(NAIJAVOICES, name, Path(tmp))
            for i, (row, audio, text, speaker) in enumerate(parquet_rows(path)):
                try:
                    samples, rate = decode(audio_bytes(row, audio))
                except Exception:  # noqa: BLE001 - one bad clip should not stop a 500 MB shard
                    stats["unreadable audio"] += 1
                    continue
                spk = row.get(speaker) if speaker else None
                stats[out.add(f"{Path(name).stem}-{i}", samples, rate, row.get(text), f"nv-{spk}" if spk else f"nv-{Path(name).stem}")] += 1
                if out.full():
                    break
        if not out.full():
            out.mark_done(name)
    report(out, stats)


def cmd_pidgin(a) -> None:
    """Pidgin ASR Combined (CC BY 4.0, 16 kHz): its own train/validation/test files decide the split."""
    out = Output(a.out, "pidgin", "pcm", a.hours)
    files = sorted(f for f in HfApi(token=token()).list_repo_files(PIDGIN, repo_type="dataset") if f.endswith(".parquet"))
    stats: Counter = Counter()
    for name in files:
        if out.is_done(name):
            continue
        split = "dev" if "validation" in name else "test" if "test" in name else "train"
        with tempfile.TemporaryDirectory(dir=a.out) as tmp:
            path = download(PIDGIN, name, Path(tmp))
            for i, (row, audio, text, speaker) in enumerate(parquet_rows(path)):
                try:
                    samples, rate = decode(audio_bytes(row, audio))
                except Exception:  # noqa: BLE001
                    stats["unreadable audio"] += 1
                    continue
                spk = row.get(speaker) if speaker else None
                stats[out.add(f"{split}-{i}", samples, rate, row.get(text), f"pcm-{spk}" if spk else f"pcm-{split}", split)] += 1
        out.mark_done(name)
    report(out, stats)


# --- AfriSpeech-200: per-accent transcripts (csv) and audio archives (tar.gz) ----------------------


def safe_extract(archive: Path, into: Path) -> None:
    with tarfile.open(archive) as t:
        t.extractall(into, filter="data")


def cmd_afrispeech(a) -> None:
    named = {"north": NORTH_ACCENTS, "south": SOUTH_ACCENTS}
    accents = [x.strip() for x in named.get(a.accents, a.accents).split(",") if x.strip()]
    out = Output(a.out, "afrispeech", "en")
    files = HfApi(token=token()).list_repo_files(AFRISPEECH, repo_type="dataset")
    share = a.hours * 3600 / len(accents) if a.hours else None
    stats: Counter = Counter()
    for accent in accents:
        start = out.train_sec
        for split in ("train", "dev", "test"):
            part = f"{accent}/{split}"
            csv_name = f"transcripts/{accent}/{split}.csv"
            if out.is_done(part) or csv_name not in files:
                continue
            archives = sorted(f for f in files if f.startswith(f"audio/{accent}/{split}/") and f.endswith(".tar.gz"))
            with tempfile.TemporaryDirectory(dir=a.out) as tmp:
                tmp = Path(tmp)
                with download(AFRISPEECH, csv_name, tmp).open(encoding="utf-8", newline="") as f:
                    rows = list(csv.DictReader(f))
                if not rows:
                    out.mark_done(part)
                    continue
                cols = list(rows[0].keys())
                text_col = pick(cols, TEXT_COLUMNS, "transcript")
                path_col = pick(cols, PATH_COLUMNS, "audio path")
                spk_col = pick(cols, SPEAKER_COLUMNS, "speaker", required=False)
                wanted = {Path(r[path_col]).stem: r for r in rows}
                print(f"{part}: {len(rows)} transcripts, {len(archives)} archives (text={text_col} path={path_col})")
                capped = False
                for arch in archives:
                    got = tmp / "x"
                    safe_extract(download(AFRISPEECH, arch, tmp), got)
                    for wav in got.rglob("*"):
                        row = wanted.get(wav.stem) if wav.is_file() else None
                        if row is None:
                            continue
                        if split == "train" and share and out.train_sec - start >= share:
                            capped = True
                            break
                        try:
                            samples, rate = decode(wav.read_bytes())
                        except Exception:  # noqa: BLE001
                            stats["unreadable audio"] += 1
                            continue
                        spk = row.get(spk_col) if spk_col else None
                        stats[out.add(f"{accent}-{wav.stem}", samples, rate, row[text_col], f"afri-{spk or accent}", split)] += 1
                    shutil.rmtree(got, ignore_errors=True)
                    for leftover in tmp.rglob("*.tar.gz"):
                        leftover.unlink()
                    if capped:
                        break
            out.mark_done(part)
    report(out, stats)


# --- OpenSLR 70: Google's crowdsourced Nigerian English (CC BY-SA 4.0, not gated) ----------------

SLR70_MIRRORS = ("https://openslr.trmal.net", "https://openslr.elda.org", "https://openslr.magicdatatech.com")


def fetch_url(path: str, into: Path) -> Path:
    """resources/70/<name> from the first OpenSLR mirror that answers, streamed to disk."""
    import urllib.request

    target = into / Path(path).name
    last: Exception | None = None
    for mirror in SLR70_MIRRORS:
        try:
            req = urllib.request.Request(f"{mirror}/{path}", headers={"User-Agent": "voxa-training"})
            with urllib.request.urlopen(req, timeout=120) as r, target.open("wb") as f:
                shutil.copyfileobj(r, f, length=1 << 20)
            return target
        except Exception as e:  # noqa: BLE001 - try the next mirror
            print(f"  {mirror}: {type(e).__name__}: {e}")
            last = e
    raise RuntimeError(f"no OpenSLR mirror served {path}") from last


def cmd_openslr70(a) -> None:
    """Nigerian English read by volunteers in Lagos and London: a wav zip and a tsv (FileID, text) per gender."""
    import zipfile

    out = Output(a.out, "openslr70-en-ng", "en", a.hours)
    genders = ("female", "male")
    share = a.hours * 3600 / len(genders) if a.hours else None
    stats: Counter = Counter()
    for gender in genders:
        if out.is_done(gender):
            continue
        start = out.train_sec
        with tempfile.TemporaryDirectory(dir=a.out) as tmp:
            tmp = Path(tmp)
            texts = {}
            for line in fetch_url(f"resources/70/line_index_{gender}.tsv", tmp).read_text(encoding="utf-8").splitlines():
                cols = line.split("\t")
                if len(cols) >= 2:
                    texts[cols[0].strip()] = cols[-1].replace('\\"', '"').strip()  # the tsv writes quotes as \"
            print(f"{gender}: {len(texts)} transcripts; downloading the audio (about {'760' if gender == 'female' else '450'} MB)")
            matched = 0
            with zipfile.ZipFile(fetch_url(f"resources/70/en_ng_{gender}.zip", tmp)) as z:
                for info in z.infolist():
                    stem = Path(info.filename).stem
                    if not info.filename.endswith(".wav") or stem not in texts:
                        continue
                    matched += 1
                    if share and out.train_sec - start >= share:
                        break
                    try:
                        samples, rate = decode(z.read(info))
                    except Exception:  # noqa: BLE001
                        stats["unreadable audio"] += 1
                        continue
                    # FileIDs look like ngf_00295_00053165: the speaker is the first two parts.
                    speaker = "_".join(stem.split("_")[:2])
                    stats[out.add(stem, samples, rate, texts[stem], f"slr70-{speaker}")] += 1
            if not matched and texts:
                sys.exit(f"{gender}: none of the wav names matched the tsv FileIDs (first FileID: {next(iter(texts))!r})")
        out.mark_done(gender)
    report(out, stats)


# --- FLEURS: the folder layout voxa_asr/sources.py reads -----------------------------------------


def cmd_fleurs(a) -> None:
    target = a.out / a.code
    stats: Counter = Counter()
    for split in ("train", "dev", "test"):
        tsv = target / f"{split}.tsv"
        audio = target / "audio" / split
        if tsv.is_file() and audio.is_dir() and any(audio.iterdir()):
            stats["already there"] += 1
            continue
        audio.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=a.out) as tmp:
            tmp = Path(tmp)
            shutil.copy(download(FLEURS, f"data/{a.code}/{split}.tsv", tmp), tsv)
            got = tmp / "x"
            safe_extract(download(FLEURS, f"data/{a.code}/audio/{split}.tar.gz", tmp), got)
            for wav in got.rglob("*.wav"):
                shutil.move(str(wav), audio / wav.name)
                stats["clips"] += 1
    print(f"{target}: " + ", ".join(f"{k} {v}" for k, v in stats.items()))


def main() -> None:
    # In a notebook's %%bash cell stdout is a pipe, which Python buffers: show each line as it happens.
    sys.stdout.reconfigure(line_buffering=True)
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    nv = sub.add_parser("naijavoices", help="Hausa, Yoruba or Igbo from NaijaVoices (gated)")
    nv.add_argument("--language", required=True, choices=sorted(NV_FOLDERS))
    af = sub.add_parser("afrispeech", help="Nigerian-accented English from AfriSpeech-200 (gated)")
    af.add_argument("--accents", default=NORTH_ACCENTS, help=f"north, south, or comma-separated accents. North: {NORTH_ACCENTS}. South: {SOUTH_ACCENTS}")
    sub.add_parser("pidgin", help="Nigerian Pidgin from Pidgin ASR Combined (about 9 h)")
    sub.add_parser("openslr70", help="Nigerian English from OpenSLR 70 (Google, CC BY-SA 4.0, not gated)")
    fl = sub.add_parser("fleurs", help="a FLEURS language folder, e.g. ha_ng")
    fl.add_argument("--code", required=True)
    for s in (nv, af, sub.choices["pidgin"], sub.choices["openslr70"], fl):
        s.add_argument("--out", type=Path, required=True)
        s.add_argument("--hours", type=float, default=None, help="cap on training audio (default: everything)")
        s.add_argument("--skip-if-no-access", action="store_true", help="for a gated dataset not yet approved: warn and carry on instead of failing")
    a = p.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    commands = {"naijavoices": cmd_naijavoices, "afrispeech": cmd_afrispeech, "pidgin": cmd_pidgin, "openslr70": cmd_openslr70, "fleurs": cmd_fleurs}
    try:
        commands[a.cmd](a)
    except GatedRepoError:
        if not a.skip_if_no_access:
            raise
        print(f"SKIPPED {a.cmd}: your Hugging Face account is not approved for it yet. Training goes on without it;")
        print("once you are approved, run this step again and the new data is used from the next run.")


if __name__ == "__main__":
    main()
