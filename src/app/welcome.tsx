import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { ModelRow } from '@/components/model-row';
import { POSTER_RATIO, PosterFace, PosterSheet } from '@/components/rack/poster';
import { PosterArt } from '@/components/rack/poster-art';
import { WindowLight } from '@/components/rack/room';
import { OnAirSign } from '@/components/scene/on-air-sign';
import { Waveform } from '@/components/waveform';
import { useSceneQuality } from '@/design/scene';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { textScene, voiceScene } from '@/features/library-rack/poster-art';
import { useModels } from '@/features/packs/models';
import { formatMB } from '@/features/packs/rules';
import { usePrefs } from '@/features/settings/prefs';
import { useSpeakSession } from '@/features/speak/speak-session';
import type { SessionMeta } from '@/storage/sessions';

const HELLO = 'Hello. I am your Voxa voice. I work on this phone, even with no internet.';

/** The example poster on the first step: a morning meeting with three speakers and a mark. */
const EXAMPLE: SessionMeta = {
  id: 'welcome-example',
  kind: 'listen',
  title: 'Your meetings',
  startedAt: new Date(2026, 0, 5, 10, 0).getTime(),
  durationMs: 32 * 60_000,
  status: 'saved',
  marks: [{ atMs: 12 * 60_000 }],
  speakers: 3,
};

const ART_W = 100;
const ART_H = Math.round(ART_W * POSTER_RATIO);

