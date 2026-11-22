import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme';
import { type } from '@/design/type';

/** Shared screen shell: safe area, large title, and room for the floating tab bar. */
export function Screen({ title, overline, right, children }: {
  title: string;
  overline?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        // Android tab bar floats over content; iOS native tabs inset automatically.
        paddingBottom: Platform.OS === 'ios' ? 32 : insets.bottom + 112,
        gap: 16,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          {overline ? <Text style={[type.overline, { color: colors.textTertiary }]}>{overline}</Text> : null}
          <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}

export function Placeholder({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[type.body, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  card: { borderRadius: 20, borderCurve: 'continuous', padding: 20 },
});
