import { dark, light, onAirSign, rackDark, rackLight, type Palette } from '../tokens';

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

/** An rgba() colour laid over a solid hex one, as hex. */
function over(rgba: string, base: string): string {
  const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number);
  const mix = (top: number, i: number) => Math.round(top * a + parseInt(base.slice(i, i + 2), 16) * (1 - a));
  return `#${[mix(r, 1), mix(g, 3), mix(b, 5)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
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
  it('onAccent on an accentChip over the accent is at least 4.5:1', () => {
    expect(contrast(p.onAccent, over(p.accentChip, p.accent))).toBeGreaterThanOrEqual(4.5);
  });
  it('accent text on an onAccent button is at least 4.5:1', () => {
    expect(contrast(p.accent, p.onAccent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each([
  ['light', rackLight],
  ['dark', rackDark],
])('%s rack', (_name, r) => {
  it.each([
    ['title on the wall', r.title, r.wall],
    ['overline on the wall', r.overline, r.wall],
    ['overline on the shaded wall', r.overline, r.wallShade],
    ['shelf tags and the empty-case note', r.tagText, r.tagBg],
  ])('%s is at least 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  // The scrim is see-through: test text on it laid over the room's lightest light.
  it.each([
    ['onScrim', r.onScrim],
    ['onScrimSecondary', r.onScrimSecondary],
  ])('%s text is at least 4.5:1 on the scrim over the wall', (_label, fg) => {
    expect(contrast(fg, over(r.scrim, r.light))).toBeGreaterThanOrEqual(4.5);
  });
  it.each([
    ['phrase cards on the cork', r.tagBg, r.cork],
    ['button borders on the wall', r.control, r.wall],
    ['the current-rack dot on its tag', r.accent, r.tagBg],
  ])('%s are at least 3:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('ON AIR sign', () => {
  it('lit lettering is at least 4.5:1 on its glass', () => {
    expect(contrast(onAirSign.inkOn, onAirSign.glassOn)).toBeGreaterThanOrEqual(4.5);
  });
  it('the lit glass stands out from its housing at least 3:1', () => {
    expect(contrast(onAirSign.glassOn, onAirSign.housing)).toBeGreaterThanOrEqual(3);
  });
});
