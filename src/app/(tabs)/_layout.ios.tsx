import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/design/theme';

/**
 * iOS: the system tab bar (Liquid Glass on iOS 26). It needs SF Symbols or
 * template images; SF Symbols are a temporary exception to the custom-icon
 * rule until the Voxa icons are exported as template images (plan, phase 1).
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <NativeTabs tintColor={colors.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="live">
        <NativeTabs.Trigger.Icon sf="waveform" />
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="voices">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.wave.2', selected: 'person.wave.2.fill' }} />
        <NativeTabs.Trigger.Label>Voices</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} />
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
