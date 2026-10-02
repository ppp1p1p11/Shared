/**
 * Seeds a demo album: "Búzios 2026" with Ana (owner), João, Bia and Caio, a pending join
 * request from Davi, and N generated photos spread across Jan 10–15 (grouped by capture day).
 *
 *   npx tsx scripts/seed.ts                 # 48 photos (+2 short videos if ffmpeg is installed)
 *   npx tsx scripts/seed.ts --count 5000    # performance seed (image pool copied server-side)
 *
 * Demo logins (web): ana@demo.rolo.app / joao@demo.rolo.app … password: rolo-demo-2026
 * Uses the service role key from .env; never ship that key in the app.
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { rgbaToThumbHash } from 'thumbhash';

const env = Object.fromEntries(
  (existsSync('.env') ? readFileSync('.env', 'utf8') : readFileSync('.env.example', 'utf8'))
    .split('\n')
    .filter((l) => /^\w+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL = process.env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing (see .env.example)');
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const COUNT = Number(args[args.indexOf('--count') + 1]) || 48;
const ALBUM_NAME = args.includes('--name') ? args[args.indexOf('--name') + 1] : COUNT > 500 ? `Búzios 2026 · ${COUNT}` : 'Búzios 2026';
export const PASSWORD = 'rolo-demo-2026';

const PEOPLE = [
  { key: 'ana', name: 'Ana', color: 0 },
  { key: 'joao', name: 'João', color: 1 },
  { key: 'bia', name: 'Bia', color: 3 },
  { key: 'caio', name: 'Caio', color: 2 },
  { key: 'davi', name: 'Davi', color: 5 },
];

// ── tiny deterministic RNG
let seed = 20260110;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

type RGB = [number, number, number];
const PALETTES: { sky: [RGB, RGB]; sea: RGB; sun: RGB }[] = [
  { sky: [[255, 150, 100], [120, 70, 140]], sea: [30, 60, 110], sun: [255, 236, 190] }, // sunset
  { sky: [[120, 190, 235], [225, 240, 250]], sea: [20, 110, 140], sun: [255, 250, 225] }, // midday
  { sky: [[250, 210, 150], [140, 190, 200]], sea: [25, 90, 100], sun: [255, 240, 200] }, // morning
  { sky: [[40, 30, 80], [200, 90, 90]], sea: [40, 30, 60], sun: [255, 210, 170] }, // dusk
  { sky: [[90, 160, 210], [250, 220, 170]], sea: [10, 120, 120], sun: [255, 255, 235] }, // golden
  { sky: [[205, 225, 235], [160, 190, 210]], sea: [70, 110, 130], sun: [250, 250, 250] }, // overcast
];

/** A small "beach photo": gradient sky, sun, hills, sea with soft waves, sand. */
function scene(w: number, h: number, v: number) {
  const p = PALETTES[v % PALETTES.length];
  const data = new Uint8Array(w * h * 4);
  const sunX = w * (0.25 + 0.5 * ((v * 37) % 100) / 100);
  const sunY = h * (0.18 + 0.2 * ((v * 53) % 100) / 100);
  const sunR = w * (0.05 + 0.04 * ((v * 17) % 10) / 10);
  const horizon = h * (0.55 + 0.1 * ((v * 29) % 10) / 10);
  const sand = h * 0.86;
  const hill = (x: number) => horizon - h * 0.06 * (1 + Math.sin(x / w * 6 + v)) - h * 0.03 * Math.sin(x / w * 17 + v * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: number[];
      const t = y / horizon;
      if (y < horizon) {
        c = [0, 1, 2].map((k) => p.sky[0][k] * (1 - t) + p.sky[1][k] * t);
        const d = Math.hypot(x - sunX, y - sunY);
        if (d < sunR) c = p.sun;
        else if (d < sunR * 3) c = c.map((ch, k) => ch + (p.sun[k] - ch) * 0.25 * (1 - (d - sunR) / (sunR * 2)));
        if (y > hill(x) && (v % 3 !== 1)) c = c.map((ch) => ch * 0.45 + 20);
      } else if (y < sand) {
        const wave = 0.06 * Math.sin(x / 9 + y / 3 + v) + 0.04 * Math.sin(x / 31 - y / 5);
        const depth = (y - horizon) / (sand - horizon);
        c = p.sea.map((ch) => ch * (0.8 + 0.4 * depth) * (1 + wave));
        if (Math.abs(x - sunX) < sunR * 1.4 * (1 - depth) && wave > 0.04) c = p.sun;
      } else {
        const grain = (rnd() - 0.5) * 18;
        c = [236 + grain, 214 + grain, 172 + grain];
      }
      const i = (y * w + x) * 4;
      data[i] = Math.max(0, Math.min(255, c[0]));
      data[i + 1] = Math.max(0, Math.min(255, c[1]));
      data[i + 2] = Math.max(0, Math.min(255, c[2]));
      data[i + 3] = 255;
    }
  }
  return data;
}

