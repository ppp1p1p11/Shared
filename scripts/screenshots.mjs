// Captures every key screen of the web build in light + dark, English + Português.
// Prereqs: local Supabase running, `npx tsx scripts/seed.ts`, web build served on :8081
// (scripts/web-build-serve.sh). Output: docs/screenshots/<set>/NN-name.jpg
//
//   node scripts/screenshots.mjs [baseUrl] [--sets light-en,dark-en,light-pt,dark-pt]
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:8081';
const setsArg = process.argv.includes('--sets') ? process.argv[process.argv.indexOf('--sets') + 1].split(',') : null;
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL = 'http://127.0.0.1:54321';
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = 'rolo-demo-2026';

const SETS = [
  { id: 'light-en', scheme: 'light', lang: 'en', locale: 'en-US' },
  { id: 'dark-en', scheme: 'dark', lang: 'en', locale: 'en-US' },
  { id: 'light-pt', scheme: 'light', lang: 'pt-BR', locale: 'pt-BR' },
  { id: 'dark-pt', scheme: 'dark', lang: 'pt-BR', locale: 'pt-BR' },
].filter((s) => !setsArg || setsArg.includes(s.id));

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function sessionFor(email) {
  const c = createClient(URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return data.session;
}

async function albumByName(name) {
  const { data } = await admin.from('albums').select('*').eq('name', name).order('created_at', { ascending: false }).limit(1).single();
  return data;
}

async function newPage(set, session, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: set.scheme,
    locale: set.locale,
    permissions: ['camera', 'clipboard-read', 'clipboard-write'],
    ...extra,
  });
  await ctx.addInitScript(
    ([s, lang]) => {
      if (s) localStorage.setItem('rolo.auth', JSON.stringify(s));
      localStorage.setItem('rolo.prefs', JSON.stringify({ state: { language: lang, lastDisplayName: '' }, version: 0 }));
    },
    [session, set.lang],
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
  return page;
}

const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();

