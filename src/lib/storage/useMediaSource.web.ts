import { useSyncExternalStore } from 'react';

import { storageProvider } from './index';
import type { ImageSourceSpec } from './types';

/**
 * Web: <img> can't send auth headers, so thumbnails use signed URLs. Requests made in the same
 * tick are batched into one createSignedUrls call; results are cached for the session.
 */
const TTL_S = 6 * 3600;
const cache = new Map<string, { url: string; exp: number }>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

function flush() {
  timer = null;
  const batch = [...pending];
  pending.clear();
  if (!batch.length) return;
  storageProvider
    .downloadUrls(batch, TTL_S)
    .then((map) => {
      const exp = Date.now() + (TTL_S - 300) * 1000;
      for (const [p, url] of Object.entries(map)) cache.set(p, { url, exp });
      version++;
      listeners.forEach((l) => l());
    })
    .catch(() => {});
}

function request(path: string) {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  pending.add(path);
  if (!timer) timer = setTimeout(flush, 16);
  return null;
}

export function prefetchMediaSources(paths: string[]) {
  paths.forEach(request);
}

export function useMediaSource(path: string | null | undefined): ImageSourceSpec | null {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => version,
  );
  if (!path) return null;
  const url = request(path);
  return url ? { uri: url, cacheKey: `media/${path}` } : null;
}
