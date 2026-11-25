import { buildPockets, frontMatches, paginate, pocketLabel, rackLayout, SHELF_CHROME } from '../pockets';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
// Wednesday 25 Nov 2026.
const NOW = at(2026, 11, 25, 15);

describe('pockets', () => {
  it('names today, yesterday, then the days of this week', () => {
    expect(pocketLabel(at(2026, 11, 25, 9), NOW)).toEqual({ label: 'TODAY', spoken: 'Today' });
    expect(pocketLabel(NOW + 3_600_000 * 30, NOW)).toEqual({ label: 'TODAY', spoken: 'Today' });
    expect(pocketLabel(at(2026, 11, 24, 23), NOW)).toEqual({ label: 'YESTERDAY', spoken: 'Yesterday' });
    expect(pocketLabel(at(2026, 11, 23, 8), NOW)).toEqual({ label: 'MONDAY', spoken: 'Monday' });
    // Monday's yesterday is Sunday, last week: "Yesterday" wins.
    const monday = at(2026, 11, 23, 15);
    expect(pocketLabel(at(2026, 11, 22, 10), monday).label).toBe('YESTERDAY');
    expect(pocketLabel(at(2026, 11, 21, 10), monday).label).toBe('LAST WEEK');
  });

  it('uses short tag labels and spoken names for older buckets', () => {
    expect(pocketLabel(at(2026, 11, 17), NOW)).toEqual({ label: 'LAST WEEK', spoken: 'Last week' });
    expect(pocketLabel(at(2026, 10, 3), NOW)).toEqual({ label: 'OCTOBER', spoken: 'October' });
    expect(pocketLabel(at(2025, 10, 3), NOW)).toEqual({ label: 'OCT 2025', spoken: 'October 2025' });
  });

  it('stacks each time bucket in one pocket, newest in front', () => {
    const items = [25, 25, 24, 18, 17, 3].map((d, i) => ({ i, at: at(2026, 11, d, 10 - i) }));
    const pockets = buildPockets(items, (x) => x.at, NOW);
    expect(pockets.map((p) => [p.label, p.items.map((x) => x.i)])).toEqual([
      ['TODAY', [0, 1]],
      ['YESTERDAY', [2]],
      ['LAST WEEK', [3, 4]],
      ['NOVEMBER', [5]],
    ]);
  });

  it('groups older items by week, then month', () => {
    const items = [18, 17, 3].map((d, i) => ({ i, at: at(2026, 11, d) }));
    const pockets = buildPockets(items, (x) => x.at, NOW);
    expect(pockets.map((p) => [p.label, p.items.map((x) => x.i)])).toEqual([
      ['LAST WEEK', [0, 1]],
      ['NOVEMBER', [2]],
    ]);
  });

  it('fills racks of nine and always has one rack', () => {
    expect(paginate([], 9)).toEqual([[]]);
    expect(paginate([1, 2, 3], 9)).toEqual([[1, 2, 3]]);
    expect(paginate(Array.from({ length: 20 }, (_, i) => i), 9).map((r) => r.length)).toEqual([9, 9, 2]);
  });

  it('brings search matches to the front of a stack, keeping order', () => {
    expect(frontMatches([1, 2, 3, 4, 5], (n) => n % 2 === 0)).toEqual({ items: [2, 4, 1, 3, 5], hits: 2 });
    expect(frontMatches([1, 3], (n) => n > 5)).toEqual({ items: [1, 3], hits: 0 });
  });
});

describe('rack layout', () => {
  const chrome = SHELF_CHROME.top + SHELF_CHROME.peek + SHELF_CHROME.edge;

  it.each([
    ['small Android (360 x 740)', 308, 540],
    ['iPhone SE (375 x 667)', 323, 470],
    ['tall phone (412 x 915)', 360, 700],
  ])('fits three shelves of three on a %s', (_name, width, height) => {
    const l = rackLayout({ width, height, fontScale: 1, gap: 10 });
    expect([l.cols, l.rows]).toEqual([3, 3]);
    expect(l.rows * l.shelfH).toBeLessThanOrEqual(height);
    expect(l.cols * l.posterW + 2 * 10).toBeLessThanOrEqual(width);
    expect(l.posterH).toBeGreaterThanOrEqual(84);
    expect(l.shelfH).toBe(l.posterH + chrome);
  });

  it('keeps the poster shape', () => {
    const l = rackLayout({ width: 308, height: 540, fontScale: 1, gap: 10 });
    expect(l.posterH / l.posterW).toBeCloseTo(1.42, 1);
  });

  it('uses two columns with large text', () => {
    expect(rackLayout({ width: 308, height: 540, fontScale: 1.5, gap: 10 }).cols).toBe(2);
  });

  it('drops to two shelves when three would make posters too small', () => {
    const l = rackLayout({ width: 308, height: 330, fontScale: 1, gap: 10 });
    expect(l.rows).toBe(2);
    expect(l.rows * l.shelfH).toBeLessThanOrEqual(330);
  });

  it('shows more pockets per shelf on a tablet', () => {
    expect(rackLayout({ width: 700, height: 900, fontScale: 1, gap: 10 }).cols).toBe(4);
  });
});
