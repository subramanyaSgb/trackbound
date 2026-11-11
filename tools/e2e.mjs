// End-to-end check in headless Chrome: boots the production build, drives real
// input, exercises every system, runs the autopilot over the generated track,
// verifies offline play, and saves screenshots.
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import fs from 'node:fs';

const out = process.argv[2] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port: 4317, strictPort: true }, logLevel: 'silent' });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const check = (ok, m) => { if (!ok) fail(m); };
async function open(w, h, mobile) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  page.on('console', (m) => { if (m.type() === 'error') fail('console: ' + m.text()); });
  page.on('pageerror', (e) => fail('pageerror: ' + e.message));
  await page.goto('http://localhost:4317/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.state === 'menu', { timeout: 90000 });
  return page;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sim = (page, fn, arg) => page.evaluate(fn, arg);
const step = (p, secs) => p.evaluate((secs) => { for (let i = 0; i < 60 * secs; i++) __game.update(1 / 60); }, secs);
const shot = async (p, name, settle = 600) => { await wait(settle); await p.screenshot({ path: `${out}/${name}.png` }); };

// ================= desktop: controls, animation states, pause, crash, results, persistence
const page = await open(1280, 720, false);
await shot(page, '01-menu-desktop', 1500);
await page.click('#btn-play');
check((await sim(page, () => __game.state)) === 'running', 'play did not start run');
await step(page, 1);
check((await sim(page, () => __game.player.animation)) === 'Running_A', 'run animation');
await page.keyboard.press('ArrowLeft');
check((await sim(page, () => __game.player.animation)) === 'Running_Strafe_Left', 'lane-change animation');
await step(page, 0.4);
check(Math.abs((await sim(page, () => __game.player.x)) + 2.2) < 0.05, 'lane change left');
check((await sim(page, () => __game.player.animation)) === 'Running_A', 'returns to run after lane change');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowUp');
check((await sim(page, () => __game.player.animation)) === 'Jump_Start', 'take-off animation');
await step(page, 0.25);
check(await sim(page, () => __game.player.airborne && __game.player.y > 0.8 && __game.player.animation === 'Jump_Idle'), 'jump / airborne animation');
await shot(page, '02-jump', 300);
check(await sim(page, () => { const g = __game; for (let i = 0; i < 90 && g.player.airborne; i++) g.update(1 / 60); return !g.player.airborne && g.player.animation === 'Jump_Land'; }), 'landing animation');
await step(page, 0.3);
check((await sim(page, () => __game.player.animation)) === 'Running_A', 'run resumes after landing');
await step(page, 0.4);
await page.keyboard.press('ArrowDown');
await step(page, 0.3);
check(await sim(page, () => __game.player.sliding && __game.player.height < 1 && __game.player.animation === 'Dodge_Forward'), 'slide / roll animation');
await shot(page, '03-slide', 300);
await step(page, 0.6);
check(!(await sim(page, () => __game.player.sliding)), 'slide should end');
await page.keyboard.press('Escape');
const dPause = await sim(page, () => __game.player.d);
await step(page, 0.5);
check((await sim(page, () => __game.player.d)) === dPause, 'pause does not freeze the run');
await shot(page, '04-pause');
await page.click('#btn-resume');
check((await sim(page, () => __game.state)) === 'running', 'resume');

// ---- autopilot over real physics, fast-forwarded (no rendering): fairness + collision + leaks
let geo2k = 0;
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const r = await sim(page, (seed) => {
    const g = __game;
    g.toMenu(); g.startRun(seed); g.autopilot = true;
    let geoMid = 0;
    for (let i = 0; i < 60 * 300 && g.state === 'running'; i++) { g.update(1 / 60); if (i === 60 * 100) geoMid = g.renderer.info.memory.geometries; }
    const rows = g.spawner.rows, p = g.player;
    const near = rows.filter((r) => Math.abs(r.d - p.d) < 25).map((r) => `${r.d.toFixed(1)}:${r.cells.join('/')}:s${r.safe}`);
    return { state: g.state, d: Math.round(p.d), coins: g.runCoins, lane: p.lane, near, active: g.spawner.active.length, geoMid, geoEnd: g.renderer.info.memory.geometries, sceneKids: g.scene.children.length };
  }, seed);
  console.log(`autopilot seed ${seed}: ${r.d} m, ${r.coins} coins, ${r.active} live obstacles, ${r.sceneKids} scene nodes, state ${r.state}`);
  check(r.state === 'running', `autopilot died seed ${seed} at ${r.d} m lane ${r.lane}: ${r.near.join(' | ')}`);
  check(r.coins > 100, 'autopilot collected too few coins');
  check(r.active < 40, 'obstacles are not being recycled');
  // pooled models are built on first use, so counts may rise early; they must then stay flat
  if (seed === 3) geo2k = r.sceneKids;
  if (seed === 6) check(r.sceneKids <= geo2k + 3 && r.geoEnd < 150, `scene keeps growing across runs (${geo2k} -> ${r.sceneKids} nodes, ${r.geoEnd} geometries): leak`);
}

