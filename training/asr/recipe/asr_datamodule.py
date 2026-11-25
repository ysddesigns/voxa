"""
Voxa's data for icefall's zipformer/finetune.py.

finetune.py imports `LibriSpeechAsrDataModule` from `asr_datamodule` in its own folder and asks
it for GigaSpeech and LibriSpeech cuts. setup.sh builds a recipe folder (voxa_zipformer) whose
asr_datamodule.py is this file, so finetune.py runs unchanged and reads Voxa's data instead:

  gigaspeech_subset_small_cuts()  -> Voxa training cuts, all chosen languages mixed
  train_all_shuf_cuts()           -> the same (used only with --use-mux)
  dev_clean_cuts()                -> Voxa dev cuts, all languages
  dev_other_cuts()                -> empty
  gigaspeech_dev_cuts()           -> the first 100 dev cuts per language (a quick second check)

Loaders, augmentation and batching are icefall's own (tdnn_lstm_ctc/asr_datamodule.py), loaded
by path and subclassed here. MUSAN noise needs musan_cuts.jsonl.gz in --manifest-dir; without it,
pass --enable-musan 0.

Languages are mixed by --voxa-temperature: weights are (clips per language) ** temperature, so
0.5 gives a small language more turns than its share without repeating it endlessly.
"""

from __future__ import annotations

import argparse
import gzip
import importlib.util
import logging
import os
from pathlib import Path

from lhotse import CutSet, load_manifest_lazy
from lhotse.utils import fastcopy

from icefall.utils import str2bool


def _load_icefall_module():
    asr_dir = Path(os.environ.get("ICEFALL_ASR_DIR", Path.cwd()))
    path = asr_dir / "tdnn_lstm_ctc" / "asr_datamodule.py"
    if not path.is_file():
        raise FileNotFoundError(f"{path} not found: run from icefall/egs/librispeech/ASR or set ICEFALL_ASR_DIR")
    spec = importlib.util.spec_from_file_location("icefall_librispeech_asr_datamodule", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_base = _load_icefall_module()


def _upper(sup):
    """The English starting model's vocabulary is upper case (LibriSpeech); Voxa text is lower case."""
    return fastcopy(sup, text=sup.text.upper())


# training/asr: scripts/05_compute_fbank.py ran there, and older manifests store feature paths
# relative to it. finetune.py runs from icefall's folder, where those paths do not exist.
_HERE = Path(__file__).resolve().parent.parent


def _absolute_features(cut):
    f = cut.features
    if f is not None and not Path(f.storage_path).is_absolute():
        cut = fastcopy(cut, features=fastcopy(f, storage_path=str(_HERE / f.storage_path)))
    return cut


class LibriSpeechAsrDataModule(_base.LibriSpeechAsrDataModule):
    @classmethod
    def add_arguments(cls, parser: argparse.ArgumentParser):
        super().add_arguments(parser)
        g = parser.add_argument_group(title="Voxa data")
        g.add_argument("--voxa-languages", type=str, default="en,pcm", help="comma-separated: en, pcm, ha, yo, ig")
        g.add_argument("--voxa-upper", type=str2bool, default=False, help="upper-case text (English starting vocabulary)")
        g.add_argument("--voxa-temperature", type=float, default=0.5)

    def _languages(self) -> list[str]:
        return [x.strip() for x in self.args.voxa_languages.split(",") if x.strip()]

    def _path(self, split: str, lang: str) -> Path:
        return self.args.manifest_dir / f"voxa_cuts_{split}_{lang}.jsonl.gz"

    def _cuts(self, split: str, lang: str) -> CutSet:
        path = self._path(split, lang)
        if not path.is_file():
            raise FileNotFoundError(f"{path} not found: run scripts 02 and 05 for {lang}")
        cuts = load_manifest_lazy(path).map(_absolute_features)
        return cuts.map_supervisions(_upper) if self.args.voxa_upper else cuts

    def _count(self, split: str, lang: str) -> int:
        with gzip.open(self._path(split, lang), "rt") as f:
            return sum(1 for _ in f)

    def _present(self, split: str) -> list[str]:
        """
        The chosen languages that have a set for this split. Code-switched sets (cs-*) may be missing:
        joined clips (cs-ha-synth) have no dev or test, and early on real cs-ha recordings may only
        exist as a test set. A missing single-language set is still an error.
        """
        out = []
        for lang in self._languages():
            if self._path(split, lang).is_file():
                out.append(lang)
            elif lang.startswith("cs-"):
                logging.info(f"Voxa {split}: no {lang} set, skipped")
            else:
                raise FileNotFoundError(f"{self._path(split, lang)} not found: run scripts 02 and 05 for {lang}")
        if not out:
            raise FileNotFoundError(f"No Voxa {split} sets for {self.args.voxa_languages}")
        return out

    def gigaspeech_subset_small_cuts(self) -> CutSet:
        langs = self._present("train")
        sets = [self._cuts("train", lang) for lang in langs]
        if len(sets) == 1:
            return sets[0]
        counts = [self._count("train", lang) for lang in langs]
        weights = [c ** self.args.voxa_temperature for c in counts]
        for lang, c, w in zip(langs, counts, weights):
            logging.info(f"Voxa train {lang}: {c} clips, mix weight {w / sum(weights):.2f}")
        # stop_early=False: an epoch ends when every language has run out once.
        return CutSet.mux(*sets, weights=weights, stop_early=False)

    def train_all_shuf_cuts(self) -> CutSet:
        return self.gigaspeech_subset_small_cuts()

    def dev_clean_cuts(self) -> CutSet:
        out = None
        for lang in self._present("dev"):
            cuts = self._cuts("dev", lang)
            out = cuts if out is None else out + cuts
        return out

    def dev_other_cuts(self) -> CutSet:
        return CutSet.from_cuts([])

    def gigaspeech_dev_cuts(self) -> CutSet:
        out = None
        for lang in self._present("dev"):
            cuts = self._cuts("dev", lang).subset(first=100)
            out = cuts if out is None else out + cuts
        return out
