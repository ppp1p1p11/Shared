import type { SupabaseClient } from '@supabase/supabase-js';

import { createTus, type PatchTransport } from './tus';
import { UploadHttpError, type ChunkBody, type ImageSourceSpec, type StorageProvider } from './types';

export const MEDIA_BUCKET = 'media';

export function createSupabaseProvider(opts: {
  client: SupabaseClient;
  url: string;
  anonKey: string;
  chunkSize: number;
  getToken: () => Promise<string>;
  /** Synchronous token for image headers (may be slightly stale; expo-image caches by key). */
  peekToken: () => string | null;
  patch: PatchTransport;
  smallBody: (body: ChunkBody) => Promise<Blob | ArrayBuffer | Uint8Array>;
}): StorageProvider {
  const authHeaders = async () => ({ authorization: `Bearer ${await opts.getToken()}`, apikey: opts.anonKey });
  const tus = createTus({
    endpoint: `${opts.url}/storage/v1/upload/resumable`,
    bucket: MEDIA_BUCKET,
    chunkSize: opts.chunkSize,
    authHeaders,
    patch: opts.patch,
  });
  const bucket = () => opts.client.storage.from(MEDIA_BUCKET);

  return {
    name: 'supabase',
    createResumable: (p) => tus.create(p),
    getOffset: (u) => tus.offset(u),
    uploadChunk: (p) => tus.patch(p),

    async uploadSmall({ path, body, contentType }) {
      const { error } = await bucket().upload(path, await opts.smallBody(body), { contentType, upsert: true });
      if (error) throw new UploadHttpError((error as any).statusCode ? Number((error as any).statusCode) : 500, error.message);
    },

    imageSource(path: string, explicitToken?: string): ImageSourceSpec | null {
      const token = explicitToken ?? opts.peekToken();
      if (!token) return null;
      return {
        uri: `${opts.url}/storage/v1/object/authenticated/${MEDIA_BUCKET}/${path}`,
        headers: { Authorization: `Bearer ${token}`, apikey: opts.anonKey },
        cacheKey: `${MEDIA_BUCKET}/${path}`,
      };
    },

    async downloadUrl(path, expiresIn = 3600) {
      const { data, error } = await bucket().createSignedUrl(path, expiresIn);
      if (error || !data) throw new Error(error?.message ?? 'sign failed');
      return data.signedUrl;
    },

    async downloadUrls(paths, expiresIn = 3600) {
      const out: Record<string, string> = {};
      for (let i = 0; i < paths.length; i += 500) {
        const slice = paths.slice(i, i + 500);
        const { data, error } = await bucket().createSignedUrls(slice, expiresIn);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) if (row.signedUrl && row.path) out[row.path] = row.signedUrl;
      }
      return out;
    },

    async remove(paths) {
      const clean = paths.filter(Boolean);
      for (let i = 0; i < clean.length; i += 500) {
        const { error } = await bucket().remove(clean.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
    },
  };
}
