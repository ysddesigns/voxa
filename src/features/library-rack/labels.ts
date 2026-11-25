import { formatDay, formatDuration } from '@/features/listen/format';
import type { SessionMeta } from '@/storage/sessions';

/** Small caps line above the poster title: "MEETING · 42 MIN", "SCAN". */
export function posterOverline(s: SessionMeta): string {
  if (s.kind === 'scan') return 'SCAN';
  const min = Math.round(s.durationMs / 60000);
  const length = min < 1 ? '<1 MIN' : min < 60 ? `${min} MIN` : `${Math.floor(min / 60)} H ${min % 60 ? `${min % 60} M` : ''}`.trim();
  return s.status === 'recovered' ? `RECOVERED · ${length}` : `MEETING · ${length}`;
}

/** The title without the "Meeting, " the overline already says. */
export function posterTitle(s: SessionMeta): string {
  const t = s.title.trim() || 'Untitled';
  return s.kind === 'listen' ? t.replace(/^Meeting,\s*/, '') || t : t;
}

/** One line under a big poster: "Today · 30 min · 3 speakers · 1 mark". */
export function posterMeta(s: SessionMeta, now = Date.now()): string {
  if (s.kind === 'scan') return `Scanned · ${formatDay(s.startedAt, now)}`;
  const parts = [formatDay(s.startedAt, now), formatDuration(s.durationMs)];
  if (s.speakers) parts.push(`${s.speakers} ${s.speakers === 1 ? 'speaker' : 'speakers'}`);
  if (s.marks.length) parts.push(`${s.marks.length} ${s.marks.length === 1 ? 'mark' : 'marks'}`);
  if (s.status === 'recovered') parts.push('recovered');
  return parts.join(' · ');
}

/** What TalkBack and VoiceOver read for a poster. */
export function posterA11yLabel(s: SessionMeta, now = Date.now()): string {
  if (s.kind === 'scan') return `${s.title}. Scanned ${formatDay(s.startedAt, now)}.`;
  const parts = [s.title, formatDay(s.startedAt, now), formatDuration(s.durationMs)];
  if (s.speakers) parts.push(`${s.speakers} ${s.speakers === 1 ? 'speaker' : 'speakers'}`);
  if (s.marks.length) parts.push(`${s.marks.length} ${s.marks.length === 1 ? 'mark' : 'marks'}`);
  if (s.status === 'recovered') parts.push('recovered after the app closed');
  return `${parts.join(', ')}.`;
}
