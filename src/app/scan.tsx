import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { Icon, type IconName } from '@/components/icons';
import { PosterArt } from '@/components/rack/poster-art';
import { PaperSheet } from '@/components/scene/paper';
import { PaperShadow } from '@/components/scene/shadows';
import { announce } from '@/design/a11y';
import { useScene, useSceneQuality } from '@/design/scene';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { sceneType, type } from '@/design/type';
import { useEngines } from '@/engines/provider';
import { useListen } from '@/features/listen/listen-session';
import { textScene } from '@/features/library-rack/poster-art';
import { linesToText, scanTitle, unsureWords } from '@/features/scan/scan-text';
import { useSpeakSession } from '@/features/speak/speak-session';
import { sessionStore } from '@/storage';

type Step = { kind: 'pick' } | { kind: 'reading'; uri: string } | { kind: 'done'; uri: string; unsure: string[] };

/** Scan text (PRD SC-1..SC-3): photo → text on the phone, checked by the person, then spoken or saved. */
export default function ScanScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scan } = useEngines();
  const speak = useSpeakSession();
  const listen = useListen();
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { rich } = useSceneQuality();

  const pick = async (camera: boolean) => {
    setError(null);
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Voxa needs the camera to scan. You can allow it in the phone settings, or choose a photo instead.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: true };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets[0].uri;
      setStep({ kind: 'reading', uri });
      const lines = await scan.recognize(uri);
      const found = linesToText(lines);
      if (!found) {
        setStep({ kind: 'pick' });
        setError('No text found. Try again with more light, the page flat, and the text filling the photo.');
        announce('No text found');
        return;
      }
      setText(found);
      const unsure = unsureWords(lines);
      setStep({ kind: 'done', uri, unsure });
      announce(`Text found.${unsure.length ? ` ${unsure.length} ${unsure.length === 1 ? 'word' : 'words'} to check.` : ''}`);
    } catch (err) {
      setStep({ kind: 'pick' });
      setError(err instanceof Error ? `Could not read the photo: ${err.message}` : 'Could not read the photo.');
    }
  };

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const meta = await sessionStore.saveScan(text.trim(), scanTitle(text));
      listen.bump();
      router.replace({ pathname: '/session/[id]', params: { id: meta.id } });
    } catch {
      setError('Could not save. Check free space on the phone.');
    } finally {
      setSaving(false);
    }
  };

  const speakIt = () => {
    speak.setText(text.trim());
    router.push('/editor');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.iconBtn, { backgroundColor: colors.chip }]}>
          <Icon name="chevronLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[sceneType.navTitle, { color: colors.text, flex: 1 }]} accessibilityRole="header" numberOfLines={1}>
          Scan text
        </Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
        {step.kind === 'pick' ? (
          <>
            <PageUnderLamp rich={rich} />
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[type.body, { color: colors.textSecondary }]}>
                Take a photo of printed text (a letter, a sign, a menu, a prescription) and Voxa reads it on this phone, with no internet. Photos are not kept.
              </Text>
              <Big icon="scan" label="Take a photo" primary onPress={() => void pick(true)} />
              <Big icon="library" label="Choose a photo" onPress={() => void pick(false)} />
            </View>
            {error ? <Text style={[type.callout, { color: colors.accentText }]}>{error}</Text> : null}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>For a good scan</Text>
              <Text style={[type.callout, { color: colors.textSecondary }]}>Good light, no shadow on the page. Hold the phone flat above it. Crop to the text you need. Handwriting may not read well.</Text>
            </View>
          </>
        ) : null}

        {step.kind === 'reading' ? (
          <View style={[styles.card, { backgroundColor: colors.card, alignItems: 'center' }]}>
            <Image source={{ uri: step.uri }} style={styles.thumbBig} resizeMode="contain" accessibilityIgnoresInvertColors />
            <ActivityIndicator color={colors.accent} />
            <Text style={[type.callout, { color: colors.textSecondary }]}>Reading the text…</Text>
          </View>
        ) : null}

        {step.kind === 'done' ? (
          <>
            <View style={[styles.card, styles.row, { backgroundColor: colors.card }]}>
              <Image source={{ uri: step.uri }} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
              <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]}>Check the text and fix any mistakes before you use it.</Text>
            </View>

            {step.unsure.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.warning }]}>
                <Text style={[type.bodyStrong, { color: colors.accentText }]}>Check these words</Text>
                <View style={styles.chips}>
                  {step.unsure.slice(0, 20).map((w) => (
                    <View key={w} style={[styles.chip, { backgroundColor: colors.card }]}>
                      <Text style={[type.callout, { color: colors.text }]}>{w}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* The text as read, on a plain sheet to check and fix. */}
            <PaperSheet rich={rich}>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                accessibilityLabel="Scanned text"
                style={[type.body, styles.text, { color: colors.text }]}
              />
            </PaperSheet>
            {error ? <Text style={[type.callout, { color: colors.accentText }]}>{error}</Text> : null}

            <View style={styles.row}>
              <Big icon="play" label="Speak it" primary onPress={speakIt} disabled={!text.trim()} />
              <Big icon="download" label={saving ? 'Saving…' : 'Save'} onPress={() => void save()} disabled={!text.trim() || saving} />
            </View>
            <Pressable
              onPress={() => {
                setText('');
                setError(null);
                setStep({ kind: 'pick' });
              }}
              accessibilityRole="button"
              style={[styles.pill, { backgroundColor: colors.chip }]}
            >
              <Text style={[type.callout, { color: colors.text }]}>Scan something else</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const PAGE_W = 96;
const PAGE_H = 124;

/**
 * What Scan does, drawn: a printed page lying in a pool of lamp light, framed by the camera's
 * corners in the accent. Decoration only.
 */
function PageUnderLamp({ rich }: { rich: boolean }) {
  const { colors } = useTheme();
  const { r } = useScene();
  const page = useMemo(() => textScene('A letter, a sign, a menu or a prescription, read on this phone.'), []);
  return (
    <View style={styles.lamp} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="scanPool" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor={r.light} stopOpacity={0.75} />
            <Stop offset="1" stopColor={r.light} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={50} cy={52} rx={46} ry={48} fill="url(#scanPool)" />
      </Svg>
      <View style={{ width: PAGE_W, height: PAGE_H, transform: [{ rotate: '-4deg' }] }}>
        <PaperShadow rich={rich} radius={2} />
        <View style={styles.page}>
          <PosterArt scene={page} id="scan-page" />
        </View>
      </View>
      {/* The camera's frame round the page. */}
      <View style={styles.frame} pointerEvents="none">
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <View
            key={c}
            style={[
              styles.corner,
              { borderColor: colors.accent },
              c[0] === 't' ? { top: 0, borderTopWidth: 3 } : { bottom: 0, borderBottomWidth: 3 },
              c[1] === 'l' ? { left: 0, borderLeftWidth: 3 } : { right: 0, borderRightWidth: 3 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function Big({ icon, label, onPress, primary, disabled }: { icon: IconName; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const fg = primary ? colors.onAccent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.big,
        { backgroundColor: primary ? (pressed ? colors.accentText : colors.accent) : pressed ? colors.chipPressed : colors.chip, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Icon name={icon} size={20} color={fg} />
      <Text style={[type.bodyStrong, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.card, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  big: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: minTouch + 8, borderRadius: radius.pill },
  pill: { borderRadius: radius.pill, paddingHorizontal: 16, minHeight: minTouch, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbBig: { width: '100%', height: 220, borderRadius: 20, borderCurve: 'continuous' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radius.chip, paddingHorizontal: 12, paddingVertical: 6 },
  text: { padding: 16, minHeight: 200, textAlignVertical: 'top' },
  lamp: { height: 170, alignItems: 'center', justifyContent: 'center' },
  page: { ...StyleSheet.absoluteFill, borderRadius: 2, overflow: 'hidden' },
  frame: { position: 'absolute', width: PAGE_W + 40, height: PAGE_H + 30 },
  corner: { position: 'absolute', width: 20, height: 20, borderRadius: 3 },
});
