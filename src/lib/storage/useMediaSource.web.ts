import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { storageProvider } from './index';
import type { ImageSourceSpec } from './types';

/**
 * Web: <img> can't send auth headers, so thumbnails use signed URLs. Requests made in the same
 * tick are batched into one createSignedUrls call; results are cached for the session.
 * (The URL is read through useSyncExternalStore so React Compiler memoization stays correct.)
 */
const TTL_S = 6 * 3600;
const cache = new Map<string, { url: string; exp: number }>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

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
      listeners.forEach((l) => l());
    })
    .catch(() => {});
}

function peek(path: string): string | null {
  const hit = cache.get(path);
  return hit && hit.exp > Date.now() ? hit.url : null;
}

function request(path: string) {
  if (peek(path) || pending.has(path)) return;
  pending.add(path);
  if (!timer) timer = setTimeout(flush, 16);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function prefetchMediaSources(paths: string[]) {
  paths.forEach(request);
}

export function useMediaSource(path: string | null | undefined): ImageSourceSpec | null {
  const url = useSyncExternalStore(
    subscribe,
    () => (path ? peek(path) : null),
    () => null,
  );
  useEffect(() => {
    if (path && !url) request(path);
  }, [path, url]);
  return useMemo(() => (url && path ? { uri: url, cacheKey: `media/${path}` } : null), [url, path]);
}
