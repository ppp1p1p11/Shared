import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/features/auth/session';
import { supabase } from './supabase';

type Sub = { table: 'media' | 'album_members' | 'albums'; filter?: string; event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE' };

/**
 * Subscribe to Postgres changes. Realtime enforces the same RLS as queries, so a client only
 * ever receives rows it could have selected.
 */
export function useRealtime(
  name: string | null,
  subs: Sub[],
  onChange: (table: Sub['table'], payload: RealtimePostgresChangesPayload<Record<string, any>>) => void,
) {
  const handler = useRef(onChange);
  handler.current = onChange;
  const token = useAuth((s) => s.session?.access_token);
  const key = JSON.stringify(subs);

  useEffect(() => {
    if (!name || !token) return;
    supabase.realtime.setAuth(token);
    let ch = supabase.channel(`${name}:${Math.random().toString(36).slice(2, 8)}`);
    for (const s of JSON.parse(key) as Sub[]) {
      ch = ch.on('postgres_changes' as any, { event: s.event ?? '*', schema: 'public', table: s.table, filter: s.filter }, (p: any) =>
        handler.current(s.table, p),
      );
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [name, key, token]);
}
