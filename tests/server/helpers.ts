import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export type User = { client: SupabaseClient; id: string; token: string };

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export async function anonUser(name?: string): Promise<User> {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  if (name) await client.rpc('update_profile', { p_display_name: name });
  return { client, id: data.user!.id, token: data.session!.access_token };
}

/** Calls an RPC and returns the ROLO error code (or null on success). */
export async function rpcError(user: User, fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await user.client.rpc(fn, args);
  if (!error) return null;
  const m = /ROLO:([a-z_]+)/.exec(error.message);
  return m ? m[1] : error.message;
}

export async function rpc<T = any>(user: User, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await user.client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

let hashCounter = 0;
export function fakeHash() {
  hashCounter += 1;
  return `md5-${Date.now().toString(16)}-${hashCounter}`;
}

export async function beginUpload(user: User, albumId: string, overrides: Record<string, unknown> = {}) {
  return rpc(user, 'begin_upload', {
    p_album_id: albumId,
    p_content_hash: fakeHash(),
    p_kind: 'photo',
    p_mime_type: 'image/heic',
    p_size_bytes: 1024,
    p_captured_at: new Date().toISOString(),
    p_extension: 'heic',
    ...overrides,
  });
}

/** Full happy-path upload: reserve, put bytes, finalize. Returns media id + path. */
export async function uploadPhoto(user: User, albumId: string, bytes = new Uint8Array([1, 2, 3, 4])) {
  const r = await beginUpload(user, albumId, { p_size_bytes: bytes.byteLength });
  const { error } = await user.client.storage.from('media').upload(r.storage_path, bytes, { contentType: 'image/heic' });
  if (error) throw new Error(`upload: ${error.message}`);
  await rpc(user, 'finalize_upload', { p_media_id: r.media_id, p_thumbhash: 'AAAA' });
  return r as { media_id: string; storage_path: string; thumb_path: string };
}
