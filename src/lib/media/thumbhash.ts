import jpeg from 'jpeg-js';
import { rgbaToThumbHash } from 'thumbhash';

import { base64ToBytes, bytesToBase64 } from '@/lib/base64';

/** Thumbhash from RGBA pixels (≤100×100). */
export function thumbhashFromRgba(w: number, h: number, rgba: Uint8Array | Uint8ClampedArray): string {
  return bytesToBase64(rgbaToThumbHash(w, h, rgba));
}

/** Thumbhash from a tiny JPEG (base64), as produced by the image manipulator. */
export function thumbhashFromJpegBase64(b64: string): string {
  const img = jpeg.decode(base64ToBytes(b64), { useTArray: true, formatAsRGBA: true });
  return thumbhashFromRgba(img.width, img.height, img.data);
}
