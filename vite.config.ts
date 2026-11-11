import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Build identity shown in the game and published as dist/version.json:
 * package.json version + short git commit + build time. On Vercel the commit
 * comes from VERCEL_GIT_COMMIT_SHA (there is no .git folder there).
 */
function buildInfo() {
  const version = (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }).version;
  let commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '').slice(0, 7);
  if (!commit) { try { commit = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = ''; } }
  return { version, commit, built: new Date().toISOString() };
}
const INFO = buildInfo();

/**
 * Writes dist/version.json and dist/sw.js (a precache list of every built file,
 * for offline play after the first load). A new service worker installs in the
 * background and then WAITS: the page activates it when the player accepts the
 * update, so a run in progress is never swapped out from under them.
 * version.json is never cached, so an installed app can always see what is live.
 */
function serviceWorker(): Plugin {
  return {
    name: 'trackbound-sw',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist');
      fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify(INFO));
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of fs.readdirSync(dir)) {
          const p = path.join(dir, f);
          if (fs.statSync(p).isDirectory()) walk(p);
          else if (f !== 'sw.js' && f !== 'version.json') files.push('./' + path.relative(dist, p).split(path.sep).join('/'));
        }
      };
      walk(dist);
      const hash = crypto.createHash('sha1');
      for (const f of files) hash.update(f).update(fs.readFileSync(path.join(dist, f)));
      const cache = hash.digest('hex').slice(0, 10);
      const sw = `// Trackbound ${INFO.version} ${INFO.commit} ${INFO.built}
const CACHE = 'trackbound-${cache}';
const FILES = ${JSON.stringify(['./', ...files.filter((f) => f !== './index.html')])};
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // always from the network
  e.respondWith(caches.match(e.request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('./'))));
});
`;
      fs.writeFileSync(path.join(dist, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(INFO.version), __APP_COMMIT__: JSON.stringify(INFO.commit), __APP_BUILT__: JSON.stringify(INFO.built) },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
