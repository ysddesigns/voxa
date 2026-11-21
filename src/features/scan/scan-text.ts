import type { ScanLine } from '@/engines/types';

/**
 * Turns recognised lines into readable text: lines of one paragraph join with spaces (a word
 * broken with a hyphen at the end of a line is joined back), paragraphs are separated by a blank line.
 * Without paragraph numbers every line is its own paragraph.
 */
export function linesToText(lines: ScanLine[]): string {
  const paragraphs: string[] = [];
  let current = '';
  let last: number | undefined;
  lines.forEach((line, i) => {
    const text = line.text.trim();
    if (!text) return;
    const para = line.paragraph ?? i;
    if (current && para !== last) {
      paragraphs.push(current);
      current = '';
    }
    if (!current) current = text;
    else if (/[A-Za-z]-$/.test(current) && /^[a-z]/.test(text)) current = current.slice(0, -1) + text;
    else current += ` ${text}`;
    last = para;
  });
  if (current) paragraphs.push(current);
  return paragraphs.join('\n\n');
}

/** Words to check, each once, in reading order. */
export function unsureWords(lines: ScanLine[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines)
    for (const w of l.unsureWords) {
      const key = w.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(w);
      }
    }
  return out;
}

/** A title from the first few words: "Weekly sync agenda…" */
export function scanTitle(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return 'Scanned text';
  const t = words.slice(0, 5).join(' ').replace(/[,;:.!?—-]+$/, '');
  return words.length > 5 ? `${t}…` : t;
}
