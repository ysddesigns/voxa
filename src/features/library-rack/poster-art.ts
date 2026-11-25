import type { SessionMeta } from '@/storage/sessions';

/**
 * Poster art for the Rack, drawn from the session itself rather than chosen at random:
 * - sky and sun (or moon and stars): the time of day it started
 * - hill layers: the number of speakers
 * - how tall the range rises: how long it ran
 * - flags on the front ridge: the marks made while listening
 * - scans get a printed page instead of a landscape
 * The rest (palette within the time of day, peaks or rolling hills, a lake) comes from a seed
 * made from the id, so a session always gets the same poster.
 *
 * Art is described in a 100 x 100 box; the poster component draws it with react-native-svg.
 */

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export type Band = { bg: string; fg: string };

export type LandscapeScene = {
  kind: 'landscape';
  time: TimeOfDay;
  sky: [string, string];
  sun: { x: number; y: number; r: number; color: string; moon: boolean };
  stars: { x: number; y: number; r: number }[];
  /** Back to front. */
  hills: { d: string; color: string }[];
  lake: { y: number; color: string; shine: string } | null;
  flags: { x: number; y: number }[];
  flagColor: string;
  band: Band;
};

export type PageScene = {
  kind: 'page';
  paper: string;
  ink: string;
  /** Text lines, as widths out of 100, top to bottom. */
  lines: number[];
  corner: string;
  band: Band;
};

export type PosterScene = LandscapeScene | PageScene;

/** Title bands: every pair passes 4.5:1 (see poster-art.test). */
export const BANDS: Band[] = [
  { bg: '#1F2A44', fg: '#F6EEDC' },
  { bg: '#B8321A', fg: '#FFF6E8' },
  { bg: '#F3E7CF', fg: '#2A2118' },
  { bg: '#2F5D50', fg: '#FFFFFF' },
  { bg: '#E2A93B', fg: '#2A2118' },
];

type Mood = { sky: [string, string]; sun: string; hills: string[]; lake: string; band: number[] };

/** A few palettes per time of day; the seed picks one. Hills run far (pale) to near (deep). */
const MOODS: Record<TimeOfDay, Mood[]> = {
  dawn: [
    { sky: ['#F7C9A9', '#FBEBD0'], sun: '#F0643C', hills: ['#E9B79A', '#C98F7A', '#8E6A6A', '#5B4A5C'], lake: '#E8B8A4', band: [0, 2] },
    { sky: ['#F4D7B0', '#FFF1D6'], sun: '#E7553A', hills: ['#BFD0B4', '#8FB08E', '#5E8A6E', '#3D5E50'], lake: '#BFD8D0', band: [3, 0] },
  ],
  day: [
    { sky: ['#BFE1E6', '#F5EDCF'], sun: '#F2B33D', hills: ['#A9CFC0', '#76A98F', '#4E8268', '#2F5D4A'], lake: '#7FB8C4', band: [3, 2, 0] },
    { sky: ['#CDE6EE', '#FBF2DA'], sun: '#E9573A', hills: ['#D9C28E', '#C19A55', '#9A7238', '#6B4F2A'], lake: '#86C1CC', band: [1, 4] },
    { sky: ['#D6EAF0', '#F6F0DD'], sun: '#F2B33D', hills: ['#B7C9D6', '#8BA4B8', '#5F7C93', '#3E566C'], lake: '#9CC9D3', band: [0, 2] },
  ],
  dusk: [
    { sky: ['#E9785A', '#F7C98E'], sun: '#C9311B', hills: ['#C98E86', '#9D6476', '#6D4766', '#432F4C'], lake: '#E59A7E', band: [0, 4] },
    { sky: ['#B4708F', '#F2B28A'], sun: '#F6D372', hills: ['#9C7397', '#77557C', '#523C5E', '#2F2540'], lake: '#C98E99', band: [1, 2] },
  ],
  night: [
    { sky: ['#14203A', '#2C3D66'], sun: '#F3EBD3', hills: ['#2E4470', '#23365B', '#192846', '#101B33'], lake: '#25385E', band: [0, 2] },
    { sky: ['#1A1C36', '#3A2F5C'], sun: '#F3EBD3', hills: ['#3D3A6B', '#2D2B55', '#211F40', '#15142B'], lake: '#2B2A52', band: [2, 3] },
  ],
};

