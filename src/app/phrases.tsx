import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { MAX_PHRASE, type Phrase } from '@/features/phrases/phrases';
import { usePrefs } from '@/features/settings/prefs';
import { useSpeakSession } from '@/features/speak/speak-session';
import { phraseStore } from '@/storage';

/** Speak for me: type and speak at once, or tap a saved phrase. Discreet mode keeps it off the loudspeaker. */
export default function PhrasesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useSpeakSession();
  const { prefs, update } = usePrefs();
  const [phrases, setPhrases] = useState<Phrase[] | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    let live = true;
    phraseStore
      .list()
      .then((list) => live && setPhrases(list))
      .catch(() => live && setPhrases([]));
    return () => {
      live = false;
    };
  }, []);

  const change = (p: Promise<Phrase[]>) => p.then(setPhrases).catch(() => Alert.alert('Could not save', 'Check free space on the phone.'));

  const discreet = prefs.discreet;
  const typed = draft.trim();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.iconBtn, { backgroundColor: colors.chip }]}>
          <Icon name="chevronLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[type.heading, { color: colors.text, flex: 1 }]} accessibilityRole="header">
          Speak for me
        </Text>
        <Pressable onPress={() => router.push('/editor')} accessibilityRole="button" style={[styles.pill, { backgroundColor: colors.chip }]}>
          <Text style={[type.callout, { color: colors.text }]}>Write longer</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type, then tap Speak"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={2000}
            accessibilityLabel="Text to speak"
            style={[type.body, { color: colors.text, minHeight: 64, textAlignVertical: 'top' }]}
          />
          <View style={styles.row}>
            <Pressable
              onPress={() => s.say(draft)}
              disabled={!typed}
              accessibilityRole="button"
              accessibilityState={{ disabled: !typed }}
              style={[styles.speak, { backgroundColor: typed ? colors.accent : colors.chip }]}
            >
              <Icon name={s.saying === draft && typed ? 'stop' : 'play'} size={18} color={typed ? colors.onAccent : colors.textTertiary} />
              <Text style={[type.bodyStrong, { color: typed ? colors.onAccent : colors.textTertiary }]}>{s.saying === draft && typed ? 'Stop' : 'Speak'}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                change(phraseStore.add(draft));
                setDraft('');
              }}
              disabled={!typed}
              accessibilityRole="button"
              style={[styles.pill, { backgroundColor: colors.chip, opacity: typed ? 1 : 0.5 }]}
            >
              <Text style={[type.callout, { color: colors.text }]}>Save as phrase</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, styles.row, { backgroundColor: discreet ? colors.warning : colors.card }]}>
          <Icon name="lock" size={20} color={colors.accentText} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>Discreet mode</Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {discreet ? 'Plays in your earbuds. With none connected, hold the phone to your ear like a call.' : 'Plays out loud on the loudspeaker.'}
            </Text>
          </View>
          <Switch
            value={discreet}
            onValueChange={(v) => update({ discreet: v })}
            accessibilityLabel="Discreet mode"
            trackColor={{ true: colors.accent, false: colors.waveUnplayed }}
            thumbColor="#FFFFFF"
          />
        </View>

        {s.error ? <Text style={[type.callout, { color: colors.accentText }]}>{s.error}</Text> : null}

        <View style={styles.head}>
          <Text style={[type.heading, { color: colors.text, flex: 1 }]}>Quick phrases</Text>
          <Pressable
            onPress={() => {
              setEditing((e) => !e);
              setEditId(null);
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={[type.callout, { color: colors.accentText }]}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        </View>

        {phrases && phrases.length === 0 ? (
          <Text style={[type.body, { color: colors.textTertiary }]}>No phrases yet. Type one above and tap Save as phrase.</Text>
        ) : null}

        <View style={[styles.list, { backgroundColor: colors.card }]}>
          {(phrases ?? []).map((p, i) => {
            const speaking = s.saying === p.text;
            const border = i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator } : null;
            if (editing && editId === p.id) {
              const save = () => {
                change(phraseStore.update(p.id, editText));
                setEditId(null);
              };
              return (
                <View key={p.id} style={[styles.item, border]}>
                  <TextInput
                    value={editText}
                    onChangeText={setEditText}
                    autoFocus
                    multiline
                    maxLength={MAX_PHRASE}
                    onBlur={save}
                    accessibilityLabel="Edit phrase"
                    style={[type.body, { color: colors.text, flex: 1, paddingVertical: 4 }]}
                  />
                  <Pressable onPress={save} accessibilityRole="button" accessibilityLabel="Save phrase" style={styles.small}>
                    <Icon name="check" size={22} color={colors.accent} onColor={colors.onAccent} />
                  </Pressable>
                </View>
              );
            }
            if (editing) {
              return (
                <View key={p.id} style={[styles.item, border]}>
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => {
                      setEditId(p.id);
                      setEditText(p.text);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit: ${p.text}`}
                  >
                    <Text style={[type.body, { color: colors.text }]}>{p.text}</Text>
                  </Pressable>
                  <Pressable onPress={() => change(phraseStore.move(p.id, -1))} disabled={i === 0} accessibilityRole="button" accessibilityLabel="Move up" style={[styles.small, { opacity: i === 0 ? 0.3 : 1 }]}>
                    <View style={{ transform: [{ rotate: '180deg' }] }}>
                      <Icon name="chevronDown" size={20} color={colors.text} />
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => change(phraseStore.move(p.id, 1))}
                    disabled={i === phrases!.length - 1}
                    accessibilityRole="button"
                    accessibilityLabel="Move down"
                    style={[styles.small, { opacity: i === phrases!.length - 1 ? 0.3 : 1 }]}
                  >
                    <Icon name="chevronDown" size={20} color={colors.text} />
                  </Pressable>
                  <Pressable onPress={() => change(phraseStore.remove(p.id))} accessibilityRole="button" accessibilityLabel={`Delete: ${p.text}`} style={styles.small}>
                    <Icon name="trash" size={20} color={colors.accentText} />
                  </Pressable>
                </View>
              );
            }
            return (
              <Pressable
                key={p.id}
                onPress={() => s.say(p.text)}
                accessibilityRole="button"
                accessibilityLabel={speaking ? `Stop: ${p.text}` : `Say: ${p.text}`}
                style={({ pressed }) => [styles.item, border, (pressed || speaking) && { backgroundColor: colors.highlight, marginHorizontal: -16, paddingHorizontal: 16 }]}
              >
                <Text style={[type.body, { color: colors.text, flex: 1 }]}>{p.text}</Text>
                <Icon name={speaking ? 'stop' : discreet ? 'lock' : 'speaker'} size={18} color={speaking ? colors.accent : colors.textTertiary} />
              </Pressable>
            );
          })}
        </View>

        {editing ? (
          <Pressable
            onPress={() =>
              Alert.alert('Restore the starter phrases?', 'Your own phrases are replaced by the starter list.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Restore', style: 'destructive', onPress: () => change(phraseStore.reset()) },
              ])
            }
            accessibilityRole="button"
            style={[styles.pill, { backgroundColor: colors.chip }]}
          >
            <Text style={[type.callout, { color: colors.text }]}>Restore starter phrases</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.card, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  head: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  speak: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 18, minHeight: minTouch },
  pill: { borderRadius: radius.pill, paddingHorizontal: 16, minHeight: minTouch - 4, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  list: { borderRadius: radius.card, paddingHorizontal: 16, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: minTouch + 8, paddingVertical: 10 },
  small: { width: minTouch - 4, height: minTouch - 4, alignItems: 'center', justifyContent: 'center' },
});
