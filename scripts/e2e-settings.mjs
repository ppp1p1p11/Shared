// Settings flows: upgrade nudge after 2 albums, link an email with a 6-digit code (read from the
// local Mailpit inbox), storage overview, and LGPD/GDPR "delete my data".
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const OUT = process.argv[3] ?? 'artifacts/e2e-settings';
mkdirSync(OUT, { recursive: true });
const SERVICE_KEY = readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient('http://127.0.0.1:54321', SERVICE_KEY, { auth: { persistSession: false } });
const MAILPIT = 'http://127.0.0.1:54324';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'en-US' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
const step = (s) => console.log(`• ${s}`);

async function createAlbum(name, first) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await tid('create-album').click();
  await tid('album-name').fill(name);
  if (first) await tid('creator-name').fill('Ana');
  await tid('create-submit').click();
  await page.waitForURL(/\/album\//);
}
await createAlbum('Búzios 2026', true);
await createAlbum('Aniversário da Bia', false);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/home-nudge.png` });
const nudge = await page.getByText('Keep your albums on any phone').count();
step(`upgrade nudge visible after 2 albums: ${nudge > 0}`);

// Settings
await tid('open-settings').click();
await page.waitForURL(/\/settings/);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/settings.png`, fullPage: true });

// Link email with OTP from Mailpit
const email = `ana+${Date.now()}@example.com`;
await tid('settings-account').click();
await tid('link-target').fill(email);
await tid('link-send').click();
await tid('link-code').waitFor();
let code = null;
for (let i = 0; i < 20 && !code; i++) {
  const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + email)}`)).json();
  if (list.messages?.length) {
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
    code = (msg.Text || msg.HTML).match(/\b(\d{6})\b/)?.[1];
  }
  if (!code) await page.waitForTimeout(500);
}
step(`email code received: ${!!code}`);
await tid('link-code').fill(code);
await page.screenshot({ path: `${OUT}/link-code.png` });
await tid('link-verify').click();
await page.waitForURL(/\/settings$/, { timeout: 10000 });
await page.waitForTimeout(800);
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const linked = users.users.find((u) => u.email === email);
step(`account linked, still the same user: ${!!linked && linked.is_anonymous === false}`);
await page.screenshot({ path: `${OUT}/settings-linked.png` });

// Delete my data
const before = await admin.from('albums').select('id', { count: 'exact', head: true }).eq('owner_id', linked.id);
await tid('delete-data').click();
await page.getByText('Delete everything').last().click();
await page.waitForURL(BASE + '/', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);
const after = await admin.from('albums').select('id', { count: 'exact', head: true }).eq('owner_id', linked.id);
const gone = (await admin.auth.admin.getUserById(linked.id)).data.user === null;
step(`delete my data: albums ${before.count} → ${after.count}, auth user deleted: ${gone}`);
await page.screenshot({ path: `${OUT}/after-delete.png` });

console.log(errors.length ? `\nErrors:\n${errors.join('\n')}` : '\nNo page errors.');
await browser.close();
