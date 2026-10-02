import { useMemo } from 'react';

import { useAuth } from '@/features/auth/session';
import { storageProvider } from './index';
import type { ImageSourceSpec } from './types';

/** Native: authenticated object URL + bearer header; expo-image caches by the stable path key. */
export function useMediaSource(path: string | null | undefined): ImageSourceSpec | null {
  const token = useAuth((s) => s.session?.access_token ?? null);
  return useMemo(() => (path && token ? storageProvider.imageSource(path, token) : null), [path, token]);
}

export function prefetchMediaSources(_paths: string[]) {}
