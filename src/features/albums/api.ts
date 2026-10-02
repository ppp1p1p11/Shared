import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/session';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Album, AlbumPreview, AlbumStorage, AlbumSummary, Member, Usage } from '@/lib/types';
import { storageProvider } from '@/lib/storage';

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const useReady = () => useAuth((s) => s.status === 'ready');

// ─── queries

export function useMyAlbums() {
  const ready = useReady();
  return useQuery({ queryKey: qk.albums, queryFn: () => rpc<AlbumSummary[]>('list_my_albums'), enabled: ready });
}

export function useAlbum(id: string) {
  const ready = useReady();
  return useQuery({
    queryKey: qk.album(id),
    enabled: ready && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('albums').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('ROLO:not_a_member');
      return data as Album;
    },
  });
}

export function useMembers(albumId: string) {
  const ready = useReady();
  return useQuery({
    queryKey: qk.members(albumId),
    enabled: ready && !!albumId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('album_members')
        .select('album_id,user_id,role,status,auto_save,joined_at,requested_at,profile:profiles(display_name,avatar_color)')
        .eq('album_id', albumId)
        .in('status', ['active', 'pending'])
        .order('role', { ascending: true })
        .order('joined_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data as unknown as Member[];
    },
  });
}

export function usePreview(token: string | undefined) {
  const ready = useReady();
  return useQuery({
    queryKey: qk.preview(token ?? ''),
    enabled: ready && !!token,
    queryFn: () => rpc<AlbumPreview>('get_album_preview', { p_token: token }),
    staleTime: 0,
  });
}

export function useMyUsage() {
  const ready = useReady();
  return useQuery({ queryKey: qk.usage, enabled: ready, queryFn: () => rpc<Usage>('get_my_usage') });
}

export function useAlbumStorage(albumId: string) {
  const ready = useReady();
  return useQuery({
    queryKey: qk.albumStorage(albumId),
    enabled: ready && !!albumId,
    queryFn: () => rpc<AlbumStorage>('get_album_storage', { p_album_id: albumId }),
  });
}

// ─── mutations

export function useCreateAlbum() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; startDate?: string | null; endDate?: string | null }) =>
      rpc<Album>('create_album', { p_name: v.name, p_start_date: v.startDate ?? null, p_end_date: v.endDate ?? null }),
    onSuccess: (album) => {
      qc.setQueryData(qk.album(album.id), album);
      qc.invalidateQueries({ queryKey: qk.albums });
      qc.invalidateQueries({ queryKey: qk.usage });
    },
  });
}

export function useJoinAlbum() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { token: string; displayName?: string }) =>
      rpc<{ album_id: string; status: 'active' | 'pending' }>('join_album', { p_token: v.token, p_display_name: v.displayName ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.albums });
      qc.invalidateQueries({ queryKey: qk.profile });
    },
  });
}

export function useUpdateAlbum(albumId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Album, 'name' | 'start_date' | 'end_date' | 'join_mode' | 'is_locked' | 'keep_location' | 'cover_media_id' | 'invite_expiry_hours'>>) =>
      rpc<Album>('update_album', { p_album_id: albumId, p_patch: patch }),
    // Optimistic: settings toggles feel instant; rolled back on error.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.album(albumId) });
      const prev = qc.getQueryData<Album>(qk.album(albumId));
      if (prev) qc.setQueryData(qk.album(albumId), { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.album(albumId), ctx.prev),
    onSuccess: (album) => qc.setQueryData(qk.album(albumId), album),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.albums }),
  });
}

export function useResetLink(albumId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc<Album>('reset_invite_link', { p_album_id: albumId }),
    onSuccess: (album) => qc.setQueryData(qk.album(albumId), album),
  });
}

export function useRespondToRequest(albumId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; approve: boolean }) =>
      rpc<void>('respond_to_request', { p_album_id: albumId, p_user_id: v.userId, p_approve: v.approve }),
    onMutate: async ({ userId, approve }) => {
      await qc.cancelQueries({ queryKey: qk.members(albumId) });
      const prev = qc.getQueryData<Member[]>(qk.members(albumId));
      if (prev) {
        qc.setQueryData(
          qk.members(albumId),
          approve
            ? prev.map((m) => (m.user_id === userId ? { ...m, status: 'active' as const, joined_at: new Date().toISOString() } : m))
            : prev.filter((m) => m.user_id !== userId),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.members(albumId), ctx.prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.members(albumId) });
      qc.invalidateQueries({ queryKey: qk.albums });
    },
  });
}

/** Paths of a user's uploads in an album (owner can see all, including hidden). */
async function uploadPaths(albumId: string, userId?: string) {
  let q = supabase.from('media').select('storage_path,thumb_path,preview_path,live_photo_video_path').eq('album_id', albumId);
  if (userId) q = q.eq('uploader_id', userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((m) => [m.storage_path, m.thumb_path, m.preview_path, m.live_photo_video_path]).filter(Boolean) as string[];
}

export function useRemoveMember(albumId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { userId: string; deleteUploads: boolean }) => {
      // Storage objects first (policies need the rows to still exist), then the row change.
      if (v.deleteUploads) await storageProvider.remove(await uploadPaths(albumId, v.userId));
      await rpc('remove_member', { p_album_id: albumId, p_user_id: v.userId, p_delete_uploads: v.deleteUploads });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.members(albumId) });
      qc.invalidateQueries({ queryKey: qk.media(albumId) });
      qc.invalidateQueries({ queryKey: qk.albums });
    },
  });
}

export function useLeaveAlbum(albumId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc('leave_album', { p_album_id: albumId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.albums }),
  });
}

export function useDeleteAlbum(albumId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await storageProvider.remove(await uploadPaths(albumId));
      await rpc('delete_album', { p_album_id: albumId });
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: qk.album(albumId) });
      qc.removeQueries({ queryKey: qk.media(albumId) });
      qc.invalidateQueries({ queryKey: qk.albums });
      qc.invalidateQueries({ queryKey: qk.usage });
    },
  });
}

export function useSetAutoSave(albumId: string) {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.userId);
  return useMutation({
    mutationFn: (enabled: boolean) => rpc('set_auto_save', { p_album_id: albumId, p_enabled: enabled }),
    onMutate: async (enabled) => {
      const prev = qc.getQueryData<Member[]>(qk.members(albumId));
      if (prev) qc.setQueryData(qk.members(albumId), prev.map((m) => (m.user_id === userId ? { ...m, auto_save: enabled } : m)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.members(albumId), ctx.prev),
  });
}

export function inviteUrl(webUrl: string, token: string) {
  return `${webUrl}/j/${token}`;
}

/** Accepts a full invite link (https or rolo://) or a bare token; returns the token. */
export function parseInviteToken(input: string): string | null {
  const s = input.trim();
  const m = /(?:\/j\/|^)([A-Za-z0-9_-]{20,64})(?:[/?#].*)?$/.exec(s);
  return m ? m[1] : null;
}
