import type { Tier } from '@/engines/types';

/**
 * The pack catalogue: what can be downloaded (voices now, speech models later).
 *
 * Served from the CDN as JSON. Until the CDN exists, DEV_CATALOGUE below has one small test pack
 * so the downloader can be tried on a phone. Anything that does not pass parseCatalogue is dropped,
 * so one bad entry cannot break the Voices screen.
 */

export type PackKind = 'voice' | 'test';

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
const KINDS: readonly PackKind[] = ['voice', 'test'];

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

/** One small real file (Silero VAD, 2.3 MB, MIT) to try the downloader before the CDN exists. */
export const DEV_CATALOGUE: Catalogue = {
  version: 1,
  packs: [
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
