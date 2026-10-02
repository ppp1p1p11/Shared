import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Asset, MediaSubtype } from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform } from 'react-native';
import SparkMD5 from 'spark-md5';

import { UPLOAD } from '@/config/limits';
import { extFor, extOf, mimeFor } from '@/lib/media/mime';
import type { RandomAccess } from '@/lib/media/randomAccess';
import { readCaptureDate, stripLocation } from '@/lib/media/stripLocation';
import { thumbhashFromJpegBase64 } from '@/lib/media/thumbhash';
import type { ChunkBody } from '@/lib/storage';
import type { Staged, UploadItem } from './types';

/**
 * Native media pipeline. Originals are copied into the app's documents directory first:
 * the copy survives restarts (resumable uploads need stable bytes), can be patched in place
 * (location removal) and can be read in chunks for background upload tasks.
 */
const dirFor = (id: string) => new Directory(Paths.document, 'uploads', id);
const FULL_HASH_LIMIT = 64 * 1024 * 1024;

function fileAccess(uri: string): RandomAccess & { close(): void } {
  const handle = new File(uri).open(FileMode.ReadWrite);
  return {
    size: handle.size ?? 0,
    async read(offset, length) {
      handle.offset = offset;
      return handle.readBytes(length);
    },
    async write(offset, data) {
      handle.offset = offset;
      handle.writeBytes(data);
    },
    close: () => handle.close(),
  };
}

/** md5 of the whole file (native, fast) for normal photos; md5(first+last 4 MiB) + size for huge videos. */
function contentHash(file: File): string {
  if (file.size <= FULL_HASH_LIMIT) {
    const md5 = file.info({ md5: true }).md5;
    if (md5) return `md5:${md5}`;
  }
  const h = file.open(FileMode.ReadOnly);
  try {
    const spark = new SparkMD5.ArrayBuffer();
    const part = 4 * 1024 * 1024;
    h.offset = 0;
    spark.append(h.readBytes(part).buffer as ArrayBuffer);
    h.offset = Math.max(0, file.size - part);
    spark.append(h.readBytes(part).buffer as ArrayBuffer);
    return `pmd5:${spark.end()}:${file.size}`;
  } finally {
    h.close();
  }
}

async function copyInto(srcUri: string, dest: File) {
  if (dest.exists) dest.delete();
  await new File(srcUri).copy(dest);
}