/** First run: what Voxa does, a voice check, and the one download Listen needs. */
export default function Welcome() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { update } = usePrefs();
  const speak = useSpeakSession();
  const models = useModels();
  const [step, setStep] = useState(0);
  const [heard, setHeard] = useState(false);
  const wasSaying = useRef(false);
  const { rich, motion } = useSceneQuality();
  const screen = useWindowDimensions();

  // The voice check counts once the sample has played to the end without an error.
  useEffect(() => {
    if (speak.saying === HELLO) wasSaying.current = true;
    else if (wasSaying.current) {
      wasSaying.current = false;
      if (!speak.error) {
        const t = setTimeout(() => setHeard(true), 0);
        return () => clearTimeout(t);
      }
    }
  }, [speak.saying, speak.error]);

  const finish = () => {
    if (speak.saying) speak.say(speak.saying);
    update({ onboarded: true });
    router.replace('/');
  };

  const steps: { title: string; body: string }[] = [
    {
      title: 'Voxa speaks and listens for you',
      body: 'Type and Voxa says it out loud. Turn on Live and Voxa writes down what people say. Scan printed text and Voxa reads it.',
    },
    {
      title: 'Hear your voice',
      body: 'Voices are built into the app and work offline. Tap play to check the sound.',
    },
    {
      title: 'Set up listening',
      body: `Live captions need one download of ${formatMB(models.bytes('listen'))}. Best on Wi-Fi. After that, everything works offline.`,
    },
    {
      title: 'Private by design',
      body: 'What you say, hear, type and scan stays on this phone. Voxa asks for the microphone the first time you listen, and the camera the first time you scan.',
    },
  ];
  const s = steps[step];
  const last = step === steps.length - 1;
  const listenStep = step === 2;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      {/* The room's window light on the wall, as in the Library. */}
      <WindowLight width={screen.width} height={screen.height} strength={0.55} simple={!rich} />
      <View style={styles.top}>
        <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i <= step ? colors.accent : colors.waveUnplayed, width: i === step ? 22 : 8 }]} />
          ))}
        </View>
        <Pressable onPress={finish} accessibilityRole="button" hitSlop={10}>
          <Text style={[type.callout, { color: colors.textTertiary }]}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <StepArt step={step} speaking={speak.saying === HELLO} listenReady={models.ready.listen} motion={motion} rich={rich} />
        <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header">
          {s.title}
        </Text>
        <Text style={[type.body, { color: colors.textSecondary, fontSize: 17, lineHeight: 24 }]}>{s.body}</Text>

        {step === 1 ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={{ height: 48, justifyContent: 'center' }}>
              <Waveform bars={28} maxHeight={44} color={colors.accent} breathe={speak.saying === HELLO} />
            </View>
            <Pressable
              onPress={() => speak.say(HELLO)}
              accessibilityRole="button"
              style={[styles.primary, { backgroundColor: colors.primaryFill }]}
            >
              <Icon name={speak.saying === HELLO ? 'stop' : 'play'} size={18} color={colors.onPrimary} />
              <Text style={[type.bodyStrong, { color: colors.onPrimary }]}>{speak.saying === HELLO ? 'Stop' : 'Play'}</Text>
            </Pressable>
            {heard ? (
              <View style={styles.ok}>
                <Icon name="check" size={20} color={colors.accent} onColor={colors.onAccent} />
                <Text style={[type.callout, { color: colors.text }]}>The voice works offline.</Text>
              </View>
            ) : null}
            {speak.error ? <Text style={[type.caption, { color: colors.accentText }]}>{speak.error}</Text> : null}
          </View>
        ) : null}

        {listenStep ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <ModelRow id="listen" title="Listening" what="Live captions in English" />
            <Text style={[type.caption, { color: colors.textTertiary }]}>
              {models.ready.listen ? 'Ready. Live captions work offline now.' : 'You can also do this later in Settings. Speak for me and Scan work without it.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        {step > 0 ? (
          <Pressable onPress={() => setStep(step - 1)} accessibilityRole="button" style={[styles.secondary, { backgroundColor: colors.chip }]}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>Back</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => (last ? finish() : setStep(step + 1))}
          accessibilityRole="button"
          style={[styles.primary, { flex: 1, backgroundColor: colors.accent }]}
        >
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
            {last ? 'Start using Voxa' : listenStep && !models.ready.listen && !models.downloads.listen ? 'Later' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Each step shows one thing from the house the person is about to walk around: a meeting's
 * poster (Library), a voice's sleeve (Voices), the ON AIR sign (Live, lit once listening is set
 * up) and a printed page that stays on the phone. Decoration only: the words say it all.
 */
function StepArt({ step, speaking, listenReady, motion, rich }: { step: number; speaking: boolean; listenReady: boolean; motion: boolean; rich: boolean }) {
  const voice = useMemo(() => voiceScene({ id: 'welcome-voice', tags: ['Warm'] }), []);
  const page = useMemo(() => textScene('What you say, hear, type and scan stays on this phone.'), []);
  let art;
  if (step === 0) {
    art = <PosterFace item={{ kind: 'session', meta: EXAMPLE }} width={ART_W} height={ART_H} motion={false} rich={rich} />;
  } else if (step === 1) {
    art = (
      <PosterSheet
        band={voice.band}
        overline={speaking ? 'SPEAKING' : 'YOUR VOICE'}
        dot={speaking ? 'breathing' : 'still'}
        title="Hello"
        art={<PosterArt scene={voice} id="welcome-voice" />}
        width={ART_W}
        height={ART_H}
        motion={motion}
        rich={rich}
      />
    );
  } else if (step === 2) {
    art = <OnAirSign lit={listenReady} motion={motion} rich={rich} />;
  } else {
    art = (
      <PosterSheet band={page.band} overline="ON THIS PHONE" title="Only yours" art={<PosterArt scene={page} id="welcome-page" />} width={ART_W} height={ART_H} rich={rich} />
    );
  }
  return (
    <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {art}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  body: { gap: 16, paddingVertical: 32 },
  art: { minHeight: ART_H, justifyContent: 'center', alignItems: 'flex-start', marginBottom: 4 },
  card: { borderRadius: radius.card, padding: 16, gap: 12 },
  ok: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 10 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: minTouch + 8, borderRadius: radius.pill, paddingHorizontal: 20 },
  secondary: { alignItems: 'center', justifyContent: 'center', minHeight: minTouch + 8, borderRadius: radius.pill, paddingHorizontal: 20 },
});
