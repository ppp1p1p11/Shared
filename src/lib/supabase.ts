import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '@/config/env';
import { secureStorage } from './secureStorage';

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    storageKey: 'rolo.auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 20 } },
});

// Refresh tokens only while foregrounded (Supabase's recommended RN setup).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Current access token, refreshing if needed. Used by the upload transport. */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('ROLO:not_authenticated');
  const expiresSoon = (data.session.expires_at ?? 0) * 1000 - Date.now() < 60_000;
  if (expiresSoon) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) return refreshed.data.session.access_token;
  }
  return data.session.access_token;
}
