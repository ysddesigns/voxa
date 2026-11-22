import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Group, LargeTitle, NavBar, Page } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { minTouch, radius, squircle } from '@/design/tokens';
import { type } from '@/design/type';
import { LIBRARIES, licenceText, MODELS, type Credit } from '@/features/settings/licences';

/** Open-source licences: every model and library Voxa ships, with its notice and licence text. */
export default function LicencesScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavBar back="Settings" />
      <Page>
        <View style={{ gap: 8 }}>
          <LargeTitle>Licences</LargeTitle>
          <Text style={[type.subheadline, { color: colors.textSecondary, paddingHorizontal: 4 }]}>
            Voxa is built on work that others share openly. Thank you to everyone below. Tap a name to read its notice and licence.
          </Text>
        </View>
        <Group header="Models and engines">
          {MODELS.map((c) => (
            <Item key={c.name} credit={c} />
          ))}
        </Group>
        <Group header="App libraries" footer="These libraries also include smaller open-source packages under the MIT and similar licences.">
          {LIBRARIES.map((c) => (
            <Item key={c.name} credit={c} />
          ))}
        </Group>
      </Page>
    </View>
  );
}

function Item({ credit }: { credit: Credit }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${credit.name}, ${credit.licence}`}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.chipPressed }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.body, { color: colors.text }]}>{credit.name}</Text>
          {credit.what ? <Text style={[type.footnote, { color: colors.textSecondary }]}>{credit.what}</Text> : null}
        </View>
        <Text style={[type.footnote, { color: colors.textSecondary, maxWidth: 110, textAlign: 'right' }]}>{credit.licence}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevronDown" size={14} color={colors.textTertiary} strokeWidth={2.4} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.detail}>
          {credit.copyright.map((line) => (
            <Text key={line} style={[type.footnote, { color: colors.text }]} selectable>
              {line}
            </Text>
          ))}
          {credit.url ? (
            <Pressable onPress={() => void Linking.openURL(credit.url!)} accessibilityRole="link" style={{ minHeight: minTouch, justifyContent: 'center' }}>
              <Text style={[type.footnote, { color: colors.accentText }]}>{credit.url}</Text>
            </Pressable>
          ) : null}
          {credit.text ? (
            <Text style={[styles.licence, { color: colors.textSecondary, backgroundColor: colors.background }]} selectable>
              {licenceText(credit.text)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: minTouch, paddingHorizontal: 16, paddingVertical: 11 },
  detail: { gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  licence: { ...type.caption, fontSize: 11, lineHeight: 15, padding: 12, borderRadius: radius.input, ...squircle },
});
