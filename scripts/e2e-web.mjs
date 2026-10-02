// End-to-end flows on the web build with two independent browser contexts (= two devices).
// Usage: node scripts/e2e-web.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const OUT = process.argv[3] ?? 'artifacts/e2e';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const device = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'en-US' };
const errors = [];

async function newUser(name, opts = {}) {
  const ctx = await browser.newContext({ ...device, ...opts });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  return page;
}
const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();
const step = (s) => console.log(`• ${s}`);
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png` });

// ── Owner creates an album
const ana = await newUser('ana');
await ana.goto(BASE, { waitUntil: 'networkidle' });
await tid(ana, 'create-album').click();
await tid(ana, 'album-name').fill('Búzios 2026');
await tid(ana, 'creator-name').fill('Ana');
await shot(ana, '01-create');
await tid(ana, 'create-submit').click();
await ana.waitForURL(/\/album\//, { timeout: 15000 });
const albumUrl = ana.url();
step(`album created: ${albumUrl}`);
await ana.waitForTimeout(800);
await shot(ana, '02-album-empty');

// ── Share sheet exposes the invite link
await tid(ana, 'album-invite').click();
await ana.waitForURL(/\/share/);
await ana.waitForTimeout(1200);
await shot(ana, '03-share');
const link = await ana.locator('text=/\\/j\\//').first().innerText();
const inviteUrl = `${BASE}/j/${link.split('/j/')[1].trim()}`;
step(`invite: ${inviteUrl}`);

// ── Guest joins with the open link (web fallback: "continue in browser")
const joao = await newUser('joao');
await joao.goto(inviteUrl, { waitUntil: 'networkidle' });
await joao.waitForSelector('[data-testid="preview-name"]');
await shot(joao, '04-join-web');
await tid(joao, 'web-continue').click();
await tid(joao, 'join-name').fill('João');
await shot(joao, '05-join-name');
await tid(joao, 'join-submit').click();
await joao.waitForURL(/\/album\//, { timeout: 15000 });
step('João joined via open link');

// ── Owner switches to approval mode
await ana.goto(albumUrl.replace(/\/?$/, '/settings'), { waitUntil: 'networkidle' });
await ana.getByText('Approval required').click();
await ana.waitForTimeout(800);
step('approval mode on');

// ── Third person requests to join and waits (live)
const bia = await newUser('bia');
await bia.goto(inviteUrl, { waitUntil: 'networkidle' });
await bia.waitForSelector('[data-testid="preview-name"]');
await tid(bia, 'web-continue').click();
await tid(bia, 'join-name').fill('Bia');
await tid(bia, 'join-submit').click();
await bia.waitForURL(/\/waiting\//, { timeout: 15000 });
await bia.waitForTimeout(1000);
await shot(bia, '06-waiting');
step('Bia is waiting for approval');

// ── Owner sees the request and approves; Bia's screen flips live
await ana.reload({ waitUntil: 'networkidle' });
await ana.getByText('Requests').waitFor({ timeout: 10000 });
await shot(ana, '07-settings-request');
await ana.getByRole('button', { name: 'Approve' }).click();
await bia.waitForURL(/\/album\//, { timeout: 20000 });
step('Bia approved → album opened live');

// ── Lock: a fourth person is turned away
await ana.waitForTimeout(500);
await ana.getByRole('switch', { name: 'Lock album' }).click().catch(async () => ana.getByText('Lock album').click());
await ana.waitForTimeout(1000);
const zed = await newUser('zed');
await zed.goto(inviteUrl, { waitUntil: 'networkidle' });
await zed.getByText('Album is locked').waitFor({ timeout: 10000 });
await shot(zed, '08-join-locked');
step('locked album refuses new people');

await shot(ana, '09-settings-owner');
console.log(errors.length ? `\nErrors:\n${errors.join('\n')}` : '\nNo page errors.');
await browser.close();
