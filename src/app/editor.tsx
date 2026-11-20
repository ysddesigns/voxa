import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEngines } from '@/engines/provider';
import type { SpeakHandle } from '@/engines/types';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';

/** Speak for me editor (phase 1). Uses the mock voice engine for word-by-word highlighting. */
export default function Editor() {
  const { colors } = useTheme();
  const { voice } = useEngines();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [word, setWord] = useState<{ start: number; end: number } | null>(null);
  const handle = useRef<SpeakHandle | null>(null);

  const toggle = () => {
    if (handle.current) {
      handle.current.stop();
      handle.current = null;
      setWord(null);
      return;
    }
    if (!text.trim()) return;
    handle.current = voice.speak(text, { voiceId: 'lily' }, (e) => {
      if (e.type === 'word') setWord({ start: e.charStart, end: e.charEnd });
      if (e.type === 'end') {
        handle.current = null;
        setWord(null);
      }
    });
  };

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}>
          <Text style={[type.callout, { color: colors.accentText }]}>Close</Text>
        </Pressable>
        <Text style={[type.bodyStrong, { color: colors.text }]}>Speak for me</Text>
        <View style={styles.close} />
      </View>

      {word ? (
        <Text style={[type.title, styles.input, { color: colors.textTertiary }]}>
          {text.slice(0, word.start)}
          <Text style={{ color: colors.text, backgroundColor: colors.warning }}>{text.slice(word.start, word.end)}</Text>
          {text.slice(word.end)}
        </Text>
      ) : (
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type what you want to say"
          placeholderTextColor={colors.textTertiary}
          multiline
          autoFocus
          style={[type.title, styles.input, { color: colors.text }]}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={word ? 'Stop' : 'Speak'}
        onPress={toggle}
        style={[styles.play, { backgroundColor: colors.primaryFill }]}
      >
        <Text style={[type.bodyStrong, { color: colors.onPrimary }]}>{word ? 'Stop' : 'Speak'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { minWidth: 60, minHeight: minTouch, justifyContent: 'center' },
  input: { flex: 1, textAlignVertical: 'top' },
  play: { minHeight: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
