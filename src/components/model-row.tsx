import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { useModels, type ModelId } from '@/features/packs/models';
import { formatMB } from '@/features/packs/rules';

/** One model pack: ready (bundled or downloaded), downloading, or offered. */
export function ModelRow({ id, title, what }: { id: ModelId; title: string; what: string }) {
  const { colors } = useTheme();
  const m = useModels();
  const dl = m.downloads[id];
  const size = formatMB(m.bytes(id));
  const error = m.errors[id];
  return (
    <View style={{ gap: 6, paddingVertical: 6 }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { color: colors.text }]}>{title}</Text>
          <Text style={[type.caption, { color: colors.textTertiary }]}>
            {what} ·{' '}
            {m.ready[id] ? (m.bundled[id] ? 'built into this app' : `downloaded, ${size}`) : dl ? `downloading ${Math.round(dl.fraction * 100)}%` : `${size} download`}
          </Text>
        </View>
        {m.ready[id] ? (
          m.bundled[id] ? (
            <Icon name="check" size={22} color={colors.accent} onColor={colors.onAccent} />
          ) : (
            <Pressable
              onPress={() =>
                Alert.alert(`Remove ${title}?`, `Frees ${size}. You can download it again later.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => m.remove(id) },
                ])
              }
              accessibilityRole="button"
              accessibilityLabel={`Remove ${title}`}
              style={[styles.small, { backgroundColor: colors.chip }]}
            >
              <Text style={[type.callout, { color: colors.text }]}>Remove</Text>
            </Pressable>
          )
        ) : dl ? (
          <Pressable onPress={() => m.cancel(id)} accessibilityRole="button" accessibilityLabel={`Cancel ${title} download`} style={[styles.small, { backgroundColor: colors.chip }]}>
            <Text style={[type.callout, { color: colors.text }]}>Cancel</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => m.download(id)} accessibilityRole="button" accessibilityLabel={`Download ${title}, ${size}`} style={[styles.small, { backgroundColor: colors.primaryFill }]}>
            <Text style={[type.callout, { color: colors.onPrimary }]}>Download</Text>
          </Pressable>
        )}
      </View>
      {dl ? (
        <View style={[styles.track, { backgroundColor: colors.chip }]}>
          <View style={{ width: `${Math.max(2, dl.fraction * 100)}%`, height: '100%', backgroundColor: colors.accent }} />
        </View>
      ) : null}
      {error ? <Text style={[type.caption, { color: colors.accentText }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: minTouch },
  small: { borderRadius: radius.pill, paddingHorizontal: 14, minHeight: minTouch - 8, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
});