// ---- power-ups do what they say
const pw = await sim(page, () => {
  const g = __game, p = g.player, out = {};
  g.autopilot = false; g.toMenu(); g.startRun(21); g.update(1 / 60);
  // magnet: a coin in another lane is pulled in
  g.coins.add(p.d + 5, 2.2, 1); for (let i = 0; i < 40; i++) g.update(1 / 60);
  out.noMagnet = g.runCoins;
  g.powers.activate('magnet', 0); g.coins.add(p.d + 5, 2.2, 1); for (let i = 0; i < 40; i++) g.update(1 / 60);
  out.magnet = g.runCoins;
  // double: one coin counts twice
  g.powers.reset(); g.powers.activate('double', 0); const c0 = g.runCoins; g.coins.add(p.d + 3, p.x, 1); for (let i = 0; i < 30; i++) g.update(1 / 60);
  out.double = g.runCoins - c0;
  // durations / upgrades
  out.left = g.powers.left.double; out.total = g.powers.total.double;
  // shield: first crash absorbed, second ends the run
  g.toMenu(); g.startRun(11); g.powers.activate('shield', 5);
  let absorbedAt = 0;
  for (let i = 0; i < 60 * 60 && g.state === 'running'; i++) { g.update(1 / 60); if (!absorbedAt && !g.powers.active('shield')) absorbedAt = p.d; }
  out.absorbedAt = Math.round(absorbedAt); out.diedAt = Math.round(p.d); out.state = g.state; out.anim = p.animation;
  // pickups appear on the track and are collected by running through them
  g.toMenu(); g.startRun(5); g.autopilot = true; let picked = 0; const report = g.missions.report.bind(g.missions);
  g.missions.report = (m, v, a) => { if (m === 'powerups') picked += v; report(m, v, a); };
  for (let i = 0; i < 60 * 90; i++) g.update(1 / 60);
  g.missions.report = report; out.picked = picked; g.autopilot = false;
  return out;
});
check(pw.noMagnet === 0 && pw.magnet === 1, `magnet should pull coins from another lane (${pw.noMagnet}, ${pw.magnet})`);
check(pw.double === 2, `double coins should count twice (${pw.double})`);
check(pw.left > 0 && pw.left < pw.total, 'power-up timer should count down');
check(pw.absorbedAt > 0 && pw.diedAt > pw.absorbedAt + 5 && pw.state === 'dying', `shield should absorb exactly one crash (${JSON.stringify(pw)})`);
check(pw.anim === 'Death_A', 'crash animation');
check(pw.picked >= 2, `pickups should spawn and be collectable (${pw.picked})`);
console.log(`power-ups: magnet ok, double ok, shield absorbed at ${pw.absorbedAt} m then crashed at ${pw.diedAt} m, ${pw.picked} pickups in 90 s`);

