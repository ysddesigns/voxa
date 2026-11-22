import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { ProgressWave } from '@/components/progress-wave';
import { Button, NavBar } from '@/components/ui';
import { VoiceAvatar } from '@/components/voice-avatar';
import { useTheme } from '@/design/theme';
import { elevation, minTouch, radius, squircle } from '@/design/tokens';
import { type } from '@/design/type';
import { durationMs, formatSpeed, formatTime } from '@/features/speak/playback';
import { useSpeakSession } from '@/features/speak/speak-session';
import { openDocument } from '@/features/speak/open-document';
import { insertPause, sayAsKey, sayAsWordAt, STYLE_LABEL, toggleEmphasis, type Selection } from '@/features/speak/script';
import { useVoices } from '@/features/voices/voices-store';

/** Speak for me: script editor with a live preview bar (canvas "Editor"). */
export default function Editor() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useSpeakSession();
  const { byId } = useVoices();
  // voxa://editor?text=... opens the editor with that text (deep links, share-to-Voxa later).
  const { text: incoming, open } = useLocalSearchParams<{ text?: string; open?: string }>();
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
  const [sel, setSel] = useState<Selection>({ start: 0, end: 0 });
  // Set only right after a toolbar edit; a cursor controlled all the time jumps while typing on Android.
  const [forcedSel, setForcedSel] = useState<Selection | undefined>(undefined);
  const [hint, setHint] = useState<string | null>(null);
  const [sayAsWord, setSayAsWord] = useState<string | null>(null);

  const apply = (edit: { text: string; selection: Selection } | null, why: string) => {
    if (!edit) {
      setHint(why);
      return;
    }
    setHint(null);
    s.setText(edit.text);
    setSel(edit.selection);
    setForcedSel(edit.selection);
  };
  const [reading, setReading] = useState<number | null>(null);
  const openFile = async () => {
    setHint(null);
    setReading(0);
    try {
      const doc = await openDocument((f) => setReading(f));
      if (!doc) return;
      const put = (t: string) => {
        s.setText(t);
        setForcedSel({ start: t.length, end: t.length });
        setHint(doc.note);
      };
      if (!s.text.trim()) put(doc.text);
      else
        Alert.alert(`Add “${doc.name}”?`, 'Replace the script, or add the file to the end?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add to end', onPress: () => put(`${s.text.trimEnd()}\n\n${doc.text}`) },
          { text: 'Replace', style: 'destructive', onPress: () => put(doc.text) },
        ]);
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(null);
    }
  };
  // voxa://editor?open=file (the Home screen's Files button) opens the file picker once.
  const opened = useRef(false);
  useEffect(() => {
    if (open !== 'file' || opened.current) return;
    opened.current = true;
    const t = setTimeout(() => void openFile(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openSayAs = () => {
    const word = sayAsWordAt(s.text, sel);
    if (!word) setHint('Tap a word in the script first, then Say as.');
    else {
      setHint(null);
      setSayAsWord(word);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <NavBar
        back="Home"
        title={s.title}
        right={
          <Pressable
            onPress={() => router.push('/player')}
            disabled={!hasText}
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasText }}
            hitSlop={8}
            style={({ pressed }) => [styles.navRight, pressed && { opacity: 0.4 }]}
          >
            <Text style={[type.headline, { color: hasText ? colors.accentText : colors.textTertiary }]}>Player</Text>
          </Pressable>
        }
      />

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
              <Text style={[type.headline, { color: colors.text }]}>{voice?.name ?? 'Pick a voice'}</Text>
              <Text style={[type.footnote, { color: colors.textSecondary }]} numberOfLines={1}>
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
            <Text maxFontSizeMultiplier={1.4} style={[type.headline, { color: colors.text }]}>{formatSpeed(s.rate)}</Text>
            <Text maxFontSizeMultiplier={1.4} style={[type.caption, { color: colors.textSecondary }]}>Speed</Text>
          </Pressable>
        </View>

        {!showingPlayback ? (
          <View style={{ gap: 6 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.tools}>
              <Tool icon="library" label={reading !== null ? 'Reading…' : 'Open file'} hint="Adds text from a .txt, Word or PDF file" onPress={() => void openFile()} />
              <Tool
                icon="pause"
                label="Pause"
                hint="Adds a short pause at the cursor. Press and hold for a long pause."
                onPress={() => apply(insertPause(s.text, sel), '')}
                onLongPress={() => apply(insertPause(s.text, sel, true), '')}
              />
              <Tool
                icon="flag"
                label="Emphasis"
                hint="Stresses the word at the cursor, or the selected words. Tap again to remove."
                onPress={() => apply(toggleEmphasis(s.text, sel), 'Tap a word or select some words first, then Emphasis.')}
              />
              <Tool icon="speaker" label="Say as" hint="Tells Voxa how to say the word at the cursor" onPress={openSayAs} />
              <Tool icon="wave" label={`Style: ${STYLE_LABEL[s.style]}`} hint="Changes the reading style: Neutral, Warm, Upbeat or Slow" onPress={s.cycleStyle} />
            </ScrollView>
            <Text style={[type.footnote, { color: hint ? colors.accentText : colors.textSecondary, paddingHorizontal: 4 }]} accessibilityLiveRegion="polite">
              {reading !== null && reading > 0
                ? `Reading the PDF… ${Math.round(reading * 100)}%`
                : hint || 'Write *word* to stress it, and [pause] for a pause.'}
            </Text>
          </View>
        ) : null}

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
              selection={forcedSel}
              onSelectionChange={(e) => {
                setSel(e.nativeEvent.selection);
                setForcedSel(undefined);
              }}
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
            {s.error && (
              <Text style={[type.caption, { color: colors.accentText }]} accessibilityLiveRegion="polite">
                {`Couldn't play: ${s.error}`}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.preview,
          { backgroundColor: colors.card, bottom: Math.max(insets.bottom, 12) + 10, ...elevation(colors.shadow) },
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

      <SayAsSheet word={sayAsWord} onClose={() => setSayAsWord(null)} />
    </KeyboardAvoidingView>
  );
}

function Tool({ icon, label, hint, onPress, onLongPress }: { icon: IconName; label: string; hint: string; onPress: () => void; onLongPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.tool, { backgroundColor: pressed ? colors.chipPressed : colors.card, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <Icon name={icon} size={16} color={colors.text} />
      <Text style={[type.subheadline, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** "Say as": how Voxa should say a word, saved for every script and quick phrase. */
function SayAsSheet({ word, onClose }: { word: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSpeakSession();
  const saved = word ? s.sayAs[sayAsKey(word)] : undefined;
  const [sound, setSound] = useState('');
  const [shownFor, setShownFor] = useState<string | null>(null);
  // Fill the box when the sheet opens for a word.
  if (word !== shownFor) {
    setShownFor(word);
    setSound(saved ?? '');
  }
  const save = async (value: string) => {
    if (word) await s.setSayAs(word, value);
    onClose();
  };
  return (
    <Modal visible={!!word} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sayAs, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grabber, { backgroundColor: colors.chipPressed }]} />
          <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
            How should Voxa say “{word}”?
          </Text>
          <Text style={[type.subheadline, { color: colors.textSecondary }]}>
            Write it the way it sounds, with hyphens between parts. For example Nnamdi → Nahm-dee, NEPA → nee-pah.
          </Text>
          <TextInput
            value={sound}
            onChangeText={setSound}
            placeholder="Sounds like…"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            autoCorrect={false}
            accessibilityLabel={`How to say ${word ?? ''}`}
            style={[type.body, styles.sayAsInput, { color: colors.text, backgroundColor: colors.chip }]}
          />
          <View style={styles.sayAsActions}>
            <Button label="Try It" kind="gray" icon="play" onPress={() => s.trySound(sound || word || '')} style={{ flexGrow: 1 }} />
            {saved ? <Button label="Remove" kind="gray" onPress={() => void save('')} style={{ flexGrow: 1 }} /> : null}
            <Button label="Save" disabled={!sound.trim()} onPress={() => void save(sound)} style={{ flexGrow: 1 }} />
          </View>
          <Text style={[type.footnote, { color: colors.textSecondary }]}>Saved on this phone and used everywhere Voxa speaks.</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  navRight: { height: minTouch, justifyContent: 'center', paddingHorizontal: 8 },
  voiceRow: { flexDirection: 'row', gap: 8 },
  voiceChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.card, ...squircle, paddingVertical: 8, paddingLeft: 8, paddingRight: 12 },
  speed: { width: 76, borderRadius: radius.card, ...squircle, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: radius.tile, ...squircle, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 14 },
  script: { fontFamily: type.body.fontFamily, fontSize: 20, lineHeight: 32 },
  input: { minHeight: 220, padding: 0 },
  sheetFoot: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  preview: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 92,
    borderRadius: radius.card,
    ...squircle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingLeft: 14,
    paddingRight: 18,
  },
  previewPlay: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  tools: { gap: 8, paddingHorizontal: 2 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: minTouch, borderRadius: radius.pill, paddingHorizontal: 14 },
  sayAs: { borderTopLeftRadius: radius.hero, borderTopRightRadius: radius.hero, ...squircle, padding: 20, paddingTop: 8, gap: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: radius.pill, marginBottom: 8 },
  sayAsInput: { minHeight: minTouch + 4, borderRadius: radius.input, ...squircle, paddingHorizontal: 14 },
  sayAsActions: { flexDirection: 'row', gap: 8 },
  tabular: { fontVariant: ['tabular-nums'] },
});
