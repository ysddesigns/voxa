/**
 * Library v2 ("The Rack"): the time buckets saved items are grouped into
 * (This Week, Last Week, then by month). Pockets use them: see pockets.ts.
 */

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
