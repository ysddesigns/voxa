import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useScene } from '@/design/scene';
import { sceneType } from '@/design/type';

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

const styles = StyleSheet.create({
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 2, borderWidth: 1, maxWidth: '100%' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderRadius: 999, borderWidth: 1 },
  note: { padding: 16, borderRadius: 3, borderWidth: 1, gap: 6, transform: [{ rotate: '-0.6deg' }] },
});
