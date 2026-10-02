import { UPLOAD } from '@/config/limits';
import { env } from '@/config/env';
import { useAuth } from '@/features/auth/session';
import { getAccessToken, supabase } from '@/lib/supabase';
import { createSupabaseProvider } from './supabaseProvider';
import { patchTransport, smallBody } from './transport';

export * from './types';

export const storageProvider = createSupabaseProvider({
  client: supabase,
  url: env.supabaseUrl,
  anonKey: env.supabaseAnonKey,
  chunkSize: UPLOAD.chunkSize,
  getToken: getAccessToken,
  peekToken: () => useAuth.getState().session?.access_token ?? null,
  patch: patchTransport,
  smallBody,
});
