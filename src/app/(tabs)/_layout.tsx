import { Tabs } from 'expo-router';
import { AndroidTabBar } from '@/components/android-tab-bar';
import { useTheme } from '@/design/theme';

/** Android (and web): the custom solid Voxa pill. iOS uses _layout.ios.tsx. */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <AndroidTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="live" options={{ title: 'Live' }} />
      <Tabs.Screen name="voices" options={{ title: 'Voices' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}
