import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Screen } from '@/components/screen';
import { DownloadRing, VoiceAvatar } from '@/components/voice-avatar';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import type { Voice } from '@/engines/types';
import { VOICE_FILTERS, matchesVoice, useVoices, voiceSubtitle, type VoiceFilter } from '@/features/voices/voices-store';
import { Waveform } from '@/components/waveform';

export default function VoicesScreen() {
  const { colors } = useTheme();
  const { voices, defaultId, downloads, download, cancelDownload } = useVoices();
  const [filter, setFilter] = useState<VoiceFilter>('All');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => voices.filter((v) => matchesVoice(v, filter, query)), [voices, filter, query]);
  const installed = shown.filter((v) => v.installed);
  const def = installed.find((v) => v.id === defaultId);
  const others = installed.filter((v) => v.id !== defaultId);
  const more = shown.filter((v) => !v.installed);
  const usedMB = voices.filter((v) => v.installed).reduce((n, v) => n + v.sizeMB, 0);

  return (
    <Screen
      title="Voices"
      right={
        <View style={[styles.storage, { backgroundColor: colors.card }]}>
          <Text style={[type.caption, { color: colors.text, fontFamily: type.bodyStrong.fontFamily }]}>
            {usedMB} MB on phone
          </Text>
        </View>
      }
    >
      <View style={[styles.search, { backgroundColor: colors.chip }]}>
        <Icon name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search voices, accents, tones"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Search voices"
          returnKeyType="search"
          style={[type.body, styles.searchInput, { color: colors.text }]}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {VOICE_FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.filter, { backgroundColor: on ? colors.primaryFill : colors.card }]}
            >
              <Text style={[type.callout, { color: on ? colors.onPrimary : colors.text, fontFamily: type.bodyStrong.fontFamily }]}>
                {f}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {installed.length > 0 && <SectionTitle>On this phone</SectionTitle>}
      {def && <DefaultVoiceCard voice={def} />}
      {others.length > 0 && (
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          {others.map((v, i) => (
            <InstalledRow key={v.id} voice={v} first={i === 0} />
          ))}
        </View>
      )}

      {more.length > 0 && <SectionTitle>Get more voices</SectionTitle>}
      {more.length > 0 && (
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          {more.map((v, i) => {
            const p = downloads[v.id];
            const busy = p !== undefined;
            return (
              <View key={v.id} style={[styles.row, i > 0 && sep(colors.separator)]}>
                <VoiceAvatar name={v.name} size={40} solid={false} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>{v.name}</Text>
                  <Text style={[type.caption, { color: colors.textTertiary }]}>
                    {busy
                      ? `${v.tags.join(' · ')} · ${Math.round(p * v.sizeMB)} of ${v.sizeMB} MB`
                      : voiceSubtitle(v, true)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => (busy ? cancelDownload(v.id) : download(v.id))}
                  accessibilityRole="button"
                  accessibilityLabel={busy ? `Cancel ${v.name} download, ${Math.round(p * 100)} percent` : `Download ${v.name}, ${v.sizeMB} MB`}
                  style={styles.iconButton}
                >
                  {busy ? <DownloadRing progress={p} /> : <Icon name="download" size={28} color={colors.text} />}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {shown.length === 0 && (
        <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 24 }]}>
          No voices match “{query}”.
        </Text>
      )}
    </Screen>
  );
}

function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[type.overline, { color: colors.textSecondary, marginTop: 6, marginLeft: 2 }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

function DefaultVoiceCard({ voice }: { voice: Voice }) {
  const { colors } = useTheme();
  const { previewingId, togglePreview, favourites, toggleFavourite } = useVoices();
  const playing = previewingId === voice.id;
  const fav = favourites.has(voice.id);
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.cardTop}>
        <Pressable
          onPress={() => togglePreview(voice.id)}
          accessibilityRole="button"
          accessibilityLabel={`${playing ? 'Stop' : 'Play'} ${voice.name} sample`}
          style={[styles.bigPlay, { backgroundColor: colors.accent }]}
        >
          <Icon name={playing ? 'pause' : 'play'} size={20} color={colors.onAccent} />
        </Pressable>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={styles.nameRow}>
            <Text style={[type.bodyStrong, { color: colors.text, fontSize: 17 }]}>{voice.name}</Text>
            <View style={[styles.badge, { backgroundColor: colors.primaryFill }]}>
              <Text style={[type.tab, { color: colors.onPrimary }]}>Default</Text>
            </View>
          </View>
          <View style={styles.tags}>
            {voice.tags.map((t) => (
              <View key={t} style={[styles.tag, { backgroundColor: colors.chip }]}>
                <Text style={[type.tab, { color: colors.textSecondary }]}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
        <FavouriteButton id={voice.id} name={voice.name} on={fav} onToggle={toggleFavourite} />
      </View>
      {playing && <Waveform bars={48} maxHeight={30} minHeight={4} barWidth={2.5} gap={2.5} color={colors.accent} breathe seed={0.6} />}
    </View>
  );
}

function InstalledRow({ voice, first }: { voice: Voice; first: boolean }) {
  const { colors } = useTheme();
  const { previewingId, togglePreview, favourites, toggleFavourite, setDefault } = useVoices();
  const playing = previewingId === voice.id;
  return (
    <View style={[styles.row, !first && sep(colors.separator)]}>
      <Pressable
        onPress={() => togglePreview(voice.id)}
        accessibilityRole="button"
        accessibilityLabel={`${playing ? 'Stop' : 'Play'} ${voice.name} sample`}
        style={[styles.smallPlay, { backgroundColor: playing ? colors.accent : colors.primaryFill }]}
      >
        <Icon name={playing ? 'pause' : 'play'} size={16} color={playing ? colors.onAccent : colors.onPrimary} />
      </Pressable>
      <Pressable
        style={{ flex: 1, minHeight: minTouch, justifyContent: 'center' }}
        onPress={() => setDefault(voice.id)}
        accessibilityRole="button"
        accessibilityLabel={`${voice.name}, ${voiceSubtitle(voice)}`}
        accessibilityHint="Makes this your default voice"
      >
        <Text style={[type.bodyStrong, { color: colors.text }]}>{voice.name}</Text>
        <Text style={[type.caption, { color: colors.textTertiary }]}>{voiceSubtitle(voice)}</Text>
      </Pressable>
      <FavouriteButton id={voice.id} name={voice.name} on={favourites.has(voice.id)} onToggle={toggleFavourite} />
    </View>
  );
}

function FavouriteButton({ id, name, on, onToggle }: { id: string; name: string; on: boolean; onToggle: (id: string) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onToggle(id)}
      accessibilityRole="button"
      accessibilityLabel={`Favourite ${name}`}
      accessibilityState={{ selected: on }}
      style={styles.iconButton}
    >
      <Icon name="heart" filled={on} size={22} color={on ? colors.accent : colors.text} />
    </Pressable>
  );
}

const sep = (color: string) => ({ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color });

const styles = StyleSheet.create({
  storage: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, marginBottom: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12 },
  searchInput: { flex: 1, paddingVertical: 0 },
  filters: { gap: 8 },
  filter: { height: 36, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center' },
  card: { borderRadius: radius.card, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bigPlay: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  smallPlay: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tags: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  group: { borderRadius: radius.card, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  iconButton: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
