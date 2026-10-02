import * as ImagePicker from 'expo-image-picker';

import type { MediaKind } from '@/lib/types';

export type Candidate = {
  key: string;
  assetId?: string | null;
  uri: string;
  filename: string;
  kind: MediaKind;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  capturedAt?: string | null;
  size?: number | null;
  livePhotoUri?: string | null;
};
export type LibraryAccess = 'undetermined' | 'denied' | 'limited' | 'all';

/** The browser has no photo library API: picking is the only way in. */
export async function getLibraryAccess(): Promise<LibraryAccess> {
  return 'denied';
}
export async function requestLibraryAccess(): Promise<LibraryAccess> {
  return 'denied';
}
export const manageLimitedAccess = async () => {};
export async function loadLibrary(_o: unknown): Promise<Candidate[]> {
  return [];
}

export async function pickWithSystemPicker(): Promise<Candidate[]> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 1 });
  if (r.canceled) return [];
  return r.assets.map((a, i) => ({
    key: `${a.uri}-${i}`,
    uri: a.uri,
    filename: a.fileName ?? `photo-${i}.jpg`,
    kind: a.type === 'video' || a.mimeType?.startsWith('video/') ? 'video' : 'photo',
    mimeType: a.mimeType ?? a.file?.type ?? null,
    width: a.width || null,
    height: a.height || null,
    durationMs: a.duration ?? null,
    size: a.fileSize ?? a.file?.size ?? null,
    capturedAt: a.file?.lastModified ? new Date(a.file.lastModified).toISOString() : null,
  }));
}
