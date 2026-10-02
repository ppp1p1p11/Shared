import '@/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OverlayHost } from '@/components/ui/OverlayHost';
import { AppRuntime } from '@/features/runtime/AppRuntime';
import { bootstrapAuth, useAuth } from '@/features/auth/session';
import { setLanguage } from '@/i18n';
import { queryClient } from '@/lib/queryClient';
import { usePrefs } from '@/stores/prefs';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 220, fade: true });

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Shell />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { scheme, colors } = useTheme();
  const authStatus = useAuth((s) => s.status);
  const language = usePrefs((s) => s.language);

  useEffect(() => {
    bootstrapAuth();
  }, []);
  useEffect(() => setLanguage(language), [language]);
  useEffect(() => {
    if (authStatus !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [authStatus]);

  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: colors.accent, background: colors.bg, card: colors.bg, text: colors.text, border: colors.separator },
    };
  }, [scheme, colors]);

  const sheet = {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    contentStyle: { backgroundColor: colors.surfaceRaised },
  };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="create" options={{ ...sheet, sheetAllowedDetents: 'fitToContents' }} />
        <Stack.Screen name="join/index" options={{ ...sheet, sheetAllowedDetents: 'fitToContents' }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="j/[token]" options={{ animation: 'fade' }} />
        <Stack.Screen name="waiting/[albumId]" options={{ animation: 'fade', gestureEnabled: true }} />
        <Stack.Screen name="album/[id]/index" options={{ contentStyle: { backgroundColor: colors.bgPhoto } }} />
        <Stack.Screen name="album/[id]/share" options={{ presentation: 'modal', contentStyle: { backgroundColor: colors.bg } }} />
        <Stack.Screen name="album/[id]/settings" options={{ presentation: 'modal', contentStyle: { backgroundColor: colors.bg } }} />
        <Stack.Screen name="album/[id]/upload" options={{ presentation: 'modal', contentStyle: { backgroundColor: colors.bg } }} />
        <Stack.Screen name="uploads" options={{ ...sheet, sheetAllowedDetents: [0.5, 1] }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', contentStyle: { backgroundColor: colors.bg } }} />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/account" />
      </Stack>
      <AppRuntime />
      <OverlayHost />
    </NavThemeProvider>
  );
}
