import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { ModelRow } from '@/components/model-row';
import { progressProps } from '@/design/a11y';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { formatClock, formatDay, formatDuration } from '@/features/listen/format';
import { useListen } from '@/features/listen/listen-session';
import { useModels } from '@/features/packs/models';
import { speakerName } from '@/features/listen/speakers';
import { useSpeakSession } from '@/features/speak/speak-session';
import { sessionStore } from '@/storage';
import type { Session } from '@/storage/sessions';
import type { TranscriptSegment } from '@/engines/types';

/** One saved meeting: summary, marks and the transcript by speaker. */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const l = useListen();
  const speak = useSpeakSession();
  const models = useModels();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [title, setTitle] = useState('');

  // Reload when labelling finishes or anything else saves.
  useEffect(() => {
    let live = true;
    sessionStore
      .load(String(id))
      .catch(() => null)
      .then((s) => {
        if (!live) return;
        setSession(s);
        if (s) setTitle(s.title);
      });
    return () => {
      live = false;
    };
  }, [id, l.version]);

  if (session === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (session === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>This session is no longer on the phone.</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={[styles.pill, { backgroundColor: colors.chip, marginTop: 16 }]}>
          <Text style={[type.bodyStrong, { color: colors.text }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const labelling = l.labelling && l.labelling.id === session.id ? l.labelling : null;
  const working = !!labelling && !labelling.done;

  const saveTitle = async () => {
    const t = title.trim() || session.title;
    setTitle(t);
    if (t !== session.title) {
      await sessionStore.updateMeta(session.id, { title: t });
      l.bump();
    }
  };

  const share = () => {
    const text =
      session.kind === 'scan'
        ? [session.title, '', session.text ?? ''].join('\n')
        : [session.title, `${formatDay(session.startedAt)} · ${formatDuration(session.durationMs)}`, '', transcriptText(session.segments)].join('\n');
    void Share.share({ title: session.title, message: text });
  };

  const remove = () => {
    Alert.alert('Delete this session?', 'The transcript, summary and any audio are removed from this phone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (working) l.cancelLabel();
          await sessionStore.remove(session.id);
          l.bump();
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="chevronLeft" label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <IconButton icon="share" label="Share transcript" onPress={share} />
        <IconButton icon="trash" label="Delete session" onPress={remove} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={saveTitle}
            onSubmitEditing={saveTitle}
            returnKeyType="done"
            accessibilityLabel="Session title"
            style={[type.title, { color: colors.text, padding: 0 }]}
          />
          <Text style={[type.callout, { color: colors.textTertiary }]}>
            {session.kind === 'scan'
              ? `Scanned · ${formatDay(session.startedAt)} · ${wordCount(session.text ?? '')} words`
              : `${formatDay(session.startedAt)} · ${formatDuration(session.durationMs)}`}
            {session.speakers ? ` · ${session.speakers} ${session.speakers === 1 ? 'speaker' : 'speakers'}` : ''}
            {session.status === 'recovered' ? ' · recovered' : ''}
          </Text>
        </View>

        {session.kind === 'scan' ? (
          <>
            <Pressable
              onPress={() => {
                speak.setText(session.text ?? '');
                router.push('/editor');
              }}
              accessibilityRole="button"
              style={[styles.pill, styles.row, { backgroundColor: colors.accent }]}
            >
              <Icon name="play" size={18} color={colors.onAccent} />
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Speak it</Text>
            </Pressable>
            <Text style={[type.body, { color: colors.text }]} selectable>
              {session.text}
            </Text>
          </>
        ) : null}

        {session.hasAudio || labelling ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.row}>
              <Icon name="person" size={20} color={colors.accentText} />
              <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>
                {working ? 'Finding who spoke…' : labelling?.error ? 'Could not label speakers' : session.speakers ? 'Speakers labelled' : 'Speaker labels'}
              </Text>
              {working ? <Text style={[type.callout, { color: colors.textSecondary }]}>{Math.round(labelling.fraction * 100)}%</Text> : null}
            </View>
            {working ? (
              <>
                <View {...progressProps('Finding who spoke', labelling.fraction)} style={[styles.track, { backgroundColor: colors.chip }]}>
                  <View style={{ width: `${Math.max(2, labelling.fraction * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: colors.accent }} />
                </View>
                <Text style={[type.caption, { color: colors.textTertiary }]}>Takes about half the meeting&apos;s length. You can leave this screen.</Text>
                <Pressable onPress={l.cancelLabel} accessibilityRole="button" style={[styles.pill, { backgroundColor: colors.chip }]}>
                  <Text style={[type.callout, { color: colors.text }]}>Cancel</Text>
                </Pressable>
              </>
            ) : session.hasAudio && l.canLabel && !models.ready.speakers ? (
              <>
                <Text style={[type.caption, { color: colors.textTertiary }]}>Labelling speakers needs a one-time download. The audio waits on this phone until then.</Text>
                <ModelRow id="speakers" title="Speaker labels" what="Who spoke when" />
              </>
            ) : session.hasAudio && l.canLabel ? (
              <>
                {labelling?.error ? <Text style={[type.caption, { color: colors.accentText }]}>{labelling.error}</Text> : null}
                <Text style={[type.caption, { color: colors.textTertiary }]}>The audio is kept on this phone until speakers are labelled, then deleted.</Text>
                <View style={styles.row}>
                  <Pressable onPress={() => l.label(session.id)} accessibilityRole="button" style={[styles.pill, { backgroundColor: colors.primaryFill }]}>
                    <Text style={[type.callout, { color: colors.onPrimary }]}>Label speakers</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      await sessionStore.removeAudio(session.id);
                      l.bump();
                    }}
                    accessibilityRole="button"
                    style={[styles.pill, { backgroundColor: colors.chip }]}
                  >
                    <Text style={[type.callout, { color: colors.text }]}>Delete audio</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {session.summary && (session.summary.keyPoints.length > 0 || session.summary.actions.length > 0) ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.row}>
              <Text style={[type.bodyStrong, { color: colors.text }]} accessibilityRole="header">
                Quick summary
              </Text>
            </View>
            {session.summary.keyPoints.map((p, i) => (
              <View key={`k${i}`} style={styles.row}>
                <Text style={[type.body, { color: colors.textTertiary }]} importantForAccessibility="no" accessibilityElementsHidden>
                  •
                </Text>
                <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                  {p.text}
                  {p.atMs !== null ? <Text style={{ color: colors.textTertiary }}>  {formatClock(p.atMs)}</Text> : null}
                </Text>
              </View>
            ))}
            {session.summary.actions.length > 0 ? (
              <>
                <Text style={[type.overline, { color: colors.textTertiary, marginTop: 6 }]}>Possible action items</Text>
                {session.summary.actions.map((a, i) => (
                  <View key={`a${i}`} style={styles.row}>
                    <Icon name="check" size={18} color={colors.waveUnplayed} onColor={colors.card} />
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {a.text}
                      {a.owner || a.due ? <Text style={{ color: colors.textTertiary }}>{`  ${[a.owner, a.due].filter(Boolean).join(' · ')}`}</Text> : null}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
            <Text style={[type.caption, { color: colors.textTertiary }]}>Picked from the transcript on this phone. Check before acting on it.</Text>
          </View>
        ) : null}

        {session.marks.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.row}>
              <Icon name="flag" size={20} color={colors.accentText} />
              <Text style={[type.bodyStrong, { color: colors.text }]} accessibilityRole="header">
                Marks
              </Text>
            </View>
            {session.marks.map((m, i) => {
              const near = session.segments.find((s) => s.endMs >= m.atMs);
              return (
                <View key={`m${i}`} style={{ gap: 2 }}>
                  <Text style={[type.callout, { color: colors.accentText }]}>
                    Mark {i + 1} · {formatClock(m.atMs)}
                  </Text>
                  {near ? <Text style={[type.body, { color: colors.text }]} numberOfLines={2}>{near.text}</Text> : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {session.kind === 'scan' ? null : <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
            Transcript
          </Text>}
        {session.kind === 'scan' ? null : session.segments.length === 0 ? (
          <Text style={[type.body, { color: colors.textTertiary }]}>No words were saved.</Text>
        ) : (
          groupBySpeaker(session.segments).map((g) => (
            <View key={g.key} style={{ gap: 4 }}>
              <Text style={[type.caption, { color: colors.textTertiary }]}>
                {[speakerName(g.speaker), formatClock(g.startMs)].filter(Boolean).join(' · ')}
              </Text>
              <Text style={[type.body, { color: colors.text }]} selectable>
                {g.text}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/** Joins sentences in a row from the same speaker; without labels, a new paragraph after 8 s of silence. */
function groupBySpeaker(segments: TranscriptSegment[]) {
  const groups: { key: string; speaker: number | null; startMs: number; endMs: number; text: string }[] = [];
  for (const s of segments) {
    const last = groups[groups.length - 1];
    if (last && last.speaker === s.speaker && s.startMs - last.endMs < (s.speaker === null ? 8000 : 60_000)) {
      last.text += ` ${s.text}`;
      last.endMs = s.endMs;
    } else {
      groups.push({ key: s.id, speaker: s.speaker, startMs: s.startMs, endMs: s.endMs, text: s.text });
    }
  }
  return groups;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function transcriptText(segments: TranscriptSegment[]): string {
  return groupBySpeaker(segments)
    .map((g) => `[${formatClock(g.startMs)}]${g.speaker !== null ? ` ${speakerName(g.speaker)}:` : ''} ${g.text}`)
    .join('\n\n');
}

function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.iconBtn, { backgroundColor: colors.chip }]}>
      <Icon name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  iconBtn: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.card, padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 16, minHeight: minTouch, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
});