export const mediaOps = {
  async stage(item: UploadItem): Promise<Staged> {
    const dir = dirFor(item.id);
    dir.create({ intermediates: true, idempotent: true });
    const s = item.source;
    let srcUri = s.uri;
    let filename = s.filename;
    let capturedAt = s.capturedAt ?? null;
    let width = s.width ?? null;
    let height = s.height ?? null;
    let durationMs = s.durationMs ?? null;
    let liveSrc = s.livePhotoUri ?? null;

    if (s.assetId) {
      // The media library gives us the original file (HEIC stays HEIC, full resolution, video originals).
      try {
        const asset = new Asset(s.assetId);
        const info = await asset.getInfo();
        srcUri = await asset.getUri();
        filename = info.filename || filename;
        width = info.width || width;
        height = info.height || height;
        if (info.duration) durationMs = Math.round(info.duration * 1000);
        if (info.creationTime) capturedAt = new Date(info.creationTime).toISOString();
        if (Platform.OS === 'ios' && s.kind === 'photo' && !liveSrc) {
          const subtypes = await asset.getMediaSubtypes();
          if (subtypes.includes(MediaSubtype.LIVE_PHOTO)) liveSrc = await asset.getLivePhotoVideoUri();
        }
      } catch (e) {
        console.warn('[rolo] media library lookup failed, using picker file', e);
      }
    }

    const ext = extOf(filename) || extFor(s.mimeType, s.kind);
    const original = new File(dir, `original.${ext}`);
    await copyInto(srcUri, original);

    let liveUri: string | null = null;
    let liveSize = 0;
    if (liveSrc) {
      const live = new File(dir, 'live.mov');
      try {
        await copyInto(liveSrc, live);
        liveUri = live.uri;
        liveSize = live.size;
      } catch {
        liveUri = null;
      }
    }

    if (!capturedAt && s.kind === 'photo') {
      const io = fileAccess(original.uri);
      try {
        capturedAt = await readCaptureDate(io);
      } finally {
        io.close();
      }
    }

    return {
      originalUri: original.uri,
      size: original.size,
      mimeType: s.mimeType && s.mimeType !== 'image/jpeg' ? s.mimeType : mimeFor(ext, s.kind),
      ext,
      contentHash: contentHash(original),
      capturedAt: capturedAt ?? new Date().toISOString(),
      width,
      height,
      durationMs,
      liveUri,
      liveSize,
    };
  },

  async stripLocation(staged: Staged, _item?: UploadItem): Promise<string[]> {
    const removed: string[] = [];
    for (const uri of [staged.originalUri, staged.liveUri].filter(Boolean) as string[]) {
      const io = fileAccess(uri);
      try {
        removed.push(...(await stripLocation(io)).removed);
      } finally {
        io.close();
      }
    }
    return removed;
  },

  async makeThumb(item: UploadItem, staged: Staged): Promise<{ thumbUri: string; previewUri: string | null; thumbhash: string | null; width: number | null; height: number | null }> {
    let src = staged.originalUri;
    let width = staged.width;
    let height = staged.height;
    if (item.source.kind === 'video') {
      const frame = await VideoThumbnails.getThumbnailAsync(staged.originalUri, { time: 400, quality: 0.9 });
      src = frame.uri;
      width = width ?? frame.width;
      height = height ?? frame.height;
    }
    const ctx = ImageManipulator.manipulate(src);
    ctx.resize({ width: UPLOAD.thumbWidth });
    const ref = await ctx.renderAsync();
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: UPLOAD.thumbQuality });
    if (!width || !height) {
      width = ref.width;
      height = ref.height;
    }
    const thumb = new File(dirFor(item.id), 'thumb.jpg');
    await copyInto(saved.uri, thumb);

    // Viewer rendition (never upscaled).
    let previewUri: string | null = null;
    try {
      const big = ImageManipulator.manipulate(src);
      const longest = Math.max(width ?? 0, height ?? 0);
      if (longest > UPLOAD.previewWidth) big.resize((width ?? 0) >= (height ?? 0) ? { width: UPLOAD.previewWidth } : { height: UPLOAD.previewWidth });
      const bigRef = await big.renderAsync();
      const bigSaved = await bigRef.saveAsync({ format: SaveFormat.JPEG, compress: UPLOAD.previewQuality });
      const preview = new File(dirFor(item.id), 'preview.jpg');
      await copyInto(bigSaved.uri, preview);
      previewUri = preview.uri;
    } catch (e) {
      console.warn('[rolo] preview failed', e);
    }

    let thumbhash: string | null = null;
    try {
      const tiny = ImageManipulator.manipulate(saved.uri);
      tiny.resize(ref.width >= ref.height ? { width: 32 } : { height: 32 });
      const tinyRef = await tiny.renderAsync();
      const tinySaved = await tinyRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
      if (tinySaved.base64) thumbhash = thumbhashFromJpegBase64(tinySaved.base64);
    } catch (e) {
      console.warn('[rolo] thumbhash failed', e);
    }
    return { thumbUri: thumb.uri, previewUri, thumbhash, width, height };
  },

  /** Writes [offset, offset+length) into a temp file for a native upload task. */
  async readChunk(uri: string, offset: number, length: number, _item?: UploadItem): Promise<ChunkBody> {
    const h = new File(uri).open(FileMode.ReadOnly);
    try {
      h.offset = offset;
      const bytes = h.readBytes(length);
      const chunk = new File(Paths.cache, `chunk-${Date.now()}-${offset}.bin`);
      chunk.write(bytes);
      return { kind: 'file', uri: chunk.uri };
    } finally {
      h.close();
    }
  },

  releaseChunk(body: ChunkBody) {
    if (body.kind === 'file') {
      try {
        new File(body.uri).delete();
      } catch {}
    }
  },

  thumbBody(item: UploadItem): ChunkBody | null {
    return item.staged?.thumbUri ? { kind: 'file', uri: item.staged.thumbUri } : null;
  },

  previewBody(item: UploadItem): ChunkBody | null {
    return item.staged?.previewUri ? { kind: 'file', uri: item.staged.previewUri } : null;
  },

  cleanup(itemId: string) {
    try {
      const d = dirFor(itemId);
      if (d.exists) d.delete();
    } catch {}
  },

  /** Display URI for the optimistic tile while uploading. */
  previewUri(item: UploadItem): string {
    return item.staged?.thumbUri ?? item.source.uri;
  },

  /** True when the original can still be read (e.g. after a restart). */
  sourceAvailable(item: UploadItem): boolean {
    if (item.staged) return new File(item.staged.originalUri).exists;
    return true;
  },
};

export type MediaOps = typeof mediaOps;
