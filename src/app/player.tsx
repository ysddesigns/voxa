import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { ProgressWave } from '@/components/progress-wave';
import { POSTER_RATIO, PosterSheet } from '@/components/rack/poster';
import { PosterArt } from '@/components/rack/poster-art';
import { useSceneQuality } from '@/design/scene';
import { useTheme } from '@/design/theme';
import { elevation, minTouch, radius, squircle } from '@/design/tokens';
import { type } from '@/design/type';
import { textScene } from '@/features/library-rack/poster-art';
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
  const [exporting, setExporting] = useState<number | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const cancelExport = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelExport.current?.(), []);
  const { rich, motion } = useSceneQuality();
  // The script's poster: a printed page from its text, the same paper every time it plays.
  const scene = useMemo(() => textScene(s.text), [s.text]);
  const [artH, setArtH] = useState(0);
  const posterH = Math.max(0, artH - 20);
  const posterW = Math.round(posterH / POSTER_RATIO);

  const shareAudio = async () => {
    if (s.status === 'playing') s.pause();
    setExportNote(null);
    setExporting(0);
    const job = s.startExport((f) => setExporting(f));
    cancelExport.current = job.cancel;
    try {
      const uri = await job.done;
      setExporting(null);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone');
      await Sharing.shareAsync(uri, { mimeType: 'audio/mp4', dialogTitle: 'Share audio' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== 'Cancelled') setExportNote(`Could not make the audio file: ${message}`);
    } finally {
      cancelExport.current = null;
      setExporting(null);
    }
  };
  const share = () => {
    if (!s.canExport) {
      void Share.share({ message: s.text });
      return;
    }
    Alert.alert('Share', 'Share the speech as an audio file, or the words as text.', [
      { text: 'Audio file (M4A)', onPress: () => void shareAudio() },
      { text: 'Text', onPress: () => void Share.share({ message: s.text }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={[styles.grabber, { backgroundColor: colors.waveUnplayed }]} />
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close player" style={styles.iconBtn}>
          <Icon name="chevronDown" size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={[type.footnote, { color: colors.textSecondary, fontFamily: type.headline.fontFamily }]}>Now Playing</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* The script as a poster, like a record sleeve: its light breathes while it is spoken. */}
      <View
        style={styles.art}
        onLayout={(e) => setArtH(Math.round(e.nativeEvent.layout.height))}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {posterH > 0 ? (
          <PosterSheet
            band={scene.band}
            overline={[playing ? 'SPEAKING' : s.status === 'paused' ? 'PAUSED' : 'READY', voice?.name.toUpperCase()].filter(Boolean).join(' · ')}
            dot={playing ? 'breathing' : 'still'}
            title={s.title}
            art={<PosterArt scene={scene} id="player" />}
            width={posterW}
            height={posterH}
            scale={posterW / 100}
            motion={motion}
            rich={rich}
          />
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={{ gap: 3 }}>
          <Text numberOfLines={2} style={[type.title, { color: colors.text }]}>{s.title}</Text>
          <Text style={[type.subheadline, { color: colors.textSecondary }]}>
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
            <Text maxFontSizeMultiplier={1.4} style={[type.subheadline, { color: colors.text, fontFamily: type.headline.fontFamily }]}>{formatSpeed(s.rate)}</Text>
          </Pressable>
          <RoundButton icon="back15" label="Back 15 seconds" onPress={() => s.skip(-15)} />
          <Pressable
            onPress={s.toggle}
            disabled={!s.words.length}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            style={({ pressed }) => [styles.play, { backgroundColor: colors.primaryFill, ...elevation(colors.shadow), transform: [{ scale: pressed ? 0.95 : 1 }] }]}
          >
            <Icon name={playing ? 'pause' : 'play'} size={32} color={colors.onPrimary} />
          </Pressable>
          <RoundButton icon="forward15" label="Forward 15 seconds" onPress={() => s.skip(15)} />
          <Pressable
            onPress={share}
            disabled={!s.words.length || exporting !== null}
            accessibilityRole="button"
            accessibilityLabel={s.canExport ? 'Share audio or text' : 'Share text'}
            style={[styles.pill, { backgroundColor: colors.card }]}
          >
            <Icon name="share" size={20} color={colors.text} />
          </Pressable>
        </View>

        {exporting !== null ? (
          <View style={[styles.exportRow, { backgroundColor: colors.card }]} accessibilityLiveRegion="polite">
            <Text style={[type.subheadline, { color: colors.text, flex: 1 }]}>Making the audio file… {Math.round(exporting * 100)}%</Text>
            <Pressable onPress={() => cancelExport.current?.()} accessibilityRole="button" style={styles.cancel}>
              <Text style={[type.headline, { color: colors.accentText }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : exportNote ? (
          <Text style={[type.footnote, { color: colors.accentText }]} accessibilityLiveRegion="polite">
            {exportNote}
          </Text>
        ) : null}

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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.skip, pressed && { opacity: 0.4, transform: [{ scale: 0.92 }] }]}>
      <Icon name={icon} size={34} color={colors.text} />
    </Pressable>
  );
}

function Chip({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: colors.chip }]}>
      <Icon name={icon} size={15} color={colors.textSecondary} />
      <Text style={[type.footnote, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: radius.pill },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginHorizontal: -12 },
  iconBtn: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  art: { marginTop: 8, flex: 1, maxHeight: 300, minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  body: { marginTop: 22, gap: 18 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  tabular: { fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { width: 52, height: minTouch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  skip: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  exportRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.group, ...squircle, paddingLeft: 16, paddingRight: 4, minHeight: minTouch + 8 },
  cancel: { minHeight: minTouch, justifyContent: 'center', paddingHorizontal: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill },
});
