import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const CHARACTERS = [
  { id: 'ash', name: 'Ash', blurb: 'Night-shift courier. Never misses a train.', cost: 0 },
  { id: 'vex', name: 'Vex', blurb: 'Rooftop racer with a grin.', cost: 600 },
  { id: 'mira', name: 'Mira', blurb: 'Street illusionist in a very tall hat.', cost: 1500 },
  { id: 'bolt', name: 'Sir Bolt', blurb: 'Cosplay champion. The armour is foam.', cost: 3000 },
  { id: 'grom', name: 'Grom', blurb: 'Gentle giant of the freight yard.', cost: 5000 },
] as const;
export type CharId = (typeof CHARACTERS)[number]['id'];

/** Loads and caches GLB assets. Missing models throw: nothing is silently replaced by a primitive. */
export class Assets {
  private loader = new GLTFLoader();
  private props = new Map<string, THREE.Object3D>();
  private chars = new Map<string, Promise<GLTF>>();

  async load(onProgress: (f: number) => void) {
    const files = ['city', 'nature'];
    let done = 0;
    await Promise.all(files.map(async (f) => {
      const g = await this.loader.loadAsync(`./models/${f}.glb`);
      g.scene.updateMatrixWorld(true);
      for (const c of g.scene.children) this.props.set(c.name, c);
      onProgress(++done / (files.length + 1));
    }));
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

  character(id: string): Promise<GLTF> {
    let p = this.chars.get(id);
    if (!p) { p = this.loader.loadAsync(`./models/runner-${id}.glb`); this.chars.set(id, p); }
    return p;
  }
}
