// Visual inspection harness: serves the game with Vite's dev server, opens it in a
// real (GPU) browser and runs a scenario that steps the simulation and saves screenshots.
//   node tools/shots.mjs <outDir> <scenario.mjs> [width] [height]
// The scenario's default export receives (page, { shot, step, wait, sim }).
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [out = 'shots', scenarioPath, w = '1280', h = '720'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'];
const exe = CANDIDATES.find((p) => p && fs.existsSync(p));
if (!exe) throw new Error('No browser found; set CHROME=/path/to/chrome');

const server = await createServer({ server: { port: 4318, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const mobile = +w < +h;
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('console.error:', m.text()); } });
page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror:', e.message); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const helpers = {
  wait,
  shot: async (name, settle = 350) => { await wait(settle); await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('shot', name); },
  /** Advance the simulation deterministically by `secs` of game time. */
  step: (secs) => page.evaluate((s) => { const g = window.__game; for (let i = 0; i < Math.round(60 * s); i++) g.update(1 / 60); g.renderer.render(g.scene, g.camera.cam); }, secs),
  /** Stop the real-time loop so only step() advances the game (exact, repeatable frames). */
  freeze: () => page.evaluate(() => window.__game.renderer.setAnimationLoop(null)),
  /** Render from a camera placed relative to the player: offset and look-at as [x, y, z]. */
  view: (off, look = [0, 1, 0]) => page.evaluate((off, look) => {
    const g = window.__game, p = g.player.root.position, c = g.camera.cam;
    const keep = [c.position.clone(), c.quaternion.clone()];
    c.position.set(p.x + off[0], off[1], p.z + off[2]);
    c.lookAt(p.x + look[0], look[1], p.z + look[2]);
    g.renderer.render(g.scene, c);
    c.position.copy(keep[0]); c.quaternion.copy(keep[1]);
  }, off, look),
  sim: (fn, arg) => page.evaluate(fn, arg),
};
let code = 0;
try {
  const mod = await import(pathToFileURL(path.resolve(scenarioPath)).href);
  await page.goto('http://localhost:4318/' + (mod.url ?? ''), { waitUntil: 'load' });
  await page.waitForFunction(mod.ready ?? (() => window.__game?.state === 'menu'), { timeout: 120000 });
  await mod.default(page, helpers);
} catch (e) { console.log('SCENARIO ERROR', e); code = 1; }
if (errors.length) { console.log(`${errors.length} page error(s)`); code = 1; }
await browser.close();
await server.close();
process.exit(code);
