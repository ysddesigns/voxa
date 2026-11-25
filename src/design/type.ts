import type { TextStyle } from 'react-native';

/**
 * Inter on both platforms for an identical look (PRD: SF Pro may not be used on Android).
 * Android needs a separate family per weight, so styles name the family, not fontWeight.
 *
 * Body sizes follow Apple's type ramp (Title 28, Title 2 22, Headline 17, Body 17, Callout 16,
 * Subheadline 15, Footnote 13, Caption 12). The screen's large title is set in the serif, like
 * the Library's (see sceneType). One display size per screen.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
  /**
   * Serif for screen titles, poster titles and titles inside scenes; never body text. Noto Serif
   * Display covers Yoruba, Igbo and Hausa (ẹ ọ ṣ ɓ ɗ ƙ, tone marks, combining dot below); Fraunces did not.
   */
  display: 'NotoSerifDisplay_600SemiBold',
} as const;

/**
 * Type for drawn scenes (the Rack and the rooms to come): a spaced small-caps overline over a
 * serif title, as on a shop sign or a poster. Inter stays the body face.
 */
export const sceneType = {
  /** "THE RACK · 12 SAVED". */
  overline: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 1.6, lineHeight: 15, fontVariant: ['tabular-nums'] },
  /** The screen's name, one per screen. */
  title: { fontFamily: fontFamily.display, fontSize: 30, lineHeight: 38, letterSpacing: -0.5 },
  /** A screen's name in its top bar, beside Back. */
  navTitle: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  /** The centred title of a navigation bar. */
  barTitle: { fontFamily: fontFamily.display, fontSize: 18, lineHeight: 24 },
  /** Titles on notes and under a big poster. */
  heading: { fontFamily: fontFamily.display, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

type Variant =
  | 'largeTitle'
  | 'title'
  | 'heading'
  | 'headline'
  | 'body'
  | 'bodyStrong'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption'
  | 'overline'
  | 'tab';

export const type: Record<Variant, TextStyle> = {
  /** Large Title: one per screen, at the top. The serif, as on the Library. */
  largeTitle: sceneType.title,
  /** Title 1. */
  title: { fontFamily: fontFamily.bold, fontSize: 28, letterSpacing: -0.5, lineHeight: 34 },
  /** Title 2: sheet and card titles. */
  heading: { fontFamily: fontFamily.bold, fontSize: 22, letterSpacing: -0.3, lineHeight: 28 },
  /** Headline: row titles that lead, navigation bar titles. */
  headline: { fontFamily: fontFamily.semibold, fontSize: 17, letterSpacing: -0.4, lineHeight: 22 },
  body: { fontFamily: fontFamily.regular, fontSize: 17, letterSpacing: -0.4, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 17, letterSpacing: -0.4, lineHeight: 22 },
  callout: { fontFamily: fontFamily.medium, fontSize: 16, letterSpacing: -0.3, lineHeight: 21 },
  subheadline: { fontFamily: fontFamily.regular, fontSize: 15, letterSpacing: -0.2, lineHeight: 20 },
  /** Footnote: hints, section footers. */
  footnote: { fontFamily: fontFamily.regular, fontSize: 13, letterSpacing: -0.1, lineHeight: 18 },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, letterSpacing: -0.1, lineHeight: 18 },
  /** Grouped-list section headers. */
  overline: { fontFamily: fontFamily.regular, fontSize: 13, letterSpacing: 0, lineHeight: 18, textTransform: 'uppercase' },
  tab: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.1 },
};

