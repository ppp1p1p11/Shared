import { AppState, Platform } from 'react-native';

import { UPLOAD } from '@/config/limits';
import { queryClient, qk } from '@/lib/queryClient';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { storageProvider, UploadHttpError } from '@/lib/storage';
import { notify } from '@/features/notifications/notify';
import i18n from '@/i18n';
import { backoffMs, classifyFailure, pickRunnable } from './logic';
import { mediaOps } from './mediaOps';
import { useUploads } from './store';
import type { TusSession, UploadItem } from './types';

/**
 * Upload engine: drains the persisted queue with bounded concurrency.
 *   1. stage   – copy the original (HEIC/RAW/video untouched), hash it, read capture date
 *   2. reserve – begin_upload RPC: membership, dedup and owner-quota checks; returns paths
 *   3. strip   – remove GPS in place unless the album keeps location
 *   4. thumb   – 480px JPEG + thumbhash for instant grids
 *   5. upload  – TUS chunks (resumable from the server offset), live video, thumbnail
 *   6. finalize – finalize_upload RPC runs the moderation hook and publishes the item
 * Every step persists its result, so a crash or kill resumes at the right step.
 */
const running = new Map<string, AbortController>();
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

const get = (id: string) => useUploads.getState().items.find((i) => i.id === id);
const patch = (id: string, p: Partial<UploadItem>) => useUploads.getState().patch(id, p);

class Paused extends Error {}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function tusUpload(id: string, key: 'original' | 'live', uri: string, size: number, path: string, contentType: string, baseSent: number, signal: AbortSignal) {
  let sess: TusSession | undefined = get(id)?.tus?.[key];
  if (sess) {
    const off = await storageProvider.getOffset(sess.uploadUrl).catch(() => null);
    sess = off == null ? undefined : { ...sess, offset: off };
  }
  if (!sess) {
    const t = await storageProvider.createResumable({ path, size, contentType });
    sess = { uploadUrl: t.uploadUrl, offset: 0, size };
  }
  const save = (s: TusSession) => patch(id, { tus: { ...get(id)?.tus, [key]: s }, bytesSent: baseSent + s.offset });
  save(sess);
  while (sess.offset < size) {
    if (signal.aborted || useUploads.getState().network !== 'ok') throw new Paused();
    const len = Math.min(UPLOAD.chunkSize, size - sess.offset);
    const body = await mediaOps.readChunk(uri, sess.offset, len, get(id));
    let next: number;
    try {
      const at = sess.offset;
      next = await storageProvider.uploadChunk({
        uploadUrl: sess.uploadUrl,
        offset: at,
        length: len,
        body,
        signal,
        onProgress: (n) => patch(id, { bytesSent: baseSent + at + Math.min(n, len) }),
      });
    } finally {
      mediaOps.releaseChunk(body);
    }
    sess = { ...sess, offset: next };
    save(sess);
  }
}

