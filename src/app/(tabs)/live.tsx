import { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { ModelRow } from '@/components/model-row';
import { Screen } from '@/components/screen';
import { Button, Card, Group, ListRow, TextRow } from '@/components/ui';
import { announce, useScreenReader } from '@/design/a11y';
import { useTheme } from '@/design/theme';
import { minTouch, radius, squircle } from '@/design/tokens';
import { type } from '@/design/type';
import { useEngines } from '@/engines/provider';
import { useListen } from '@/features/listen/listen-session';
import { useModels } from '@/features/packs/models';
import { usePrefs } from '@/features/settings/prefs';
import { shouldShowTip } from '@/features/settings/battery-guide';
import { useBattery } from '@/features/settings/use-battery';
import { formatClock } from '@/features/listen/format';
import type { TranscriptSegment } from '@/engines/types';
import type { Mark } from '@/storage/sessions';

/** Live captions (PRD LS-1..LS-6): words as they are heard, marks, pause, saved as it goes. */
export default function LiveScreen() {
  const l = useListen();
  const active = l.status !== 'idle';
  // Errors appear as text; screen-reader users hear them too.
  useEffect(() => {
    if (l.error) announce(l.error);
  }, [l.error]);
  return active ? <Listening /> : <Ready />;
}

function Ready() {
  const { colors } = useTheme();
  const router = useRouter();
  const l = useListen();
  const models = useModels();
  const { speech } = useEngines();
  // The listening model takes several seconds to load: start now so tapping Listen is quick.
  const listenReady = models.ready.listen;
  useEffect(() => {
    if (listenReady) speech.warmUp?.();
  }, [listenReady, speech]);
  return (
    <Screen title="Live" overline="Listen">
      {l.recovered.length > 0 ? (
        <Group footer="Voxa closed while listening. Everything heard up to then was saved.">
          <ListRow
            icon="flag"
            tint
            title={l.recovered.length === 1 ? 'A meeting was interrupted' : `${l.recovered.length} meetings were interrupted`}
            subtitle="Tap to open it"
            onPress={() => {
              const id = l.recovered[0].id;
              l.dismissRecovered();
              router.push({ pathname: '/session/[id]', params: { id } });
            }}
          />
        </Group>
      ) : null}

      <Card style={{ padding: 20, gap: 14 }}>
        <Text style={[type.heading, { color: colors.text }]}>Live captions</Text>
        <Text style={[type.subheadline, { color: colors.textSecondary }]}>
          Voxa writes down what it hears, on this phone, with no internet. It keeps listening with the screen off. Everything is saved as it goes.
        </Text>
        {models.ready.listen ? (
          <Button
            label="Start Listening"
            icon="mic"
            accent
            onPress={() => {
              l.clearError();
              void l.start();
            }}
          />
        ) : (
          <>
            <Text style={[type.subheadline, { color: colors.text }]}>First, a one-time download. After that Live works with no internet.</Text>
            <ModelRow id="listen" title="Listening" what="Live captions in English" />
          </>
        )}
      </Card>

      {l.error ? <Text style={[type.callout, { color: colors.accentText }]}>{l.error}</Text> : null}

      <BatteryTip />

      <Group header="Good to know">
        <Tip icon="flag" text="Tap Mark at an important moment to find it later." />
        <Tip icon="person" text="Speakers are labelled after the meeting ends." />
        <Tip icon="lock" text="Audio never leaves the phone and is deleted once speakers are labelled." />
      </Group>
    </Screen>
  );
}

/** Battery savers on many Android brands end Listen when the screen goes off: say how to stop it. */
function BatteryTip() {
  const { colors } = useTheme();
  const router = useRouter();
  const battery = useBattery();
  const { prefs, update } = usePrefs();
  if (!shouldShowTip({ android: battery.android, unrestricted: battery.unrestricted, strict: battery.guide.strict, dismissed: prefs.batteryTipDismissed })) return null;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 }}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/battery')} style={({ pressed }) => [{ flex: 1, gap: 2 }, pressed && { opacity: 0.6 }]}>
        <Text style={[type.headline, { color: colors.text }]}>Keep listening with the screen off</Text>
        <Text style={[type.footnote, { color: colors.textSecondary }]}>
          Your phone’s battery saver may stop Voxa mid-meeting. Tap to see the two-minute fix.
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hide this tip"
        onPress={() => update({ batteryTipDismissed: true })}
        style={{ width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="close" size={18} color={colors.textTertiary} />
      </Pressable>
    </Card>
  );
}

function Tip({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <TextRow>
      <View style={styles.tip}>
        <Icon name={icon} size={20} color={colors.accentText} />
        <Text style={[type.subheadline, { color: colors.text, flex: 1 }]}>{text}</Text>
      </View>
    </TextRow>
  );
}

type Row = { kind: 'seg'; seg: TranscriptSegment } | { kind: 'mark'; mark: Mark; n: number } | { kind: 'partial'; text: string };

function rows(segments: TranscriptSegment[], marks: Mark[], partial: string): Row[] {
  const out: Row[] = [];
  let m = 0;
  for (const seg of segments) {
    while (m < marks.length && marks[m].atMs <= seg.startMs) out.push({ kind: 'mark', mark: marks[m], n: ++m });
    out.push({ kind: 'seg', seg });
  }
  while (m < marks.length) out.push({ kind: 'mark', mark: marks[m], n: ++m });
  if (partial) out.push({ kind: 'partial', text: partial });
  return out;
}

