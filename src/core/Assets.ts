import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Accessory, BodyId, LookDef, RecolorRule } from '../data/characters';

const BODIES: BodyId[] = ['knight', 'rogue', 'hooded', 'mage', 'barbarian'];
const BUNDLES = ['city', 'nature', 'vehicles', 'props'];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const inRange = (v: number, r?: [number, number]) => !r || (v >= r[0] && v <= r[1]);
const inHue = (h: number, r?: [number, number]) => !r || (r[0] <= r[1] ? h >= r[0] && h <= r[1] : h >= r[0] || h <= r[1]);

/** Loads and caches GLB assets. Missing models throw: nothing is silently replaced by a primitive. */
export class Assets {
  private loader = new GLTFLoader();
  private props = new Map<string, THREE.Object3D>();
  private bodies = new Map<BodyId, GLTF>();
  private skins = new Map<string, THREE.MeshStandardMaterial>();
  private accMats = new Map<string, THREE.MeshStandardMaterial>();
  clips: THREE.AnimationClip[] = [];

  async load(onProgress: (f: number) => void) {
    let done = 0;
    const total = BUNDLES.length + BODIES.length;
    const tick = () => onProgress(++done / total);
    await Promise.all([
      ...BUNDLES.map(async (f) => {
        const g = await this.loader.loadAsync(`./models/${f}.glb`);
        g.scene.updateMatrixWorld(true);
        for (const c of g.scene.children) this.props.set(c.name, c);
        tick();
      }),
      ...BODIES.map(async (b) => { this.bodies.set(b, await this.loader.loadAsync(`./models/char-${b}.glb`)); tick(); }),
    ]);
    // one animation set drives every body (identical rig). Bone lengths belong to
    // each model, so only the hips keep their translation track.
    this.clips = this.bodies.get('knight')!.animations.map((clip) => {
      const tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || /^(hips|root)\.position$/.test(t.name));
      return new THREE.AnimationClip(clip.name, clip.duration, tracks);
    });
    if (!this.clips.length) throw new Error('Animation clips are missing from char-knight.glb');
  }

  prop(name: string): THREE.Object3D {
    const p = this.props.get(name);
    if (!p) throw new Error(`Asset "${name}" is missing from the model bundles`);
    return p;
  }

  /** First mesh inside a prop (for instancing). */
  mesh(name: string): THREE.Mesh {
    let m: THREE.Mesh | null = null;
    this.prop(name).traverse((o) => { if (!m && (o as THREE.Mesh).isMesh) m = o as THREE.Mesh; });
    if (!m) throw new Error(`Asset "${name}" has no mesh`);
    return m;
  }

  /** A fresh, independently animatable copy of a body model. */
  body(id: BodyId): THREE.Object3D {
    const g = this.bodies.get(id);
    if (!g) throw new Error(`Character body "${id}" is not loaded`);
    return cloneSkinned(g.scene);
  }

  /** The body's material with its colour atlas repainted for this look (cached). */
  skin(look: LookDef): THREE.MeshStandardMaterial {
    const key = look.body + JSON.stringify(look.recolor);
    let mat = this.skins.get(key);
    if (mat) return mat;
    let base: THREE.MeshStandardMaterial | null = null;
    this.bodies.get(look.body)!.scene.traverse((o) => { const m = o as THREE.Mesh; if (!base && m.isMesh && /Body/.test(m.name)) base = m.material as THREE.MeshStandardMaterial; });
    if (!base) throw new Error(`Body "${look.body}" has no material`);
    mat = (base as THREE.MeshStandardMaterial).clone();
    mat.roughness = 0.72; mat.metalness = 0; mat.envMapIntensity = 0.6;
    if (look.recolor.length && mat.map) mat.map = this.repaint(mat.map, look.recolor);
    this.skins.set(key, mat);
    return mat;
  }

  private repaint(src: THREE.Texture, rules: RecolorRule[]): THREE.Texture {
    const img = src.image as CanvasImageSource & { width: number; height: number };
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      const [h, s, l] = rgbToHsl(p[i], p[i + 1], p[i + 2]);
      for (const r of rules) {
        if (!inHue(h, r.hue) || !inRange(s, r.sat) || !inRange(l, r.light)) continue;
        const nl = Math.min(1, Math.max(0, l * (r.to.lMul ?? 1) + (r.to.lAdd ?? 0)));
        const [R, G, B] = hslToRgb(r.to.h ?? h, r.to.s ?? s, nl);
        p[i] = R; p[i + 1] = G; p[i + 2] = B;
        break;
      }
    }
    g.putImageData(data, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = src.colorSpace;
    t.flipY = src.flipY;
    t.wrapS = src.wrapS; t.wrapT = src.wrapT;
    t.magFilter = src.magFilter; t.minFilter = src.minFilter;
    t.generateMipmaps = src.generateMipmaps;
    return t;
  }

  private accMat(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    const key = color + JSON.stringify(extra);
    let m = this.accMats.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }); this.accMats.set(key, m); }
    return m;
  }

  /** Small worn items fitted to a head of radius r (model units). The model faces +Z. */
  accessory(kind: Accessory, color: string, r: number): THREE.Object3D {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    const dark = this.accMat('#141a33');
    if (kind === 'cap') {
      const cloth = this.accMat(color);
      add(new THREE.CylinderGeometry(r * 0.98, r * 1.0, r * 0.3, 24), dark, 0, r * 0.12, 0); // band
      add(new THREE.CylinderGeometry(r * 1.16, r * 0.98, r * 0.34, 24), cloth, 0, r * 0.42, 0); // flared crown
      add(new THREE.CylinderGeometry(r * 1.1, r * 1.16, r * 0.08, 24), cloth, 0, r * 0.62, 0);
      const peak = add(new THREE.CylinderGeometry(r * 1.02, r * 1.02, r * 0.07, 20, 1, false, -Math.PI / 2, Math.PI), this.accMat('#0b0f1f', { roughness: 0.25 }), 0, r * 0.0, r * 0.42);
      peak.rotation.x = 0.16;
      add(new THREE.OctahedronGeometry(r * 0.17), this.accMat('#ffc928', { metalness: 0.8, roughness: 0.25 }), 0, r * 0.36, r * 1.07).scale.set(1, 1.2, 0.4);
    } else if (kind === 'beanie') {
      add(new THREE.SphereGeometry(r * 1.06, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.accMat('#22252e'), 0, -r * 0.05, 0);
      add(new THREE.CylinderGeometry(r * 1.09, r * 1.09, r * 0.22, 20), this.accMat('#353a47'), 0, 0, 0);
    } else if (kind === 'mask') {
      add(new THREE.CylinderGeometry(r * 1.07, r * 1.0, r * 0.62, 24, 1, true), this.accMat('#16181f', { side: THREE.DoubleSide }), 0, 0, 0);
      const knot = add(new THREE.ConeGeometry(r * 0.2, r * 0.5, 8), this.accMat('#16181f'), 0, 0, -r * 1.2);
      knot.rotation.x = -Math.PI / 2;
    } else if (kind === 'visor') {
      add(new THREE.CylinderGeometry(r * 1.06, r * 1.06, r * 0.3, 24, 1, true, -Math.PI * 0.42, Math.PI * 0.84), this.accMat(color, { emissive: new THREE.Color(color), emissiveIntensity: 1.6, roughness: 0.2, side: THREE.DoubleSide }), 0, 0, 0);
      add(new THREE.CylinderGeometry(r * 1.04, r * 1.04, r * 0.12, 24, 1, true), dark, 0, 0, 0);
    } else if (kind === 'headband') {
      add(new THREE.CylinderGeometry(r * 1.05, r * 1.05, r * 0.2, 24, 1, true), this.accMat(color, { side: THREE.DoubleSide }), 0, 0, 0);
      for (const s of [-1, 1]) { const tail = add(new THREE.BoxGeometry(r * 0.16, r * 0.7, r * 0.04), this.accMat(color), s * r * 0.14, -r * 0.3, -r * 1.1); tail.rotation.set(0.5, 0, s * 0.25); }
    } else {
      // loot sack
      const cloth = this.accMat('#b89468', { roughness: 0.95 });
      const bag = add(new THREE.SphereGeometry(r * 0.62, 14, 10), cloth, 0, 0, 0);
      bag.scale.set(1, 1.15, 0.9);
      add(new THREE.CylinderGeometry(r * 0.2, r * 0.3, r * 0.3, 10), cloth, 0, r * 0.72, 0);
      add(new THREE.TorusGeometry(r * 0.2, r * 0.05, 6, 12), this.accMat('#5a3d22'), 0, r * 0.62, 0).rotation.x = Math.PI / 2;
      const strap = add(new THREE.BoxGeometry(r * 0.12, r * 0.9, r * 0.06), this.accMat('#5a3d22'), -r * 0.3, r * 0.5, r * 0.5);
      strap.rotation.x = -0.9;
    }
    return g;
  }
}
