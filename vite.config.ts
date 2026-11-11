import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Writes dist/sw.js with a precache list of every built file (offline play after first load). */
function serviceWorker(): Plugin {
  return {
    name: 'trackbound-sw',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist');
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of fs.readdirSync(dir)) {
          const p = path.join(dir, f);
          if (fs.statSync(p).isDirectory()) walk(p);
          else if (f !== 'sw.js') files.push('./' + path.relative(dist, p).split(path.sep).join('/'));
        }
      };
      walk(dist);
      const hash = crypto.createHash('sha1');
      for (const f of files) hash.update(f).update(fs.readFileSync(path.join(dist, f)));
      const version = hash.digest('hex').slice(0, 10);
      const sw = `const CACHE = 'trackbound-${version}';
const FILES = ${JSON.stringify(['./', ...files.filter((f) => f !== './index.html')])};
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('./'))));
});
`;
      fs.writeFileSync(path.join(dist, 'sw.js'), sw);
    },
  };
}

export default defineConfig({ base: './', plugins: [serviceWorker()], build: { target: 'es2020', chunkSizeWarningLimit: 1200 } });
