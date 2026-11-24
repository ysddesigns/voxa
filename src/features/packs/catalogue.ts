import type { Tier } from '@/engines/types';

/**
 * The pack catalogue: what can be downloaded (voices now, speech models later).
 *
 * Served from the CDN as JSON. Until the CDN exists, DEV_CATALOGUE below has one small test pack
 * so the downloader can be tried on a phone. Anything that does not pass parseCatalogue is dropped,
 * so one bad entry cannot break the Voices screen.
 */

/**
 * model: engine models the app downloads at setup (listening, speaker labels).
 * lab: models being evaluated, offered only in the Engine lab (never in Settings or setup).
 */
export type PackKind = 'voice' | 'model' | 'lab' | 'test';

export type PackFile = {
  /** Where the file goes inside the pack folder, e.g. "model.onnx". */
  path: string;
  url: string;
  sha256: string;
  bytes: number;
};

export type Pack = {
  id: string;
  kind: PackKind;
  name: string;
  tags: string[];
  /** Lowest tier the pack runs well on. */
  minTier: Tier;
  /** Where the recordings and model come from, shown in the app (CC BY needs attribution). */
  licence: string;
  files: PackFile[];
};

export type Catalogue = { version: number; packs: Pack[] };

export const packBytes = (p: Pack) => p.files.reduce((n, f) => n + f.bytes, 0);

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/i;
const TIERS: readonly Tier[] = ['lite', 'standard', 'pro'];
const KINDS: readonly PackKind[] = ['voice', 'model', 'lab', 'test'];

function isSafePath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && path.split(/[\\/]/).every((part) => part !== '' && part !== '..');
}

function parseFile(raw: unknown): PackFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (!isSafePath(f.path)) return null;
  if (typeof f.url !== 'string' || !f.url.startsWith('https://')) return null;
  if (typeof f.sha256 !== 'string' || !SHA256.test(f.sha256)) return null;
  if (typeof f.bytes !== 'number' || !Number.isInteger(f.bytes) || f.bytes <= 0) return null;
  return { path: f.path, url: f.url, sha256: f.sha256.toLowerCase(), bytes: f.bytes };
}

function parsePack(raw: unknown): Pack | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || !ID.test(p.id)) return null;
  if (typeof p.kind !== 'string' || !KINDS.includes(p.kind as PackKind)) return null;
  if (typeof p.name !== 'string' || !p.name.trim()) return null;
  if (typeof p.licence !== 'string' || !p.licence.trim()) return null;
  const minTier = typeof p.minTier === 'string' && TIERS.includes(p.minTier as Tier) ? (p.minTier as Tier) : 'lite';
  const tags = Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string') : [];
  if (!Array.isArray(p.files) || p.files.length === 0) return null;
  const files = p.files.map(parseFile);
  if (files.some((f) => f === null)) return null;
  const paths = new Set(files.map((f) => f!.path));
  if (paths.size !== files.length) return null;
  return { id: p.id, kind: p.kind as PackKind, name: p.name.trim(), tags, minTier, licence: p.licence.trim(), files: files as PackFile[] };
}

/** Keeps the packs that are well formed; drops the rest (and duplicates of an id). */
export function parseCatalogue(raw: unknown): Catalogue {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const version = typeof c.version === 'number' ? c.version : 0;
  const seen = new Set<string>();
  const packs: Pack[] = [];
  for (const item of Array.isArray(c.packs) ? c.packs : []) {
    const pack = parsePack(item);
    if (pack && !seen.has(pack.id)) {
      seen.add(pack.id);
      packs.push(pack);
    }
  }
  return { version, packs };
}

const TIER_RANK: Record<Tier, number> = { lite: 0, standard: 1, pro: 2 };

export const runsOn = (p: Pack, tier: Tier) => TIER_RANK[tier] >= TIER_RANK[p.minTier];

/** Kroko English since 22 Nov 2026 (Zipformer 20M was 'listen-en'). Must match VoxaEngineModule.kt. */
export const LISTEN_PACK = 'listen-en-kroko';
/** Voxa's fine-tuned Nigerian multilingual streaming model (en, pcm, yo, ha, ig). */
export const LISTEN_PACK_NG = 'listen-ng';
export const SPEAKERS_PACK = 'speakers';

/** Listening models being compared with the one in LISTEN_PACK (Engine lab). Same file names as LISTEN_PACK. */
export const LAB_ZIPFORMER_0626 = 'lab-asr-zipformer-0626';
/** Offline (whole-sentence) candidates: run after each sentence or after the meeting, not live. */
export const LAB_MOONSHINE_BASE = 'lab-asr-moonshine-base';
export const LAB_OMNILINGUAL_300M = 'lab-asr-omnilingual-300m';
/** The previous listening model, kept as a baseline. */
export const LAB_ZIPFORMER_20M = 'lab-asr-zipformer-20m';
export const LAB_NEMO_480 = 'lab-asr-nemo-480';

