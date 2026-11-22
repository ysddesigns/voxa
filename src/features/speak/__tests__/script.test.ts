import { insertPause, LONG_PAUSE_MS, PAUSE_MS, parseScript, planFrom, sayAsWordAt, scriptWords, toggleEmphasis } from '../script';

describe('parseScript', () => {
  it('reads plain text as one piece', () => {
    const p = parseScript('Good morning, everyone.');
    expect(p.spoken).toBe('Good morning, everyone.');
    expect(p.pieces).toEqual([{ start: 0, end: 23, speed: 1, gain: 1, pauseMs: 0, gapMs: 0 }]);
    expect(p.map[5]).toBe(5);
  });

  it('turns pause markers into silence and keeps the words apart', () => {
    const p = parseScript('Hello[pause]world. Then [long pause] [pause 2s] done.');
    expect(p.spoken).not.toMatch(/pause|\[|\]/);
    expect(p.spoken).toContain('Hello world');
    expect(p.pieces.map((x) => x.pauseMs)).toEqual([PAUSE_MS, LONG_PAUSE_MS, 2000, 0]);
    expect(p.pauseMs).toBe(PAUSE_MS + LONG_PAUSE_MS + 2000);
  });

  it('caps pauses at five seconds', () => {
    expect(parseScript('a [pause 30s] b').pieces[0].pauseMs).toBe(5000);
  });

  it('reads *emphasis* slower and louder with a breath either side, and maps back to the script', () => {
    const text = 'This is *really* important.';
    const p = parseScript(text);
    expect(p.spoken).toBe('This is really important.');
    const emph = p.pieces.find((x) => x.gain > 1)!;
    expect(p.spoken.slice(emph.start, emph.end)).toBe('really');
    expect(emph.speed).toBeLessThan(1);
    expect(p.pieces[0].pauseMs).toBe(150);
    expect(text[p.map[p.spoken.indexOf('really')]]).toBe('r');
    expect(text.slice(p.map[p.spoken.indexOf('important')])).toBe('important.');
  });

  it('leaves lone asterisks and multiplication alone', () => {
    expect(parseScript('2 * 3 = 6 and a * b').spoken).toBe('2 * 3 = 6 and a * b');
  });

  it('applies a style to every piece and a gap after each sentence', () => {
    const p = parseScript('One. *Two*. Three.', 'slow');
    expect(p.pieces.every((x) => x.speed < 1 && x.gapMs === 300)).toBe(true);
  });

  it('replaces Say as words, keeping highlights on the original word', () => {
    const text = 'Ask Nnamdi about NEPA.';
    const p = parseScript(text, 'neutral', { nnamdi: 'Nahm-dee', nepa: 'nee-pah' });
    expect(p.spoken).toBe('Ask Nahm-dee about nee-pah.');
    const i = p.spoken.indexOf('dee');
    expect(text.slice(p.map[i], p.map[i] + 6)).toBe('Nnamdi');
  });
});

describe('planFrom', () => {
  it('starts mid-script without replaying the pause behind it', () => {
    const text = 'First part. [pause] Second part.';
    const p = parseScript(text);
    const plan = planFrom(p, text.indexOf('Second'));
    expect(plan.spoken.trim()).toBe('Second part.');
    expect(plan.pieces.every((x) => x.pauseMs === 0)).toBe(true);
    expect(text.slice(plan.toOriginal(plan.spoken.indexOf('part')))).toBe('part.');
  });

  it('keeps a pause at the very start', () => {
    expect(planFrom(parseScript('[pause] Hi'), 0).pieces[0].pauseMs).toBe(PAUSE_MS);
  });
});

describe('editing helpers', () => {
  it('counts words without the markers', () => {
    const text = 'Hello [long pause] *there* friend';
    expect(scriptWords(text, parseScript(text).markers).map((w) => text.slice(w.start, w.end))).toEqual(['Hello', '*there*', 'friend']);
  });

  it('inserts a pause with spaces at the cursor', () => {
    expect(insertPause('Hello world', { start: 5, end: 5 })).toEqual({ text: 'Hello [pause] world', selection: { start: 13, end: 13 } });
    expect(insertPause('Hi', { start: 2, end: 2 }, true).text).toBe('Hi [long pause]');
  });

  it('toggles emphasis on the word at the cursor, leaving punctuation out', () => {
    const on = toggleEmphasis('Come now.', { start: 6, end: 6 })!;
    expect(on.text).toBe('Come *now*.');
    expect(toggleEmphasis(on.text, { start: 7, end: 7 })!.text).toBe('Come now.');
    expect(toggleEmphasis('a big deal', { start: 2, end: 10 })!.text).toBe('a *big deal*');
    expect(toggleEmphasis('   ', { start: 1, end: 1 })).toBeNull();
  });

  it('finds the plain word for Say as', () => {
    expect(sayAsWordAt('Greet *Olúwaṣeun*, please', { start: 9, end: 9 })).toBe('Olúwaṣeun');
  });
});
