import type { SessionMeta } from '@/storage/sessions';
import { posterA11yLabel, posterMeta, posterOverline, posterTitle } from '../labels';
import { BANDS, hashId, heightFromDuration, posterScene, timeOfDay } from '../poster-art';
import { bucketLabel, startOfWeek } from '../shelves';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
// Wednesday 25 Nov 2026, 15:00.
const NOW = at(2026, 11, 25, 15);

const meta = (over: Partial<SessionMeta> = {}): SessionMeta => ({
  id: 'abc-123',
  kind: 'listen',
  title: 'Meeting, Wed 25 Nov, 10:00',
  startedAt: at(2026, 11, 25, 10),
  durationMs: 30 * 60000,
  status: 'saved',
  marks: [],
  ...over,
});

describe('time buckets', () => {
  it('starts the week on Monday', () => {
    expect(new Date(startOfWeek(NOW)).getDate()).toBe(23);
    expect(new Date(startOfWeek(at(2026, 11, 23, 0, 0))).getDate()).toBe(23);
    expect(new Date(startOfWeek(at(2026, 11, 22, 23))).getDate()).toBe(16);
  });

  it('labels this week, last week, then months (with the year when it differs)', () => {
    expect(bucketLabel(at(2026, 11, 23, 1), NOW)).toBe('THIS WEEK');
    expect(bucketLabel(NOW + 86_400_000, NOW)).toBe('THIS WEEK');
    expect(bucketLabel(at(2026, 11, 17), NOW)).toBe('LAST WEEK');
    expect(bucketLabel(at(2026, 11, 3), NOW)).toBe('NOVEMBER');
    expect(bucketLabel(at(2026, 10, 3), NOW)).toBe('OCTOBER');
    expect(bucketLabel(at(2025, 10, 3), NOW)).toBe('OCTOBER 2025');
  });
});

describe('poster art', () => {
  it('is the same every time for the same session', () => {
    expect(posterScene(meta())).toEqual(posterScene(meta()));
    expect(hashId('abc-123')).toBe(hashId('abc-123'));
    expect(hashId('abc-123')).not.toBe(hashId('abc-124'));
  });

  it('reads the time of day from when it started', () => {
    expect(timeOfDay(at(2026, 1, 1, 6))).toBe('dawn');
    expect(timeOfDay(at(2026, 1, 1, 12))).toBe('day');
    expect(timeOfDay(at(2026, 1, 1, 17))).toBe('dusk');
    expect(timeOfDay(at(2026, 1, 1, 23))).toBe('night');
    expect(timeOfDay(at(2026, 1, 1, 3))).toBe('night');
  });

  it('puts the sun low at dawn and dusk, high at noon, and a moon with stars at night', () => {
    const scene = (h: number) => {
      const s = posterScene(meta({ startedAt: at(2026, 11, 25, h) }));
      if (s.kind !== 'landscape') throw new Error('expected landscape');
      return s;
    };
    const dawn = scene(6);
    const noon = scene(12);
    const dusk = scene(18);
    const night = scene(22);
    expect(noon.sun.y).toBeLessThan(dawn.sun.y);
    expect(noon.sun.y).toBeLessThan(dusk.sun.y);
    expect(dawn.sun.x).toBeLessThan(noon.sun.x);
    expect(noon.sun.x).toBeLessThan(dusk.sun.x);
    expect(night.sun.moon).toBe(true);
    expect(night.stars.length).toBeGreaterThan(0);
    expect(noon.stars).toEqual([]);
  });

  it('draws one hill layer per speaker (1 to 4), two when unknown', () => {
    const layers = (speakers?: number) => {
      const s = posterScene(meta({ speakers }));
      return s.kind === 'landscape' ? s.hills.length : -1;
    };
    expect(layers(1)).toBe(1);
    expect(layers(3)).toBe(3);
    expect(layers(9)).toBe(4);
    expect(layers(undefined)).toBe(2);
  });

  it('plants a flag per mark, up to five, inside the poster', () => {
    const s = posterScene(meta({ marks: Array.from({ length: 8 }, (_, i) => ({ atMs: i * 1000 })) }));
    if (s.kind !== 'landscape') throw new Error('expected landscape');
    expect(s.flags.length).toBeGreaterThan(0);
    expect(s.flags.length).toBeLessThanOrEqual(5);
    for (const f of s.flags) {
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(100);
      expect(f.y).toBeGreaterThan(0);
      expect(f.y).toBeLessThan(100);
    }
  });

  it('grows the range with length, on a log scale', () => {
    expect(heightFromDuration(0)).toBe(0);
    expect(heightFromDuration(120 * 60000)).toBe(1);
    expect(heightFromDuration(5 * 3600000)).toBe(1);
    expect(heightFromDuration(10 * 60000)).toBeGreaterThan(0.4);
  });

  it('gives scans a printed page with more lines for more text', () => {
    const short = posterScene(meta({ kind: 'scan', text: 'a few words' }));
    const long = posterScene(meta({ kind: 'scan', text: 'word '.repeat(200) }));
    expect(short.kind).toBe('page');
    if (short.kind !== 'page' || long.kind !== 'page') throw new Error('expected page');
    expect(long.lines.length).toBeGreaterThan(short.lines.length);
  });

  it('keeps every hill path closed and inside the box', () => {
    for (let i = 0; i < 40; i++) {
      const s = posterScene(meta({ id: `id-${i}`, startedAt: at(2026, 11, 25, i % 24), speakers: (i % 4) + 1, durationMs: i * 300000 }));
      if (s.kind !== 'landscape') continue;
      for (const h of s.hills) {
        expect(h.d.endsWith('Z')).toBe(true);
        const nums = (h.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
        expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...nums)).toBeLessThanOrEqual(100);
      }
    }
  });
});

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('poster text', () => {
  it.each(BANDS)('title band %o passes 4.5:1', (band) => {
    expect(contrast(band.fg, band.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('drops "Meeting," from default titles (the overline says it)', () => {
    expect(posterTitle(meta())).toBe('Wed 25 Nov, 10:00');
    expect(posterTitle(meta({ title: 'Ìpàdé Ẹgbẹ́' }))).toBe('Ìpàdé Ẹgbẹ́');
    expect(posterTitle(meta({ kind: 'scan', title: 'Meeting, notes' }))).toBe('Meeting, notes');
  });

  it('writes overlines with the length', () => {
    expect(posterOverline(meta())).toBe('MEETING · 30 MIN');
    expect(posterOverline(meta({ durationMs: 65 * 60000 }))).toBe('MEETING · 1 H 5 M');
    expect(posterOverline(meta({ durationMs: 120 * 60000, status: 'recovered' }))).toBe('RECOVERED · 2 H');
    expect(posterOverline(meta({ kind: 'scan' }))).toBe('SCAN');
  });

  it('writes the line under a big poster', () => {
    expect(posterMeta(meta({ speakers: 1, marks: [{ atMs: 1 }, { atMs: 2 }] }), NOW)).toBe('Today · 30 min · 1 speaker · 2 marks');
    expect(posterMeta(meta({ kind: 'scan' }), NOW)).toBe('Scanned · Today');
  });

  it('gives screen readers the full story', () => {
    expect(posterA11yLabel(meta({ speakers: 3, marks: [{ atMs: 1 }] }), NOW)).toBe(
      'Meeting, Wed 25 Nov, 10:00, Today, 30 min, 3 speakers, 1 mark.',
    );
  });
});
