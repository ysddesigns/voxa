import { bucketLabel, startOfWeek } from './shelves';

/**
 * The fixed Rack: it always fits the screen, so it grows deeper instead of longer. Each pocket
 * is one time bucket holding a stack, newest in front: Today, Yesterday, each earlier day of
 * this week, Last Week, then a month. Days keep a busy week from filling only one pocket.
 * A rack holds rows x cols pockets; more pockets go on the next rack (swipe across).
 */

export type Pocket<T> = {
  key: string;
  /** Short enough for the tag under one pocket: "TODAY", "MONDAY", "OCTOBER", "OCT 2025". */
  label: string;
  /** Spoken: "Today", "Monday", "October 2025". */
  spoken: string;
  /** Newest first. */
  items: T[];
};

const DAY = 86_400_000;
const startOfDay = (at: number) => {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export function pocketLabel(at: number, now = Date.now()): { label: string; spoken: string } {
  const today = startOfDay(now);
  if (at >= today) return { label: 'TODAY', spoken: 'Today' }; // includes a clock that runs ahead
  if (at >= today - DAY) return { label: 'YESTERDAY', spoken: 'Yesterday' };
  if (at >= startOfWeek(now)) {
    const day = new Date(at).toLocaleDateString('en-GB', { weekday: 'long' });
    return { label: day.toUpperCase(), spoken: day };
  }
  const full = bucketLabel(at, now);
  const spoken = full.charAt(0) + full.slice(1).toLowerCase();
  const m = /^([A-Z]+) (\d{4})$/.exec(full);
  return { label: m ? `${m[1].slice(0, 3)} ${m[2]}` : full, spoken };
}

/** Items must be newest first. */
export function buildPockets<T>(items: T[], at: (item: T) => number, now = Date.now()): Pocket<T>[] {
  const out: Pocket<T>[] = [];
  for (const item of items) {
    const { label, spoken } = pocketLabel(at(item), now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(item);
    else out.push({ key: label, label, spoken, items: [item] });
  }
  return out;
}

/** Splits pockets into racks of `perRack`. Always at least one rack (empty when nothing saved). */
export function paginate<T>(pockets: T[], perRack: number): T[][] {
  const size = Math.max(1, Math.floor(perRack));
  if (pockets.length === 0) return [[]];
  const racks: T[][] = [];
  for (let i = 0; i < pockets.length; i += size) racks.push(pockets.slice(i, i + size));
  return racks;
}

/** Matches first (in their order), then the rest. `hits` is how many matched. */
export function frontMatches<T>(items: T[], match: (item: T) => boolean): { items: T[]; hits: number } {
  const yes: T[] = [];
  const no: T[] = [];
  for (const i of items) (match(i) ? yes : no).push(i);
  return { items: [...yes, ...no], hits: yes.length };
}

/**
 * Space each shelf needs besides the poster: headroom under the shelf above, room for the
 * stack's peeking edges, and the shelf board's front edge (which carries the tags).
 */
export const SHELF_CHROME = { top: 8, peek: 16, edge: 18 } as const;
const CHROME = SHELF_CHROME.top + SHELF_CHROME.peek + SHELF_CHROME.edge;
const RATIO = 1.42;
const MIN_POSTER_H = 84;

export type RackLayout = { cols: number; rows: number; posterW: number; posterH: number; shelfH: number };

/**
 * Sizes the rack to fit `height` (the space between the header and the counter) and `width`
 * (the rack's inner width, posts to posts less padding). Three shelves when they fit with
 * posters at least MIN_POSTER_H tall, else two.
 */
export function rackLayout({ width, height, fontScale, gap }: { width: number; height: number; fontScale: number; gap: number }): RackLayout {
  const cols = fontScale >= 1.3 ? (width >= 560 ? 3 : 2) : width >= 840 ? 5 : width >= 560 ? 4 : 3;
  const byWidth = Math.floor((width - (cols - 1) * gap) / cols);
  const fit = (rows: number) => {
    const maxH = Math.floor(height / rows) - CHROME;
    const posterH = Math.max(0, Math.min(Math.round(byWidth * RATIO), maxH));
    const posterW = Math.min(byWidth, Math.floor(posterH / RATIO));
    return { cols, rows, posterW, posterH: Math.round(posterW * RATIO), shelfH: Math.round(posterW * RATIO) + CHROME };
  };
  const three = fit(3);
  return three.posterH >= MIN_POSTER_H ? three : fit(2);
}