function downscale(src: Uint8Array, w: number, h: number, nw: number, nh: number) {
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const sx = Math.floor((x * w) / nw);
      const sy = Math.floor((y * h) / nh);
      const s = (sy * w + sx) * 4;
      const d = (y * nw + x) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = 255;
    }
  return out;
}

type PoolImage = { original: Buffer; thumb: Buffer; preview: Buffer; thumbhash: string; width: number; height: number };

function makePool(n: number): PoolImage[] {
  const pool: PoolImage[] = [];
  for (let v = 0; v < n; v++) {
    const portrait = v % 4 === 1;
    const [w, h] = portrait ? [900, 1200] : [1200, 900];
    const px = scene(w, h, v);
    const original = Buffer.from(jpeg.encode({ data: px, width: w, height: h }, 88).data);
    const [tw, th] = portrait ? [480, 640] : [480, 360];
    const thumb = Buffer.from(jpeg.encode({ data: downscale(px, w, h, tw, th), width: tw, height: th }, 75).data);
    const [hw, hh] = portrait ? [24, 32] : [32, 24];
    const thumbhash = Buffer.from(rgbaToThumbHash(hw, hh, downscale(px, w, h, hw, hh))).toString('base64');
    pool.push({ original, thumb, preview: original, thumbhash, width: w, height: h });
  }
  return pool;
}

async function ensureUser(p: (typeof PEOPLE)[number]) {
  const email = `${p.key}@demo.rolo.app`;
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: p.name } });
    if (error) throw error;
    user = data.user!;
  }
  await admin.from('profiles').update({ display_name: p.name, avatar_color: p.color }).eq('id', user.id);
  return user.id;
}

async function pMap<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    }),
  );
}

