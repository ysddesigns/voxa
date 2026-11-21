import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { VoxaThemeProvider, useTheme } from '@/design/theme';
import { EngineProvider } from '@/engines/provider';
import { ListenSessionProvider } from '@/features/listen/listen-session';
import { SpeakSessionProvider } from '@/features/speak/speak-session';
import { PrefsProvider } from '@/features/settings/prefs';
import { prefsStore, sessionStore } from '@/storage';
import { VoicesProvider } from '@/features/voices/voices-store';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="editor" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="engine-lab" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="session/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="phrases" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="scan" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="player" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen
          name="voice-picker"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  // Always mount the navigator, even before the fonts load: a deep link that arrives while
  // nothing is mounted is dropped ("NAVIGATE ... was not handled"). The splash screen stays
  // up until the fonts are ready, so nothing shows in the fallback font.
  return (
    <VoxaThemeProvider>
      <EngineProvider>
        <PrefsProvider store={prefsStore}>
          <VoicesProvider>
            <SpeakSessionProvider>
              <ListenSessionProvider store={sessionStore}>
                <Root />
              </ListenSessionProvider>
            </SpeakSessionProvider>
          </VoicesProvider>
        </PrefsProvider>
      </EngineProvider>
    </VoxaThemeProvider>
  );
}
