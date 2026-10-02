import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/session';
import { qk } from '@/lib/queryClient';
import { storageProvider } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { Media } from '@/lib/types';

export const MEDIA_COLUMNS =
  'id,album_id,uploader_id,kind,storage_path,thumb_path,preview_path,thumbhash,mime_type,width,height,duration_ms,size_bytes,live_photo_video_path,original_filename,captured_at,status,created_at';

/** All visible media for an album (RLS decides what "visible" means). Pages of 1,000 fetched in parallel. */
export async function fetchAlbumMedia(albumId: string): Promise<Media[]> {
  const page = 1000;
  const query = () =>
    supabase
      .from('media')
      .select(MEDIA_COLUMNS, { count: 'exact' })
      .eq('album_id', albumId)
      .in('status', ['ready', 'hidden'])
      .order('captured_at', { ascending: false })
      .order('id', { ascending: false });
  const first = await query().range(0, page - 1);
  if (first.error) throw new Error(first.error.message);
  const total = first.count ?? first.data?.length ?? 0;
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(total / page) - 1) }, (_, i) => query().range((i + 1) * page, (i + 2) * page - 1)),
  );
  const out = [...((first.data ?? []) as Media[])];
  for (const r of rest) {
    if (r.error) throw new Error(r.error.message);
    out.push(...((r.data ?? []) as Media[]));
  }
  return out;
}

export function useAlbumMedia(albumId: string) {
  const ready = useAuth((s) => s.status === 'ready');
  return useQuery({ queryKey: qk.media(albumId), enabled: ready && !!albumId, queryFn: () => fetchAlbumMedia(albumId), staleTime: 60_000 });
}

/** Apply a realtime row to the cached list without refetching 5,000 rows. */
export function applyMediaChange(list: Media[] | undefined, event: 'INSERT' | 'UPDATE' | 'DELETE', row: Partial<Media> & { id: string }): Media[] | undefined {
  if (!list) return list;
  const without = list.filter((m) => m.id !== row.id);
  if (event === 'DELETE' || (row.status !== 'ready' && row.status !== 'hidden')) return without;
  const merged = { ...(list.find((m) => m.id === row.id) ?? {}), ...row } as Media;
  const next = [...without, merged];
  next.sort((a, b) => (a.captured_at < b.captured_at ? 1 : a.captured_at > b.captured_at ? -1 : 0));
  return next;
}

export function useDeleteMedia(albumId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Media[]) => {
      // Bytes first (storage policies look at the rows), then rows.
      await storageProvider.remove(items.flatMap((m) => [m.storage_path, m.thumb_path, m.preview_path, m.live_photo_video_path]).filter(Boolean) as string[]);
      const { data, error } = await supabase.from('media').delete().in('id', items.map((m) => m.id)).select('id');
      if (error) throw new Error(error.message);
      return data?.length ?? 0;
    },
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: qk.media(albumId) });
      const prev = qc.getQueryData<Media[]>(qk.media(albumId));
      const ids = new Set(items.map((m) => m.id));
      qc.setQueryData<Media[]>(qk.media(albumId), (l) => l?.filter((m) => !ids.has(m.id)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.media(albumId), ctx.prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.albums });
      qc.invalidateQueries({ queryKey: qk.albumStorage(albumId) });
      qc.invalidateQueries({ queryKey: qk.usage });
    },
  });
}

export function useSetHidden(albumId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; hidden: boolean }) => {
      const { error } = await supabase.rpc('set_media_hidden', { p_media_id: v.id, p_hidden: v.hidden });
      if (error) throw new Error(error.message);
    },
    onMutate: ({ id, hidden }) =>
      qc.setQueryData<Media[]>(qk.media(albumId), (l) => l?.map((m) => (m.id === id ? { ...m, status: hidden ? 'hidden' : 'ready' } : m))),
  });
}

export async function reportMedia(mediaId: string, reason: string) {
  const uid = useAuth.getState().userId;
  const { error } = await supabase.from('reports').insert({ media_id: mediaId, reporter_id: uid, reason });
  if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
}
