import { useAuth } from '@/features/auth/session';
import { storageProvider } from './index';
import type { ImageSourceSpec } from './types';

/** Native: authenticated object URL + bearer header; expo-image caches by the stable path key. */
export function useMediaSource(path: string | null | undefined): ImageSourceSpec | null {
  useAuth((s) => s.session?.access_token); // re-render when the token rotates
  return path ? storageProvider.imageSource(path) : null;
}

export function prefetchMediaSources(_paths: string[]) {}