const PAPERS = [
  { paper: '#F3EAD6', ink: '#3A3128', corner: '#DCCFB4' },
  { paper: '#EAF0EC', ink: '#27413A', corner: '#CBD8D1' },
  { paper: '#F6E3DA', ink: '#4A2A22', corner: '#E2C3B6' },
];

/** FNV-1a: a stable number from the id. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for art. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function timeOfDay(at: number): TimeOfDay {
  const h = new Date(at).getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'dusk';
  return 'night';
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const pick = <T>(rand: () => number, list: T[]): T => list[Math.floor(rand() * list.length) % list.length];

/** 0 for a few seconds, 1 at two hours or more (log scale, so short meetings still get hills). */
export function heightFromDuration(ms: number): number {
  const min = Math.max(0, ms) / 60000;
  return clamp(Math.log10(1 + min) / Math.log10(121), 0, 1);
}

type Ridge = { d: string; points: { x: number; y: number }[] };

/** A closed ridge shape: jagged peaks or rolling hills. `points` are on the outline. */
function ridge(rand: () => number, base: number, amp: number, steps: number, peaks: boolean): Ridge {
  const raw: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 100;
    const y = base - amp * (0.35 + 0.65 * rand());
    raw.push({ x: r1(x), y: r1(y) });
  }
  if (peaks) {
    const d = `M0,100 L${raw.map((p) => `${p.x},${p.y}`).join(' L')} L100,100 Z`;
    return { d, points: raw };
  }
  // Rolling: quadratic curves through the midpoints, so the midpoints lie on the outline.
  const mids = raw.slice(0, -1).map((p, i) => ({ x: r1((p.x + raw[i + 1].x) / 2), y: r1((p.y + raw[i + 1].y) / 2) }));
  let d = `M0,100 L${raw[0].x},${raw[0].y} L${mids[0].x},${mids[0].y}`;
  for (let i = 1; i < mids.length; i++) d += ` Q${raw[i].x},${raw[i].y} ${mids[i].x},${mids[i].y}`;
  d += ` L${raw[raw.length - 1].x},${raw[raw.length - 1].y} L100,100 Z`;
  return { d, points: mids };
}

function landscape(meta: SessionMeta, rand: () => number): LandscapeScene {
  const time = timeOfDay(meta.startedAt);
  const mood = pick(rand, MOODS[time]);
  const band = BANDS[pick(rand, mood.band)];

  // Sun follows the day: low on the left at dawn, high at noon, low on the right at dusk.
  const d = new Date(meta.startedAt);
  const hour = d.getHours() + d.getMinutes() / 60;
  const night = time === 'night';
  const t = night ? 0.3 + rand() * 0.4 : clamp((hour - 5) / 14, 0, 1);
  const sun = {
    x: r1(15 + t * 70),
    y: r1(night ? 18 + rand() * 10 : 58 - Math.sin(Math.PI * t) * 40),
    r: night ? 7 : 9 + Math.round(rand() * 3),
    color: mood.sun,
    moon: night,
  };
  const stars = night
    ? Array.from({ length: 9 }, () => ({ x: r1(rand() * 100), y: r1(rand() * 45), r: r1(0.5 + rand() * 0.7) }))
    : [];

  const layers = clamp(Math.round(meta.speakers ?? 2), 1, 4);
  const height = heightFromDuration(meta.durationMs);
  const peaks = rand() < 0.5;
  const lake = rand() < 0.3;
  const colors = mood.hills.slice(mood.hills.length - layers);
  const ridges: Ridge[] = [];
  for (let i = 0; i < layers; i++) {
    const depth = layers === 1 ? 1 : i / (layers - 1); // 0 far, 1 near
    const base = (lake ? 74 : 84) - (1 - depth) * 14 + depth * 4;
    const amp = (10 + height * 34) * (1 - depth * 0.55);
    ridges.push(ridge(rand, base, amp, peaks ? 6 + Math.floor(rand() * 3) : 4 + Math.floor(rand() * 2), peaks && i < layers - 1));
  }

  // Marks become flags on the nearest ridge, spread left to right.
  const front = ridges[ridges.length - 1].points.filter((p) => p.x > 6 && p.x < 94);
  const count = Math.min(meta.marks.length, 5, front.length);
  const flags = Array.from({ length: count }, (_, i) => front[Math.floor(((i + 0.5) / count) * front.length)]).map((p) => ({ x: p.x, y: p.y }));

  return {
    kind: 'landscape',
    time,
    sky: mood.sky,
    sun,
    stars,
    hills: ridges.map((r, i) => ({ d: r.d, color: colors[i] })),
    lake: lake ? { y: 80, color: mood.lake, shine: mood.sky[1] } : null,
    flags,
    flagColor: '#D63F1C',
    band,
  };
}

