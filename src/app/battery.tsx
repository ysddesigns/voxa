import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/icons';
import { ActionRow, Button, Group, LargeTitle, NavBar, Page, TextRow } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { type } from '@/design/type';
import { useBattery } from '@/features/settings/use-battery';

/** How to stop the phone's battery saver from ending Listen when the screen is off. */
export default function BatteryScreen() {
  const { colors } = useTheme();
  const battery = useBattery();
  const { guide, unrestricted } = battery;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavBar back="Settings" />
      <Page>
        <View style={{ gap: 8 }}>
          <LargeTitle>Screen-off listening</LargeTitle>
          <Text style={[type.subheadline, { color: colors.textSecondary, paddingHorizontal: 4 }]}>
            To save battery, some phones stop apps when the screen goes off. That can end Live captions mid-meeting. What was heard is saved, but the rest is missed.
          </Text>
        </View>

        {battery.android ? (
          <Group
            header="This phone"
            footer={unrestricted === false ? 'Find Voxa in the list and choose Don’t optimise, Unrestricted or Allow.' : undefined}
          >
            <TextRow>
              <View style={styles.status} accessibilityLiveRegion="polite">
                <Icon name={unrestricted ? 'check' : 'flag'} size={22} color={unrestricted ? colors.accent : colors.accentText} onColor={colors.onAccent} />
                <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                  {unrestricted === null
                    ? 'Update Voxa to check the battery setting.'
                    : unrestricted
                      ? 'Android lets Voxa run in the background.'
                      : 'Android may stop Voxa in the background.'}
                </Text>
              </View>
            </TextRow>
            <ActionRow label="Open battery settings" onPress={() => battery.open(unrestricted === false ? 'optimisation' : 'app')} />
          </Group>
        ) : null}

        <Group header={guide.strict ? `Also on ${guide.brand}` : `On ${guide.brand}`} footer="Menu names differ a little between phone versions.">
          {guide.steps.map((step, i) => (
            <TextRow key={step}>
              <View style={styles.step}>
                <View style={[styles.num, { backgroundColor: colors.chip }]}>
                  <Text style={[type.footnote, { color: colors.text, fontFamily: type.headline.fontFamily }]}>{i + 1}</Text>
                </View>
                <Text style={[type.subheadline, { color: colors.text, flex: 1 }]}>{step}</Text>
              </View>
            </TextRow>
          ))}
        </Group>

        {battery.android ? <Button label="Open Voxa’s App Settings" kind="gray" onPress={() => battery.open('app')} /> : null}

        <Text style={[type.footnote, { color: colors.textSecondary, paddingHorizontal: 16 }]}>
          Listening uses about as much battery as a phone call. Plug in for long meetings if you can.
        </Text>
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  step: { flexDirection: 'row', gap: 12, flex: 1, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
