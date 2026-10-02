// Grid performance on the web build with a large album (seed with: npx tsx scripts/seed.ts --count 5000).
// Measures time to first rendered tiles, then frame times during 6 s of continuous fling scrolling.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const NAME = process.argv[3] ?? 'Búzios 2026 · 5000';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const admin = createClient('http://127.0.0.1:54321', env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: album } = await admin.from('albums').select('id').eq('name', NAME).order('created_at', { ascending: false }).limit(1).single();
const { count } = await admin.from('media').select('*', { count: 'exact', head: true }).eq('album_id', album.id);
const c = createClient('http://127.0.0.1:54321', env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await c.auth.signInWithPassword({ email: 'ana@demo.rolo.app', password: 'rolo-demo-2026' });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
await ctx.addInitScript((s) => localStorage.setItem('rolo.auth', JSON.stringify(s)), data.session);
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(`${BASE}/album/${album.id}`);
await page.waitForSelector('[aria-label*="Photo by"]', { timeout: 30000 });
const firstTiles = Date.now() - t0;
await page.waitForTimeout(1500);

const result = await page.evaluate(async () => {
  const frames = [];
  let last = performance.now();
  let running = true;
  const loop = (t) => {
    frames.push(t - last);
    last = t;
    if (running) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const scroller = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight * 20 && getComputedStyle(d).overflowY !== 'visible');
  const start = performance.now();
  while (performance.now() - start < 6000) {
    scroller.scrollTop += 140; // ~8400 px/s, a fast fling
    await new Promise((r) => requestAnimationFrame(r));
  }
  running = false;
  frames.sort((a, b) => a - b);
  const pct = (p) => frames[Math.floor(frames.length * p)];
  return { frames: frames.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), over50ms: frames.filter((f) => f > 50).length, scrolled: scroller.scrollTop, height: scroller.scrollHeight };
});
const tiles = await page.locator('[aria-label*="Photo by"]').count();
console.log(JSON.stringify({ items: count, firstTilesMs: firstTiles, mountedTiles: tiles, ...result }, null, 2));
await page.screenshot({ path: 'docs/screenshots/perf-5000.jpg', type: 'jpeg', quality: 80 });
await browser.close();