function page(text: string, rand: () => number): PageScene {
  const p = pick(rand, PAPERS);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const count = clamp(Math.round(4 + words / 25), 4, 9);
  const lines = Array.from({ length: count }, (_, i) => (i === count - 1 ? 30 + rand() * 30 : 62 + rand() * 26)).map(r1);
  return { kind: 'page', paper: p.paper, ink: p.ink, corner: p.corner, lines, band: BANDS[pick(rand, [0, 3, 1])] };
}

export function posterScene(meta: SessionMeta): PosterScene {
  const rand = seeded(hashId(meta.id));
  return meta.kind === 'scan' ? page(meta.text ?? '', rand) : landscape(meta, rand);
}

/**
 * A printed page for any text (a script being spoken): longer text, more lines. The same text
 * always gets the same paper and band.
 */
export function textScene(text: string): PageScene {
  return page(text, seeded(hashId(text.trim() || 'voxa')));
}

/** A voice's tone sets how its sound wave rolls: low and slow for deep, quick for bright. */
const TONE_WAVES: Record<string, number> = { Deep: 1.2, Calm: 1.5, Warm: 2, Natural: 2.5, Bright: 3.5 };
/** And the light it is heard in. */
const TONE_TIME: Record<string, TimeOfDay> = { Deep: 'night', Calm: 'dusk', Warm: 'dusk', Natural: 'day', Bright: 'dawn' };

/** How many waves cross a voice's sleeve: from its first tone tag, else 2. */
export function voiceWaves(tags: string[]): number {
  for (const t of tags) if (TONE_WAVES[t]) return TONE_WAVES[t];
  return 2;
}

/**
 * A voice's record sleeve, for the Voices shop window: its sound as rolling hills. The tone
 * sets how quickly the waves roll and the time of day; the rest comes from the voice's id, so
 * a voice always has the same sleeve. Drawn by the same PosterArt as a session's poster.
 */
export function voiceScene(voice: { id: string; tags: string[] }): LandscapeScene {
  const rand = seeded(hashId(`voice:${voice.id}`));
  const tone = voice.tags.find((t) => TONE_TIME[t]);
  const time: TimeOfDay = tone ? TONE_TIME[tone] : 'day';
  const mood = pick(rand, MOODS[time]);
  const night = time === 'night';
  const waves = voiceWaves(voice.tags);
  const colors = mood.hills.slice(1);
  const hills = colors.map((color, i) => {
    const base = 62 + i * 11;
    const amp = 9 - i * 2;
    const phase = rand() * Math.PI * 2;
    let d = 'M0,100';
    for (let x = 0; x <= 100; x += 2.5) {
      const y = base - amp * (0.5 + 0.5 * Math.sin((2 * Math.PI * waves * x) / 100 + phase));
      d += ` L${r1(x)},${r1(y)}`;
    }
    return { d: `${d} L100,100 Z`, color };
  });
  return {
    kind: 'landscape',
    time,
    sky: mood.sky,
    sun: { x: r1(20 + rand() * 60), y: r1(night ? 20 : 26 + rand() * 10), r: night ? 7 : 10, color: mood.sun, moon: night },
    stars: night ? Array.from({ length: 7 }, () => ({ x: r1(rand() * 100), y: r1(rand() * 40), r: r1(0.5 + rand() * 0.6) })) : [],
    hills,
    lake: null,
    flags: [],
    flagColor: '#D63F1C',
    band: BANDS[pick(rand, mood.band)],
  };
}