async function run(set) {
  const dir = `docs/screenshots/${set.id}`;
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const shot = async (page, name, opts = {}) => {
    n++;
    await page.screenshot({ path: `${dir}/${String(n).padStart(2, '0')}-${name}.jpg`, type: 'jpeg', quality: 82, ...opts });
    console.log(`  ✓ ${set.id}/${name}`);
  };
  const T = (en, pt) => (set.lang === 'pt-BR' ? pt : en);

  const buzios = await albumByName('Búzios 2026');
  const reveillon = await albumByName('Réveillon 2027');
  const ana = await sessionFor('ana@demo.rolo.app');
  const joao = await sessionFor('joao@demo.rolo.app');

  // 1. First run (no session yet → silent anonymous account)
  {
    const p = await newPage(set, null);
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await wait(1200);
    await shot(p, 'home-first-run');
    // 2. Create sheet with date range
    await tid(p, 'create-album').click();
    await tid(p, 'album-name').fill('Búzios 2026');
    await tid(p, 'creator-name').fill('Ana');
    await p.getByText(T('Add dates', 'Adicionar datas')).click();
    await wait(400);
    await shot(p, 'create-album');
    await p.context().close();
  }

  // 3. Home with albums (cover mosaics, avatars, pending album, requests badge)
  const pa = await newPage(set, ana);
  await pa.goto(BASE, { waitUntil: 'networkidle' });
  await wait(2000);
  await shot(pa, 'home');

  // 4. Album grid
  await pa.goto(`${BASE}/album/${buzios.id}`, { waitUntil: 'networkidle' });
  await wait(2500);
  await shot(pa, 'album-grid');

  // 5. Live: new uploads from Caio arrive while the album is open → "3 new from Caio"
  {
    const { data: caio } = await admin.from('profiles').select('id').eq('display_name', 'Caio').limit(1).single();
    const { data: src } = await admin.from('media').select('*').eq('album_id', buzios.id).eq('kind', 'photo').limit(3);
    for (const m of src) {
      const id = crypto.randomUUID();
      const base = `albums/${buzios.id}/${id}/`;
      for (const f of ['original.jpg', 'thumb.jpg', 'preview.jpg']) await admin.storage.from('media').copy(m.storage_path.replace('original.jpg', f), base + f);
      const { id: _id, created_at, ready_at, ...rest } = m;
      await admin.from('media').insert({ ...rest, id, uploader_id: caio.id, storage_path: base + 'original.jpg', thumb_path: base + 'thumb.jpg', preview_path: base + 'preview.jpg', content_hash: `shot:${id}`, status: 'uploading' });
      await admin.from('media').update({ status: 'ready' }).eq('id', id);
    }
    await wait(2500);
    await shot(pa, 'album-live-new');
  }

  // 6. Contributor filter
  await pa.getByText('João', { exact: true }).first().click();
  await wait(900);
  await shot(pa, 'album-filter');
  await pa.getByText(T('Everyone', 'Todo mundo')).first().click();
  await wait(600);

  // 7. Multi-select
  {
    const tile = pa.locator('[aria-label*="Photo by"], [aria-label*="Foto de"]').nth(1);
    const b = await tile.boundingBox();
    await pa.mouse.move(b.x + 30, b.y + 30);
    await pa.mouse.down();
    await wait(600);
    await pa.mouse.up();
    for (const i of [2, 4]) {
      const bb = await pa.locator('[aria-label*="Photo by"], [aria-label*="Foto de"]').nth(i).boundingBox();
      await pa.mouse.click(bb.x + 30, bb.y + 30);
    }
    await wait(500);
    await shot(pa, 'album-select');
    await pa.keyboard.press('Escape');
    await pa.reload({ waitUntil: 'networkidle' });
    await wait(2000);
  }

  // 8. Viewer + 9. viewer actions
  {
    const bb = await pa.locator('[aria-label*="Photo by"], [aria-label*="Foto de"]').nth(0).boundingBox();
    await pa.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await wait(1800);
    await shot(pa, 'viewer');
    await tid(pa, 'viewer-more').click();
    await wait(700);
    await shot(pa, 'viewer-actions');
    await pa.keyboard.press('Escape');
    await pa.mouse.click(196, 820).catch(() => {});
    await wait(400);
  }

  // 10. Share / QR
  await pa.goto(`${BASE}/album/${buzios.id}/share`, { waitUntil: 'networkidle' });
  await wait(1200);
  await shot(pa, 'share-qr');

  // 11. Album settings (owner): requests, people, access controls, storage
  await pa.goto(`${BASE}/album/${buzios.id}/settings`, { waitUntil: 'networkidle' });
  await wait(1500);
  await shot(pa, 'album-settings');
  await pa.mouse.wheel(0, 1100);
  await wait(500);
  await shot(pa, 'album-settings-access');

  // 12. Upload review (web picker) → 13. upload progress pill + 14. uploads sheet
  {
    await pa.goto(`${BASE}/album/${buzios.id}`, { waitUntil: 'networkidle' });
    await wait(1500);
    let let_through = 2;
    await pa.route('**/storage/v1/upload/resumable/**', async (route) => {
      if (route.request().method() === 'PATCH' && let_through-- <= 0) await wait(60_000);
      return route.continue().catch(() => {});
    });
    await tid(pa, 'album-add').click();
    const chooser = pa.waitForEvent('filechooser');
    await tid(pa, 'web-pick').click();
    await (await chooser).setFiles([1, 2, 3, 4, 5, 6].map((i) => `tests/fixtures/buzios-${i}.jpg`));
    await wait(1200);
    await shot(pa, 'upload-review');
    await tid(pa, 'upload-submit').click();
    await wait(4000);
    await shot(pa, 'album-uploading');
    await tid(pa, 'upload-pill').click();
    await wait(1200);
    await shot(pa, 'uploads-sheet');
    await pa.unrouteAll({ behavior: 'ignoreErrors' });
  }

  // 15. Settings + 16. account linking
  await pa.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await wait(1500);
  await shot(pa, 'settings');
  await pa.goto(`${BASE}/settings/account`, { waitUntil: 'networkidle' });
  await wait(800);
  await shot(pa, 'account-link');

  // 17. Waiting for approval (Ana asked to join Réveillon 2027)
  await pa.goto(`${BASE}/waiting/${reveillon.id}`, { waitUntil: 'networkidle' });
  await wait(1500);
  await shot(pa, 'waiting-approval');

  // 18. Empty album
  {
    const { data: anaProfile } = await admin.from('profiles').select('id').eq('display_name', 'Ana').limit(1).single();
    let { data: empty } = await admin.from('albums').select('*').eq('name', 'Ilha Grande').eq('owner_id', anaProfile.id).maybeSingle();
    if (!empty) {
      ({ data: empty } = await admin.from('albums').insert({ owner_id: anaProfile.id, name: 'Ilha Grande', start_date: '2026-03-06', end_date: '2026-03-08' }).select().single());
      await admin.from('album_members').insert({ album_id: empty.id, user_id: anaProfile.id, role: 'owner', status: 'active', joined_at: new Date().toISOString() });
    }
    await pa.goto(`${BASE}/album/${empty.id}`, { waitUntil: 'networkidle' });
    await wait(1200);
    await shot(pa, 'album-empty');
  }

  // 19. Storage at ~85% (calm heads-up) and 20. full → paywall
  {
    const { data: usage } = await (await createClient(URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${ana.access_token}` } }, auth: { persistSession: false } })).rpc('get_my_usage');
    const original = (await admin.from('plan_limits').select('*').eq('plan', 'free').single()).data.max_storage_bytes;
    await admin.from('plan_limits').update({ max_storage_bytes: Math.round(usage.used_bytes / 0.86) }).eq('plan', 'free');
    await pa.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('rolo.prefs'));
      p.state.storageWarned = {};
      localStorage.setItem('rolo.prefs', JSON.stringify(p));
    });
    await pa.goto(`${BASE}/album/${buzios.id}`, { waitUntil: 'networkidle' });
    await wait(2000);
    await shot(pa, 'storage-warning');
    await admin.from('plan_limits').update({ max_storage_bytes: usage.used_bytes }).eq('plan', 'free');
    await pa.goto(`${BASE}/paywall?reason=full&albumId=${buzios.id}`, { waitUntil: 'networkidle' });
    await wait(1500);
    await shot(pa, 'paywall-storage-full');
    await admin.from('plan_limits').update({ max_storage_bytes: original }).eq('plan', 'free');
  }
  await pa.context().close();

  // 21. Join page (web fallback) and 22. join with name, as a stranger
  {
    const p = await newPage(set, null);
    await p.goto(`${BASE}/j/${buzios.invite_token}`, { waitUntil: 'networkidle' });
    await wait(1500);
    await shot(p, 'join-web');
    await tid(p, 'web-continue').click();
    await tid(p, 'join-name').fill('Lia');
    await wait(400);
    await shot(p, 'join-name');
    // 23. Invalid link
    await p.goto(`${BASE}/j/AAAAAAAAAAAAAAAAAAAAAAAA`, { waitUntil: 'networkidle' });
    await wait(1200);
    await shot(p, 'join-invalid');
    await p.context().close();
  }

  // 24. Member view of settings (João: read-only access controls)
  {
    const p = await newPage(set, joao);
    await p.goto(`${BASE}/album/${buzios.id}/settings`, { waitUntil: 'networkidle' });
    await wait(1500);
    await shot(p, 'album-settings-member');
    // 25. QR scanner (fake camera)
    await p.goto(`${BASE}/scan`, { waitUntil: 'networkidle' });
    await wait(2500);
    await shot(p, 'scan-qr');
    await p.context().close();
  }
}

for (const set of SETS) {
  console.log(`\n${set.id}`);
  await run(set);
}
await browser.close();
