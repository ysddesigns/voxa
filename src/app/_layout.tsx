import { useEffect, type ReactNode } from 'react';
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
import { NotoSerifDisplay_600SemiBold } from '@expo-google-fonts/noto-serif-display';
import { VoxaThemeProvider, useTheme } from '@/design/theme';
import { EngineProvider } from '@/engines/provider';
import { useStartupWarmUp } from '@/engines/warm-up';
import { ListenSessionProvider } from '@/features/listen/listen-session';
import { SpeakSessionProvider } from '@/features/speak/speak-session';
import { ModelsProvider } from '@/features/packs/models';
import { PrefsProvider, usePrefs } from '@/features/settings/prefs';
import { prefsStore, sessionStore } from '@/storage';
import { VoicesProvider } from '@/features/voices/voices-store';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const { colors, scheme } = useTheme();
  useStartupWarmUp();
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
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="custom-words" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="donate" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="licences" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="battery" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
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

/** Light, dark or follow the phone, saved in prefs. */
function SavedTheme({ children }: { children: ReactNode }) {
  const { prefs, update } = usePrefs();
  return (
    <VoxaThemeProvider preference={prefs.theme} onPreferenceChange={(theme) => update({ theme })}>
      {children}
    </VoxaThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    NotoSerifDisplay_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  // Always mount the navigator, even before the fonts load: a deep link that arrives while
  // nothing is mounted is dropped ("NAVIGATE ... was not handled"). The splash screen stays
  // up until the fonts are ready, so nothing shows in the fallback font.
  return (
    <PrefsProvider store={prefsStore}>
      <SavedTheme>
        <EngineProvider>
          <ModelsProvider>
            <VoicesProvider>
              <SpeakSessionProvider>
                <ListenSessionProvider store={sessionStore}>
                  <Root />
                </ListenSessionProvider>
              </SpeakSessionProvider>
            </VoicesProvider>
          </ModelsProvider>
        </EngineProvider>
      </SavedTheme>
    </PrefsProvider>
  );
}
