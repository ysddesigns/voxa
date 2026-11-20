import type { TextStyle } from 'react-native';

/**
 * Inter on both platforms for an identical look (PRD: SF Pro may not be used on Android).
 * Android needs a separate family per weight, so styles name the family, not fontWeight.
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
  | 'body'
  | 'bodyStrong'
  | 'callout'
  | 'caption'
  | 'overline'
  | 'tab';

export const type: Record<Variant, TextStyle> = {
  largeTitle: { fontFamily: fontFamily.heavy, fontSize: 34, letterSpacing: -0.8, lineHeight: 40 },
  title: { fontFamily: fontFamily.heavy, fontSize: 26, letterSpacing: -0.6, lineHeight: 31 },
  heading: { fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 27 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 21 },
  callout: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 },
  overline: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tab: { fontFamily: fontFamily.semibold, fontSize: 11 },
};
