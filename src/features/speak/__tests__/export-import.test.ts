import { cleanImported, exportName, kindOf } from '../export-import';

describe('import', () => {
  it('knows the file kind from its name or type', () => {
    expect(kindOf('Speech.DOCX', null)).toBe('docx');
    expect(kindOf('notes', 'text/plain')).toBe('txt');
    expect(kindOf('a.pdf', 'application/octet-stream')).toBe('pdf');
    expect(kindOf('photo.jpg', 'image/jpeg')).toBeNull();
  });

  it('tidies line endings, spaces and blank lines', () => {
    expect(cleanImported('﻿Hello   there\r\n\r\n\r\n\r\nNext\tline  ').text).toBe('Hello there\n\nNext line');
  });

  it('cuts very long text at a sentence end', () => {
    const r = cleanImported('One sentence here. '.repeat(10), 60);
    expect(r.cut).toBe(true);
    expect(r.text.endsWith('.')).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(60);
  });
});

describe('export', () => {
  it('makes a safe file name from the title', () => {
    expect(exportName('Good morning, everyone…')).toBe('Good morning everyone.m4a');
    expect(exportName('???')).toBe('Voxa speech.m4a');
  });
});
