/**
 * Server-side access rules for Rolo, exercised against a running local Supabase stack
 * (`npx supabase start`). Every assertion goes through the public API as a real
 * anonymous user, so these tests prove RLS + RPCs enforce access — not the client.
 *
 * Run: npm run test:server
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { admin, anonUser, beginUpload, rpc, rpcError, uploadPhoto, type User } from './helpers';

async function createAlbum(owner: User, name = 'Búzios 2026') {
  return rpc(owner, 'create_album', { p_name: name, p_start_date: '2026-01-10', p_end_date: '2026-01-15' });
}

describe('identity', () => {
  it('anonymous sign-in creates a profile', async () => {
    const u = await anonUser('Ana');
    const { data } = await u.client.from('profiles').select('*').eq('id', u.id).single();
    assert.equal(data.display_name, 'Ana');
    assert.equal(data.is_anonymous, true);
  });

  it('cannot read profiles of strangers', async () => {
    const a = await anonUser('Ana');
    const b = await anonUser('Bia');
    const { data } = await a.client.from('profiles').select('*').eq('id', b.id);
    assert.deepEqual(data, []);
  });
});

describe('albums & invite links', () => {
  let owner: User;
  let album: any;

  before(async () => {
    owner = await anonUser('Ana');
    album = await createAlbum(owner);
  });

  it('invite tokens carry ≥128 bits and are unique', async () => {
    assert.match(album.invite_token, /^[A-Za-z0-9_-]{24}$/); // 24 × 6 bits = 144 bits
    const other = await createAlbum(owner, 'Outro');
    assert.notEqual(other.invite_token, album.invite_token);
  });

  it('free plan allows 3 albums, the 4th is refused server-side', async () => {
    const u = await anonUser();
    await createAlbum(u, 'a');
    await createAlbum(u, 'b');
    await createAlbum(u, 'c');
    assert.equal(await rpcError(u, 'create_album', { p_name: 'd' }), 'album_limit_reached');
  });

  it('strangers cannot read the album, its members or its media directly', async () => {
    const stranger = await anonUser();
    const a = await stranger.client.from('albums').select('*').eq('id', album.id);
    const m = await stranger.client.from('album_members').select('*').eq('album_id', album.id);
    const media = await stranger.client.from('media').select('*').eq('album_id', album.id);
    assert.deepEqual(a.data, []);
    assert.deepEqual(m.data, []);
    assert.deepEqual(media.data, []);
  });

  it('preview by token shows minimal info and never the token or photos', async () => {
    const stranger = await anonUser();
    const p = await rpc(stranger, 'get_album_preview', { p_token: album.invite_token });
    assert.equal(p.state, 'open');
    assert.equal(p.name, 'Búzios 2026');
    assert.equal(p.owner_name, 'Ana');
    assert.equal(p.member_count, 1);
    assert.equal(p.invite_token, undefined);
    assert.equal(JSON.stringify(p).includes('albums/'), false, 'no storage paths leak');
  });

  it('an unknown token reveals nothing', async () => {
    const stranger = await anonUser();
    const p = await rpc(stranger, 'get_album_preview', { p_token: 'A'.repeat(24) });
    assert.deepEqual(p, { state: 'invalid' });
    assert.equal(await rpcError(stranger, 'join_album', { p_token: 'A'.repeat(24) }), 'invalid_link');
  });

  it('open link: joining makes you an active member who can read the album', async () => {
    const joao = await anonUser();
    const r = await rpc(joao, 'join_album', { p_token: album.invite_token, p_display_name: 'João' });
    assert.equal(r.status, 'active');
    const { data } = await joao.client.from('albums').select('id,name').eq('id', album.id);
    assert.equal(data!.length, 1);
    const prof = await joao.client.from('profiles').select('display_name').eq('id', joao.id).single();
    assert.equal(prof.data!.display_name, 'João');
  });

  it('joining twice is idempotent', async () => {
    const u = await anonUser();
    await rpc(u, 'join_album', { p_token: album.invite_token });
    const again = await rpc(u, 'join_album', { p_token: album.invite_token });
    assert.equal(again.status, 'active');
  });

  it('members can read co-members profiles', async () => {
    const u = await anonUser('Caio');
    await rpc(u, 'join_album', { p_token: album.invite_token });
    const { data } = await u.client.from('profiles').select('display_name').eq('id', owner.id);
    assert.equal(data![0].display_name, 'Ana');
  });

  it('members cannot use owner controls', async () => {
    const m = await anonUser();
    await rpc(m, 'join_album', { p_token: album.invite_token });
    assert.equal(await rpcError(m, 'update_album', { p_album_id: album.id, p_patch: { is_locked: true } }), 'not_owner');
    assert.equal(await rpcError(m, 'reset_invite_link', { p_album_id: album.id }), 'not_owner');
    assert.equal(await rpcError(m, 'remove_member', { p_album_id: album.id, p_user_id: owner.id }), 'not_owner');
    assert.equal(await rpcError(m, 'delete_album', { p_album_id: album.id }), 'not_owner');
  });

  it('members cannot write tables directly (no insert/update grants)', async () => {
    const m = await anonUser();
    await rpc(m, 'join_album', { p_token: album.invite_token });
    const upd = await m.client.from('albums').update({ is_locked: true }).eq('id', album.id);
    assert.ok(upd.error, 'direct update must fail');
    const ins = await m.client.from('album_members').insert({ album_id: album.id, user_id: m.id, role: 'owner' });
    assert.ok(ins.error, 'direct insert must fail');
  });
});

describe('approval mode', () => {
  let owner: User;
  let album: any;

  before(async () => {
    owner = await anonUser('Ana');
    album = await createAlbum(owner);
    await rpc(owner, 'update_album', { p_album_id: album.id, p_patch: { join_mode: 'approval' } });
  });

  it('requests are pending and cannot see anything until approved', async () => {
    await uploadPhoto(owner, album.id);
    const u = await anonUser('Bia');
    const r = await rpc(u, 'join_album', { p_token: album.invite_token, p_display_name: 'Bia' });
    assert.equal(r.status, 'pending');

    const media = await u.client.from('media').select('id').eq('album_id', album.id);
    assert.deepEqual(media.data, []);
    // …but they can see their own membership row (powers the live waiting screen)
    const mine = await u.client.from('album_members').select('status').eq('album_id', album.id).eq('user_id', u.id);
    assert.equal(mine.data![0].status, 'pending');

    // The owner sees the request and the requester's name.
    const reqs = await owner.client.from('album_members').select('user_id,status').eq('album_id', album.id).eq('status', 'pending');
    assert.equal(reqs.data!.length, 1);
    const prof = await owner.client.from('profiles').select('display_name').eq('id', u.id);
    assert.equal(prof.data![0].display_name, 'Bia');

    await rpc(owner, 'respond_to_request', { p_album_id: album.id, p_user_id: u.id, p_approve: true });
    const after = await u.client.from('media').select('id').eq('album_id', album.id);
    assert.equal(after.data!.length, 1);
  });

  it('declined requests cannot be re-approved silently, but can ask again', async () => {
    const u = await anonUser();
    await rpc(u, 'join_album', { p_token: album.invite_token });
    await rpc(owner, 'respond_to_request', { p_album_id: album.id, p_user_id: u.id, p_approve: false });
    const again = await rpc(u, 'join_album', { p_token: album.invite_token });
    assert.equal(again.status, 'pending');
  });
});

describe('lock, expiry, reset', () => {
  it('a locked album accepts no new members but keeps existing ones', async () => {
    const owner = await anonUser();
    const album = await createAlbum(owner);
    const early = await anonUser();
    await rpc(early, 'join_album', { p_token: album.invite_token });
    await rpc(owner, 'update_album', { p_album_id: album.id, p_patch: { is_locked: true } });

    const late = await anonUser();
    assert.equal(await rpcError(late, 'join_album', { p_token: album.invite_token }), 'album_locked');
    const preview = await rpc(late, 'get_album_preview', { p_token: album.invite_token });
    assert.equal(preview.state, 'locked');

    const { data } = await early.client.from('albums').select('id').eq('id', album.id);
    assert.equal(data!.length, 1);
  });

  it('expiry is computed server-side and enforced', async () => {
    const owner = await anonUser();
    const album = await createAlbum(owner);
    const updated = await rpc(owner, 'update_album', { p_album_id: album.id, p_patch: { invite_expiry_hours: 24 } });
    const hours = (new Date(updated.invite_expires_at).getTime() - Date.now()) / 3_600_000;
    assert.ok(hours > 23.9 && hours <= 24, `expected ~24h, got ${hours}`);
    assert.equal(await rpcError(owner, 'update_album', { p_album_id: album.id, p_patch: { invite_expiry_hours: 5 } }), 'invalid_expiry');

    // Simulate time passing.
    await admin.from('albums').update({ invite_expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', album.id);
    const late = await anonUser();
    assert.equal(await rpcError(late, 'join_album', { p_token: album.invite_token }), 'link_expired');
    assert.equal((await rpc(late, 'get_album_preview', { p_token: album.invite_token })).state, 'expired');

    // Turning expiry off re-opens the link.
    await rpc(owner, 'update_album', { p_album_id: album.id, p_patch: { invite_expiry_hours: null } });
    assert.equal((await rpc(late, 'join_album', { p_token: album.invite_token })).status, 'active');
  });

  it('reset link invalidates the old token immediately', async () => {
    const owner = await anonUser();
    const album = await createAlbum(owner);
    const reset = await rpc(owner, 'reset_invite_link', { p_album_id: album.id });
    assert.notEqual(reset.invite_token, album.invite_token);
    const u = await anonUser();
    assert.equal(await rpcError(u, 'join_album', { p_token: album.invite_token }), 'invalid_link');
    assert.equal((await rpc(u, 'join_album', { p_token: reset.invite_token })).status, 'active');
  });
});

describe('remove member', () => {
  it('removes access; uploads stay unless the owner deletes them; open link does not re-admit', async () => {
    const owner = await anonUser();
    const album = await createAlbum(owner);
    const m = await anonUser();
    await rpc(m, 'join_album', { p_token: album.invite_token });
    const up = await uploadPhoto(m, album.id);

    await rpc(owner, 'remove_member', { p_album_id: album.id, p_user_id: m.id });

    assert.deepEqual((await m.client.from('albums').select('id').eq('id', album.id)).data, []);
    assert.deepEqual((await m.client.from('media').select('id').eq('album_id', album.id)).data, []);
    const dl = await m.client.storage.from('media').download(up.storage_path);
    assert.ok(dl.error, 'removed member cannot download');

    const ownerView = await owner.client.from('media').select('id').eq('id', up.media_id);
    assert.equal(ownerView.data!.length, 1, 'their upload stays');

    assert.equal(await rpcError(m, 'join_album', { p_token: album.invite_token }), 'removed');
    assert.equal(await rpcError(owner, 'remove_member', { p_album_id: album.id, p_user_id: owner.id }), 'cannot_remove_owner');
  });

  it('owner can remove a member together with their uploads', async () => {
    const owner = await anonUser();
    const album = await createAlbum(owner);
    const m = await anonUser();
    await rpc(m, 'join_album', { p_token: album.invite_token });
    await uploadPhoto(m, album.id);
    await rpc(owner, 'remove_member', { p_album_id: album.id, p_user_id: m.id, p_delete_uploads: true });
    const { data } = await owner.client.from('media').select('id').eq('album_id', album.id);
    assert.deepEqual(data, []);
  });
});

describe('media & storage', () => {
  let owner: User;
  let member: User;
  let other: User;
  let stranger: User;
  let album: any;

  before(async () => {
    owner = await anonUser('Ana');
    member = await anonUser('João');
    other = await anonUser('Bia');
    stranger = await anonUser('Zé');
    album = await createAlbum(owner);
    await rpc(member, 'join_album', { p_token: album.invite_token });
    await rpc(other, 'join_album', { p_token: album.invite_token });
  });

  it('strangers cannot reserve uploads', async () => {
    const err = await beginUpload(stranger, album.id).catch((e) => e.message);
    assert.match(String(err), /not_a_member/);
  });

  it('in-flight uploads are invisible to others until finalized', async () => {
    const r = await beginUpload(member, album.id, { p_size_bytes: 3 });
    const before = await other.client.from('media').select('id').eq('id', r.media_id);
    assert.deepEqual(before.data, []);
    const mine = await member.client.from('media').select('status').eq('id', r.media_id);
    assert.equal(mine.data![0].status, 'uploading');

    const up = await member.client.storage.from('media').upload(r.storage_path, new Uint8Array([1, 2, 3]));
    assert.equal(up.error, null);
    await rpc(member, 'finalize_upload', { p_media_id: r.media_id, p_thumbhash: 'abc' });

    const afterRows = await other.client.from('media').select('status').eq('id', r.media_id);
    assert.equal(afterRows.data![0].status, 'ready');
    const dl = await other.client.storage.from('media').download(r.storage_path);
    assert.equal(dl.error, null);
    assert.equal((await dl.data!.arrayBuffer()).byteLength, 3);
  });

  it('finalize is idempotent for the uploader (safe to retry after a crash)', async () => {
    const up = await uploadPhoto(member, album.id);
    const again = await rpc(member, 'finalize_upload', { p_media_id: up.media_id });
    assert.equal(again.status, 'ready');
    assert.match(String(await rpcError(other, 'finalize_upload', { p_media_id: up.media_id })), /media_not_found/);
  });

  it('only reserved paths are writable, and only by the uploader', async () => {
    const r = await beginUpload(member, album.id);
    // someone else writing into the reserved path
    const hijack = await other.client.storage.from('media').upload(r.storage_path, new Uint8Array([9]));
    assert.ok(hijack.error, 'other member cannot write into my reserved path');
    // writing an arbitrary path inside the album
    const rogue = await member.client.storage
      .from('media')
      .upload(`albums/${album.id}/${crypto.randomUUID()}/original.jpg`, new Uint8Array([9]));
    assert.ok(rogue.error, 'unreserved path is rejected');
    // stranger
    const s = await stranger.client.storage.from('media').upload(r.storage_path, new Uint8Array([9]));
    assert.ok(s.error);
  });

  it('strangers cannot download originals even with the exact path', async () => {
    const up = await uploadPhoto(member, album.id);
    const dl = await stranger.client.storage.from('media').download(up.storage_path);
    assert.ok(dl.error);
    const signed = await stranger.client.storage.from('media').createSignedUrl(up.storage_path, 60);
    assert.ok(signed.error, 'cannot mint signed URLs either');
  });

  it('dedup: the same content hash is not uploaded twice', async () => {
    const hash = `dup-${Date.now()}`;
    const first = await beginUpload(member, album.id, { p_content_hash: hash });
    const resumed = await beginUpload(member, album.id, { p_content_hash: hash });
    assert.equal(resumed.resumed, true, 'my own interrupted upload resumes the same row');
    assert.equal(resumed.media_id, first.media_id);
    const dup = await beginUpload(other, album.id, { p_content_hash: hash });
    assert.equal(dup.duplicate, true, 'another member uploading the same bytes is a duplicate');
  });

  it('members delete only their own uploads; owner deletes anything', async () => {
    const mine = await uploadPhoto(member, album.id);
    const theirs = await uploadPhoto(other, album.id);

    const attempt = await member.client.from('media').delete().eq('id', theirs.media_id).select();
    assert.deepEqual(attempt.data, [], 'cannot delete someone else’s');
    const rmOther = await member.client.storage.from('media').remove([theirs.storage_path]);
    assert.deepEqual(rmOther.data, [], 'cannot delete someone else’s object');

    const ok = await member.client.from('media').delete().eq('id', mine.media_id).select();
    assert.equal(ok.data!.length, 1);

    // Objects first, then the row (the app does it in this order too).
    const rmByOwner = await owner.client.storage.from('media').remove([theirs.storage_path]);
    assert.equal(rmByOwner.data!.length, 1);
    const byOwner = await owner.client.from('media').delete().eq('id', theirs.media_id).select();
    assert.equal(byOwner.data!.length, 1);
  });

  it('owner can hide an item from members', async () => {
    const up = await uploadPhoto(member, album.id);
    await rpc(owner, 'set_media_hidden', { p_media_id: up.media_id, p_hidden: true });
    assert.deepEqual((await other.client.from('media').select('id').eq('id', up.media_id)).data, []);
    assert.equal((await owner.client.from('media').select('status').eq('id', up.media_id)).data![0].status, 'hidden');
    assert.match(String(await rpcError(member, 'set_media_hidden', { p_media_id: up.media_id, p_hidden: false })), /not_owner/);
  });

  it('reports go to a write-only moderation table', async () => {
    const up = await uploadPhoto(owner, album.id);
    const ins = await other.client.from('reports').insert({ media_id: up.media_id, reporter_id: other.id, reason: 'spam' });
    assert.equal(ins.error, null);
    const read = await other.client.from('reports').select('*');
    assert.ok(read.error || read.data!.length === 0, 'reporters cannot read the queue');
    const s = await stranger.client.from('reports').insert({ media_id: up.media_id, reporter_id: stranger.id, reason: 'spam' });
    assert.ok(s.error, 'strangers cannot report items they cannot see');
    const { count } = await admin.from('reports').select('*', { count: 'exact', head: true }).eq('media_id', up.media_id);
    assert.equal(count, 1);
  });
});

describe('storage quota (counts against the owner)', () => {
  const original: Record<string, number> = {};

  before(async () => {
    const { data } = await admin.from('plan_limits').select('*').eq('plan', 'free').single();
    original.bytes = data!.max_storage_bytes;
    await admin.from('plan_limits').update({ max_storage_bytes: 10_000 }).eq('plan', 'free');
  });
  after(async () => {
    await admin.from('plan_limits').update({ max_storage_bytes: original.bytes }).eq('plan', 'free');
  });

  it('uploads beyond the owner quota are refused, for every contributor', async () => {
    const owner = await anonUser();
    const album = await createAlbum(owner);
    const m = await anonUser();
    await rpc(m, 'join_album', { p_token: album.invite_token });

    await beginUpload(m, album.id, { p_size_bytes: 9_000 });
    const err = await beginUpload(m, album.id, { p_size_bytes: 2_000 }).catch((e) => e.message);
    assert.match(String(err), /quota_exceeded/);

    const usage = await rpc(owner, 'get_my_usage');
    assert.equal(usage.used_bytes, 9_000, 'member upload counts against the owner');
    const mUsage = await rpc(m, 'get_my_usage');
    assert.equal(mUsage.used_bytes, 0, 'contributors never pay');
  });
});

describe('delete my data', () => {
  it('removes the user, their albums and their uploads', async () => {
    const u = await anonUser();
    const album = await createAlbum(u);
    await uploadPhoto(u, album.id);
    const paths: string[] = (await rpc(u, 'my_data_storage_paths')).filter(Boolean);
    assert.ok(paths.length >= 1);
    await rpc(u, 'delete_my_data');
    const { data } = await admin.from('albums').select('id').eq('id', album.id);
    assert.deepEqual(data, []);
    const prof = await admin.from('profiles').select('id').eq('id', u.id);
    assert.deepEqual(prof.data, []);
  });
});
