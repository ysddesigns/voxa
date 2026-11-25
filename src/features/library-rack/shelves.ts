/**
 * Library v2 ("The Rack"): saved items laid out on shelves, one time bucket per shelf label
 * (This Week, Last Week, then by month), a fixed number of posters per shelf row.
 */

export type ShelfRow<T> = {
  key: string;
  /** "THIS WEEK", "LAST WEEK", "OCTOBER", "OCTOBER 2025". */
  label: string;
  /** How many items share this label (shown on the lip). */
  count: number;
  /** First row of its bucket. */
  first: boolean;
  items: T[];
};

const DAY = 86_400_000;

/** Monday 00:00 local time of the week `at` falls in. */
export function startOfWeek(at: number): number {
  const d = new Date(at);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

export function bucketLabel(at: number, now = Date.now()): string {
  const week = startOfWeek(now);
  if (at >= week) return 'THIS WEEK'; // includes a clock that runs ahead
  if (at >= week - 7 * DAY) return 'LAST WEEK';
  const d = new Date(at);
  const month = d.toLocaleDateString('en-GB', { month: 'long' }).toUpperCase();
  return d.getFullYear() === new Date(now).getFullYear() ? month : `${month} ${d.getFullYear()}`;
}

/** Items must be newest first (as the session store lists them). */
export function buildShelves<T>(items: T[], at: (item: T) => number, perRow = 3, now = Date.now()): ShelfRow<T>[] {
  const size = Math.max(1, Math.floor(perRow));
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = bucketLabel(at(item), now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  const rows: ShelfRow<T>[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.items.length; i += size) {
      rows.push({ key: `${g.label}-${i / size}`, label: g.label, count: g.items.length, first: i === 0, items: g.items.slice(i, i + size) });
    }
  }
  return rows;
}

/** Posters per shelf: 3 on a phone, 2 with large text, more on a tablet. */
export function postersPerRow(width: number, fontScale: number): number {
  if (fontScale >= 1.3) return width >= 600 ? 3 : 2;
  if (width >= 900) return 5;
  if (width >= 600) return 4;
  return 3;
}
