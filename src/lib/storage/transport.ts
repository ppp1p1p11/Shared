import { File, Paths, UploadTask, UploadType } from 'expo-file-system';

import type { PatchTransport } from './tus';
import type { ChunkBody } from './types';

/**
 * Native PATCH: each chunk is a file handed to a native upload task. On iOS this runs in a
 * background URLSession, so the chunk in flight completes even if the app is suspended.
 */
export const patchTransport: PatchTransport = async ({ url, headers, body, onProgress, signal }) => {
  const file = body.kind === 'file' ? new File(body.uri) : await writeTemp(body.data);
  try {
    const task = new UploadTask(file, url, {
      httpMethod: 'PATCH',
      uploadType: UploadType.BINARY_CONTENT,
      headers,
      sessionType: 'background',
      onProgress: onProgress ? (p) => onProgress(p.bytesSent) : undefined,
      signal,
    });
    const res = await task.uploadAsync();
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers ?? {})) lower[k.toLowerCase()] = String(v);
    return { status: res.status, headers: lower, body: res.body };
  } finally {
    if (body.kind !== 'file') file.delete();
  }
};

async function writeTemp(data: Uint8Array | Blob) {
  const f = new File(Paths.cache, `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  f.write(bytes);
  return f;
}

export async function smallBody(body: ChunkBody): Promise<Uint8Array | Blob> {
  if (body.kind === 'bytes') return body.data;
  return new File(body.uri).bytes();
}