async function main() {
  console.log(`Seeding "${ALBUM_NAME}" with ${COUNT} items → ${URL}`);
  const ids: Record<string, string> = {};
  for (const p of PEOPLE) ids[p.key] = await ensureUser(p);

  // Fresh album each run (older demo albums with the same name are removed).
  const { data: old } = await admin.from('albums').select('id').eq('owner_id', ids.ana).eq('name', ALBUM_NAME);
  for (const a of old ?? []) {
    const { data: objs } = await admin.from('media').select('storage_path,thumb_path,preview_path').eq('album_id', a.id);
    const paths = (objs ?? []).flatMap((o) => [o.storage_path, o.thumb_path, o.preview_path]).filter(Boolean) as string[];
    for (let i = 0; i < paths.length; i += 500) await admin.storage.from('media').remove(paths.slice(i, i + 500));
    await admin.from('albums').delete().eq('id', a.id);
  }

  const { data: album, error } = await admin
    .from('albums')
    .insert({ owner_id: ids.ana, name: ALBUM_NAME, start_date: '2026-01-10', end_date: '2026-01-15', join_mode: 'approval' })
    .select()
    .single();
  if (error) throw error;
  const now = new Date().toISOString();
  await admin.from('album_members').insert([
    { album_id: album.id, user_id: ids.ana, role: 'owner', status: 'active', joined_at: now },
    { album_id: album.id, user_id: ids.joao, role: 'member', status: 'active', joined_at: now },
    { album_id: album.id, user_id: ids.bia, role: 'member', status: 'active', joined_at: now },
    { album_id: album.id, user_id: ids.caio, role: 'member', status: 'active', joined_at: now },
    { album_id: album.id, user_id: ids.davi, role: 'member', status: 'pending' },
  ]);

  const pool = makePool(Math.min(COUNT, 24));
  const uploaders = [ids.ana, ids.ana, ids.joao, ids.joao, ids.bia, ids.caio];
  const start = Date.UTC(2026, 0, 10, 11); // Jan 10, 08:00 in Búzios (UTC−3)
  const span = 5 * 24 * 3600 * 1000;

  const rows = Array.from({ length: COUNT }, (_, i) => {
    const id = crypto.randomUUID();
    const img = pool[i % pool.length];
    const base = `albums/${album.id}/${id}/`;
    // Daytime-ish capture times spread across the trip.
    const day = Math.floor((i / COUNT) * 5.999);
    const t = start + day * 86_400_000 + Math.floor(rnd() * 13 * 3600 * 1000);
    return {
      id,
      album_id: album.id,
      uploader_id: uploaders[i % uploaders.length],
      kind: 'photo',
      storage_path: `${base}original.jpg`,
      thumb_path: `${base}thumb.jpg`,
      preview_path: `${base}preview.jpg`,
      thumbhash: img.thumbhash,
      mime_type: 'image/jpeg',
      width: img.width,
      height: img.height,
      size_bytes: img.original.length,
      content_hash: `seed:${id}`,
      original_filename: `IMG_${String(4100 + i).padStart(4, '0')}.jpg`,
      captured_at: new Date(Math.min(t, start + span)).toISOString(),
      status: 'ready',
      ready_at: now,
      _pool: i % pool.length,
    };
  });

  // Rows first (as 'ready'), then bytes.
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await admin.from('media').insert(rows.slice(i, i + 500).map(({ _pool, ...r }) => r));
    if (e) throw e;
  }

  const bucket = admin.storage.from('media');
  const firstOfPool = new Map<number, (typeof rows)[number]>();
  let done = 0;
  const tick = () => {
    done++;
    if (done % 250 === 0 || done === rows.length) process.stdout.write(`  ${done}/${rows.length}\r`);
  };
  // Upload one real copy per pool image…
  await pMap(rows.filter((r) => !firstOfPool.has(r._pool) && (firstOfPool.set(r._pool, r), true)), 8, async (r) => {
    const img = pool[r._pool];
    await bucket.upload(r.storage_path, img.original, { contentType: 'image/jpeg', upsert: true });
    await bucket.upload(r.thumb_path, img.thumb, { contentType: 'image/jpeg', upsert: true });
    await bucket.upload(r.preview_path, img.preview, { contentType: 'image/jpeg', upsert: true });
    tick();
  });
  // …then server-side copies for the rest (fast, no re-upload).
  await pMap(rows.filter((r) => firstOfPool.get(r._pool) !== r), 24, async (r) => {
    const src = firstOfPool.get(r._pool)!;
    await bucket.copy(src.thumb_path, r.thumb_path);
    await bucket.copy(src.preview_path, r.preview_path);
    await bucket.copy(src.storage_path, r.storage_path);
    tick();
  });

  // Two short videos for the demo, when ffmpeg is available.
  if (COUNT <= 500) {
    try {
      const dir = mkdtempSync(join(tmpdir(), 'rolo-seed-'));
      for (const [n, color] of [
        [0, 'orange'],
        [1, 'teal'],
      ] as const) {
        const file = join(dir, `v${n}.mp4`);
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=1280x720:d=4,format=yuv420p`, '-f', 'lavfi', '-i', 'sine=f=330:d=4', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', file]);
        const id = crypto.randomUUID();
        const base = `albums/${album.id}/${id}/`;
        const bytes = readFileSync(file);
        const poster = pool[(n * 7) % pool.length];
        await admin.from('media').insert({
          id, album_id: album.id, uploader_id: n ? ids.joao : ids.bia, kind: 'video', storage_path: `${base}original.mp4`, thumb_path: `${base}thumb.jpg`, preview_path: `${base}preview.jpg`,
          thumbhash: poster.thumbhash, mime_type: 'video/mp4', width: 1280, height: 720, duration_ms: 4000, size_bytes: bytes.length, content_hash: `seed:${id}`,
          original_filename: `VID_${n}.mp4`, captured_at: new Date(start + (n + 2) * 86_400_000 + 7 * 3600 * 1000).toISOString(), status: 'ready', ready_at: now,
        });
        await bucket.upload(`${base}original.mp4`, bytes, { contentType: 'video/mp4', upsert: true });
        await bucket.upload(`${base}thumb.jpg`, poster.thumb, { contentType: 'image/jpeg', upsert: true });
        await bucket.upload(`${base}preview.jpg`, poster.preview, { contentType: 'image/jpeg', upsert: true });
      }
      console.log('\n  + 2 videos');
    } catch {
      console.log('\n  (ffmpeg not found: skipping demo videos)');
    }
  }

  await admin.from('albums').update({ cover_media_id: rows[Math.min(3, rows.length - 1)]?.id ?? null }).eq('id', album.id);

  // A friend's album Ana belongs to, and one where her request is still pending (demo home screen).
  if (COUNT <= 500 && !args.includes('--no-extras')) {
    for (const extra of [
      { name: 'Aniversário da Bia', owner: 'bia', members: ['ana', 'joao', 'caio'], pending: [] as string[], count: 7, start: '2026-02-21' },
      { name: 'Réveillon 2027', owner: 'caio', members: ['joao'], pending: ['ana'], count: 0, start: '2026-12-31' },
    ]) {
      const { data: prev } = await admin.from('albums').select('id').eq('owner_id', ids[extra.owner]).eq('name', extra.name);
      for (const a of prev ?? []) await admin.from('albums').delete().eq('id', a.id);
      const { data: ex } = await admin.from('albums').insert({ owner_id: ids[extra.owner], name: extra.name, start_date: extra.start, join_mode: 'approval' }).select().single();
      await admin.from('album_members').insert([
        { album_id: ex.id, user_id: ids[extra.owner], role: 'owner', status: 'active', joined_at: now },
        ...extra.members.map((k) => ({ album_id: ex.id, user_id: ids[k], role: 'member', status: 'active', joined_at: now })),
        ...extra.pending.map((k) => ({ album_id: ex.id, user_id: ids[k], role: 'member', status: 'pending' })),
      ]);
      for (let i = 0; i < extra.count; i++) {
        const id = crypto.randomUUID();
        const img = pool[(i * 5 + 3) % pool.length];
        const base = `albums/${ex.id}/${id}/`;
        await admin.from('media').insert({
          id, album_id: ex.id, uploader_id: ids[[extra.owner, ...extra.members][i % (extra.members.length + 1)]], kind: 'photo',
          storage_path: `${base}original.jpg`, thumb_path: `${base}thumb.jpg`, preview_path: `${base}preview.jpg`, thumbhash: img.thumbhash,
          mime_type: 'image/jpeg', width: img.width, height: img.height, size_bytes: img.original.length, content_hash: `seed:${id}`,
          original_filename: `IMG_${7000 + i}.jpg`, captured_at: new Date(Date.parse(`${extra.start}T21:00:00Z`) + i * 600_000).toISOString(), status: 'ready', ready_at: now,
        });
        await bucket.upload(`${base}original.jpg`, img.original, { contentType: 'image/jpeg', upsert: true });
        await bucket.upload(`${base}thumb.jpg`, img.thumb, { contentType: 'image/jpeg', upsert: true });
        await bucket.upload(`${base}preview.jpg`, img.preview, { contentType: 'image/jpeg', upsert: true });
      }
      console.log(`  + ${extra.name}`);
    }
  }
  console.log(`\nDone. Album ${album.id}\nInvite link: ${env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:8081'}/j/${album.invite_token}`);
  console.log(`Sign in on web as ana@demo.rolo.app / ${PASSWORD} (see README → Demo data).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
