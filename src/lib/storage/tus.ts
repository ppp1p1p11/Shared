import { UploadHttpError, type ChunkBody } from './types';

/** TUS 1.0 client core (creation + PATCH + HEAD), transport-agnostic so it runs on device, web and in tests. */
export type PatchTransport = (p: {
  url: string;
  headers: Record<string, string>;
  body: ChunkBody;
  onProgress?: (sent: number) => void;
  signal?: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

export type TusConfig = {
  endpoint: string; // e.g. https://x.supabase.co/storage/v1/upload/resumable
  bucket: string;
  chunkSize: number;
  authHeaders: () => Promise<Record<string, string>>;
  patch: PatchTransport;
  fetchImpl?: typeof fetch;
};

const utf8b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[n & 63] : '=';
  }
  return out;
};

export function createTus(cfg: TusConfig) {
  const f = cfg.fetchImpl ?? fetch;
  const base = { 'tus-resumable': '1.0.0' };

  return {
    async create(p: { path: string; size: number; contentType: string }) {
      const res = await f(cfg.endpoint, {
        method: 'POST',
        headers: {
          ...base,
          ...(await cfg.authHeaders()),
          'upload-length': String(p.size),
          'x-upsert': 'true',
          'upload-metadata': [
            `bucketName ${utf8b64(cfg.bucket)}`,
            `objectName ${utf8b64(p.path)}`,
            `contentType ${utf8b64(p.contentType)}`,
            `cacheControl ${utf8b64('31536000')}`,
          ].join(','),
        },
      });
      if (res.status !== 201) throw new UploadHttpError(res.status, `tus create ${res.status}: ${await res.text()}`);
      const location = res.headers.get('location');
      if (!location) throw new UploadHttpError(500, 'tus create: no location');
      const uploadUrl = location.startsWith('http') ? location : new URL(location, cfg.endpoint).toString();
      return { uploadUrl, chunkSize: cfg.chunkSize };
    },

    async offset(uploadUrl: string): Promise<number | null> {
      const res = await f(uploadUrl, { method: 'HEAD', headers: { ...base, ...(await cfg.authHeaders()) } });
      if (res.status === 404 || res.status === 410 || res.status === 403) return null;
      if (!res.ok) throw new UploadHttpError(res.status, `tus head ${res.status}`);
      const off = res.headers.get('upload-offset');
      return off == null ? null : Number(off);
    },

    async patch(p: { uploadUrl: string; offset: number; body: ChunkBody; onProgress?: (n: number) => void; signal?: AbortSignal }) {
      const res = await cfg.patch({
        url: p.uploadUrl,
        headers: {
          ...base,
          ...(await cfg.authHeaders()),
          'upload-offset': String(p.offset),
          'content-type': 'application/offset+octet-stream',
        },
        body: p.body,
        onProgress: p.onProgress,
        signal: p.signal,
      });
      if (res.status !== 204 && res.status !== 200) {
        throw new UploadHttpError(res.status, `tus patch ${res.status}: ${res.body?.slice(0, 200)}`);
      }
      const next = res.headers['upload-offset'];
      if (next == null) throw new UploadHttpError(500, 'tus patch: missing upload-offset');
      return Number(next);
    },
  };
}
