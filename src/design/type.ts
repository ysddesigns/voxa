import type { TextStyle } from 'react-native';

/**
 * Inter on both platforms for an identical look (PRD: SF Pro may not be used on Android).
 * Android needs a separate family per weight, so styles name the family, not fontWeight.
 *
 * Sizes follow Apple's type ramp (Large Title 34, Title 28, Title 2 22, Headline 17,
 * Body 17, Callout 16, Subheadline 15, Footnote 13, Caption 12). One display size per screen.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
} as const;

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
  /** Large Title: one per screen, at the top. */
  largeTitle: { fontFamily: fontFamily.bold, fontSize: 34, letterSpacing: -0.7, lineHeight: 41 },
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
