import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { ModelRow } from '@/components/model-row';
import { OnAirSign } from '@/components/scene/on-air-sign';
import { PaperShadow } from '@/components/scene/shadows';
import { Screen } from '@/components/screen';
import { Card, Group, ListRow } from '@/components/ui';
import { announce, useScreenReader } from '@/design/a11y';
import { useSceneQuality } from '@/design/scene';
import { useTheme } from '@/design/theme';
import { minTouch, radius, squircle } from '@/design/tokens';
import { sceneType, type } from '@/design/type';
import { useEngines } from '@/engines/provider';
import { useListen } from '@/features/listen/listen-session';
import { useModels } from '@/features/packs/models';
import { usePrefs } from '@/features/settings/prefs';
import { shouldShowTip } from '@/features/settings/battery-guide';
import { useBattery } from '@/features/settings/use-battery';
import { formatClock } from '@/features/listen/format';
import { VoxaEngine } from '../../../modules/voxa-engine';
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

type ListenModel = 'kroko' | 'omnilingual';

/**
 * Before listening: the studio's ON AIR sign (off), one big Start button, the language choice
 * when there is one, and a single line of reassurance. Everything else (marks, speaker labels)
 * explains itself on the next screen.
 */
function Ready() {
  const { colors } = useTheme();
  const { rich } = useSceneQuality();
  const router = useRouter();
  const l = useListen();
  const models = useModels();
  const { speech } = useEngines();
  // The listening model takes several seconds to load: start now so tapping Listen is quick.
  const listenReady = models.ready.listen;
  const [modelState, setModelState] = useState(() => VoxaEngine?.modelStatus?.() ?? null);
  const [tuning, setTuning] = useState(() => VoxaEngine?.listenTuning?.() ?? null);

  useEffect(() => {
    if (listenReady) speech.warmUp?.();
  }, [listenReady, speech]);

  // Re-read which models are on the phone once the listening model finishes loading (during
  // render, not in an effect, so it lands in the same pass).
  const [statusFor, setStatusFor] = useState(listenReady);
  if (statusFor !== listenReady) {
    setStatusFor(listenReady);
    setModelState(VoxaEngine?.modelStatus?.() ?? null);
  }

  const model: ListenModel = modelState?.activeListenModel === 'omnilingual' ? 'omnilingual' : 'kroko';
  const chooseModel = (next: ListenModel) => {
    if (next === model || !VoxaEngine?.setListenTuning) return;
    const updated = VoxaEngine.setListenTuning({
      beam: tuning?.beam ?? true,
      gain: tuning?.gain ?? true,
      vadThreshold: tuning?.vadThreshold ?? 0.35,
      pauseMs: tuning?.pauseMs ?? 1200,
      gate: tuning?.gate ?? true,
      words: tuning?.words ?? true,
      wordsScore: tuning?.wordsScore ?? 1.3,
      model: next,
    });
    setTuning(updated);
    setModelState(VoxaEngine.modelStatus?.() ?? null);
  };

  const start = () => {
    l.clearError();
    void l.start();
  };

  return (
    <Screen title="Live">
      {l.recovered.length > 0 ? (
        <Group footer="Voxa closed while listening. Everything heard up to then was saved.">
          <ListRow
            icon="flag"
            tint
            title={l.recovered.length === 1 ? 'A meeting was interrupted' : `${l.recovered.length} meetings were interrupted`}
            subtitle={l.recovered.length === 1 ? 'Tap to open it' : 'Tap to see them in Library'}
            onPress={() => {
              const one = l.recovered.length === 1 ? l.recovered[0].id : null;
              l.dismissRecovered();
              if (one) router.push({ pathname: '/session/[id]', params: { id: one } });
              else router.navigate('/library');
            }}
          />
        </Group>
      ) : null}

      {listenReady ? (
        <View style={styles.ready}>
          {modelState?.hasOmnilingual ? (
            <Segmented
              label="Language"
              value={model}
              onChange={chooseModel}
              options={[
                { value: 'kroko', label: 'English' },
                { value: 'omnilingual', label: 'Nigerian languages', hint: 'Hausa, Yoruba, Igbo and Pidgin' },
              ]}
            />
          ) : null}

          {/* Off until Voxa listens; it lights on the next screen. */}
          <View style={styles.sign}>
            <OnAirSign lit={false} rich={rich} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start listening"
            accessibilityHint="No internet needed. Audio stays on this phone."
            onPress={start}
            style={({ pressed }) => [styles.start, { backgroundColor: colors.accent, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
          >
            <Icon name="mic" size={44} color={colors.onAccent} strokeWidth={2.2} />
          </Pressable>
          <View style={styles.startText} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={[type.headline, { color: colors.text }]}>Start listening</Text>
            <Text style={[type.footnote, { color: colors.textSecondary, textAlign: 'center' }]}>
              {model === 'omnilingual' ? 'Hausa, Yoruba, Igbo and Pidgin. ' : ''}No internet needed. Audio stays on this phone.
            </Text>
          </View>
        </View>
      ) : (
        <Card style={{ padding: 20, gap: 10 }}>
          <Text style={[type.headline, { color: colors.text }]}>One download, then Live works offline</Text>
          <ModelRow id="listen" title="Listening" what="Live captions" />
        </Card>
      )}

      {l.error ? (
        <View style={[styles.error, { backgroundColor: colors.warning }]} accessibilityLiveRegion="polite">
          <Text style={[type.subheadline, { color: colors.accentText, flex: 1 }]}>{l.error}</Text>
          {listenReady ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={start} style={styles.errorAction}>
              <Text style={[type.subheadline, { color: colors.accentText, fontFamily: type.headline.fontFamily }]}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <BatteryTip />
    </Screen>
  );
}

/** A two-way choice in the iOS segmented style: a grey track with the chosen option raised. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: colors.chip }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityHint={o.hint}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: colors.card, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }]}
          >
            <Text style={[type.subheadline, { color: colors.text, fontFamily: on ? type.headline.fontFamily : type.subheadline.fontFamily }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  // Captions follow new words while the reader is at the bottom; scrolling up stops that
  // until they come back down or tap Jump to latest.
  const following = useRef(true);
  const jumping = useRef(false);
  const [follow, setFollow] = useState(true);
  const screenReader = useScreenReader();
  const { prefs } = usePrefs();
  const { rich, motion } = useSceneQuality();

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

  const data = useMemo(() => rows(l.segments, l.marks, l.partial), [l.segments, l.marks, l.partial]);
  const paused = l.status === 'paused';
  const busy = l.status === 'starting' || l.status === 'stopping';

  const setFollowing = (v: boolean) => {
    following.current = v;
    setFollow(v);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
    if (jumping.current) {
      // Ignore the in-between positions of the Jump to latest scroll.
      if (atBottom) jumping.current = false;
      return;
    }
    if (atBottom !== following.current) setFollowing(atBottom);
  };
  const jumpToLatest = () => {
    jumping.current = true;
    setFollowing(true);
    list.current?.scrollToEnd({ animated: true });
  };

  const stop = async () => {
    const id = await l.stop();
    if (id) announce('Meeting saved');
    if (id) router.push({ pathname: '/session/[id]', params: { id } });
  };
  // Stopping ends the meeting for good, so it asks first.
  const confirmStop = () =>
    Alert.alert('End and save this meeting?', 'Voxa stops listening and saves what it heard.', [
      { text: 'Keep listening', style: 'cancel' },
      { text: 'End and save', onPress: () => void stop() },
    ]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
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
    },
    [colors],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      {/* The studio: the ON AIR sign lights while the microphone is on. The words say the state too. */}
      <View style={styles.head}>
        <OnAirSign lit={l.status === 'listening'} size="small" motion={motion} rich={rich} />
        <Text style={[sceneType.overline, { color: paused ? colors.textTertiary : colors.accentText, flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {l.status === 'starting' ? 'STARTING…' : l.status === 'stopping' ? 'SAVING…' : paused ? 'PAUSED' : 'LISTENING'}
        </Text>
        <Clock />
      </View>
      <Text style={[type.largeTitle, styles.title, { color: colors.text }]} accessibilityRole="header" numberOfLines={2}>
        {l.title}
      </Text>

      <Level paused={paused || busy} />

      {/* The captions on a plain sheet of paper: nothing drawn over the words. */}
      <View style={styles.sheetWrap}>
        <PaperShadow rich={rich} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <FlatList
            ref={list}
            style={{ flex: 1 }}
            accessibilityLabel="Captions"
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}
            data={data}
            keyExtractor={(r, i) => (r.kind === 'seg' ? r.seg.id : r.kind === 'mark' ? `m${r.n}` : `p${i}`)}
            // Jump, not glide: words arrive several times a second, and an animated scroll each
            // time keeps the list always mid-animation on a slow phone.
            onContentSizeChange={() => following.current && list.current?.scrollToEnd({ animated: false })}
            onScroll={onScroll}
            scrollEventThrottle={100}
            ListEmptyComponent={
              <Text style={[type.body, { color: colors.textTertiary }]}>
                {busy ? 'Getting the microphone ready…' : paused ? 'Paused. Nothing is being heard.' : 'Listening… words appear here as people speak.'}
              </Text>
            }
            renderItem={renderItem}
          />
          {!follow && data.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jump to latest"
              accessibilityHint="Scrolls to the newest words and follows them again"
              onPress={jumpToLatest}
              style={({ pressed }) => [styles.jump, { backgroundColor: colors.primaryFill, opacity: pressed ? 0.8 : 1 }]}
            >
              <Icon name="chevronDown" size={18} color={colors.onPrimary} />
              <Text style={[type.subheadline, { color: colors.onPrimary, fontFamily: type.headline.fontFamily }]}>Jump to latest</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {l.error ? <Text style={[type.caption, { color: colors.accentText, paddingHorizontal: 20 }]}>{l.error}</Text> : null}

      {/* Mark is what people tap mid-meeting, so it is the big one in the middle. Stop is rare
          and final: a plain button at the side that asks first. */}
      <View style={[styles.controls, { paddingBottom: Platform.OS === 'ios' ? insets.bottom + 8 : insets.bottom + 96 }]}>
        <Control icon="stop" label="Stop" disabled={busy} onPress={confirmStop} />
        <Control icon="flag" label="Mark" primary disabled={busy || paused} onPress={() => l.mark()} />
        <Control
          icon={paused ? 'play' : 'pause'}
          label={paused ? 'Resume' : 'Pause'}
          disabled={busy}
          onPress={() => void (paused ? l.resume() : l.pause())}
        />
      </View>
    </View>
  );
}

/** The listened time, ticking on its own so the rest of the screen does not redraw with it. */
function Clock() {
  const { colors } = useTheme();
  const l = useListen();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const clock = formatClock(l.elapsedMs());
  return (
    <Text style={[type.heading, { color: colors.text, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`Listened for ${clock}`}>
      {clock}
    </Text>
  );
}

const BARS = 24;
const BAR_SHAPE = Array.from({ length: BARS }, (_, i) => 0.35 + 0.65 * Math.sin(((i + 0.5) / BARS) * Math.PI));

/**
 * The mic level meter. Levels arrive many times a second, straight from the recorder into an
 * animated value, so no React render happens for them.
 */
function Level({ paused }: { paused: boolean }) {
  const { colors } = useTheme();
  const { onLevel } = useListen();
  const v = useSharedValue(0);
  useEffect(
    () =>
      onLevel((rms) => {
        // rms of speech is roughly 0.01-0.3: show it on a log scale so quiet rooms still move.
        const x = rms <= 0 ? 0 : Math.max(0, Math.min(1, (Math.log10(rms) + 2.5) / 2));
        v.set(withTiming(x, { duration: 90 }));
      }),
    [onLevel, v],
  );
  useEffect(() => {
    if (paused) v.set(withTiming(0, { duration: 150 }));
  }, [paused, v]);
  return (
    <View style={styles.level} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {BAR_SHAPE.map((shape, i) => (
        <LevelBar key={i} v={v} shape={shape} color={paused ? colors.waveUnplayed : colors.accent} />
      ))}
    </View>
  );
}

function LevelBar({ v, shape, color }: { v: SharedValue<number>; shape: number; color: string }) {
  const style = useAnimatedStyle(() => ({ height: 4 + 28 * v.get() * shape }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
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
        primary && styles.controlPrimary,
        { backgroundColor: primary ? colors.accent : pressed ? colors.chipPressed : colors.card, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] },
      ]}
    >
      <Icon name={icon} size={primary ? 26 : 22} color={primary ? colors.onAccent : colors.text} />
      <Text style={[primary ? type.headline : type.subheadline, { color: primary ? colors.onAccent : colors.text, fontFamily: type.headline.fontFamily }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  title: { paddingHorizontal: 20, marginTop: 10 },
  sheetWrap: { flex: 1, marginHorizontal: 16, marginTop: 4 },
  sheet: { flex: 1, borderRadius: 3, overflow: 'hidden' },
  sign: { marginTop: 12, marginBottom: 4 },
  ready: { alignItems: 'center', gap: 20, paddingTop: 8, paddingBottom: 8 },
  start: { width: 120, height: 120, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  startText: { alignItems: 'center', gap: 4, marginTop: -6, paddingHorizontal: 24 },
  track: { flexDirection: 'row', alignSelf: 'stretch', borderRadius: radius.pill, padding: 3 },
  segment: { flex: 1, minHeight: minTouch - 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.card, ...squircle, paddingLeft: 16, paddingVertical: 4 },
  errorAction: { minHeight: minTouch, paddingHorizontal: 16, justifyContent: 'center' },
  level: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 36, paddingHorizontal: 20, marginTop: 12 },
  bar: { flex: 1, borderRadius: 2 },
  jump: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: minTouch, paddingHorizontal: 16, borderRadius: radius.pill },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 4 },
  controls: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10 },
  control: { flex: 1, minHeight: minTouch + 16, borderRadius: radius.tile, ...squircle, alignItems: 'center', justifyContent: 'center', gap: 4 },
  controlPrimary: { flex: 1.6 },
});
