import { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '@/components/icons';
import { POSTER_RATIO, PosterSheet } from '@/components/rack/poster';
import { PosterArt } from '@/components/rack/poster-art';
import { Ledge, LEDGE } from '@/components/scene/ledge';
import { PaperTag } from '@/components/scene/paper';
import { ContactShadow } from '@/components/scene/shadows';
import { DownloadRing } from '@/components/voice-avatar';
import { useScene, useSceneQuality } from '@/design/scene';
import { fontFamily } from '@/design/type';
import type { Voice } from '@/engines/types';
import { voiceScene } from '@/features/library-rack/poster-art';
import { voiceSubtitle } from '@/features/voices/voices-store';

const SLEEVE_W = 104;
const SLEEVE_H = Math.round(SLEEVE_W * POSTER_RATIO);
/** Room above the sleeves for their lift and gloss. */
const HEADROOM = 12;
/** Where the sleeves' feet stand, and how far they stand into the ledge's top surface. */
const FEET = HEADROOM + SLEEVE_H;
const LEDGE_TOP = FEET - 6;
/** The price tag hangs from the ledge's front edge. */
const TAG_TOP = LEDGE_TOP + LEDGE.surface + 2;
const HEIGHT = TAG_TOP + 30;

/**
 * Voices to download, as record sleeves standing on an oak ledge: the shop window of the Voices
 * tab. Each sleeve is drawn from the voice (its sound as rolling hills), with a paper price tag
 * (its size) hanging from the ledge. Tap a sleeve to download it; tap again to stop. The ledge
 * stays put while the sleeves slide along it.
 */
export function VoiceShelf({
  voices,
  downloads,
  onDownload,
  onCancel,
}: {
  voices: Voice[];
  /** Download progress (0-1) by voice id, while downloading. */
  downloads: Record<string, number | undefined>;
  onDownload: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  const { rich, motion } = useSceneQuality();
  return (
    <View style={{ height: HEIGHT }}>
      <Ledge width={width} top={LEDGE_TOP} rich={rich} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={StyleSheet.absoluteFill}>
        {voices.map((v) => (
          <Sleeve
            key={v.id}
            voice={v}
            progress={downloads[v.id]}
            motion={motion}
            rich={rich}
            onPress={() => (downloads[v.id] !== undefined ? onCancel(v.id) : onDownload(v.id))}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const Sleeve = memo(function Sleeve({
  voice,
  progress,
  motion,
  rich,
  onPress,
}: {
  voice: Voice;
  progress: number | undefined;
  motion: boolean;
  rich: boolean;
  onPress: () => void;
}) {
  const { r } = useScene();
  const scene = useMemo(() => voiceScene(voice), [voice]);
  const busy = progress !== undefined;
  const pct = Math.round((progress ?? 0) * 100);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={busy ? `Cancel ${voice.name} download, ${pct} percent` : `Download ${voice.name}, ${voiceSubtitle(voice, true)}`}
      style={{ width: SLEEVE_W, height: HEIGHT }}
    >
      {({ pressed }) => (
        <>
          <ContactShadow width={SLEEVE_W} bottom={HEIGHT - FEET} />
          <View style={[styles.sleeve, { transform: [{ translateY: pressed && motion ? -6 : 0 }], opacity: pressed && !motion ? 0.75 : 1 }]}>
            <PosterSheet
              band={scene.band}
              overline={voice.tags.slice(0, 2).join(' · ').toUpperCase()}
              title={voice.name}
              art={<PosterArt scene={scene} id={`voice-${voice.id}`} />}
              width={SLEEVE_W}
              height={SLEEVE_H}
              rich={rich}
            />
          </View>
          <View style={styles.tagWrap}>
            <PaperTag round style={styles.tag}>
              {busy ? <DownloadRing progress={progress} size={16} /> : <Icon name="download" size={13} color={r.tagText} strokeWidth={2.4} />}
              <Text style={[styles.tagText, { color: r.tagText }]} maxFontSizeMultiplier={1.2}>
                {busy ? `${pct}%` : `${voice.sizeMB} MB`}
              </Text>
            </PaperTag>
          </View>
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, gap: 18 },
  sleeve: { position: 'absolute', top: HEADROOM, left: 0 },
  tagWrap: { position: 'absolute', top: TAG_TOP, left: 0, right: 0, alignItems: 'center' },
  tag: { gap: 5, paddingHorizontal: 9, paddingVertical: 4 },
  tagText: { fontFamily: fontFamily.bold, fontSize: 12, letterSpacing: 0.4, fontVariant: ['tabular-nums'] },
});
