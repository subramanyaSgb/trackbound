import * as THREE from 'three';
import type { Assets } from '../core/Assets';

interface Coin { d: number; x: number; y: number; live: boolean; pulled: boolean }
const MAX = 320;

/** All coins are one InstancedMesh of the coin model; slots are recycled, nothing is allocated mid-run. */
export class Coins {
  private coins: Coin[] = Array.from({ length: MAX }, () => ({ d: 0, x: 0, y: 0, live: false, pulled: false }));
  private mesh: THREE.InstancedMesh;
  private cursor = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1.75, 1.75, 1.75);
  private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  /** Called for each coin collected, with its world position. */
  onCollect: (x: number, y: number, z: number) => void = () => {};

  constructor(scene: THREE.Scene, assets: Assets) {
    const src = assets.mesh('coin');
    const geo = src.geometry.clone();
    geo.computeBoundingBox();
    const c = geo.boundingBox!.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const mat = (src.material as THREE.MeshStandardMaterial).clone();
    mat.metalness = 0.55; mat.roughness = 0.25; mat.emissive = new THREE.Color(0xff9d00); mat.emissiveIntensity = 0.35;
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.reset();
  }

  reset() {
    for (let i = 0; i < MAX; i++) { this.coins[i].live = false; this.mesh.setMatrixAt(i, this.zero); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  add(d: number, x: number, y: number) {
    const c = this.coins[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    c.d = d; c.x = x; c.y = y; c.live = true; c.pulled = false;
  }

  /** Returns number collected this frame. With `magnet`, nearby coins in any lane fly to the player. */
  update(time: number, dt: number, px: number, py: number, pd: number, ph: number, magnet: boolean): number {
    let got = 0;
    for (let i = 0; i < MAX; i++) {
      const c = this.coins[i];
      if (!c.live) continue;
      if (c.d < pd - 6) { c.live = false; this.mesh.setMatrixAt(i, this.zero); continue; }
      if (magnet && c.d - pd < 9 && c.d - pd > -1.5) c.pulled = true;
      if (c.pulled) {
        const k = 1 - Math.exp(-dt * 14);
        c.x += (px - c.x) * k; c.y += (py + 0.9 - c.y) * k; c.d += (pd + 0.2 - c.d) * k;
      }
      if (Math.abs(c.d - pd) < 0.9 && Math.abs(c.x - px) < 0.85 && c.y > py - 0.5 && c.y < py + ph + 0.6) {
        c.live = false; got++;
        this.mesh.setMatrixAt(i, this.zero);
        this.onCollect(c.x, c.y, -c.d);
        continue;
      }
      this.q.setFromAxisAngle(this.up, time * 3.2 + c.d * 0.35);
      this.p.set(c.x, c.y + Math.sin(time * 3 + c.d) * 0.06, -c.d);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return got;
  }
}