// ---- crash -> results -> retry -> persistence
await sim(page, () => { const g = __game; g.autopilot = false; g.toMenu(); g.startRun(11); for (let i = 0; i < 60 * 60 && g.state === 'running'; i++) g.update(1 / 60); });
check((await sim(page, () => __game.state)) === 'dying', 'idle player never crashed');
await step(page, 0.4);
await shot(page, '05-crash', 400);
await step(page, 1.2);
check((await sim(page, () => __game.state)) === 'over', 'results screen');
await step(page, 2);
await shot(page, '06-results-desktop', 1400);
const saved = await sim(page, () => ({ ...__game.save.data }));
check(saved.best > 0 && saved.runs > 0 && saved.xp > 0, 'run results not recorded');
await page.click('#btn-retry');
check((await sim(page, () => __game.state)) === 'running', 'retry');
for (const [name, secs] of [['07-run-early', 9], ['08-run-mid', 45], ['09-run-late', 150]]) {
  await sim(page, (secs) => { const g = __game; g.toMenu(); g.startRun(5); g.autopilot = true; for (let i = 0; i < 60 * secs; i++) g.update(1 / 60); }, secs);
  await shot(page, name, 800);
}
await sim(page, () => { __game.autopilot = false; __game.toMenu(); });
const before = await sim(page, () => ({ ...__game.save.data }));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.state === 'menu');
const after = await sim(page, () => ({ ...__game.save.data }));
check(after.best === before.best && after.coins === before.coins && after.xp === before.xp && JSON.stringify(after.missions) === JSON.stringify(before.missions), 'progress not persisted across reload');

// ================= mobile portrait: touch, menus, shop, characters, missions, settings, PWA
const m = await open(390, 844, true);
await shot(m, '10-menu-mobile', 1500);
// missions: completed ones can be claimed, pay out, and are replaced
await m.tap('nav [data-sheet="missions"]');
await shot(m, '11-missions');
const mi = await sim(m, () => ({ coins: __game.save.data.coins, list: __game.missions.list().map((x) => ({ id: x.def.id, done: x.done, reward: x.def.reward })) }));
const done = mi.list.find((x) => x.done);
check(!!done, 'expected at least one mission completed by the earlier runs');
if (done) {
  await m.tap(`[data-act="claim"][data-id="${done.id}"]`);
  const a = await sim(m, () => ({ coins: __game.save.data.coins, ids: __game.missions.list().map((x) => x.def.id) }));
  check(a.coins === mi.coins + done.reward, 'mission reward not paid');
  check(!a.ids.includes(done.id) && a.ids.length === 3, 'claimed mission not replaced');
}
await m.tap('#sheet-close');
// shop: upgrade costs coins and lengthens the power-up
await sim(m, () => { __game.save.data.coins = 6000; });
await m.tap('nav [data-sheet="shop"]');
await shot(m, '12-shop');
await m.tap('[data-act="upgrade"][data-id="magnet"]');
const up = await sim(m, () => ({ coins: __game.save.data.coins, lvl: __game.save.data.upgrades.magnet }));
check(up.lvl === 1 && up.coins === 5750, `upgrade purchase (${JSON.stringify(up)})`);
await m.tap('#sheet-close');
// runners: preview swaps the 3D model, buying unlocks and selects it, the run uses it
await m.tap('nav [data-sheet="runners"]');
await m.tap('[data-act="preview"][data-id="mira"]');
await m.waitForFunction(() => __game.player.characterId === 'mira', { timeout: 20000 });
await shot(m, '13-runners', 1200);
await m.tap('[data-act="choose"][data-id="mira"]');
const ch = await sim(m, () => ({ coins: __game.save.data.coins, char: __game.save.data.char, owned: __game.save.data.owned }));
check(ch.char === 'mira' && ch.owned.includes('mira') && ch.coins === 4250, `character purchase (${JSON.stringify(ch)})`);
await m.tap('[data-act="preview"][data-id="grom"]');
await m.waitForFunction(() => __game.player.characterId === 'grom', { timeout: 20000 });
await m.tap('#sheet-close');
await m.waitForFunction(() => __game.player.characterId === 'mira', { timeout: 20000 });
check((await sim(m, () => __game.save.data.char)) === 'mira', 'previewing a locked runner must not select it');
// settings
await m.tap('nav [data-sheet="settings"]');
await shot(m, '14-settings');
await m.tap('[data-act="quality"][data-id="low"]');
check(await sim(m, () => __game.renderer.shadowMap.enabled === false && __game.renderer.getPixelRatio() === 1 && __game.save.data.quality === 'low'), 'low graphics mode');
await m.tap('[data-act="quality"][data-id="high"]');
check(await sim(m, () => __game.renderer.shadowMap.enabled === true && __game.save.data.quality === 'high'), 'high graphics mode');
await m.tap('[data-act="haptics"]');
check((await sim(m, () => __game.save.data.haptics)) === false, 'haptics toggle');
await sim(m, () => { const i = document.querySelector('[data-set="music"]'); i.value = '0.2'; i.dispatchEvent(new Event('input', { bubbles: true })); });
check(await sim(m, () => __game.save.data.music === 0.2 && __game.audio.musicVol === 0.2), 'music volume setting');
await m.tap('#sheet-close');
// touch run
await m.tap('#btn-play');
check((await sim(m, () => __game.player.characterId)) === 'mira', 'selected runner is used in the run');
const swipe = async (dx, dy) => {
  await m.touchscreen.touchStart(195, 500);
  await m.touchscreen.touchMove(195 + dx / 2, 500 + dy / 2);
  await m.touchscreen.touchMove(195 + dx, 500 + dy);
  await m.touchscreen.touchEnd();
};
await swipe(80, 0);
check((await sim(m, () => __game.player.lane)) === 2, 'swipe right');
await swipe(-80, 0); await swipe(-80, 0);
check((await sim(m, () => __game.player.lane)) === 0, 'swipe left');
await swipe(0, -80);
check(await sim(m, () => __game.player.airborne), 'swipe up jump');
await step(m, 1);
await swipe(0, 80);
check(await sim(m, () => __game.player.sliding), 'swipe down slide');
check((await sim(m, () => document.documentElement.scrollTop + document.body.scrollTop)) === 0, 'page scrolled during swipes');
await sim(m, () => { const g = __game; g.toMenu(); g.startRun(9); g.autopilot = true; for (let i = 0; i < 60 * 30; i++) g.update(1 / 60); });
await shot(m, '15-run-mobile', 800);
await sim(m, () => { const g = __game; g.autopilot = false; for (let i = 0; i < 60 * 60 && g.state !== 'over'; i++) g.update(1 / 60); });
await step(m, 1.5);
await shot(m, '16-results-mobile', 1400);
await m.tap('#btn-home');
check((await sim(m, () => __game.state)) === 'menu', 'home from results');