function Listening() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const l = useListen();
  const list = useRef<FlatList<Row>>(null);
  const [, tick] = useState(0);
  const [follow, setFollow] = useState(true);
  const screenReader = useScreenReader();
  const { prefs } = usePrefs();

  // Tell screen-reader users what changed: the controls' look alone does not.
  useEffect(() => {
    if (l.status === 'listening') announce('Listening');
    else if (l.status === 'paused') announce('Paused. The microphone is off.');
    else if (l.status === 'stopping') announce('Saving');
  }, [l.status]);
  const markCount = l.marks.length;
  useEffect(() => {
    if (markCount > 0) announce(`Mark ${markCount} added`);
  }, [markCount]);
  // New sentences are read out only when the person asked for it in Settings.
  const lastSentence = l.segments[l.segments.length - 1];
  useEffect(() => {
    if (screenReader && prefs.readCaptions && lastSentence) announce(lastSentence.text);
  }, [screenReader, prefs.readCaptions, lastSentence]);

  // The clock reads the engine's listened time twice a second.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const data = rows(l.segments, l.marks, l.partial);
  const paused = l.status === 'paused';
  const busy = l.status === 'starting' || l.status === 'stopping';

  const stop = async () => {
    const id = await l.stop();
    if (id) announce('Meeting saved');
    if (id) router.push({ pathname: '/session/[id]', params: { id } });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[type.overline, { color: paused ? colors.textTertiary : colors.accentText }]}>
            {l.status === 'starting' ? 'Starting…' : l.status === 'stopping' ? 'Saving…' : paused ? 'Paused' : 'Listening'}
          </Text>
          <Text style={[type.title, { color: colors.text }]} accessibilityRole="header" numberOfLines={2}>
            {l.title}
          </Text>
        </View>
        <Text
          style={[type.heading, { color: colors.text, fontVariant: ['tabular-nums'] }]}
          accessibilityLabel={`Listened for ${formatClock(l.elapsedMs())}`}
        >
          {formatClock(l.elapsedMs())}
        </Text>
      </View>

      <Level level={paused ? 0 : l.level} />

      <FlatList
        ref={list}
        style={{ flex: 1 }}
        accessibilityLabel="Captions"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 10 }}
        data={data}
        keyExtractor={(r, i) => (r.kind === 'seg' ? r.seg.id : r.kind === 'mark' ? `m${r.n}` : `p${i}`)}
        onContentSizeChange={() => follow && list.current?.scrollToEnd({ animated: true })}
        onScrollBeginDrag={() => setFollow(false)}
        onMomentumScrollEnd={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          setFollow(contentOffset.y + layoutMeasurement.height >= contentSize.height - 40);
        }}
        ListEmptyComponent={
          <Text style={[type.body, { color: colors.textTertiary }]}>
            {busy ? 'Getting the microphone ready…' : paused ? 'Paused. Nothing is being heard.' : 'Listening… words appear here as people speak.'}
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === 'mark') {
            return (
              <View style={[styles.mark, { backgroundColor: colors.warning }]}>
                <Icon name="flag" size={14} color={colors.accentText} />
                <Text style={[type.caption, { color: colors.accentText }]}>
                  Mark {item.n} · {formatClock(item.mark.atMs)}
                </Text>
              </View>
            );
          }
          if (item.kind === 'partial') {
            return <Text style={[type.body, { color: colors.textTertiary }]}>{item.text}</Text>;
          }
          return <Text style={[type.body, { color: colors.text }]}>{item.seg.text}</Text>;
        }}
      />

      {l.error ? <Text style={[type.caption, { color: colors.accentText, paddingHorizontal: 20 }]}>{l.error}</Text> : null}

      <View style={[styles.controls, { paddingBottom: Platform.OS === 'ios' ? insets.bottom + 8 : insets.bottom + 96 }]}>
        <Control icon="flag" label="Mark" disabled={busy} onPress={() => l.mark()} />
        <Control
          icon={paused ? 'play' : 'pause'}
          label={paused ? 'Resume' : 'Pause'}
          disabled={busy}
          onPress={() => void (paused ? l.resume() : l.pause())}
        />
        <Control icon="stop" label="Stop" primary disabled={busy} onPress={() => void stop()} />
      </View>
    </View>
  );
}

function Level({ level }: { level: number }) {
  const { colors } = useTheme();
  // rms of speech is roughly 0.01-0.3: show it on a log scale so quiet rooms still move.
  const v = level <= 0 ? 0 : Math.max(0, Math.min(1, (Math.log10(level) + 2.5) / 2));
  const bars = 24;
  return (
    <View style={styles.level} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: bars }, (_, i) => {
        const shape = 0.35 + 0.65 * Math.sin(((i + 0.5) / bars) * Math.PI);
        return <View key={i} style={{ flex: 1, height: 4 + 28 * v * shape, borderRadius: 2, backgroundColor: v > 0 ? colors.accent : colors.waveUnplayed }} />;
      })}
    </View>
  );
}

function Control({ icon, label, onPress, primary, disabled }: { icon: IconName; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        { backgroundColor: primary ? colors.accent : pressed ? colors.chipPressed : colors.card, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] },
      ]}
    >
      <Icon name={icon} size={22} color={primary ? colors.onAccent : colors.text} />
      <Text style={[type.subheadline, { color: primary ? colors.onAccent : colors.text, fontFamily: type.headline.fontFamily }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 20 },
  tip: { flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 },
  level: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 36, paddingHorizontal: 20, marginTop: 12 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 4 },
  controls: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10 },
  control: { flex: 1, minHeight: minTouch + 16, borderRadius: radius.tile, ...squircle, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
