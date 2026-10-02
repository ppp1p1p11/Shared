import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * In development, "localhost" on a phone/emulator is the phone itself. If the configured
 * Supabase URL points at localhost, swap in the host the Metro dev server is reachable at,
 * so a fresh clone works on simulators, emulators and real devices without editing .env.
 */
function resolveDevHost(url: string): string {
  if (Platform.OS === 'web') return url;
  if (!/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) return url;
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  const devHost = hostUri?.split(':')[0];
  if (devHost && devHost !== 'localhost' && devHost !== '127.0.0.1') {
    return url.replace(/\/\/(localhost|127\.0\.0\.1)/, `//${devHost}`);
  }
  if (Platform.OS === 'android') return url.replace(/\/\/(localhost|127\.0\.0\.1)/, '//10.0.2.2');
  return url;
}

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

export const env = {
  supabaseUrl: resolveDevHost(rawUrl),
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Public origin of the web build; invite links are `${webUrl}/j/<token>`. */
  webUrl: (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:8081').replace(/\/$/, ''),
  appScheme: 'rolo',
  /** iOS App Store / Play Store links for the web join page (placeholders in the prototype). */
  appStoreUrl: process.env.EXPO_PUBLIC_APP_STORE_URL ?? 'https://apps.apple.com/',
  playStoreUrl: process.env.EXPO_PUBLIC_PLAY_STORE_URL ?? 'https://play.google.com/store',
};

if (!env.supabaseAnonKey && __DEV__) {
  console.warn('[rolo] EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. Copy .env.example to .env (see README).');
}
