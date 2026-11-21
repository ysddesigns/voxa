import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme';
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

  return (
    <View
      style={[
        styles.bar,
        {
          bottom: Math.max(insets.bottom, 12) + 8,
          backgroundColor: colors.tabBar,
          shadowColor: '#000',
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
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[type.tab, { color: tint }]}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    elevation: 8,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
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
