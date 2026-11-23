import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Group, LargeTitle, NavBar, Page, TextRow, ToggleRow } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { minTouch } from '@/design/tokens';
import { type } from '@/design/type';
import { useCustomWords } from '@/features/listen/custom-words';

/** Names and places Live should listen out for (Chinedu, Abuja, Port Harcourt). */
export default function CustomWordsScreen() {
  const { colors } = useTheme();
  const { supported, words, add, remove, setBuiltIn } = useCustomWords();
  const [draft, setDraft] = useState('');
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  const typed = draft.trim();

  const submit = () => {
    if (!typed) return;
    add(draft);
    setDraft('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavBar back="Settings" />
      <Page>
        <View style={{ gap: 8 }}>
          <LargeTitle>Custom words</LargeTitle>
          <Text style={[type.subheadline, { color: colors.textSecondary, paddingHorizontal: 4 }]}>
            Live captions listen out for these names and places, so “Chinedu” is not written as “Chin a do”. Changes apply the next time you start listening.
          </Text>
        </View>

        {!supported ? (
          <Text style={[type.body, { color: colors.textSecondary, paddingHorizontal: 4 }]}>Update Voxa to add custom words.</Text>
        ) : (
          <>
            <Group header="Add" footer="Write each word as it should appear. Separate several with commas.">
              <TextRow>
                <View style={styles.add}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={submit}
                    placeholder="A name, place or word"
                    placeholderTextColor={colors.textTertiary}
                    returnKeyType="done"
                    autoCapitalize="words"
                    autoCorrect={false}
                    accessibilityLabel="New custom word"
                    style={[type.body, { color: colors.text, flex: 1, minHeight: minTouch }]}
                  />
                  <Pressable
                    onPress={submit}
                    disabled={!typed}
                    accessibilityRole="button"
                    accessibilityLabel="Add word"
                    accessibilityState={{ disabled: !typed }}
                    hitSlop={8}
                    style={[styles.icon, { backgroundColor: typed ? colors.accent : colors.chip }]}
                  >
                    <Icon name="plus" size={20} color={typed ? colors.onAccent : colors.textTertiary} />
                  </Pressable>
                </View>
              </TextRow>
            </Group>

            <Group header={`Your words (${words.custom.length})`}>
              {words.custom.length === 0 ? (
                <TextRow>
                  <Text style={[type.body, { color: colors.textTertiary }]}>None yet. Add the names of people you meet often.</Text>
                </TextRow>
              ) : (
                words.custom.map((w) => (
                  <TextRow key={w}>
                    <View style={styles.add}>
                      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{w}</Text>
                      <Pressable onPress={() => remove(w)} accessibilityRole="button" accessibilityLabel={`Remove ${w}`} hitSlop={8} style={styles.icon}>
                        <Icon name="trash" size={20} color={colors.accentText} />
                      </Pressable>
                    </View>
                  </TextRow>
                ))
              )}
            </Group>

            <Group
              header="Built in"
              footer="Nigerian cities, states, common names and everyday words. Turn off if Live starts writing them for words that only sound alike."
              action={{ label: showBuiltIn ? 'Hide' : 'Show all', onPress: () => setShowBuiltIn((s) => !s) }}
            >
              <ToggleRow label="Nigerian names and places" value={words.builtIn} onChange={setBuiltIn} />
              {showBuiltIn ? (
                <TextRow>
                  <Text style={[type.subheadline, { color: colors.textSecondary }]}>{words.builtInWords.join(', ')}</Text>
                </TextRow>
              ) : null}
            </Group>
          </>
        )}
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  add: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
