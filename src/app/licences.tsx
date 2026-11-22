import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { LIBRARIES, licenceText, MODELS, type Credit } from '@/features/settings/licences';

/** Open-source licences: every model and library Voxa ships, with its notice and licence text. */
export default function LicencesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.iconBtn, { backgroundColor: colors.chip }]}>
          <Icon name="chevronLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
          Open-source licences
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 8 }}>
        <Text style={[type.callout, { color: colors.textSecondary }]}>
          Voxa is built on work that others share openly. Thank you to everyone below. Tap a name to read its notice and licence.
        </Text>
        <Group title="Models and engines" credits={MODELS} />
        <Group title="App libraries" credits={LIBRARIES} />
        <Text style={[type.caption, { color: colors.textTertiary }]}>
          These libraries also include smaller open-source packages under the MIT and similar licences.
        </Text>
      </ScrollView>
    </View>
  );
}

function Group({ title, credits }: { title: string; credits: Credit[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8, marginTop: 12 }}>
      <Text style={[type.overline, { color: colors.textTertiary }]} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {credits.map((c, i) => (
          <Item key={c.name} credit={c} first={i === 0} />
        ))}
      </View>
    </View>
  );
}

function Item({ credit, first }: { credit: Credit; first: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={[!first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${credit.name}, ${credit.licence}`}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { color: colors.text }]}>{credit.name}</Text>
          {credit.what ? <Text style={[type.caption, { color: colors.textTertiary }]}>{credit.what}</Text> : null}
        </View>
        <Text style={[type.caption, { color: colors.textSecondary }]}>{credit.licence}</Text>
        <Icon name="chevronDown" size={16} color={colors.textTertiary} />
      </Pressable>
      {open ? (
        <View style={{ gap: 8, paddingBottom: 12 }}>
          {credit.copyright.map((line) => (
            <Text key={line} style={[type.caption, { color: colors.text }]} selectable>
              {line}
            </Text>
          ))}
          {credit.url ? (
            <Pressable onPress={() => void Linking.openURL(credit.url!)} accessibilityRole="link" style={{ minHeight: minTouch, justifyContent: 'center' }}>
              <Text style={[type.caption, { color: colors.accentText, textDecorationLine: 'underline' }]}>{credit.url}</Text>
            </Pressable>
          ) : null}
          {credit.text ? (
            <Text style={[styles.licence, { color: colors.textSecondary, backgroundColor: colors.chip }]} selectable>
              {licenceText(credit.text)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  iconBtn: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: minTouch + 8, paddingVertical: 6 },
  licence: { ...type.caption, fontSize: 11, lineHeight: 15, padding: 10, borderRadius: radius.icon },
});
