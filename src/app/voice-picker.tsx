import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/icons';
import { VoiceAvatar } from '@/components/voice-avatar';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { useSpeakSession } from '@/features/speak/speak-session';
import { useVoices, voiceSubtitle } from '@/features/voices/voices-store';

/** Sheet for choosing the voice of the current script. */
export default function VoicePicker() {
  const { colors } = useTheme();
  const router = useRouter();
  const { voices } = useVoices();
  const s = useSpeakSession();
  const installed = voices.filter((v) => v.installed);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
        Choose a voice
      </Text>
      <View style={[styles.group, { backgroundColor: colors.card }]}>
        {installed.map((v, i) => {
          const on = v.id === s.voiceId;
          return (
            <Pressable
              key={v.id}
              onPress={() => {
                s.setVoiceId(v.id);
                router.back();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${v.name}, ${voiceSubtitle(v)}`}
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
            >
              <VoiceAvatar name={v.name} />
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{v.name}</Text>
                <Text style={[type.caption, { color: colors.textTertiary }]}>{voiceSubtitle(v)}</Text>
              </View>
              {on && <Icon name="check" size={22} color={colors.accent} onColor={colors.onAccent} />}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => {
          router.back();
          router.navigate('/voices');
        }}
        accessibilityRole="button"
        style={styles.more}
      >
        <Text style={[type.bodyStrong, { color: colors.accentText }]}>Get more voices</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  group: { borderRadius: radius.card, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  more: { minHeight: minTouch, alignItems: 'center', justifyContent: 'center' },
});
