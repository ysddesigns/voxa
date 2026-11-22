import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { VoxaEngine } from '../../../modules/voxa-engine';
import { cleanImported, kindOf, PICK_TYPES } from './export-import';

export type Opened = { text: string; name: string; note: string | null };

/**
 * Lets the person pick a .txt, .docx or PDF and returns its text for the editor (PRD ED-1), read on
 * the phone. Null when they cancel. onProgress gets 0..1 while PDF pages are read.
 */
export async function openDocument(onProgress?: (fraction: number) => void): Promise<Opened | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: PICK_TYPES, copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets.length) return null;
  const asset = picked.assets[0];
  const kind = kindOf(asset.name, asset.mimeType);
  if (!kind) throw new Error('Voxa can open .txt, .docx (Word) and PDF files.');

  let raw: string;
  let note: string | null = null;
  if (kind === 'txt') {
    raw = await new File(asset.uri).text();
  } else {
    if (!VoxaEngine?.readDocument) throw new Error('Opening Word and PDF files needs the latest version of Voxa.');
    const sub = kind === 'pdf' ? VoxaEngine.addListener('onDocument', (e) => onProgress?.(e.fraction)) : null;
    try {
      const r = await VoxaEngine.readDocument(asset.uri, kind);
      raw = r.text;
      if (r.pages > r.pagesRead) note = `Only the first ${r.pagesRead} of ${r.pages} pages were read.`;
    } finally {
      sub?.remove();
    }
  }
  const { text, cut } = cleanImported(raw);
  if (!text) throw new Error('No text was found in that file.');
  if (cut) note = 'The file was long, so only the first part was added.';
  if (kind === 'pdf') note = [note, 'PDF text is read from the page image: check names and numbers.'].filter(Boolean).join(' ');
  return { text, name: asset.name, note };
}
