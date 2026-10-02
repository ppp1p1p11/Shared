import SparkMD5 from 'spark-md5';

import { UPLOAD } from '@/config/limits';
import { extFor, extOf, mimeFor } from '@/lib/media/mime';
import { memoryAccess } from '@/lib/media/randomAccess';
import { readCaptureDate, stripLocation } from '@/lib/media/stripLocation';
import { thumbhashFromRgba } from '@/lib/media/thumbhash';
import type { ChunkBody } from '@/lib/storage';
import type { Staged, UploadItem } from './types';

/**
 * Web media pipeline ("continue in browser"). Picked files live in memory for the session;
 * if the tab is closed mid-upload, unfinished items are marked as needing to be re-picked.
 */
const blobs = new Map<string, Blob>(); // item id → (possibly location-stripped) original
const thumbs = new Map<string, Blob>();
const previews = new Map<string, Blob>();

async function blobFor(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function videoFrame(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = src;
    v.onloadeddata = () => {
      v.currentTime = Math.min(0.4, (v.duration || 1) / 2);
    };
    v.onseeked = () => {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0);
      resolve(c);
    };
    v.onerror = reject;
  });
}

function scaled(source: CanvasImageSource, w: number, h: number, maxW: number) {
  const scale = Math.min(1, maxW / w);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

export const mediaOps = {
  async stage(item: UploadItem): Promise<Staged> {
    const s = item.source;
    const blob = await blobFor(s.uri);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ext = extOf(s.filename) || extFor(s.mimeType || blob.type, s.kind);
    const spark = new SparkMD5.ArrayBuffer();
    spark.append(bytes.buffer as ArrayBuffer);
    // EXIF capture date wins; the file's modification time is only a fallback.
    const capturedAt = (s.kind === 'photo' ? await readCaptureDate(memoryAccess(bytes)) : null) ?? s.capturedAt;
    blobs.set(item.id, new Blob([bytes], { type: s.mimeType || blob.type }));
    return {
      originalUri: s.uri,
      size: bytes.byteLength,
      mimeType: s.mimeType || blob.type || mimeFor(ext, s.kind),
      ext,
      contentHash: `md5:${spark.end()}`,
      capturedAt: capturedAt ?? new Date().toISOString(),
      width: s.width ?? null,
      height: s.height ?? null,
      durationMs: s.durationMs ?? null,
    };
  },

  async stripLocation(_staged: Staged, item?: UploadItem): Promise<string[]> {
    const id = item?.id;
    const blob = id ? blobs.get(id) : undefined;
    if (!blob || !id) return [];
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const r = await stripLocation(memoryAccess(bytes));
    blobs.set(id, new Blob([bytes], { type: blob.type }));
    return r.removed;
  },

  async makeThumb(item: UploadItem, staged: Staged) {
    const url = URL.createObjectURL(blobs.get(item.id) ?? (await blobFor(staged.originalUri)));
    try {
      let src: CanvasImageSource;
      let w: number;
      let h: number;
      if (item.source.kind === 'video') {
        const c = await videoFrame(url);
        src = c;
        w = c.width;
        h = c.height;
      } else {
        const img = await loadImage(url);
        src = img;
        w = img.naturalWidth;
        h = img.naturalHeight;
      }
      const thumb = scaled(src, w, h, UPLOAD.thumbWidth);
      const blob: Blob = await new Promise((r) => thumb.toBlob((b) => r(b!), 'image/jpeg', UPLOAD.thumbQuality));
      thumbs.set(item.id, blob);
      const big = scaled(src, w, h, UPLOAD.previewWidth);
      const bigBlob: Blob = await new Promise((r) => big.toBlob((b) => r(b!), 'image/jpeg', UPLOAD.previewQuality));
      previews.set(item.id, bigBlob);
      const tiny = scaled(src, w, h, 32);
      const data = tiny.getContext('2d')!.getImageData(0, 0, tiny.width, tiny.height).data;
      return { thumbUri: URL.createObjectURL(blob), previewUri: null, thumbhash: thumbhashFromRgba(tiny.width, tiny.height, data), width: staged.width ?? w, height: staged.height ?? h };
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  async readChunk(_uri: string, offset: number, length: number, item?: UploadItem): Promise<ChunkBody> {
    const blob = item ? blobs.get(item.id) : undefined;
    if (!blob) throw new Error('ROLO:source_lost');
    return { kind: 'bytes', data: blob.slice(offset, offset + length) };
  },

  releaseChunk(_body: ChunkBody) {},

  thumbBody(item: UploadItem): ChunkBody | null {
    const b = thumbs.get(item.id);
    return b ? { kind: 'bytes', data: b } : null;
  },

  previewBody(item: UploadItem): ChunkBody | null {
    const b = previews.get(item.id);
    return b ? { kind: 'bytes', data: b } : null;
  },

  cleanup(itemId: string) {
    blobs.delete(itemId);
    thumbs.delete(itemId);
    previews.delete(itemId);
  },

  previewUri(item: UploadItem): string {
    return item.staged?.thumbUri ?? item.source.uri;
  },

  sourceAvailable(item: UploadItem): boolean {
    return blobs.has(item.id) || item.state === 'queued';
  },
};

export type MediaOps = typeof mediaOps;
