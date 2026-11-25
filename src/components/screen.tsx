import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIVE_BAR_SPACE } from '@/components/live-bar';
import { useTheme } from '@/design/theme';
import { sceneType, type } from '@/design/type';
import { useListen } from '@/features/listen/listen-session';
import { useSpeakSession } from '@/features/speak/speak-session';

/** Shared screen shell: safe area, large title, and room for the floating tab bar. */
export function Screen({ title, overline, right, children }: {
  title: string;
  overline?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Leave room for the bar above the Android tabs while listening or speaking.
  const listening = useListen().status !== 'idle';
  const speaking = useSpeakSession().status !== 'idle';
  const liveBar = Platform.OS === 'android' && (listening || speaking) ? LIVE_BAR_SPACE : 0;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        // Android tab bar floats over content; iOS native tabs inset automatically.
        paddingBottom: Platform.OS === 'ios' ? 32 : insets.bottom + 112 + liveBar,
        gap: 24,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          {overline ? <Text style={[sceneType.overline, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{overline.toUpperCase()}</Text> : null}
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
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 4, marginBottom: -8 },
  card: { borderRadius: 20, borderCurve: 'continuous', padding: 20 },
});
