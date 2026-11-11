import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { CFG } from '../core/config';
import type { ThemeId } from '../data/missions';
import type { Part } from './StaticBatch';
import { Kit, THEMES, portal, type ThemeLook } from './themes';

const SLOTS = 6;
const L = CFG.chunkLen;

/**
 * Streams the environment. The route is a function from distance to theme;
 * six recycled 60 m slots show whichever chunk variant belongs at their
 * position. Variants are baked once per theme (a few merged meshes each) and
 * shared, so crossing into a new environment only swaps mesh references.
 * Themes are baked a little ahead of where they are needed, one per frame.
 */
export class World {
  readonly kit: Kit;
  private slots: THREE.Group[] = [];
  private cache = new Map<string, Part[]>();
  private portalParts: Part[] | null = null;
  private route: (d: number) => ThemeId = () => 'city';
  private next = 0;
  private col = { a: new THREE.Color(), b: new THREE.Color() };

  constructor(scene: THREE.Scene, assets: Assets) {
    this.kit = new Kit(assets);
    for (let i = 0; i < SLOTS; i++) { const g = new THREE.Group(); this.slots.push(g); scene.add(g); }
  }

  themeAtChunk(i: number): ThemeId { return this.route(Math.max(0, i) * L + L / 2); }
  themeAt(d: number): ThemeId { return this.themeAtChunk(Math.floor(Math.max(0, d) / L)); }

  private variant(theme: ThemeId, i: number) {
    const t = THEMES[theme];
    return t.variantFor ? t.variantFor(i) % t.variants : ((i * 7 + 3) % t.variants + t.variants) % t.variants;
  }

  private parts(theme: ThemeId, variant: number): Part[] {
    const key = theme + variant;
    let p = this.cache.get(key);
    if (!p) { p = THEMES[theme].build(this.kit, variant); this.cache.set(key, p); }
    return p;
  }

  /** Bake every variant of these themes now (called behind the loading/intro screen). */
  prewarm(themes: ThemeId[]) {
    for (const t of themes) for (let v = 0; v < THEMES[t].variants; v++) this.parts(t, v);
  }

  /** Start a route at distance d. */
  reset(route: (d: number) => ThemeId, d = 0) {
    this.route = route;
    this.next = Math.floor(d / L) - 1;
    this.prewarm([this.themeAt(d), this.themeAt(d + 200)]);
    for (const s of this.slots) this.place(s);
  }

  private fill(g: THREE.Group, parts: Part[], z = 0) {
    for (const p of parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.castShadow = p.cast;
      m.receiveShadow = p.receive;
      m.frustumCulled = false; // the curved-world shader moves vertices outside their bounds
      m.position.z = z;
      g.add(m);
    }
  }

  private place(g: THREE.Group) {
    const i = this.next++;
    g.clear();
    g.userData.index = i;
    g.position.z = -i * L;
    const theme = this.themeAtChunk(i);
    this.fill(g, this.parts(theme, this.variant(theme, i)));
    // close off tunnel mouths where an enclosed theme meets an open one
    const prev = this.themeAtChunk(i - 1);
    if (i > 0 && THEMES[theme].enclosed !== THEMES[prev].enclosed) this.fill(g, (this.portalParts ??= portal(this.kit)));
  }

  update(playerD: number, time: number) {
    for (const s of this.slots) if ((s.userData.index + 1) * L < playerD - 25) this.place(s);
    // bake the environment that is coming up, one variant per frame, well before it is shown
    const ahead = this.themeAtChunk(this.next + 3);
    const t = THEMES[ahead];
    for (let v = 0; v < t.variants; v++) if (!this.cache.has(ahead + v)) { this.parts(ahead, v); break; }
    // flashing lights
    const beat = (time * 2.2) % 1;
    this.kit.flashRed.emissiveIntensity = beat < 0.5 ? 5 : 0.2;
    this.kit.flashBlue.emissiveIntensity = beat < 0.5 ? 0.2 : 5;
    this.kit.beacon.emissiveIntensity = 1.2 + Math.max(0, Math.sin(time * 5)) * 3;
  }

  /** Atmosphere at distance d, blended across the 60 m before a change of environment. */
  look(d: number, out: ThemeLook): ThemeLook {
    const i = Math.floor(Math.max(0, d) / L);
    const a = THEMES[this.themeAtChunk(i)].look, b = THEMES[this.themeAtChunk(i + 1)].look;
    if (a === b) return Object.assign(out, a);
    const f = THREE.MathUtils.smoothstep((d - i * L) / L, 0.25, 1);
    const mix = (x: number, y: number) => x + (y - x) * f;
    const hex = (x: number, y: number) => this.col.a.setHex(x).lerp(this.col.b.setHex(y), f).getHex();
    out.fog = hex(a.fog, b.fog); out.fogNear = mix(a.fogNear, b.fogNear); out.fogFar = mix(a.fogFar, b.fogFar);
    out.skyTop = hex(a.skyTop, b.skyTop); out.skyMid = hex(a.skyMid, b.skyMid); out.skyHor = hex(a.skyHor, b.skyHor);
    out.sun = hex(a.sun, b.sun); out.sunI = mix(a.sunI, b.sunI);
    out.hemiSky = hex(a.hemiSky, b.hemiSky); out.hemiGround = hex(a.hemiGround, b.hemiGround); out.hemiI = mix(a.hemiI, b.hemiI);
    out.env = mix(a.env, b.env); out.clouds = f < 0.5 ? a.clouds : b.clouds;
    return out;
  }
}
