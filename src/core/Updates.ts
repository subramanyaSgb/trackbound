export type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'offline' | 'updating';
export interface VersionInfo { version: string; commit: string; built: string }

/** What this running copy of the game was built from (injected by vite.config.ts). */
export const BUILD: VersionInfo = { version: __APP_VERSION__, commit: __APP_COMMIT__, built: __APP_BUILT__ };

/** "v0.2.0 (54ccd7f)" */
export const versionLabel = (v: VersionInfo = BUILD) => `v${v.version}${v.commit ? ` (${v.commit})` : ''}`;
export const builtLabel = (v: VersionInfo = BUILD) => {
  const d = new Date(v.built);
  return isNaN(+d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

/**
 * Keeps an installed copy honest about its version. The service worker caches
 * the whole game, so an installed app keeps running the build it cached until
 * a newer one is fetched AND activated. This class:
 *  - registers the service worker and asks it to look for a newer build on
 *    launch, whenever the app returns to the foreground, and on demand;
 *  - compares this build with version.json on the server (never cached);
 *  - holds a downloaded update until the player accepts it, then swaps and
 *    reloads, so a pursuit is never interrupted by an update.
 */
export class Updates {
  status: UpdateStatus = 'idle';
  /** The newest build the server reports (when it differs from this one). */
  latest: VersionInfo | null = null;
  onChange: () => void = () => {};
  private reg: ServiceWorkerRegistration | null = null;
  private reloading = false;

  get supported() { return 'serviceWorker' in navigator && import.meta.env.PROD; }

  private set(s: UpdateStatus) { if (this.status !== s) { this.status = s; this.onChange(); } }

  async start() {
    if (!this.supported) return;
    try {
      this.reg = await navigator.serviceWorker.register('./sw.js');
    } catch { return; }
    const reg = this.reg;
    const watch = (w: ServiceWorker | null) => w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) this.set('available'); });
    if (reg.waiting && navigator.serviceWorker.controller) this.set('available');
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (this.status === 'updating' && !this.reloading) { this.reloading = true; location.reload(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.check(true); });
    void this.check(true);
  }

  /** Look for a newer build. `quiet` keeps the status unchanged when nothing new is found. */
  async check(quiet = false) {
    if (this.status === 'updating') return;
    if (!quiet) this.set('checking');
    let remote: VersionInfo | null = null;
    try {
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) remote = await r.json() as VersionInfo;
    } catch { /* offline */ }
    if (!remote) { if (!quiet) this.set('offline'); return; }
    const newer = remote.built !== BUILD.built || remote.commit !== BUILD.commit;
    this.latest = newer ? remote : null;
    if (newer) {
      void this.reg?.update().catch(() => {}); // start downloading it
      this.set('available');
    } else if (this.reg?.waiting && navigator.serviceWorker.controller) this.set('available');
    else if (!quiet || this.status === 'checking') this.set('latest');
  }

  /** Switch to the downloaded build and reload. */
  async apply() {
    if (this.status === 'updating') return;
    this.set('updating');
    const reg = this.reg;
    if (!reg) { location.reload(); return; }
    // safety net: if the worker never takes over (for example no update was really pending), just reload
    setTimeout(() => { if (!this.reloading) { this.reloading = true; location.reload(); } }, 8000);
    const activate = (w: ServiceWorker) => w.postMessage('SKIP_WAITING');
    if (reg.waiting) activate(reg.waiting);
    else {
      // still downloading: activate it as soon as it is installed
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') activate(w); });
      else await reg.update().then(() => { if (reg.waiting) activate(reg.waiting); else if (reg.installing) { const n = reg.installing; n.addEventListener('statechange', () => { if (n.state === 'installed') activate(n); }); } }).catch(() => {});
    }
  }
}
