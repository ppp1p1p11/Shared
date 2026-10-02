import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

type AuthState = {
  status: 'loading' | 'ready' | 'error';
  session: Session | null;
  userId: string | null;
  isAnonymous: boolean;
  email: string | null;
  phone: string | null;
};

export const useAuth = create<AuthState>(() => ({
  status: 'loading',
  session: null,
  userId: null,
  isAnonymous: true,
  email: null,
  phone: null,
}));

function apply(session: Session | null) {
  const user = session?.user;
  useAuth.setState({
    status: session ? 'ready' : useAuth.getState().status,
    session,
    userId: user?.id ?? null,
    isAnonymous: user?.is_anonymous ?? true,
    email: user?.email || null,
    phone: user?.phone || null,
  });
}

let started = false;

/**
 * Silent identity: reuse the device's session, or create an anonymous user.
 * No sign-up screen, no prompts. The refresh token in secure storage is the device token.
 */
export async function bootstrapAuth() {
  if (started) return;
  started = true;
  supabase.auth.onAuthStateChange((_event, session) => apply(session));
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      apply(data.session);
      return;
    }
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    apply(anon.session);
  } catch (e) {
    console.warn('[rolo] auth bootstrap failed', e);
    useAuth.setState({ status: 'error' });
  }
}

export async function retryAuth() {
  started = false;
  useAuth.setState({ status: 'loading' });
  await bootstrapAuth();
}

export const currentUserId = () => useAuth.getState().userId;
