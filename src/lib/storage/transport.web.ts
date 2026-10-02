import type { PatchTransport } from './tus';
import type { ChunkBody } from './types';

/** Web PATCH via XHR (fetch has no upload progress). */
export const patchTransport: PatchTransport = ({ url, headers, body, onProgress, signal }) =>
  new Promise(async (resolve, reject) => {
    const data = body.kind === 'bytes' ? body.data : await (await fetch(body.uri)).blob();
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => {
      const out: Record<string, string> = {};
      xhr
        .getAllResponseHeaders()
        .trim()
        .split(/[\r\n]+/)
        .forEach((line) => {
          const i = line.indexOf(':');
          if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
        });
      resolve({ status: xhr.status, headers: out, body: xhr.responseText });
    };
    xhr.onerror = () => reject(new Error('Network request failed'));
    signal?.addEventListener('abort', () => {
      xhr.abort();
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    });
    xhr.send(data as any);
  });

export async function smallBody(body: ChunkBody): Promise<Uint8Array | Blob> {
  if (body.kind === 'bytes') return body.data;
  return (await fetch(body.uri)).blob();
}
