import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useScene } from '@/design/scene';
import { useTheme } from '@/design/theme';
import { sceneType } from '@/design/type';
import { PaperShadow } from './shadows';

/**
 * A paper tag in a brass holder: shelf labels, the rack dots, small counts. `round` makes it a
 * pill (for controls laid on it); otherwise a small card with nearly square corners.
 */
export function PaperTag({ children, round, style }: { children: ReactNode; round?: boolean; style?: StyleProp<ViewStyle> }) {
  const { r } = useScene();
  return <View style={[round ? styles.pill : styles.tag, { backgroundColor: r.tagBg, borderColor: r.tagBorder }, style]}>{children}</View>;
}

/**
 * A paper note laid a touch crooked: empty states and short explanations inside a scene.
 * `children` go under the title (body text, a button).
 */
export function PaperNote({ title, children, style }: { title: string; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { r } = useScene();
  return (
    <View style={[styles.note, { backgroundColor: r.tagBg, borderColor: r.tagBorder }, style]}>
      <Text style={[sceneType.heading, { color: r.tagText }]}>{title}</Text>
      {children}
    </View>
  );
}

/** Body text on a PaperNote or PaperTag. */
export function PaperText({ children }: { children: ReactNode }) {
  const { r } = useScene();
  return <Text style={[sceneType.body, { color: r.tagText }]}>{children}</Text>;
}

/** Height of a PaperSheet's binding; pad the content below it. */
export const BINDING = 10;

/**
 * A sheet of paper for working text (a script, captions, scanned text): the app's card colour,
 * so text keeps its contrast in both schemes, with nearly square corners and a soft shadow on
 * the wall. Nothing is drawn over the words. `binding` glues it into a writing pad (an oak strip
 * across the top, BINDING high); `margin` rules a faint red margin line down the left, 18 in.
 * `contentStyle` pads the paper.
 */
export function PaperSheet({
  children,
  rich = true,
  binding,
  margin,
  style,
  contentStyle,
}: {
  children: ReactNode;
  rich?: boolean;
  binding?: boolean;
  margin?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { r } = useScene();
  return (
    <View style={style}>
      <PaperShadow rich={rich} />
      <View style={[styles.sheet, { backgroundColor: colors.card }, contentStyle]}>
        {margin ? <View style={[styles.margin, { backgroundColor: colors.accent }]} pointerEvents="none" /> : null}
        {binding ? (
          <View style={[styles.binding, { backgroundColor: r.oak, borderBottomColor: r.oakDark }]} pointerEvents="none">
            {rich ? Array.from({ length: 14 }, (_, i) => <View key={i} style={[styles.stitch, { backgroundColor: r.oakDark }]} />) : null}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { borderRadius: 3, overflow: 'hidden' },
  binding: { position: 'absolute', top: 0, left: 0, right: 0, height: BINDING, borderBottomWidth: 1.5, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  stitch: { width: 3, height: 3, borderRadius: 1.5, opacity: 0.7 },
  margin: { position: 'absolute', top: 0, bottom: 0, left: 18, width: 1.5, opacity: 0.3 },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 2, borderWidth: 1, maxWidth: '100%' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderRadius: 999, borderWidth: 1 },
  note: { padding: 16, borderRadius: 3, borderWidth: 1, gap: 6, transform: [{ rotate: '-0.6deg' }] },
});
