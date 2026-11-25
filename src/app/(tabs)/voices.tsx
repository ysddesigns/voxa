import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Screen } from '@/components/screen';
import { Group, SearchField } from '@/components/ui';
import { VoiceShelf } from '@/components/voice-shelf';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import type { Voice } from '@/engines/types';
import { VOICE_FILTERS, matchesVoice, useVoices, voiceSubtitle, type VoiceFilter } from '@/features/voices/voices-store';

/** Search and filters only earn their space once there are more voices than fit on a screen. */
const SEARCH_FROM = 9;

/**
 * Who speaks for you: the voices on this phone as a pick-one list (a checkmark on the chosen
 * one, which stays put when tapped), then voices to download.
 */
export default function VoicesScreen() {
  const { colors } = useTheme();
  const { voices, downloads, download, cancelDownload, downloadErrors } = useVoices();
  const [filter, setFilter] = useState<VoiceFilter>('All');
  const [query, setQuery] = useState('');
  const searchable = voices.length >= SEARCH_FROM;

  const shown = useMemo(
    () => (searchable ? voices.filter((v) => matchesVoice(v, filter, query)) : voices),
    [voices, searchable, filter, query],
  );
  const installed = shown.filter((v) => v.installed);
  const more = shown.filter((v) => !v.installed);
  const onPhone = voices.filter((v) => v.installed);
  const usedMB = onPhone.reduce((n, v) => n + v.sizeMB, 0);

  return (
    <Screen title="Voices">
      {searchable ? (
        <View style={{ gap: 12 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search voices, accents, tones" label="Search voices" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ marginHorizontal: -16 }}>
            {VOICE_FILTERS.map((f) => {
              const on = f === filter;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="button"
                  accessibilityLabel={f}
                  accessibilityState={{ selected: on }}
                  style={[styles.filter, { backgroundColor: on ? colors.primaryFill : colors.chip }]}
                >
                  <Text style={[type.subheadline, { color: on ? colors.onPrimary : colors.text, fontFamily: on ? type.headline.fontFamily : type.subheadline.fontFamily }]}>
                    {f}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {installed.length > 0 && (
        <Group
          header="Speaks for you"
          footer={`${onPhone.length === 1 ? '1 voice' : `${onPhone.length} voices`} on this phone · ${usedMB} MB. Tap a voice to choose it.`}
        >
          {installed.map((v) => (
            <InstalledRow key={v.id} voice={v} />
          ))}
        </Group>
      )}

      {more.length > 0 && (
        <View style={{ gap: 7 }}>
          <Text style={[type.overline, styles.head, { color: colors.textSecondary }]} accessibilityRole="header">
            Get more voices
          </Text>
          {/* The shop window: voices to download, as record sleeves on a ledge. */}
          <View style={{ marginHorizontal: -16 }}>
            <VoiceShelf voices={more} downloads={downloads} onDownload={download} onCancel={cancelDownload} />
          </View>
          {more
            .filter((v) => downloads[v.id] === undefined && downloadErrors[v.id])
            .map((v) => (
              <Text key={v.id} style={[type.footnote, styles.head, { color: colors.accentText }]} accessibilityLiveRegion="polite">
                {v.name}: {downloadErrors[v.id]}
              </Text>
            ))}
          <Text style={[type.footnote, styles.head, { color: colors.textSecondary }]}>Tap a voice to download it. Tap again to stop.</Text>
        </View>
      )}

      {shown.length === 0 && (
        <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 24 }]}>
          {query.trim() ? `No voices match “${query.trim()}”.` : 'No voices in this filter.'}
        </Text>
      )}
    </Screen>
  );
}

/** A voice on the phone: play its sample, or tap the row to make it the one that speaks. */
function InstalledRow({ voice }: { voice: Voice }) {
  const { colors } = useTheme();
  const { previewingId, togglePreview, defaultId, setDefault } = useVoices();
  const playing = previewingId === voice.id;
  const chosen = voice.id === defaultId;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => togglePreview(voice.id)}
        accessibilityRole="button"
        accessibilityLabel={`${playing ? 'Stop' : 'Play'} ${voice.name} sample`}
        style={({ pressed }) => [styles.play, { backgroundColor: playing ? colors.accent : pressed ? colors.chipPressed : colors.chip }]}
      >
        <Icon name={playing ? 'pause' : 'play'} size={16} color={playing ? colors.onAccent : colors.text} />
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.choose, pressed && !chosen && { opacity: 0.6 }]}
        onPress={() => setDefault(voice.id)}
        accessibilityRole="radio"
        accessibilityLabel={`${voice.name}, ${voiceSubtitle(voice)}`}
        accessibilityState={{ checked: chosen }}
        accessibilityHint={chosen ? undefined : 'Makes this the voice that speaks for you'}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.body, { color: colors.text, fontFamily: chosen ? type.headline.fontFamily : type.body.fontFamily }]}>{voice.name}</Text>
          <Text style={[type.footnote, { color: colors.textSecondary }]}>{voiceSubtitle(voice)}</Text>
        </View>
        <View style={styles.check}>{chosen ? <Icon name="check" size={22} color={colors.accent} onColor={colors.onAccent} /> : null}</View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 16 },
  filters: { gap: 8, paddingHorizontal: 16 },
  filter: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center' },
  play: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  choose: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: minTouch, gap: 8 },
  check: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingLeft: 16, paddingRight: 4, minHeight: minTouch + 12 },
  iconButton: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
