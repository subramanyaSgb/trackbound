// Proves the in-app update path against real builds: load build A (service worker
// installs and caches it), publish build B, then check that the running app reports
// the update, keeps running A until told to switch, and comes back on B.
//   npm run build && node tools/update-test.mjs [screenshot dir]
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const exe = CANDIDATES.find((p) => p && fs.existsSync(p));
if (!exe) throw new Error('No browser found; set CHROME=/path/to/chrome');
const errors = [];
const check = (ok, m) => { if (!ok) { errors.push(m); console.log('FAIL', m); } else console.log('  ok  ', m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await preview({ preview: { port: 4319, strictPort: true }, logLevel: 'silent' });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: 414, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const ready = () => page.waitForFunction(() => window.__game?.state === 'menu', { timeout: 120000 });
const info = () => page.evaluate(() => ({ status: __game.updates.status, label: document.getElementById('m-version').textContent, button: document.getElementById('btn-update').classList.contains('on'), controlled: !!navigator.serviceWorker.controller }));
const served = () => JSON.parse(fs.readFileSync('dist/version.json', 'utf8'));

await page.goto('http://localhost:4319/', { waitUntil: 'load' });
await ready();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30000 });
const a = served();
let s = await info();
check(s.label.includes(a.version) && (!a.commit || s.label.includes(a.commit)), `menu shows the running version (${s.label})`);
await page.evaluate(() => __game.updates.check());
s = await info();
check(s.status === 'latest' && !s.button, 'with nothing newer published it reports "latest" and offers no update');
const builtA = await page.evaluate(() => __game.updates.constructor && document.getElementById('m-version').textContent);

console.log('publishing a newer build…');
await wait(1100);
execSync('npm run build', { stdio: 'ignore' });
const b = served();
check(b.built !== a.built, 'a newer build is being served');

await page.evaluate(() => __game.updates.check());
await page.waitForFunction(() => __game.updates.status === 'available', { timeout: 30000 });
s = await info();
check(s.button, 'the menu shows the update button');
check(s.label === builtA, 'the app keeps running the old build until the player accepts');
check(await page.evaluate((built) => __game.updates.latest?.built === built, b.built), 'it knows which build is waiting');
await page.evaluate(() => __game.openSheet('settings'));
await wait(600);
check(await page.evaluate(() => !!document.querySelector('[data-act="apply-update"]')), 'settings shows the version row with an UPDATE button');
if (out) await page.screenshot({ path: `${out}/update-available.png` });
await page.evaluate(() => __game.openSheet(null));
// a pursuit in progress is not interrupted by the waiting update
await page.evaluate(() => __game.startPursuit(1, true));
await wait(1500);
check(await page.evaluate(() => __game.state === 'running'), 'a waiting update does not interrupt a pursuit');
await page.evaluate(() => __game.toMenu());

await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }), page.evaluate(() => document.getElementById('btn-update').click())]);
await ready();
const builtNow = await page.evaluate(() => __APP_BUILT_CHECK());
check(builtNow === b.built, 'after accepting, the app reloads on the new build');
await page.evaluate(() => __game.updates.check());
s = await info();
check(s.status === 'latest' && !s.button, 'and reports that it is up to date');
// offline: still launches from cache and says it could not check
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'load' });
await ready();
await page.evaluate(() => __game.updates.check());
s = await info();
check(s.status === 'offline' && s.label.includes(b.version), 'offline: the game still starts and reports that it could not check');
if (out) await page.screenshot({ path: `${out}/menu-version.png` });

await browser.close();
await server.close();
console.log(errors.length ? `\n${errors.length} FAILURE(S)` : '\nUPDATE FLOW VERIFIED');
process.exit(errors.length ? 1 : 0);
