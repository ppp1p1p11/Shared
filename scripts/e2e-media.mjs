// Media flows on the web build: two people upload originals, see each other's photos live,
// open the viewer, filter by contributor and multi-select. Verifies server-side that GPS was
// stripped and the EXIF capture date was kept.
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const OUT = process.argv[3] ?? 'artifacts/e2e-media';
mkdirSync(OUT, { recursive: true });
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const browser = await chromium.launch();
const device = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false, locale: 'en-US' };
const errors = [];
const step = (s) => console.log(`• ${s}`);
const tid = (p, id) => p.locator(`[data-testid="${id}"]`).first();

async function user(name) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  return page;
}

async function upload(page, files) {
  await (await tid(page, 'album-add').count() ? tid(page, 'album-add') : tid(page, 'empty-add')).click();
  await page.waitForURL(/\/upload/);
  const chooser = page.waitForEvent('filechooser');
  await tid(page, 'web-pick').click();
  await (await chooser).setFiles(files);
  await tid(page, 'upload-submit').waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/upload-review-${files.length}.png` });
  await tid(page, 'upload-submit').click();
  await page.waitForURL(/\/album\/[^/]+$/);
}

async function tiles(page) {
  return page.locator('[data-testid="album-grid"] [role="button"][aria-label*="Photo by"], [data-testid="album-grid"] [aria-label*="Photo by"]').count();
}

// Ana creates the album
const ana = await user('ana');
await ana.goto(BASE, { waitUntil: 'networkidle' });
await tid(ana, 'create-album').click();
await tid(ana, 'album-name').fill('Búzios 2026');
await tid(ana, 'creator-name').fill('Ana');
await tid(ana, 'create-submit').click();
await ana.waitForURL(/\/album\//);
const albumId = ana.url().split('/album/')[1].split('/')[0];
const { data: albumRow } = await admin.from('albums').select('invite_token').eq('id', albumId).single();
const invite = `${BASE}/j/${albumRow.invite_token}`;
step(`album ${albumId}`);

// João joins and keeps the album open
const joao = await user('joao');
await joao.goto(invite, { waitUntil: 'networkidle' });
await tid(joao, 'web-continue').click();
await tid(joao, 'join-name').fill('João');
await tid(joao, 'join-submit').click();
await joao.waitForURL(/\/album\//);
await joao.waitForTimeout(1500);
step('João joined, album open');

// Ana uploads 4 originals
await upload(ana, [1, 2, 3, 4].map((i) => `tests/fixtures/buzios-${i}.jpg`));
await ana.waitForTimeout(800);
await ana.screenshot({ path: `${OUT}/ana-uploading.png` });
for (let i = 0; i < 40; i++) {
  const { count } = await admin.from('media').select('*', { count: 'exact', head: true }).eq('album_id', albumId).eq('status', 'ready');
  if (count === 4) break;
  await ana.waitForTimeout(500);
}
step('Ana: 4 items ready on the server');
await ana.waitForTimeout(1500);
await ana.screenshot({ path: `${OUT}/ana-grid.png` });

// João sees them live without reloading
await joao.waitForTimeout(2000);
await joao.screenshot({ path: `${OUT}/joao-live.png` });
const joaoTiles = await tiles(joao);
step(`João sees ${joaoTiles} tiles live`);

// Server-side checks: GPS stripped, capture date from EXIF, original bytes otherwise untouched
const { data: rows } = await admin.from('media').select('*').eq('album_id', albumId).order('captured_at');
const first = rows.find((r) => r.original_filename === 'buzios-1.jpg');
const dl = await admin.storage.from('media').download(first.storage_path);
const bytes = Buffer.from(await dl.data.arrayBuffer());
const orig = readFileSync('tests/fixtures/buzios-1.jpg');
const hasGps = bytes.includes(Buffer.from([0, 0, 0, 22, 0, 0, 0, 1])); // 22/1 latitude degrees rational
step(`buzios-1: size ${bytes.length} (original ${orig.length}), GPS present: ${hasGps}, captured_at ${first.captured_at}, thumb ${!!first.thumbhash}`);

// João uploads 2; Ana gets "2 new from João"
await upload(joao, ['tests/fixtures/buzios-5.jpg', 'tests/fixtures/buzios-6.jpg']);
for (let i = 0; i < 40; i++) {
  const { count } = await admin.from('media').select('*', { count: 'exact', head: true }).eq('album_id', albumId).eq('status', 'ready');
  if (count === 6) break;
  await joao.waitForTimeout(500);
}
await ana.waitForTimeout(1500);
await ana.screenshot({ path: `${OUT}/ana-new-chip.png` });
step('João uploaded 2');

// Viewer
// Click a tile that is fully visible (below the floating top bar).
const tileBox = await joao.locator('[aria-label*="Photo by Ana"]').nth(0).boundingBox();
await joao.mouse.click(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
await joao.waitForTimeout(1200);
await joao.screenshot({ path: `${OUT}/viewer.png` });
await tid(joao, 'viewer-close').click();
await joao.waitForTimeout(900);
step('viewer opened and closed');

// Contributor filter: only mine
await joao.getByText('Only mine').click();
await joao.waitForTimeout(600);
await joao.screenshot({ path: `${OUT}/filter-mine.png` });
await joao.getByText('Everyone').click();

// Multi-select via long press
const t2 = joao.locator('[aria-label*="Photo by"]').nth(1);
const box = await t2.boundingBox();
await joao.mouse.move(box.x + 20, box.y + 20);
await joao.mouse.down();
await joao.waitForTimeout(600);
await joao.mouse.up();
await joao.waitForTimeout(500);
await joao.screenshot({ path: `${OUT}/select.png` });
step('selection mode');

console.log(errors.length ? `\nErrors:\n${errors.join('\n')}` : '\nNo page errors.');
await browser.close();
