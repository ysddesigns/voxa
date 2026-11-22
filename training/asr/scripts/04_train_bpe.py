#!/usr/bin/env python3
"""
Step 4 (multilingual stage only): build one shared vocabulary of word pieces for all five
languages, from the cleaned training text.

The English stage keeps the starting model's own vocabulary (its bpe.model), so it needs no
step 4. The multilingual stage needs Hausa, Yoruba and Igbo pieces, so it trains a new one; the
encoder carries over and the decoder and joiner start fresh (see 06_finetune.sh).

Writes data/lang_bpe_<size>/bpe.model and tokens.txt in the layout icefall expects, with <blk>
as id 0 (the transducer's blank) and <sos/eos> as id 1.

Each language's text is repeated up to --balance times its share, so a language with little
text still gets its own pieces instead of being spelled out letter by letter.

  python scripts/04_train_bpe.py --vocab-size 2000
"""

from __future__ import annotations

import argparse
import gzip
import json
import random
from collections import defaultdict
from pathlib import Path

import sentencepiece as spm


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--manifests", type=Path, default=Path("data/manifests"))
    p.add_argument("--vocab-size", type=int, default=2000)
    p.add_argument("--balance", type=int, default=5, help="largest repeat for a low-text language")
    p.add_argument("--out", type=Path)
    a = p.parse_args()
    out = a.out or Path(f"data/lang_bpe_{a.vocab_size}")
    out.mkdir(parents=True, exist_ok=True)

    lines: dict[str, list[str]] = defaultdict(list)
    for path in sorted(a.manifests.glob("voxa_cuts_train_*.jsonl.gz")):
        lang = path.name.removeprefix("voxa_cuts_train_").removesuffix(".jsonl.gz")
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                for s in json.loads(line)["supervisions"]:
                    lines[lang].append(s["text"])
    if not lines:
        raise SystemExit(f"No voxa_cuts_train_*.jsonl.gz in {a.manifests}: run step 2 first")

    most = max(len(v) for v in lines.values())
    text = out / "train_text.txt"
    rng = random.Random(0)
    with text.open("w", encoding="utf-8") as f:
        for lang, items in sorted(lines.items()):
            repeat = min(a.balance, max(1, most // max(1, len(items))))
            print(f"{lang}: {len(items)} lines, used {repeat}x")
            batch = items * repeat
            rng.shuffle(batch)
            f.write("\n".join(batch) + "\n")

    spm.SentencePieceTrainer.train(
        input=str(text),
        vocab_size=a.vocab_size,
        model_type="unigram",
        model_prefix=str(out / "bpe"),
        input_sentence_size=100_000_000,
        character_coverage=1.0,
        user_defined_symbols=["<blk>", "<sos/eos>"],
        unk_id=2,
        bos_id=-1,
        eos_id=-1,
    )
    sp = spm.SentencePieceProcessor(model_file=str(out / "bpe.model"))
    assert sp.piece_to_id("<blk>") == 0, "icefall needs <blk> at id 0"
    with (out / "tokens.txt").open("w", encoding="utf-8") as f:
        for i in range(sp.get_piece_size()):
            f.write(f"{sp.id_to_piece(i)} {i}\n")
    print(f"Wrote {out / 'bpe.model'} and {out / 'tokens.txt'} ({sp.get_piece_size()} pieces)")


if __name__ == "__main__":
    main()
