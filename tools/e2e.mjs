// End-to-end check in a real browser against the production build: boots the game,
// drives real input, and exercises every system — menus, intro, controls, collisions,
// checkpoints, abilities, the capture finale, rewards, persistence and offline play.
//   npm run build && npm run test:e2e        (set CHROME=/path/to/browser if it is not found)
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import fs from 'node:fs';

const out = process.argv[2] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const exe = CANDIDATES.find((p) => p && fs.existsSync(p));
if (!exe) throw new Error('No browser found; set CHROME=/path/to/chrome');
const server = await preview({ preview: { port: 4317, strictPort: true }, logLevel: 'silent' });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const check = (ok, m) => { if (!ok) fail(m); else console.log('  ok  ', m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(w, h, mobile) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  page.on('console', (m) => { if (m.type() === 'error') fail('console: ' + m.text()); });
  page.on('pageerror', (e) => fail('pageerror: ' + e.message));
  await page.goto('http://localhost:4317/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.state === 'menu', { timeout: 120000 });
  await page.evaluate(() => window.__game.renderer.setAnimationLoop(null)); // the test steps the simulation itself
  return page;
}
const step = (p, secs) => p.evaluate((s) => { const g = window.__game; for (let i = 0; i < Math.round(60 * s); i++) g.update(1 / 60); g.renderer.render(g.scene, g.camera.cam); }, secs);
const shot = async (p, name) => { await wait(350); await p.screenshot({ path: `${out}/${name}.png` }); };
const G = (p, fn, arg) => p.evaluate(fn, arg);
/** Step until `cond` holds (game-time limit in seconds). */
async function until(p, cond, limit, chunk = 0.5) {
  for (let t = 0; t < limit; t += chunk) { if (await p.evaluate(cond)) return true; await step(p, chunk); }
  return p.evaluate(cond);
}

// ================= desktop
const page = await open(1280, 720, false);
console.log('menu and sheets');
await shot(page, '01-menu');
check(await G(page, () => document.getElementById('c-title').textContent === 'Corner Shop Stick-up'), 'menu shows the current case');
for (const s of ['heroes', 'missions', 'bounties', 'shop', 'seasons', 'settings']) {
  await page.evaluate((s) => document.querySelector(`#menu [data-sheet="${s}"]`).click(), s);
  await step(page, 0.6);
  check(await G(page, () => document.getElementById('sheet').classList.contains('show') && document.getElementById('sheet-body').children.length > 0), `sheet opens with content: ${s}`);
  if (s === 'heroes') {
    await page.evaluate(() => document.querySelector('[data-act="preview"][data-id="skylark"]').click());
    await step(page, 0.5);
    check(await G(page, () => __game.player.characterId === 'skylark'), 'hero preview swaps the 3D model');
    check(await G(page, () => document.querySelector('[data-act="choose"]').hasAttribute('disabled')), 'a hero that cannot be afforded cannot be bought');
    await shot(page, '02-heroes');
  }
  if (s === 'missions') {
    check(await G(page, () => !document.querySelector('[data-act="mission"][data-id="m2"]')), 'locked cases cannot be selected');
    await shot(page, '03-cases');
  }
  if (s === 'seasons') await shot(page, '04-seasons');
  await page.click('#sheet-close');
  await step(page, 0.4);
}
check(await G(page, () => __game.player.characterId === 'officer'), 'closing the sheet restores the selected hero');

console.log('intro cinematic');
await page.click('#btn-play');
check(await G(page, () => __game.state === 'intro'), 'the first run opens with the robbery cinematic');
await step(page, 1.0);
check(await G(page, () => document.getElementById('caption').classList.contains('show')), 'cinematic caption is shown');
await shot(page, '05-intro');
check(await until(page, () => __game.state === 'running', 8), 'intro hands over to the pursuit');
check(await G(page, () => __game.criminal.root.visible && __game.pursuit.gap > 20), 'the suspect is ahead with a real gap');

console.log('controls and animation states');
const anim = () => G(page, () => __game.player.animation);
await page.keyboard.press('ArrowLeft'); await step(page, 0.3);
check(await G(page, () => __game.player.lane === 0), 'ArrowLeft changes lane');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await step(page, 0.3);
check(await G(page, () => __game.player.lane === 2), 'ArrowRight changes lane');
await page.keyboard.press('KeyA'); await step(page, 0.4);
await page.keyboard.press('Space'); await step(page, 0.03);
check((await anim()) === 'Jump_Start', 'jump starts with a take-off (crouch) animation');
await step(page, 0.3);
check(await G(page, () => __game.player.y > 0.8) && (await anim()) === 'Jump_Idle', 'jump rises with an airborne pose');
await step(page, 0.5);
check(await G(page, () => __game.player.y === 0), 'jump lands');
await step(page, 0.4);
await page.keyboard.press('ArrowDown'); await step(page, 0.2);
check((await anim()) === 'Sit_Floor_Idle' && await G(page, () => __game.player.sliding && __game.player.rig.pitch.rotation.x > 0.3), 'slide drops into a leaned-back seated pose');
await shot(page, '06-slide');
await step(page, 0.7);
check((await anim()).startsWith('Running'), 'slide returns to the run');
await page.keyboard.press('Escape');
check(await G(page, () => __game.state === 'paused'), 'Esc pauses');
const d0 = await G(page, () => __game.player.d);
await step(page, 0.5);
check(await G(page, (d) => __game.player.d === d, d0), 'nothing moves while paused');
await page.click('#btn-resume');
check(await G(page, () => __game.state === 'running'), 'resume continues');

console.log('collisions, hearts and failure');
await G(page, () => { __game.autopilot = false; });
check(await until(page, () => __game.pursuit.hits >= 1, 40, 0.1), 'running into an obstacle registers a hit');
check(await G(page, () => __game.pursuit.hearts === 2 && __game.state === 'running'), 'a hit costs a heart, not the run');
check(await until(page, () => __game.state === 'over', 120), 'too many hits ends the pursuit');
check(await G(page, () => __game.failReason === 'injured' && document.getElementById('o-title').textContent === 'PURSUIT ABANDONED'), 'failure screen states the reason');
await shot(page, '07-failed');

console.log('pursuit gap, zones and checkpoints');
await G(page, () => { __game.autopilot = true; __game.botPowers = false; __game.startPursuit(11, true); });
const gap0 = await G(page, () => __game.pursuit.gap);
await step(page, 12);
check(await G(page, (g) => __game.pursuit.gap < g, gap0), 'clean running closes the gap');
check(await G(page, () => __game.runCoins > 0 && __game.abilities.charge > 0 && __game.abilities.charge <= __game.runCoins), 'coins charge the ability');
check(await until(page, () => __game.zone === 1, 120, 2), 'the route enters the rail yard');
check(await G(page, () => __game.world.themeAt(__game.player.d + 5) === 'rail' && __game.save.data.story.m1.zone === 1), 'environment changes and the checkpoint is saved');
check(await G(page, () => __game.save.data.coins > 0), 'coins are banked at the checkpoint');
await step(page, 3);
await shot(page, '08-rail');
await page.keyboard.press('Escape'); await page.click('#btn-quit');
check(await G(page, () => document.getElementById('play-label').textContent === 'RESUME PURSUIT'), 'menu offers to resume from the checkpoint');
await page.click('#btn-play');
check(await G(page, () => __game.state === 'running' && __game.player.d >= 1500), 'resuming starts at the checkpoint, without the intro');

console.log('abilities');
await G(page, () => { __game.abilities.charge = __game.abilities.cost; });
check(await G(page, () => __game.abilities.ready), 'ability becomes ready at full charge');
const walletBefore = await G(page, () => __game.runCoins);
await page.keyboard.press('KeyE'); await step(page, 1.2);
check(await G(page, () => __game.player.mode === 'bike' && __game.abilities.active && __game.abilities.charge === 0), 'E mounts the police motorcycle and empties the charge');
check(await G(page, (w) => __game.runCoins >= w, walletBefore), 'activating never spends collected coins');
await shot(page, '09-motorcycle');
check(await until(page, () => !__game.abilities.active, 20), 'the motorcycle runs out');
check(await G(page, () => __game.player.mode === 'run'), 'and the officer is back on foot');
await G(page, () => { const g = __game; g.save.data.owned.push('skylark'); g.save.data.char = 'skylark'; g.startPursuit(12, true); });
await step(page, 3);
await G(page, () => { __game.abilities.charge = __game.abilities.cost; __game.power(); });
await step(page, 2);
check(await G(page, () => __game.player.mode === 'fly' && __game.player.y > 3.5), 'the flyer takes off');
await shot(page, '10-flight');
const hitsBefore = await G(page, () => __game.pursuit.hits);
const coinsBefore = await G(page, () => __game.runCoins);
await step(page, 6);
check(await G(page, (h) => __game.pursuit.hits === h, hitsBefore), 'flight passes over ground obstacles');
check(await G(page, (c) => __game.runCoins > c, coinsBefore), 'airborne coins are collected');
check(await until(page, () => __game.player.mode === 'run' && __game.player.y === 0, 12), 'flight ends with a landing');

console.log('capture finale');
await G(page, () => { const g = __game; g.save.data.char = 'officer'; g.save.data.story.m1 = { zone: 6, gap: 40, done: false, best: 0 }; g.startPursuit(21, true); g.mission.length = 40400; g.mission.limit = 42000; g.autopilot = true; });
check(await until(page, () => !!__game.capture, 40), 'reaching the target distance starts the final pursuit (no automatic win)');
check(await G(page, () => __game.state === 'running' && !__game.save.data.story.m1.done), 'the mission is not complete yet');
await G(page, () => { __game.autopilot = false; __game.player.moveLane(-1); });
check(await until(page, () => __game.capture.phase === 'lock', 30, 0.1), 'closing in arms the taser');
await shot(page, '11-capture');
const tries = await G(page, () => __game.capture.tries);
// a deliberately bad shot: fire when the meter is outside the window
await until(page, () => !__game.capture.inWindow && __game.capture.cooldown === 0, 5, 1 / 60);
await page.keyboard.press('KeyE'); await step(page, 0.1);
check(await G(page, (t) => __game.capture.tries === t - 1 && __game.capture.hits === 0, tries), 'a mistimed shot misses and costs an attempt');
await G(page, () => { __game.autopilot = true; });
check(await until(page, () => __game.state === 'takedown', 40, 0.1), 'well-timed shots in the right lane bring the suspect down');
await step(page, 1.6);
await shot(page, '12-arrest');
check(await until(page, () => __game.state === 'over', 10), 'the arrest cinematic ends on the results');
check(await G(page, () => __game.save.data.story.m1.done && __game.save.data.arrests === 1 && __game.save.data.mission === 'm2'), 'the case is closed and the next one unlocked');
check(await G(page, () => document.getElementById('retry-label').textContent === 'NEXT CASE'), 'results offer the next case');
await shot(page, '13-case-closed');
await page.click('#btn-retry');
check(await G(page, () => __game.mission.id === 'm2' && __game.state === 'intro'), 'the next case starts with its own robbery');
await G(page, () => __game.toMenu());

console.log('persistence');
const saved = await G(page, () => { __game.save.commit(); return JSON.stringify({ c: __game.save.data.coins, m: __game.save.data.mission, a: __game.save.data.arrests }); });
await wait(300);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.state === 'menu', { timeout: 120000 });
check(await G(page, (s) => JSON.stringify({ c: __game.save.data.coins, m: __game.save.data.mission, a: __game.save.data.arrests }) === s, saved), 'progress survives a reload');
check(await G(page, () => navigator.serviceWorker.getRegistration().then((r) => !!r)), 'service worker is registered (offline play)');
await page.close();

// ================= phone, portrait, touch
console.log('phone');
const phone = await open(390, 844, true);
await shot(phone, '14-phone-menu');
const swipe = async (dx, dy) => {
  const c = await phone.createCDPSession();
  const pt = (x, y) => [{ x, y, id: 1 }];
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(195, 420) });
  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(195 + dx, 420 + dy) });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
await G(phone, () => __game.startPursuit(5, true));
await step(phone, 0.5);
await swipe(-90, 0); await step(phone, 0.2);
check(await G(phone, () => __game.player.lane === 0), 'swipe left changes lane');
await swipe(0, -90); await step(phone, 0.25);
check(await G(phone, () => __game.player.airborne), 'swipe up jumps');
await step(phone, 0.7);
await swipe(0, 90); await step(phone, 0.15);
check(await G(phone, () => __game.player.sliding), 'swipe down slides');
await G(phone, () => { __game.abilities.charge = __game.abilities.cost; });
await step(phone, 0.2);
await phone.tap('#btn-power'); await step(phone, 0.6);
check(await G(phone, () => __game.abilities.active), 'tapping the ability button activates it');
await shot(phone, '15-phone-run');
check(await G(phone, () => { const r = document.getElementById('btn-power').getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight && r.width >= 64; }), 'ability button is on screen and thumb-sized');
await phone.close();

await browser.close();
await server.close();
console.log(errors.length ? `\n${errors.length} FAILURE(S)` : '\nALL END-TO-END CHECKS PASSED');
process.exit(errors.length ? 1 : 0);
