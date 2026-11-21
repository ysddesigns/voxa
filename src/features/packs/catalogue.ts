import type { Tier } from '@/engines/types';

/**
 * The pack catalogue: what can be downloaded (voices now, speech models later).
 *
 * Served from the CDN as JSON. Until the CDN exists, DEV_CATALOGUE below has one small test pack
 * so the downloader can be tried on a phone. Anything that does not pass parseCatalogue is dropped,
 * so one bad entry cannot break the Voices screen.
 */

/** model: engine models the app downloads at setup (listening, speaker labels). */
export type PackKind = 'voice' | 'model' | 'test';

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
const KINDS: readonly PackKind[] = ['voice', 'model', 'test'];

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

export const LISTEN_PACK = 'listen-en';
export const SPEAKERS_PACK = 'speakers';

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
    // Listening: streaming Zipformer 20M (int8) and Silero VAD. Ids must match LISTEN_PACK / SPEAKERS_PACK in VoxaEngineModule.kt.
    {
      id: LISTEN_PACK,
      kind: 'model',
      name: 'Listening',
      tags: ['Live captions', 'English'],
      minTier: 'lite',
      licence: 'Zipformer 20M by k2-fsa, Apache-2.0; Silero VAD, MIT',
      files: [
        { path: 'encoder.onnx', url: `${ZIPFORMER}/encoder-epoch-99-avg-1.int8.onnx`, sha256: '3810755ce7c3ab26b42a8bcf39d191308fa27fb0f53358823ba46141d03b7eb3', bytes: 42845182 },
        { path: 'decoder.onnx', url: `${ZIPFORMER}/decoder-epoch-99-avg-1.onnx`, sha256: '45a7f940ecfb53d89fa270ad11b88b961e53a317203eb24b1c8e95ed208b0f30', bytes: 2092272 },
        { path: 'joiner.onnx', url: `${ZIPFORMER}/joiner-epoch-99-avg-1.int8.onnx`, sha256: 'e085d73b593cf9b0707f370dbd656d58327d3fe36d80d849202ef81df02cb01e', bytes: 259572 },
        { path: 'tokens.txt', url: `${ZIPFORMER}/tokens.txt`, sha256: '49e3c2646595fd907228b3c6787069658f67b17377c60aeb8619c4551b2316fb', bytes: 5048 },
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
