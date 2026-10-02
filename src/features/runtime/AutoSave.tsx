import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/features/auth/session';
import { saveToDevice } from '@/features/save/save';
import { useRealtime } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import type { Media } from '@/lib/types';

/**
 * "Auto-save new photos to my gallery": while the app runs, new items from others in albums
 * where I enabled it are saved to my phone in original quality (batched every few seconds).
 */
const pending = new Map<string, Media[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function AutoSave() {
  const userId = useAuth((s) => s.userId);
  const enabled = useQuery({
    queryKey: ['autoSaveAlbums', userId],
    enabled: !!userId && Platform.OS !== 'web',
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('album_members').select('album_id, albums(name)').eq('user_id', userId!).eq('status', 'active').eq('auto_save', true);
      return (data ?? []).map((r: any) => ({ id: r.album_id as string, name: (r.albums?.name as string) ?? 'Rolo' }));
    },
  });
  const albums = useMemo(() => enabled.data ?? [], [enabled.data]);
  const filter = albums.length ? `album_id=in.(${albums.map((a) => a.id).join(',')})` : undefined;

  useRealtime(albums.length && userId ? `autosave` : null, filter ? [{ table: 'media', event: 'UPDATE', filter }] : [], (_t, payload) => {
    const m = payload.new as Media;
    const old = payload.old as Partial<Media>;
    if (m.status !== 'ready' || old?.status === 'ready' || m.uploader_id === userId) return;
    const album = albums.find((a) => a.id === m.album_id);
    if (!album) return;
    pending.set(album.name, [...(pending.get(album.name) ?? []), m]);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => {
      const batches = [...pending.entries()];
      pending.clear();
      for (const [name, items] of batches) await saveToDevice(items, name).catch(() => {});
    }, 4000);
  });
  return null;
}
