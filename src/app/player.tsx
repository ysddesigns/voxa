import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon, type IconName } from '@/components/icons';
import { ProgressWave } from '@/components/progress-wave';
import { Waveform } from '@/components/waveform';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { formatSpeed, formatTime } from '@/features/speak/playback';
import { useSpeakSession } from '@/features/speak/speak-session';
import { useVoices, voiceSubtitle } from '@/features/voices/voices-store';

/** Full-screen player for the current script (canvas "Player"). */
export default function Player() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useSpeakSession();
  const { byId } = useVoices();
  const voice = byId(s.voiceId);
  const playing = s.status === 'playing';
  const remaining = Math.max(0, s.durationMs - s.positionMs);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={[styles.grabber, { backgroundColor: colors.waveUnplayed }]} />
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close player" style={styles.iconBtn}>
          <Icon name="chevronDown" size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={[type.caption, { color: colors.textSecondary, fontFamily: type.bodyStrong.fontFamily }]}>Now playing</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={[styles.art, { backgroundColor: colors.art }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 342 300" preserveAspectRatio="none">
          <Path d="M0 230 C 80 190, 160 270, 240 230 S 320 200, 342 210 V300 H0z" fill={colors.accent} />
          <Path d="M38 44l14 8M36 68l14-4M56 38l2 12" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
        </Svg>
        <View style={[styles.bubble, { backgroundColor: colors.warning }]}>
          <Waveform bars={20} maxHeight={74} minHeight={10} barWidth={4} gap={4} color={colors.accent} breathe={playing} seed={1} />
        </View>
      </View>

      <View style={styles.body}>
        <View style={{ gap: 3 }}>
          <Text numberOfLines={1} style={[type.title, { color: colors.text }]}>{s.title}</Text>
          <Text style={[type.callout, { color: colors.textTertiary, fontFamily: type.body.fontFamily }]}>
            {voice ? `${voice.name} · ${voiceSubtitle(voice)}` : 'No voice'}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <ProgressWave
            progress={s.progress}
            height={64}
            barWidth={3}
            gap={3}
            seed={0.4}
            onSeek={s.words.length ? s.seekFraction : undefined}
            valueText={`${formatTime(s.positionMs)} of ${formatTime(s.durationMs)}`}
          />
          <View style={styles.times}>
            <Text style={[type.caption, styles.tabular, { color: colors.textTertiary }]}>{formatTime(s.positionMs)}</Text>
            <Text style={[type.caption, styles.tabular, { color: colors.textTertiary }]}>-{formatTime(remaining)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={s.cycleRate}
            accessibilityRole="button"
            accessibilityLabel={`Speed ${formatSpeed(s.rate)}. Change speed`}
            style={[styles.pill, { backgroundColor: colors.card }]}
          >
            <Text style={[type.bodyStrong, { color: colors.text, fontSize: 15 }]}>{formatSpeed(s.rate)}</Text>
          </Pressable>
          <RoundButton icon="back15" label="Back 15 seconds" onPress={() => s.skip(-15)} />
          <Pressable
            onPress={s.toggle}
            disabled={!s.words.length}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            style={[styles.play, { backgroundColor: colors.primaryFill, shadowColor: '#000' }]}
          >
            <Icon name={playing ? 'pause' : 'play'} size={32} color={colors.onPrimary} />
          </Pressable>
          <RoundButton icon="forward15" label="Forward 15 seconds" onPress={() => s.skip(15)} />
          <Pressable
            onPress={() => Share.share({ message: s.text })}
            disabled={!s.words.length}
            accessibilityRole="button"
            accessibilityLabel="Share text"
            style={[styles.pill, { backgroundColor: colors.card }]}
          >
            <Icon name="share" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.chips}>
          <Chip icon="speaker" text="Phone speaker" />
          <Chip icon="lock" text="Rendered on-device" />
        </View>
      </View>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.skip}>
      <Icon name={icon} size={34} color={colors.text} />
    </Pressable>
  );
}

function Chip({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: colors.card }]}>
      <Icon name={icon} size={15} color={colors.text} />
      <Text style={[type.caption, { color: colors.text, fontFamily: type.bodyStrong.fontFamily }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginHorizontal: -12 },
  iconBtn: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  art: { marginTop: 8, flex: 1, maxHeight: 300, minHeight: 180, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bubble: {
    width: 210,
    height: 128,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderBottomRightRadius: 34,
    borderBottomLeftRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { marginTop: 22, gap: 18 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  tabular: { fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { width: 52, height: minTouch, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  skip: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOpacity: 0.25,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 12 },
  },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill },
});