const ZIP0626 = 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/672fbf1b30579d6585301139bb363f42a0ad4a24';
const KROKO = 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-kroko-2025-08-06/resolve/572aaf4e2e0c603c3fc2a574d096e755a178faa1';
const MOONSHINE = 'https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-base-en-int8/resolve/052b0798ad1bf046a140fdd4efcd9426530fa3f5';
const OMNI300M = 'https://huggingface.co/csukuangfj/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12/resolve/6abf1ece20cd2308bdb7d13cd78ec1c44fa4c094';
const NEMO480 ='https://huggingface.co/csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms-int8/resolve/df8ed95e44a70924450381e610770f9d656d1e15';

/** Pinned to one Hugging Face commit so the files cannot change under the checksums. */
const ZIPFORMER = 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/d42f2d9f7ca24806fb667456a18a9f1b60f70d16';

/**
 * Until the CDN exists: one real voice (Cori), the two model packs, and one small test file
 * (Silero VAD, 2.3 MB, MIT) for the Engine lab's download test. Upstream URLs, pinned and checksummed.
 */
export const DEV_CATALOGUE: Catalogue = {
  version: 1,
  packs: [
    // A real voice pack until the CDN exists. Files are pinned to one Hugging Face commit so they cannot change.
    {
      id: 'cori-medium',
      kind: 'voice',
      name: 'Cori',
      tags: ['Natural', 'Female', 'English UK'],
      minTier: 'lite',
      licence: 'Cori: LibriVox recordings, public domain; Piper voice by Bryce Beattie',
      files: [
        {
          path: 'model.onnx',
          url: 'https://huggingface.co/csukuangfj/vits-piper-en_GB-cori-medium/resolve/e304c95c578725ba9cab0cff451c4e5d9aaf889e/en_GB-cori-medium.onnx',
          sha256: '8b0d3cdd77f2878e0aa2048103eabb4d01b334783f99629f042bcf703aeba487',
          bytes: 63531507,
        },
        {
          path: 'tokens.txt',
          url: 'https://huggingface.co/csukuangfj/vits-piper-en_GB-cori-medium/resolve/e304c95c578725ba9cab0cff451c4e5d9aaf889e/tokens.txt',
          sha256: 'ef3a7e4a8d1af0c9d4dc45aaae1a6242ebe24a7ed6f3d025a49eb29682784c6d',
          bytes: 940,
        },
      ],
    },
    // Listening: Kroko English (streaming Zipformer) and Silero VAD. Ids must match LISTEN_PACK / SPEAKERS_PACK in VoxaEngineModule.kt.
    // Chosen 22 Nov 2026 by the Engine lab comparison: 29% word error vs 61% for Zipformer 20M, about as fast.
    {
      id: LISTEN_PACK,
      kind: 'model',
      name: 'Listening',
      tags: ['Live captions', 'English'],
      minTier: 'lite',
      licence: 'Kroko ASR community model by Banafo, CC-BY-SA (needs legal review before shipping); Silero VAD, MIT',
      files: [
        { path: 'encoder.onnx', url: `${KROKO}/encoder.onnx`, sha256: 'd4881c57449d581e0770fd53fa66c2fdc6cd167d92ece7c715e603defc96d9d4', bytes: 70092599 },
        { path: 'decoder.onnx', url: `${KROKO}/decoder.onnx`, sha256: '455ba38466fce8d5a57e7db68a323b684079ca4d9e1dd93a740d9b2429aae3b1', bytes: 617488 },
        { path: 'joiner.onnx', url: `${KROKO}/joiner.onnx`, sha256: 'd406f616736350e2a7df3e39398b78eb2fc1a2ca6973a19d3853fa3227e25b52', bytes: 336817 },
        { path: 'tokens.txt', url: `${KROKO}/tokens.txt`, sha256: '396dbeb5f4858875690716084f54e90d339679d0ba3e6b5b584f3d7589254d2d', bytes: 6310 },
        {
          path: 'silero_vad.onnx',
          url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad_v5.onnx',
          sha256: '6b99cbfd39246b6706f98ec13c7c50c6b299181f2474fa05cbc8046acc274396',
          bytes: 2313101,
        },
      ],
    },
    // Speaker labels after a meeting: pyannote segmentation 3.0 (int8) and 3D-Speaker CAM++.
    {
      id: SPEAKERS_PACK,
      kind: 'model',
      name: 'Speaker labels',
      tags: ['Who spoke when'],
      minTier: 'lite',
      licence: 'pyannote segmentation 3.0, MIT; 3D-Speaker CAM++, Apache-2.0',
      files: [
        {
          path: 'segmentation.onnx',
          url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/9403a6902bb58e3d5ae8c7e77c3422de279db2e0/model.int8.onnx',
          sha256: 'd582f4b4c6b48205de7e0643c57df0df5615a3c176189be3fc461e9d18827b5d',
          bytes: 1540506,
        },
        {
          path: 'embedding.onnx',
          url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx',
          sha256: '98daf9bcf1c8abf3db374fec4c27a5eda7c58705bb3f180d057b085a72a88bb5',
          bytes: 29596979,
        },
      ],
    },
    // Lab: listening models to compare with Kroko on the user's own speech (Engine lab).
    {
      id: LAB_ZIPFORMER_0626,
      kind: 'lab',
      name: 'Zipformer 2023-06-26',
      tags: ['Listening candidate', 'LibriSpeech'],
      minTier: 'standard',
      licence: 'Zipformer by k2-fsa (icefall), Apache-2.0',
      files: [
        { path: 'encoder.onnx', url: `${ZIP0626}/encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx`, sha256: '563fde436d16cf7607cf408cd6b30909819d03162652ef389c2450ced3f45ac1', bytes: 71083163 },
        { path: 'decoder.onnx', url: `${ZIP0626}/decoder-epoch-99-avg-1-chunk-16-left-128.onnx`, sha256: '7bf787f90b194b307e5a4ad6a34fadb4e748304c35f78a8d66358a05b13ee6ef', bytes: 2092621 },
        { path: 'joiner.onnx', url: `${ZIP0626}/joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx`, sha256: 'd944208d660d67c8d72cd2acaeac971fa5ceb8c80e76c1968148846fedd6e297', bytes: 259335 },
        { path: 'tokens.txt', url: `${ZIP0626}/tokens.txt`, sha256: '49e3c2646595fd907228b3c6787069658f67b17377c60aeb8619c4551b2316fb', bytes: 5048 },
      ],
    },
    {
      id: LAB_ZIPFORMER_20M,
      kind: 'lab',
      name: 'Zipformer 20M',
      tags: ['Listening candidate', 'LibriSpeech'],
      minTier: 'lite',
      licence: 'Zipformer 20M by k2-fsa, Apache-2.0',
      files: [
        { path: 'encoder.onnx', url: `${ZIPFORMER}/encoder-epoch-99-avg-1.int8.onnx`, sha256: '3810755ce7c3ab26b42a8bcf39d191308fa27fb0f53358823ba46141d03b7eb3', bytes: 42845182 },
        { path: 'decoder.onnx', url: `${ZIPFORMER}/decoder-epoch-99-avg-1.onnx`, sha256: '45a7f940ecfb53d89fa270ad11b88b961e53a317203eb24b1c8e95ed208b0f30', bytes: 2092272 },
        { path: 'joiner.onnx', url: `${ZIPFORMER}/joiner-epoch-99-avg-1.int8.onnx`, sha256: 'e085d73b593cf9b0707f370dbd656d58327d3fe36d80d849202ef81df02cb01e', bytes: 259572 },
        { path: 'tokens.txt', url: `${ZIPFORMER}/tokens.txt`, sha256: '49e3c2646595fd907228b3c6787069658f67b17377c60aeb8619c4551b2316fb', bytes: 5048 },
      ],
    },
    {
      id: LAB_NEMO_480,
      kind: 'lab',
      name: 'NeMo FastConformer (480 ms)',
      tags: ['Listening candidate', 'Large training set'],
      minTier: 'standard',
      licence: 'NVIDIA stt_en_fastconformer_hybrid_large_streaming_multi, CC-BY-4.0',
      files: [
        { path: 'encoder.onnx', url: `${NEMO480}/encoder.int8.onnx`, sha256: '100c5616929a131b5b3c8c8ab0d83aaba2cdcae163acd8d190b4e5ffa5f7d051', bytes: 131507603 },
        { path: 'decoder.onnx', url: `${NEMO480}/decoder.int8.onnx`, sha256: '4f04431988472f8c7b815f942aa6901976929c9e22353029681fcdb262da0164', bytes: 3955864 },
        { path: 'joiner.onnx', url: `${NEMO480}/joiner.int8.onnx`, sha256: 'd2d8e7290a6a8245a83ed211aa0dd8cdf8effb8a7c64fe392399561111b52f30', bytes: 1408182 },
        { path: 'tokens.txt', url: `${NEMO480}/tokens.txt`, sha256: '618dc110fc2213886b52e063ff42329bbdf37a266ca7705184090fa5f39f3131', bytes: 11896 },
      ],
    },
    // Offline candidates. minTier lite: the point is to measure them on a 2 GB phone.
    {
      id: LAB_MOONSHINE_BASE,
      kind: 'lab',
      name: 'Moonshine base (English)',
      tags: ['Listening candidate', 'Whole sentence'],
      minTier: 'lite',
      licence: 'Moonshine by Useful Sensors, MIT',
      files: [
        { path: 'preprocess.onnx', url: `${MOONSHINE}/preprocess.onnx`, sha256: 'ffa630d395c5ccf76f5d4954be5b882df76aaf6491519ec01fd82ea7a3819fb2', bytes: 14077290 },
        { path: 'encode.int8.onnx', url: `${MOONSHINE}/encode.int8.onnx`, sha256: '7e38770f776f2e5583a53b052936005df2ba5c833d7e09c2a5fd796b94bf73e2', bytes: 50311494 },
        { path: 'uncached_decode.int8.onnx', url: `${MOONSHINE}/uncached_decode.int8.onnx`, sha256: 'c01f4b35093bcac20d352d23a75a539e772964579f9d024a90e5e6f09cae9987', bytes: 122120451 },
        { path: 'cached_decode.int8.onnx', url: `${MOONSHINE}/cached_decode.int8.onnx`, sha256: '2db74e51cedf64a8b1be3c8192e0bb5e4923af0e90bd9e87f8e8771873f8ea03', bytes: 99983837 },
        { path: 'tokens.txt', url: `${MOONSHINE}/tokens.txt`, sha256: '1165c2aeb9f72f457a83be2d459a09054f27490acd9b41bd43794dfd25e296ea', bytes: 436688 },
      ],
    },
    {
      id: LAB_OMNILINGUAL_300M,
      kind: 'lab',
      name: 'Omnilingual 300M (1600 languages)',
      tags: ['Listening candidate', 'Whole sentence', 'Yoruba', 'Hausa', 'Igbo', 'Pidgin'],
      minTier: 'lite',
      licence: 'Omnilingual ASR by Meta, Apache-2.0',
      files: [
        { path: 'model.int8.onnx', url: `${OMNI300M}/model.int8.onnx`, sha256: 'e7c4e54ee4c4c47829cc6667d5d00ed8ea7bef1dcfeef0fce766f77752a2726c', bytes: 365352120 },
        { path: 'tokens.txt', url: `${OMNI300M}/tokens.txt`, sha256: 'a7a044c52cb29cbe8b0dc1953e92cefd4ca16b0ed968177b6beab21f9a7d0b31', bytes: 86423 },
      ],
    },
    {
      id: LISTEN_PACK_NG,
      kind: 'lab',
      name: 'Voxa Nigerian ASR (Zipformer)',
      tags: ['Listening candidate', 'Live', 'Nigerian English', 'Pidgin', 'Yoruba', 'Hausa', 'Igbo'],
      minTier: 'lite',
      licence: 'Voxa multilingual Zipformer, Apache-2.0 base',
      files: [
        { path: 'encoder.onnx', url: `${KROKO}/encoder.onnx`, sha256: 'd4881c57449d581e0770fd53fa66c2fdc6cd167d92ece7c715e603defc96d9d4', bytes: 70092599 },
        { path: 'decoder.onnx', url: `${KROKO}/decoder.onnx`, sha256: '455ba38466fce8d5a57e7db68a323b684079ca4d9e1dd93a740d9b2429aae3b1', bytes: 617488 },
        { path: 'joiner.onnx', url: `${KROKO}/joiner.onnx`, sha256: 'd406f616736350e2a7df3e39398b78eb2fc1a2ca6973a19d3853fa3227e25b52', bytes: 336817 },
        { path: 'tokens.txt', url: `${KROKO}/tokens.txt`, sha256: '396dbeb5f4858875690716084f54e90d339679d0ba3e6b5b584f3d7589254d2d', bytes: 6310 },
        {
          path: 'silero_vad.onnx',
          url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad_v5.onnx',
          sha256: '6b99cbfd39246b6706f98ec13c7c50c6b299181f2474fa05cbc8046acc274396',
          bytes: 2313101,
        },
      ],
    },
    {
      id: 'download-test',
      kind: 'test',
      name: 'Download test',
      tags: ['Test'],
      minTier: 'lite',
      licence: 'Silero VAD, MIT',
      files: [
        {
          path: 'silero_vad.onnx',
          url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad_v5.onnx',
          sha256: '6b99cbfd39246b6706f98ec13c7c50c6b299181f2474fa05cbc8046acc274396',
          bytes: 2313101,
        },
      ],
    },
  ],
};
