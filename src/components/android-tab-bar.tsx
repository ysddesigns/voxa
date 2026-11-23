import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiveBar, SpeakBar } from '@/components/live-bar';
import { useListen } from '@/features/listen/listen-session';
import { useSpeakSession } from '@/features/speak/speak-session';
import { useTheme } from '@/design/theme';
import { elevation } from '@/design/tokens';
import { type } from '@/design/type';
import { Icon, type IconName } from './icons';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export const TAB_ICONS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Home' },
  live: { icon: 'live', label: 'Live' },
  voices: { icon: 'voices', label: 'Voices' },
  library: { icon: 'library', label: 'Library' },
};

/**
 * Android tab bar: the Voxa pill, solid with a shadow. Blur behind it is slow
 * or missing on Android 8–11, so there is no glass effect here (PRD design rules).
 */
export function AndroidTabBar({ state, emitter, navigateToTab }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 12) + 8;
  const current = state.routes[state.index]?.name;
  const liveKey = state.routes.find((r) => r.name === 'live')?.key;
  const router = useRouter();
  const listening = useListen().status !== 'idle';
  const speaking = useSpeakSession().status !== 'idle';
  const above = [styles.live, { bottom: bottom + 64 + 8 }];

  return (
    <>
      {/* Just above the tabs: Listen while it runs (Live shows it all itself), else Speak for me. */}
      {listening ? (
        current !== 'live' && liveKey ? <LiveBar onOpen={() => navigateToTab(liveKey)} style={above} /> : null
      ) : speaking ? (
        <SpeakBar onOpen={() => router.push('/player')} style={above} />
      ) : null}
    <View
      style={[
        styles.bar,
        {
          bottom,
          backgroundColor: colors.tabBar,
          ...elevation(colors.shadow),
        },
      ]}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, index) => {
        const meta = TAB_ICONS[route.name] ?? { icon: 'home', label: route.name };
        const focused = state.index === index;
        const tint = focused ? colors.accentText : colors.textSecondary;
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            onPress={onPress}
            style={[styles.item, focused && { backgroundColor: colors.tabActiveFill }]}
          >
            <Icon name={meta.icon} color={tint} />
            {/* The bar has a fixed height, like the system's own tab bars: labels grow a little, not to 200%. */}
            {/* Full tab width, centred: sized to its own text, the label kept a width measured before the
                app font loaded and showed "Ho…" once the wider font arrived. */}
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[type.tab, { color: tint, alignSelf: 'stretch', textAlign: 'center' }]}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  live: { position: 'absolute', left: 16, right: 16 },
  bar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
