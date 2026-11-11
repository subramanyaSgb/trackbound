import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import type { PowerKind } from '../systems/PowerUps';
import { hazardTexture, pickupTexture } from './textures';
import { CAR_LEN, TrainFactory } from './TrainFactory';

export { CAR_LEN };
export type ObstacleKind = 'jump' | 'slide' | 'block' | 'train';
export const POWER_COLORS: Record<PowerKind, string> = { magnet: '#ff4d6d', shield: '#2fb4ff', double: '#ffb300' };

/** Collision extents (metres): depth along the track, vertical band, half width. */
export const BOUNDS: Record<ObstacleKind, { depth: number; y0: number; y1: number; halfW: number }> = {
  jump: { depth: 0.4, y0: 0, y1: 0.85, halfW: 0.95 },
  slide: { depth: 0.4, y0: 1.1, y1: 2.6, halfW: 0.95 },
  block: { depth: CAR_LEN, y0: 0, y1: 3.1, halfW: 0.95 },
  train: { depth: CAR_LEN * 2, y0: 0, y1: 3.1, halfW: 0.95 },
};

/** Builds obstacle and pickup models from shared geometry/materials and pools them per kind. */
export class ObstacleFactory {
  private pools: Record<string, THREE.Object3D[]> = {};
  private trains = new TrainFactory();
  private mSteel = new THREE.MeshStandardMaterial({ color: 0x343b48, metalness: 0.7, roughness: 0.4 });
  private mRubber = new THREE.MeshStandardMaterial({ color: 0x1d1f25, roughness: 0.9 });
  private mHazard = new THREE.MeshStandardMaterial({ map: hazardTexture('#ffcf33', '#1b1b1f'), roughness: 0.55 });
  private mWarn = new THREE.MeshStandardMaterial({ map: hazardTexture('#ff3b3b', '#ffffff'), roughness: 0.5 });
  private mBeacon = new THREE.MeshStandardMaterial({ color: 0xffa51f, emissive: 0xff7a00, emissiveIntensity: 2.4 });
  private gLeg = new THREE.BoxGeometry(0.07, 1.0, 0.07);
  private gBoard = new THREE.BoxGeometry(1.9, 0.26, 0.05);
  private gFoot = new THREE.BoxGeometry(0.12, 0.06, 0.7);
  private gBeacon = new THREE.SphereGeometry(0.09, 10, 8);
  private gPost = new THREE.CylinderGeometry(0.06, 0.06, 2.75, 10);
  private gBase = new THREE.CylinderGeometry(0.2, 0.24, 0.1, 12);
  private gBeam = new THREE.BoxGeometry(2.1, 0.14, 0.14);
  private gSign = new THREE.BoxGeometry(1.9, 0.95, 0.08);
  private gFlap = new THREE.BoxGeometry(1.9, 0.14, 0.03);
  private gDisc = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 28).rotateX(Math.PI / 2);
  private gRing = new THREE.TorusGeometry(0.5, 0.045, 10, 36);
  private pickupMats = {} as Record<PowerKind, [THREE.Material, THREE.Material]>;

  constructor(private assets: Assets) {
    for (const k of Object.keys(POWER_COLORS) as PowerKind[]) {
      const tex = pickupTexture(k, POWER_COLORS[k]);
      this.pickupMats[k] = [
        new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.3 }),
        new THREE.MeshStandardMaterial({ color: POWER_COLORS[k], emissive: POWER_COLORS[k], emissiveIntensity: 1.4, roughness: 0.3 }),
      ];
    }
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  private build(kind: string): THREE.Object3D {
    const g = new THREE.Group();
    if (kind === 'jump') {
      if (Math.random() < 0.5) {
        // A-frame works barrier
        for (const x of [-0.82, 0.82]) {
          for (const s of [-1, 1]) { const leg = this.mesh(this.gLeg, this.mSteel, x, 0.48, s * 0.17, g); leg.rotation.x = -s * 0.33; }
          this.mesh(this.gFoot, this.mRubber, x, 0.03, 0, g);
          this.mesh(this.gBeacon, this.mBeacon, x, 1.0, 0, g);
        }
        this.mesh(this.gBoard, this.mHazard, 0, 0.72, 0.09, g).rotation.x = -0.33;
        this.mesh(this.gBoard, this.mHazard, 0, 0.72, -0.09, g).rotation.x = 0.33;
        this.mesh(this.gBoard, this.mHazard, 0, 0.36, 0.2, g).rotation.x = -0.33;
      } else {
        // freight crates left on the line
        const a = this.assets.prop('box_A').clone();
        const b = this.assets.prop('box_B').clone();
        const c = this.assets.prop('box_A').clone();
        a.position.set(-0.47, 0, 0); a.scale.setScalar(4.3); a.rotation.y = 0.12;
        b.position.set(0.47, 0, 0.03); b.scale.setScalar(4.3); b.rotation.y = -0.2;
        c.position.set(0.02, 0, -0.5); c.scale.set(3.4, 2.6, 3.4); c.rotation.y = 0.5;
        g.add(a, b, c);
        g.traverse((o) => { o.castShadow = true; });
      }
    } else if (kind === 'slide') {
      for (const x of [-1.0, 1.0]) {
        this.mesh(this.gPost, this.mSteel, x, 1.375, 0, g);
        this.mesh(this.gBase, this.mRubber, x, 0.05, 0, g);
        this.mesh(this.gBeacon, this.mBeacon, x, 2.82, 0, g);
      }
      this.mesh(this.gBeam, this.mSteel, 0, 2.66, 0, g);
      this.mesh(this.gSign, this.mWarn, 0, 2.1, 0, g);
      this.mesh(this.gFlap, this.mRubber, 0, 1.56, 0, g);
      this.mesh(this.gBoard, this.mHazard, 0, 1.36, 0, g).scale.set(1, 0.9, 1.4);
    } else if (kind === 'block') {
      g.add(this.trains.car(Math.floor(Math.random() * this.trains.liveries)));
    } else if (kind === 'train') {
      const l = Math.floor(Math.random() * this.trains.liveries);
      g.add(this.trains.car(l), this.trains.car(l, -CAR_LEN));
    } else {
      const [face, rim] = this.pickupMats[kind as PowerKind];
      const spin = new THREE.Group();
      this.mesh(this.gDisc, [rim, face, face], 0, 0, 0, spin);
      this.mesh(this.gRing, rim, 0, 0, 0, spin);
      g.add(spin);
      g.userData.spin = spin;
    }
    g.userData.kind = kind;
    return g;
  }

  get(kind: string) {
    const o = (this.pools[kind] ??= []).pop() ?? this.build(kind);
    o.visible = true;
    return o;
  }

  release(o: THREE.Object3D) {
    o.visible = false;
    (this.pools[o.userData.kind] ??= []).push(o);
  }
}
