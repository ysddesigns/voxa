import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { useBattery } from '@/features/settings/use-battery';

/** How to stop the phone's battery saver from ending Listen when the screen is off. */
export default function BatteryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const battery = useBattery();
  const { guide, unrestricted } = battery;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.iconBtn, { backgroundColor: colors.chip }]}>
          <Icon name="chevronLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[type.heading, { color: colors.text, flex: 1 }]} accessibilityRole="header">
          Keep listening with the screen off
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          To save battery, some phones stop apps when the screen goes off. That can end Live captions in the middle of a meeting. What was heard is always saved, but the rest is missed.
        </Text>

        {battery.android ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.status} accessibilityLiveRegion="polite">
              <Icon name={unrestricted ? 'check' : 'flag'} size={20} color={unrestricted ? colors.accent : colors.accentText} />
              <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>
                {unrestricted === null
                  ? 'Update Voxa to check the battery setting.'
                  : unrestricted
                    ? 'Android lets Voxa run in the background.'
                    : 'Android may stop Voxa in the background.'}
              </Text>
            </View>
            {unrestricted === false ? (
              <Text style={[type.callout, { color: colors.textSecondary }]}>Open the battery settings, find Voxa, and choose Don’t optimise, Unrestricted or Allow.</Text>
            ) : null}
            <Button label="Open battery settings" onPress={() => battery.open(unrestricted === false ? 'optimisation' : 'app')} primary={unrestricted === false} />
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[type.overline, { color: colors.textTertiary }]} accessibilityRole="header">
            {guide.strict ? `Also on ${guide.brand} phones` : `On ${guide.brand}`}
          </Text>
          {guide.steps.map((step, i) => (
            <View key={step} style={styles.step}>
              <Text style={[type.bodyStrong, { color: colors.accentText, width: 22 }]}>{i + 1}</Text>
              <Text style={[type.callout, { color: colors.text, flex: 1 }]}>{step}</Text>
            </View>
          ))}
          <Text style={[type.caption, { color: colors.textTertiary }]}>Menu names differ a little between phone versions.</Text>
          {battery.android ? <Button label="Open Voxa’s app settings" onPress={() => battery.open('app')} /> : null}
        </View>

        <Text style={[type.caption, { color: colors.textTertiary }]}>
          Listening uses about as much battery as a phone call. Plug in for long meetings if you can.
        </Text>
      </ScrollView>
    </View>
  );
}

function Button({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, { backgroundColor: primary ? colors.primaryFill : colors.chip, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[type.callout, { color: primary ? colors.onPrimary : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  iconBtn: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.card, padding: 16, gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { flexDirection: 'row', gap: 8 },
  button: { alignItems: 'center', justifyContent: 'center', minHeight: minTouch + 4, borderRadius: radius.pill, paddingHorizontal: 18 },
});