async function processItem(id: string, signal: AbortSignal) {
  let item = get(id)!;
  patch(id, { state: 'preparing', error: undefined });

  // 1. stage
  if (!item.staged || !mediaOps.sourceAvailable(item)) {
    const staged = await mediaOps.stage(item);
    patch(id, { staged, bytesTotal: staged.size + (staged.liveSize ?? 0) });
    item = get(id)!;
  }
  const staged = item.staged!;

  // 2. reserve (dedup + quota are decided by the server)
  if (!item.server) {
    const r = await rpc<any>('begin_upload', {
      p_album_id: item.albumId,
      p_content_hash: staged.contentHash,
      p_kind: item.source.kind,
      p_mime_type: staged.mimeType,
      p_size_bytes: staged.size,
      p_captured_at: staged.capturedAt,
      p_extension: staged.ext,
      p_width: staged.width,
      p_height: staged.height,
      p_duration_ms: staged.durationMs,
      p_original_filename: item.source.filename,
      p_live_photo_size_bytes: staged.liveSize ?? 0,
    });
    if (r.duplicate) {
      patch(id, { state: 'duplicate', mediaId: r.media_id, bytesSent: get(id)!.bytesTotal });
      mediaOps.cleanup(id);
      return;
    }
    patch(id, {
      server: {
        mediaId: r.media_id,
        storagePath: r.storage_path,
        thumbPath: r.thumb_path ?? r.storage_path.replace(/original\.[^/]+$/, 'thumb.jpg'),
        previewPath: r.preview_path ?? r.storage_path.replace(/original\.[^/]+$/, 'preview.jpg'),
        livePath: r.live_photo_video_path ?? null,
        keepLocation: !!r.keep_location,
      },
    });
    item = get(id)!;
  }
  const server = item.server!;

  // 3. location (once)
  if (!server.keepLocation && !staged.locationRemoved) {
    const removed = await mediaOps.stripLocation(staged, item);
    patch(id, { staged: { ...get(id)!.staged!, locationRemoved: removed } });
  }

  // 4. thumbnail + thumbhash (once)
  if (!get(id)!.staged!.thumbUri && !get(id)!.staged!.thumbFailed) {
    try {
      const t = await mediaOps.makeThumb(get(id)!, get(id)!.staged!);
      patch(id, { staged: { ...get(id)!.staged!, thumbUri: t.thumbUri, previewUri: t.previewUri, thumbhash: t.thumbhash, width: t.width, height: t.height } });
    } catch (e) {
      // Never block the original on a thumbnail: the grid falls back to a placeholder.
      console.warn('[rolo] thumbnail failed, uploading original anyway', e);
      patch(id, { staged: { ...get(id)!.staged!, thumbFailed: true } });
    }
  }

  // 5. bytes
  patch(id, { state: 'uploading' });
  await tusUpload(id, 'original', staged.originalUri, staged.size, server.storagePath, staged.mimeType, 0, signal);
  if (staged.liveUri && server.livePath) {
    await tusUpload(id, 'live', staged.liveUri, staged.liveSize ?? 0, server.livePath, 'video/quicktime', staged.size, signal);
  }
  if (!get(id)!.thumbUploaded) {
    const body = mediaOps.thumbBody(get(id)!);
    if (body) await storageProvider.uploadSmall({ path: server.thumbPath, body, contentType: 'image/jpeg' });
    patch(id, { thumbUploaded: true });
  }
  if (!get(id)!.previewUploaded) {
    const body = mediaOps.previewBody(get(id)!);
    if (body) await storageProvider.uploadSmall({ path: server.previewPath, body, contentType: 'image/jpeg' });
    patch(id, { previewUploaded: true });
  }

  // 6. publish (runs the server-side moderation hook)
  patch(id, { state: 'finalizing' });
  const s = get(id)!.staged!;
  await rpc('finalize_upload', { p_media_id: server.mediaId, p_thumbhash: s.thumbhash ?? null, p_width: s.width, p_height: s.height });
  patch(id, { state: 'done', mediaId: server.mediaId, bytesSent: get(id)!.bytesTotal });
  mediaOps.cleanup(id);
  queryClient.invalidateQueries({ queryKey: qk.media(item.albumId) });
}

