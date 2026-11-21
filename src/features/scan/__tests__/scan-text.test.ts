import { memoryFiles } from '@/storage/files';
import { SessionStore } from '@/storage/sessions';
import { linesToText, scanTitle, unsureWords } from '../scan-text';

const line = (text: string, paragraph?: number, unsure: string[] = []) => ({ text, confidence: 0.9, unsureWords: unsure, paragraph });

describe('scan text', () => {
  it('joins lines of a paragraph, mends hyphenated words, and separates paragraphs', () => {
    const lines = [line('Take one tablet', 0), line('twice a day after', 0), line('meals. Do not ex-', 0), line('ceed the dose.', 0), line('Keep cool and dry.', 1)];
    expect(linesToText(lines)).toBe('Take one tablet twice a day after meals. Do not exceed the dose.\n\nKeep cool and dry.');
  });

  it('keeps a dash before a capital, and treats lines without paragraphs as their own', () => {
    expect(linesToText([line('Lagos -', 0), line('Abuja', 0)])).toBe('Lagos - Abuja');
    expect(linesToText([line('One'), line('  '), line('Two')])).toBe('One\n\nTwo');
  });

  it('lists each unsure word once', () => {
    expect(unsureWords([line('a', 0, ['Thursdav', 'Ibadan']), line('b', 0, ['thursdav'])])).toEqual(['Thursdav', 'Ibadan']);
  });

  it('makes a short title', () => {
    expect(scanTitle('Weekly sync — agenda for the team on Monday')).toBe('Weekly sync — agenda for…');
    expect(scanTitle('Exit.')).toBe('Exit');
    expect(scanTitle('  ')).toBe('Scanned text');
  });

  it('saves a scan to the Library', async () => {
    const store = new SessionStore(memoryFiles());
    const meta = await store.saveScan('Keep cool and dry.', 'Keep cool and dry', 1000);
    const [listed] = await store.list();
    expect(listed).toMatchObject({ id: meta.id, kind: 'scan', status: 'saved', text: 'Keep cool and dry.' });
    expect(await store.recoverUnfinished()).toEqual([]);
  });
});
