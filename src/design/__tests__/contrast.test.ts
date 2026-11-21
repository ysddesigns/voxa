import { dark, light, type Palette } from '../tokens';

/**
 * PRD accessibility rule: AA contrast. Text needs 4.5:1 against every surface it sits on;
 * icons, the level meter and other non-text marks need 3:1 (WCAG 1.4.11).
 */

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

type Key = keyof Palette;
const textColours: Key[] = ['text', 'textSecondary', 'textTertiary', 'accentText'];
const surfaces: Key[] = ['background', 'card', 'chip', 'chipPressed', 'warning', 'tabActiveFill', 'highlight'];
const pairs: [Key, Key][] = [
  ...textColours.flatMap((t) => surfaces.map((s) => [t, s] as [Key, Key])),
  ['onAccent', 'accent'],
  ['onPrimary', 'primaryFill'],
  ['text', 'art'],
];
const marks: [Key, Key][] = [
  ['accent', 'background'],
  ['accent', 'card'],
  ['accent', 'chip'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme', (_name, p) => {
  it.each(pairs)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(marks)('%s marks on %s are at least 3:1', (fg, bg) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(3);
  });
});
