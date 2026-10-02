import { Directory, File, Paths } from 'expo-file-system';
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import { extOf } from '@/lib/media/mime';
import { storageProvider } from '@/lib/storage';
import type { Media } from '@/lib/types';

/**
 * Save originals to the camera roll, byte-for-byte: we download the exact uploaded file (HEIC
 * stays HEIC, full resolution, original video) and hand it to the media library. Items go into
 * a library album with the same name as the shared album.
 */
const saveDir = () => {
  const d = new Directory(Paths.cache, 'save');
  d.create({ intermediates: true, idempotent: true });
  return d;
};

function localName(m: Media) {
  const ext = extOf(m.storage_path) || 'jpg';
  const base = (m.original_filename?.replace(/\.[^.]+$/, '') || m.id).replace(/[^\w.-]+/g, '_');
  return `${base}.${ext}`;
}

export async function downloadOriginal(m: Media): Promise<File> {
  const url = await storageProvider.downloadUrl(m.storage_path, 3600);
  const dest = new File(saveDir(), localName(m));
  if (dest.exists) dest.delete();
  return File.downloadFileAsync(url, dest, { idempotent: true });
}

export class PermissionDenied extends Error {
  constructor() {
    super('permissionPhotos');
  }
}

export async function ensureSavePermission(): Promise<'full' | 'limited'> {
  const p = await requestPermissionsAsync(false);
  if (!p.granted) throw new PermissionDenied();
  return p.accessPrivileges === 'all' ? 'full' : 'limited';
}

/** Saves items; calls onProgress(done, total). Returns how many were saved. */
export async function saveToDevice(items: Media[], albumName: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  if (!items.length) return 0;
  const access = await ensureSavePermission();
  let album: Album | null = null;
  if (access === 'full') {
    try {
      album = await Album.get(albumName);
    } catch {
      album = null;
    }
  }
  let saved = 0;
  const saveOne = async (m: Media) => {
    try {
      const file = await downloadOriginal(m);
      const asset = await Asset.create(file.uri, album ?? undefined);
      // Create the library album once, with the first saved item (only possible with full access).
      if (!album && access === 'full') album = await Album.create(albumName, [asset], false);
      file.delete();
      saved++;
    } catch (e) {
      console.warn('[rolo] save failed', m.id, e);
    } finally {
      onProgress?.(saved, items.length);
    }
  };
  await saveOne(items[0]);
  // Then a few downloads in parallel; library writes are cheap.
  const queue = items.slice(1);
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) await saveOne(queue.shift()!);
    }),
  );
  return saved;
}

/** Share originals through the system share sheet (one sheet per file; up to 5 in a row). */
export async function shareOriginals(items: Media[]): Promise<void> {
  for (const m of items.slice(0, 5)) {
    const file = await downloadOriginal(m);
    await Sharing.shareAsync(file.uri, { mimeType: m.mime_type, dialogTitle: m.original_filename ?? undefined });
  }
}

export const MAX_SHARE = 5;
