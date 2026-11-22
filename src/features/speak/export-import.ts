/**
 * Export (PRD PL-2) and import (ED-1) for Speak for me: pure helpers, tested without the phone.
 */

/** Longest script the editor takes from a file; longer ones are cut at a sentence end. */
export const MAX_IMPORT = 20_000;

export type DocKind = 'txt' | 'docx' | 'pdf';

export const PICK_TYPES = ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export function kindOf(name: string | null | undefined, mime: string | null | undefined): DocKind | null {
  const ext = (name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === 'txt' || mime === 'text/plain') return 'txt';
  if (ext === 'docx' || mime === PICK_TYPES[2]) return 'docx';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  return null;
}

/** Tidies text from a file: line endings, runs of spaces, blank lines; cut to MAX_IMPORT. */
export function cleanImported(raw: string, max = MAX_IMPORT): { text: string; cut: boolean } {
  let text = raw
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= max) return { text, cut: false };
  const head = text.slice(0, max);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf('\n\n'));
  text = (end > max / 2 ? head.slice(0, end + 1) : head).trim();
  return { text, cut: true };
}

/** A safe file name for an exported recording: "Good morning everyone.m4a". */
export function exportName(title: string): string {
  const base = title
    .replace(/…$/, '')
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return `${base || 'Voxa speech'}.m4a`;
}
