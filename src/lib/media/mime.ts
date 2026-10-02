const MIME: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  hif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  dng: 'image/x-adobe-dng',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
};

export function extOf(filename: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(filename ?? '');
  return m ? m[1].toLowerCase() : '';
}

export function mimeFor(ext: string, fallbackKind: 'photo' | 'video' = 'photo'): string {
  return MIME[ext.toLowerCase()] ?? (fallbackKind === 'video' ? 'video/mp4' : 'image/jpeg');
}

export function extFor(mime: string | null | undefined, fallbackKind: 'photo' | 'video' = 'photo'): string {
  const hit = Object.entries(MIME).find(([, m]) => m === mime);
  return hit ? hit[0] : fallbackKind === 'video' ? 'mp4' : 'jpg';
}

export const isVideoMime = (mime: string) => mime.startsWith('video/');
