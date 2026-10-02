/**
 * The app's TUS client core (src/lib/storage/tus.ts) against the local Supabase Storage
 * resumable endpoint: multi-chunk upload, resume from the server offset after an "interruption",
 * and storage RLS still applies to resumable sessions.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTus, type PatchTransport } from '../../src/lib/storage/tus';
import { ANON_KEY, SUPABASE_URL, anonUser, beginUpload, rpc, type User } from './helpers';

const CHUNK = 6 * 1024 * 1024;

const fetchPatch: PatchTransport = async ({ url, headers, body }) => {
  if (body.kind !== 'bytes') throw new Error('node transport only takes bytes');
  const res = await fetch(url, { method: 'PATCH', headers, body: body.data as any });
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => (out[k.toLowerCase()] = v));
  return { status: res.status, headers: out, body: await res.text() };
};

function tusFor(u: User) {
  return createTus({
    endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
    bucket: 'media',
    chunkSize: CHUNK,
    authHeaders: async () => ({ authorization: `Bearer ${u.token}`, apikey: ANON_KEY }),
    patch: fetchPatch,
  });
}

describe('resumable uploads (TUS)', () => {
  it('uploads in 6 MiB chunks, survives an interruption, and resumes from the server offset', async () => {
    const u = await anonUser('Ana');
    const album = await rpc(u, 'create_album', { p_name: 'TUS' });
    const size = CHUNK * 2 + 12345;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 31) & 255;

    const r = await beginUpload(u, album.id, { p_size_bytes: size, p_mime_type: 'video/quicktime', p_extension: 'mov', p_kind: 'video' });
    const tus = tusFor(u);
    const { uploadUrl } = await tus.create({ path: r.storage_path, size, contentType: 'video/quicktime' });

    // First chunk, then the "app gets killed".
    let offset = await tus.patch({ uploadUrl, offset: 0, body: { kind: 'bytes', data: bytes.subarray(0, CHUNK) } });
    assert.equal(offset, CHUNK);

    // Later: ask the server where we are and continue.
    const resumedAt = await tus.offset(uploadUrl);
    assert.equal(resumedAt, CHUNK);
    offset = resumedAt!;
    while (offset < size) {
      const end = Math.min(offset + CHUNK, size);
      offset = await tus.patch({ uploadUrl, offset, body: { kind: 'bytes', data: bytes.subarray(offset, end) } });
    }
    assert.equal(offset, size);

    await rpc(u, 'finalize_upload', { p_media_id: r.media_id });
    const dl = await u.client.storage.from('media').download(r.storage_path);
    assert.equal(dl.error, null);
    const got = new Uint8Array(await dl.data!.arrayBuffer());
    assert.equal(got.byteLength, size);
    assert.equal(got[size - 1], bytes[size - 1]);
    assert.equal(got[CHUNK + 7], bytes[CHUNK + 7]);
  });

  it('resumable sessions still respect storage RLS', async () => {
    const owner = await anonUser();
    const album = await rpc(owner, 'create_album', { p_name: 'RLS' });
    const r = await beginUpload(owner, album.id, { p_size_bytes: 10 });
    const stranger = await anonUser();
    await assert.rejects(() => tusFor(stranger).create({ path: r.storage_path, size: 10, contentType: 'image/jpeg' }));
  });
});
