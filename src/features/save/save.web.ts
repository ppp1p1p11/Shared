import { extOf } from '@/lib/media/mime';
import { supabase } from '@/lib/supabase';
import type { Media } from '@/lib/types';

/** Web: download the untouched originals via signed URLs with a download filename. */
function filename(m: Media) {
  const ext = extOf(m.storage_path) || 'jpg';
  return `${(m.original_filename?.replace(/\.[^.]+$/, '') || m.id).replace(/[^\w.-]+/g, '_')}.${ext}`;
}

export class PermissionDenied extends Error {}

export async function ensureSavePermission(): Promise<'full'> {
  return 'full';
}

export async function saveToDevice(items: Media[], _albumName: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  let done = 0;
  for (const m of items) {
    const { data } = await supabase.storage.from('media').createSignedUrl(m.storage_path, 600, { download: filename(m) });
    if (data?.signedUrl) {
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = filename(m);
      document.body.appendChild(a);
      a.click();
      a.remove();
      done++;
      await new Promise((r) => setTimeout(r, 350)); // browsers throttle bursts of downloads
    }
    onProgress?.(done, items.length);
  }
  return done;
}

export async function shareOriginals(items: Media[]): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  const files: File[] = [];
  for (const m of items.slice(0, 5)) {
    const { data } = await supabase.storage.from('media').download(m.storage_path);
    if (data) files.push(new File([data], filename(m), { type: m.mime_type }));
  }
  if (nav.share && nav.canShare?.({ files })) await nav.share({ files });
  else await saveToDevice(items, '');
}

export async function downloadOriginal(_m: Media): Promise<never> {
  throw new Error('not on web');
}

export const MAX_SHARE = 5;