async function run(id: string) {
  if (running.has(id)) return;
  const ctrl = new AbortController();
  running.set(id, ctrl);
  try {
    await processItem(id, ctrl.signal);
  } catch (err) {
    const item = get(id);
    if (!item) return;
    if (err instanceof Paused || (err as Error)?.name === 'AbortError') {
      patch(id, { state: 'queued' });
    } else {
      const kind = classifyFailure(err);
      const attempts = item.attempts + 1;
      if (__DEV__) console.warn('[rolo] upload failed', kind, err);
      if (kind === 'quota') {
        patch(id, { state: 'paused_quota', error: 'quota_exceeded' });
        queryClient.invalidateQueries({ queryKey: qk.albumStorage(item.albumId) });
      } else if (kind === 'fatal' || (kind === 'retry' && attempts >= UPLOAD.maxAttempts) || String((err as Error)?.message).includes('source_lost')) {
        patch(id, { state: 'failed', attempts, error: (err as Error)?.message?.slice(0, 200) });
      } else if (kind === 'offline') {
        patch(id, { state: 'queued', nextAttemptAt: Date.now() + 3000 }); // doesn't burn an attempt
      } else {
        if (kind === 'auth') await supabase.auth.refreshSession().catch(() => {});
        // A rejected TUS session (e.g. expired) restarts that object from scratch next time.
        const tus = err instanceof UploadHttpError && [404, 410].includes(err.status) ? undefined : item.tus;
        patch(id, { state: 'queued', attempts, tus, nextAttemptAt: Date.now() + backoffMs(attempts), error: (err as Error)?.message?.slice(0, 200) });
      }
    }
  } finally {
    running.delete(id);
    onSettled();
    setTimeout(tick, 0);
  }
}

let batchHadWork = false;
function onSettled() {
  const items = useUploads.getState().items;
  const busy = items.some((i) => ['queued', 'preparing', 'uploading', 'finalizing'].includes(i.state));
  if (!busy && batchHadWork) {
    batchHadWork = false;
    const done = items.filter((i) => i.state === 'done').length;
    if (done > 0) {
      haptics.success();
      if (AppState.currentState !== 'active') notify({ title: i18n.t('queue.pillDone'), body: i18n.t('common.items', { count: done }) });
    }
    queryClient.invalidateQueries({ queryKey: qk.albums });
  }
}

let ticking = false;
export function tick() {
  // Starting an item updates the store, which notifies subscribers synchronously; guard against
  // re-entrancy so the same item can never be started twice.
  if (ticking) return;
  ticking = true;
  try {
    const { items, network, hydrated } = useUploads.getState();
    if (!hydrated || network !== 'ok') return;
    const now = Date.now();
    const notRunning = items.map((i) => (running.has(i.id) && i.state === 'queued' ? { ...i, state: 'preparing' as const } : i));
    for (const item of pickRunnable(notRunning, now)) {
      if (running.has(item.id) || get(item.id)?.state !== 'queued') continue;
      batchHadWork = true;
      run(item.id);
    }
  } finally {
    ticking = false;
  }
  const { items } = useUploads.getState();
  const now = Date.now();
  // Wake up for the next backoff deadline.
  const next = items.filter((i) => i.state === 'queued' && i.nextAttemptAt && i.nextAttemptAt > now).map((i) => i.nextAttemptAt!);
  if (wakeTimer) clearTimeout(wakeTimer);
  if (next.length) wakeTimer = setTimeout(tick, Math.max(250, Math.min(...next) - now));
}

export function cancelUpload(id: string) {
  running.get(id)?.abort();
  const item = get(id);
  if (item?.server && item.state !== 'done') {
    // Release the reservation so the space and dedup slot free up.
    supabase.from('media').delete().eq('id', item.server.mediaId).then(() => {});
  }
  mediaOps.cleanup(id);
  useUploads.getState().remove(id);
}

/** Starts the engine once: reacts to queue changes, network and app state. */
export function startUploadEngine() {
  if (started) return;
  started = true;
  useUploads.subscribe((s, prev) => {
    if (s.items !== prev.items || s.network !== prev.network || s.hydrated !== prev.hydrated) tick();
  });
  AppState.addEventListener('change', (st) => st === 'active' && tick());
  if (Platform.OS === 'web') {
    window.addEventListener('online', () => useUploads.getState().setNetwork('ok'));
    window.addEventListener('offline', () => useUploads.getState().setNetwork('offline'));
  }
  tick();
}

/** For the background task: run until the queue is idle or the time budget is used. */
export async function drainFor(ms: number) {
  startUploadEngine();
  const until = Date.now() + ms;
  while (Date.now() < until) {
    tick();
    const busy = useUploads.getState().items.some((i) => ['queued', 'preparing', 'uploading', 'finalizing'].includes(i.state));
    if (!busy) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