// PWA: manifest, service worker, offline reload
const manifest = await sim(m, async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
check(manifest.display === 'fullscreen' && manifest.icons.length >= 2 && manifest.orientation === 'portrait', 'web app manifest');
for (const ic of manifest.icons) check((await sim(m, async (u) => (await fetch(u)).ok, ic.src)), 'icon missing: ' + ic.src);
await sim(m, () => navigator.serviceWorker.ready);
await m.waitForFunction(async () => (await caches.keys()).length > 0, { timeout: 30000 });
await m.reload({ waitUntil: 'load' });
await m.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30000 });
await m.setOfflineMode(true);
await new Promise((r) => server.httpServer.close(r)); // server really gone
await m.reload({ waitUntil: 'load' });
await m.waitForFunction(() => window.__game?.state === 'menu', { timeout: 60000 }).catch(() => fail('game did not boot offline'));
check((await sim(m, () => __game?.save.data.char)) === 'mira', 'saved data missing after offline restart');
await m.tap('#btn-play');
await sim(m, () => { const g = __game; g.autopilot = true; for (let i = 0; i < 60 * 20; i++) g.update(1 / 60); });
check(await sim(m, () => __game.state === 'running' && __game.player.d > 200), 'offline run');
console.log('offline: booted and played with the server stopped');
// reset progress
await sim(m, () => { __game.autopilot = false; __game.toMenu(); });
await m.tap('nav [data-sheet="settings"]');
await m.tap('[data-act="reset"]');
await shot(m, '17-reset-confirm');
await m.tap('#btn-reset-yes');
const rs = await sim(m, () => ({ ...__game.save.data }));
check(rs.coins === 0 && rs.best === 0 && rs.owned.length === 1 && rs.char === 'ash' && rs.music === 0.2, `reset progress (${JSON.stringify(rs)})`);

await browser.close();
console.log(errors.length ? `\n${errors.length} FAILURE(S)` : '\nALL E2E CHECKS PASSED');
process.exit(errors.length ? 1 : 0);
