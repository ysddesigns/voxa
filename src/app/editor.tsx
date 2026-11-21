import { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { ProgressWave } from '@/components/progress-wave';
import { VoiceAvatar } from '@/components/voice-avatar';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { durationMs, formatSpeed, formatTime } from '@/features/speak/playback';
import { useSpeakSession } from '@/features/speak/speak-session';
import { useVoices } from '@/features/voices/voices-store';

/** Speak for me: script editor with a live preview bar (canvas "Editor"). */
export default function Editor() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useSpeakSession();
  const { byId } = useVoices();
  // voxa://editor?text=... opens the editor with that text (deep links, share-to-Voxa later).
  const { text: incoming } = useLocalSearchParams<{ text?: string }>();
  const { setText } = s;
  const applied = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!incoming || applied.current === incoming) return;
    applied.current = incoming;
    setText(incoming);
  }, [incoming, setText]);
  const voice = byId(s.voiceId);
  const hasText = s.words.length > 0;
  const showingPlayback = s.status !== 'idle';
  const current = s.words[s.wordIndex];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.nav, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to Home" style={styles.back}>
          <Icon name="chevronLeft" color={colors.accentText} strokeWidth={2.2} />
          <Text style={[type.callout, { color: colors.accentText, fontSize: 17 }]}>Home</Text>
        </Pressable>
        <Text numberOfLines={1} style={[type.bodyStrong, styles.navTitle, { color: colors.text, fontSize: 17 }]}>
          {s.title}
        </Text>
        <Pressable
          onPress={() => router.push('/player')}
          disabled={!hasText}
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasText }}
          style={styles.navRight}
        >
          <Text style={[type.bodyStrong, { color: hasText ? colors.accentText : colors.textTertiary, fontSize: 17 }]}>Player</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 140, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.voiceRow}>
          <Pressable
            onPress={() => router.push('/voice-picker')}
            accessibilityRole="button"
            accessibilityLabel={`Voice: ${voice?.name ?? 'none'}. Change voice`}
            style={[styles.voiceChip, { backgroundColor: colors.card }]}
          >
            <VoiceAvatar name={voice?.name ?? '?'} />
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: colors.text, fontSize: 15 }]}>{voice?.name ?? 'Pick a voice'}</Text>
              <Text style={[type.caption, { color: colors.textTertiary, fontSize: 12 }]} numberOfLines={1}>
                {voice ? voice.tags.slice(0, 2).join(' · ') : 'No voice installed'}
              </Text>
            </View>
            <Icon name="chevronDown" size={16} color={colors.text} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={s.cycleRate}
            accessibilityRole="button"
            accessibilityLabel={`Speed ${formatSpeed(s.rate)}. Change speed`}
            style={[styles.speed, { backgroundColor: colors.card }]}
          >
            <Text maxFontSizeMultiplier={1.4} style={[type.bodyStrong, { color: colors.text, fontSize: 15 }]}>{formatSpeed(s.rate)}</Text>
            <Text maxFontSizeMultiplier={1.4} style={[type.caption, { color: colors.textTertiary, fontSize: 11 }]}>Speed</Text>
          </Pressable>
        </View>

        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          {showingPlayback && current ? (
            <Pressable
              onPress={s.stop}
              accessibilityRole="button"
              accessibilityHint="Stops playback so you can edit"
            >
              <Text style={[styles.script, { color: colors.text }]}>
                {s.text.slice(0, current.start)}
                <Text style={{ backgroundColor: colors.highlight, color: colors.text }}>{s.text.slice(current.start, current.end)}</Text>
                {s.text.slice(current.end)}
              </Text>
            </Pressable>
          ) : (
            <TextInput
              value={s.text}
              onChangeText={s.setText}
              placeholder="Type what you want to say"
              placeholderTextColor={colors.textTertiary}
              multiline
              autoFocus={!hasText}
              textAlignVertical="top"
              accessibilityLabel="Script"
              style={[styles.script, styles.input, { color: colors.text }]}
            />
          )}
          <View style={[styles.sheetFoot, { borderTopColor: colors.separator }]}>
            <Text style={[type.caption, { color: colors.textTertiary }]}>
              {s.words.length} {s.words.length === 1 ? 'word' : 'words'} · about {formatTime(durationMs(s.words.length, s.rate))}
            </Text>
            <View style={styles.offline}>
              <Icon name="check" size={13} color={colors.accent} onColor={colors.onAccent} />
              <Text style={[type.caption, { color: colors.textTertiary }]}>Works offline</Text>
            </View>
            {s.error && (
              <Text style={[type.caption, { color: colors.warning }]} accessibilityLiveRegion="polite">
                {`Couldn't play: ${s.error}`}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.preview,
          { backgroundColor: colors.card, bottom: Math.max(insets.bottom, 12) + 10, shadowColor: '#000' },
        ]}
      >
        <Pressable
          onPress={s.toggle}
          disabled={!hasText}
          accessibilityRole="button"
          accessibilityLabel={s.status === 'playing' ? 'Pause preview' : 'Play preview'}
          accessibilityState={{ disabled: !hasText }}
          style={[styles.previewPlay, { backgroundColor: hasText ? colors.primaryFill : colors.chip }]}
        >
          <Icon name={s.status === 'playing' ? 'pause' : 'play'} size={22} color={hasText ? colors.onPrimary : colors.textTertiary} />
        </Pressable>
        <View style={{ flex: 1, gap: 6 }}>
          <ProgressWave
            progress={s.progress}
            height={34}
            barWidth={2.5}
            gap={2.5}
            seed={0.9}
            onSeek={hasText ? s.seekFraction : undefined}
            valueText={`${formatTime(s.positionMs)} of ${formatTime(s.durationMs)}`}
          />
          <View style={styles.times}>
            <Text style={[type.caption, styles.tabular, { color: colors.textTertiary }]}>{formatTime(s.positionMs)}</Text>
            <Text style={[type.caption, { color: colors.textTertiary }]}>Preview · on-device</Text>
            <Text style={[type.caption, styles.tabular, { color: colors.textTertiary }]}>{formatTime(s.durationMs)}</Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: minTouch, paddingHorizontal: 6, minWidth: 90 },
  navTitle: { flex: 1, textAlign: 'center' },
  navRight: { minWidth: 90, height: minTouch, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 8 },
  voiceRow: { flexDirection: 'row', gap: 8 },
  voiceChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, paddingVertical: 8, paddingLeft: 8, paddingRight: 12 },
  speed: { width: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: radius.tile, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 14 },
  script: { fontFamily: type.body.fontFamily, fontSize: 20, lineHeight: 32 },
  input: { minHeight: 220, padding: 0 },
  sheetFoot: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  preview: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 92,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingLeft: 14,
    paddingRight: 18,
    elevation: 10,
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 12 },
  },
  previewPlay: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  tabular: { fontVariant: ['tabular-nums'] },
});
