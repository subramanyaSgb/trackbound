import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import type { LookDef } from '../data/characters';
import { Rig } from '../player/Rig';
import type { PowerKind } from '../systems/PowerUps';
import { hazardTexture, pickupTexture, tapeTexture } from './textures';
import { CAR_LEN, TrainFactory } from './TrainFactory';

export { CAR_LEN };
export type ObstacleKind = 'jump' | 'slide' | 'block' | 'train';
export const POWER_COLORS: Record<PowerKind, string> = { magnet: '#ff4d6d', shield: '#2fb4ff', double: '#ffb300' };

/** Collision box and behaviour of one obstacle model. The model occupies local z in [-depth, 0]. */
export interface Variant {
  key: string;
  kind: ObstacleKind;
  depth: number;
  y0: number;
  y1: number;
  halfW: number;
  /** 0 = static, >0 = drives the same way at this fraction of the player's speed, <0 = oncoming at |move| m/s. */
  move: number;
  /** Barriers and gates that abilities can smash or phase through. */
  breakable: boolean;
}

const CIVILIANS: LookDef[] = [
  { body: 'rogue', hide: 'Cape', height: 1.62, color: '#888', accessories: [], recolor: [{ hue: [120, 185], sat: [0.2, 1], to: { h: 205, s: 0.55, lMul: 1 } }] },
  { body: 'mage', hide: 'Cape|Hat', height: 1.66, color: '#888', accessories: [], recolor: [{ hue: [225, 300], sat: [0.12, 1], to: { h: 8, s: 0.6, lMul: 1 } }] },
  { body: 'barbarian', hide: 'Cape|Hat', height: 1.78, color: '#888', accessories: [], recolor: [{ hue: [190, 235], sat: [0.15, 1], to: { h: 95, s: 0.35, lMul: 0.9 } }] },
  { body: 'rogue', hide: 'Cape', height: 1.6, color: '#888', accessories: [], recolor: [{ hue: [120, 185], sat: [0.2, 1], to: { h: 320, s: 0.5, lMul: 1.05 } }] },
];

/** Builds obstacle, vehicle and pickup models from shared geometry/materials and pools them per variant. */
export class ObstacleFactory {
  private pools: Record<string, THREE.Object3D[]> = {};
  private variants = new Map<string, Variant>();
  private trains = new TrainFactory();
  private mSteel = new THREE.MeshStandardMaterial({ color: 0x343b48, metalness: 0.7, roughness: 0.4 });
  private mRubber = new THREE.MeshStandardMaterial({ color: 0x1d1f25, roughness: 0.9 });
  private mHazard = new THREE.MeshStandardMaterial({ map: hazardTexture('#ffcf33', '#1b1b1f'), roughness: 0.55 });
  private mWarn = new THREE.MeshStandardMaterial({ map: hazardTexture('#ff3b3b', '#ffffff'), roughness: 0.5 });
  private mPolice = new THREE.MeshStandardMaterial({ map: tapeTexture('POLICE', '#1f4fd6', '#ffffff'), roughness: 0.5 });
  private mBeacon = new THREE.MeshStandardMaterial({ color: 0xffa51f, emissive: 0xff7a00, emissiveIntensity: 2.4 });
  private mCone = new THREE.MeshStandardMaterial({ color: 0xff6a1f, roughness: 0.6 });
  private mWhite = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.6 });
  private mConcrete = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.95 });
  private mWood = new THREE.MeshStandardMaterial({ color: 0x9a7444, roughness: 0.9 });
  private mDuct = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.75, roughness: 0.35 });
  private mPipe = new THREE.MeshStandardMaterial({ color: 0xb8482e, metalness: 0.4, roughness: 0.5 });
  private mHead = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 4 });
  private mTail = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2010, emissiveIntensity: 2.5 });
  readonly flashRed = new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2030, emissiveIntensity: 3 });
  readonly flashBlue = new THREE.MeshStandardMaterial({ color: 0x111855, emissive: 0x2f6bff, emissiveIntensity: 3 });
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
  private civ = 0;

  constructor(private assets: Assets) {
    for (const k of Object.keys(POWER_COLORS) as PowerKind[]) {
      const tex = pickupTexture(k, POWER_COLORS[k]);
      this.pickupMats[k] = [
        new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.3 }),
        new THREE.MeshStandardMaterial({ color: POWER_COLORS[k], emissive: POWER_COLORS[k], emissiveIntensity: 1.4, roughness: 0.3 }),
      ];
    }
    const low = (key: string): Variant => ({ key, kind: 'jump', depth: 0.5, y0: 0, y1: 0.85, halfW: 0.95, move: 0, breakable: true });
    const high = (key: string): Variant => ({ key, kind: 'slide', depth: 0.5, y0: 1.1, y1: 2.8, halfW: 0.95, move: 0, breakable: true });
    const solid = (key: string, depth: number, y1: number, move = 0, kind: ObstacleKind = 'block', halfW = 0.95): Variant => ({ key, kind, depth, y0: 0, y1, halfW, move, breakable: false });
    const list: Variant[] = [
      ...['barrier', 'crates', 'police', 'cones', 'barrels', 'pallet', 'pipe', 'jersey', 'tyres'].map(low),
      ...['gate', 'scaffold', 'duct', 'boom', 'hang'].map(high),
      solid('car', 4.3, 2.2), solid('van', 3.6, 2.5), solid('truck', 3.8, 2.4), solid('police_car', 4.3, 2.2),
      solid('traincar', CAR_LEN, 3.1), solid('container', 4.2, 2.3), solid('dumpster', 2.2, 2.2),
      solid('ped', 0.6, 1.9, 0.1, 'block', 0.42),
      solid('car>', 4.3, 2.2, 0.45), solid('van>', 3.6, 2.5, 0.4), solid('truck>', 3.8, 2.4, 0.36),
      solid('train', CAR_LEN * 2, 3.1, -10, 'train'), solid('car<', 4.3, 2.2, -9, 'train'), solid('van<', 3.6, 2.5, -8, 'train'), solid('truck<', 3.8, 2.4, -7, 'train'),
    ];
    for (const v of list) this.variants.set(v.key, v);
  }

  variant(key: string): Variant {
    const v = this.variants.get(key);
    if (!v) throw new Error(`Unknown obstacle variant "${key}"`);
    return v;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  private box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }

  /** Clone of a prop scaled so its width is `width`, resting on the ground, centred in x; returns its size. */
  private fitted(name: string, width: number, parent: THREE.Object3D, rotY = 0, zNear = 0) {
    const o = this.assets.prop(name).clone();
    o.rotation.y = rotY;
    o.position.set(0, 0, 0);
    o.scale.setScalar(1);
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o);
    const s = width / (b.max.x - b.min.x);
    o.scale.setScalar(s);
    const size = b.getSize(new THREE.Vector3()).multiplyScalar(s);
    o.position.set(-((b.max.x + b.min.x) / 2) * s, -b.min.y * s, zNear - b.max.z * s);
    o.traverse((c) => { c.castShadow = true; });
    parent.add(o);
    return { obj: o, size };
  }

  private vehicle(g: THREE.Group, name: string, width: number, forward: boolean, lights: boolean) {
    const { obj, size } = this.fitted(name, width, g, forward ? Math.PI : 0);
    const wheels: THREE.Object3D[] = [];
    obj.traverse((c) => { if (/wheel/i.test(c.name)) wheels.push(c); });
    g.userData.wheels = wheels;
    g.userData.wheelR = Math.max(0.2, size.y * 0.19);
    if (lights) {
      // forward-driving: tail lights face the player; oncoming: headlights face the player
      for (const sx of [-1, 1]) this.box(forward ? this.mTail : this.mHead, 0.3, 0.14, 0.06, sx * width * 0.33, size.y * 0.42, 0.02, g);
    }
    return size;
  }

  private build(key: string): THREE.Object3D {
    const g = new THREE.Group();
    const c = new THREE.Group(); // centred sub-group for the thin barriers (depth 0.5)
    c.position.z = -0.25;
    if (key === 'barrier') {
      for (const x of [-0.82, 0.82]) {
        for (const s of [-1, 1]) { const leg = this.mesh(this.gLeg, this.mSteel, x, 0.48, s * 0.17, c); leg.rotation.x = -s * 0.33; }
        this.mesh(this.gFoot, this.mRubber, x, 0.03, 0, c);
        this.mesh(this.gBeacon, this.mBeacon, x, 1.0, 0, c);
      }
      this.mesh(this.gBoard, this.mHazard, 0, 0.72, 0.09, c).rotation.x = -0.33;
      this.mesh(this.gBoard, this.mHazard, 0, 0.72, -0.09, c).rotation.x = 0.33;
      this.mesh(this.gBoard, this.mHazard, 0, 0.36, 0.2, c).rotation.x = -0.33;
    } else if (key === 'police') {
      for (const x of [-0.82, 0.82]) {
        for (const s of [-1, 1]) { const leg = this.mesh(this.gLeg, this.mWhite, x, 0.48, s * 0.17, c); leg.rotation.x = -s * 0.33; }
        this.mesh(this.gBeacon, x < 0 ? this.flashRed : this.flashBlue, x, 1.0, 0, c).scale.setScalar(1.3);
      }
      this.box(this.mPolice, 1.9, 0.3, 0.05, 0, 0.7, 0.09, c).rotation.x = -0.33;
      this.box(this.mPolice, 1.9, 0.3, 0.05, 0, 0.7, -0.09, c).rotation.x = 0.33;
      this.box(this.mWhite, 1.9, 0.12, 0.05, 0, 0.34, 0.2, c).rotation.x = -0.33;
    } else if (key === 'crates') {
      const a = this.assets.prop('box_A').clone(), b = this.assets.prop('box_B').clone(), d = this.assets.prop('box_A').clone();
      a.position.set(-0.47, 0, 0.2); a.scale.setScalar(4.3); a.rotation.y = 0.12;
      b.position.set(0.47, 0, 0.23); b.scale.setScalar(4.3); b.rotation.y = -0.2;
      d.position.set(0.02, 0, -0.3); d.scale.set(3.4, 2.6, 3.4); d.rotation.y = 0.5;
      c.add(a, b, d);
    } else if (key === 'cones') {
      for (const x of [-0.75, 0, 0.75]) {
        this.mesh(new THREE.ConeGeometry(0.2, 0.7, 14), this.mCone, x, 0.39, 0, c);
        this.mesh(new THREE.CylinderGeometry(0.115, 0.15, 0.14, 14), this.mWhite, x, 0.36, 0, c);
        this.box(this.mCone, 0.46, 0.05, 0.46, x, 0.025, 0, c);
      }
      this.box(this.mHazard, 1.9, 0.14, 0.05, 0, 0.76, 0, c);
      this.box(this.mHazard, 1.9, 0.14, 0.05, 0, 0.5, 0, c);
    } else if (key === 'barrels') {
      const names = ['Barrel_A', 'Barrel_B', 'Barrel_C'];
      [-0.62, 0, 0.62].forEach((x, i) => { const { obj } = this.fitted(names[(i + Math.floor(Math.random() * 3)) % 3], 0.6, c, Math.random() * 6, 0.3); obj.position.x += x; obj.scale.y *= 1.3; });
    } else if (key === 'pallet') {
      const { obj } = this.fitted('Pallet_Small_Decorated_A', 1.9, c, 0, 0.5);
      obj.scale.y *= 0.58; obj.scale.z *= 0.55; obj.position.z = 0.5 - 0.5;
    } else if (key === 'pipe') {
      this.mesh(new THREE.CylinderGeometry(0.27, 0.27, 2.1, 16).rotateZ(Math.PI / 2), this.mPipe, 0, 0.52, 0, c);
      for (const x of [-0.8, 0.8]) { this.box(this.mConcrete, 0.3, 0.26, 0.5, x, 0.13, 0, c); this.mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 16).rotateZ(Math.PI / 2), this.mSteel, x * 1.22, 0.52, 0, c); }
      this.box(this.mHazard, 1.3, 0.1, 0.02, 0, 0.52, 0.28, c);
    } else if (key === 'jersey') {
      const sh = new THREE.Shape();
      sh.moveTo(-0.28, 0); sh.lineTo(0.28, 0); sh.lineTo(0.26, 0.18); sh.lineTo(0.11, 0.42); sh.lineTo(0.08, 0.82); sh.lineTo(-0.08, 0.82); sh.lineTo(-0.11, 0.42); sh.lineTo(-0.26, 0.18); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.9, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-0.95, 0, 0);
      this.mesh(geo, this.mConcrete, 0, 0, 0, c);
      this.box(this.mHazard, 1.9, 0.16, 0.02, 0, 0.62, 0.1, c);
      for (const x of [-0.7, 0.7]) this.mesh(this.gBeacon, this.mBeacon, x, 0.9, 0, c);
    } else if (key === 'tyres') {
      const tyre = new THREE.TorusGeometry(0.3, 0.13, 8, 18).rotateX(Math.PI / 2);
      for (const x of [-0.6, 0.1, 0.72]) for (let i = 0; i < 3; i++) this.mesh(tyre, this.mRubber, x + (i % 2) * 0.04, 0.13 + i * 0.26, (i % 2) * 0.05, c);
    } else if (key === 'gate') {
      for (const x of [-1.0, 1.0]) {
        this.mesh(this.gPost, this.mSteel, x, 1.375, 0, c);
        this.mesh(this.gBase, this.mRubber, x, 0.05, 0, c);
        this.mesh(this.gBeacon, this.mBeacon, x, 2.82, 0, c);
      }
      this.mesh(this.gBeam, this.mSteel, 0, 2.66, 0, c);
      this.mesh(this.gSign, this.mWarn, 0, 2.1, 0, c);
      this.mesh(this.gFlap, this.mRubber, 0, 1.56, 0, c);
      this.mesh(this.gBoard, this.mHazard, 0, 1.36, 0, c).scale.set(1, 0.9, 1.4);
    } else if (key === 'scaffold') {
      for (const x of [-1.0, 1.0]) for (const z of [-0.5, 0.5]) this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.9, 8), this.mSteel, x, 1.45, z, c);
      for (const y of [1.3, 2.8]) { this.box(this.mWood, 2.1, 0.07, 1.15, 0, y, 0, c); for (const z of [-0.5, 0.5]) this.box(this.mSteel, 2.06, 0.05, 0.05, 0, y - 0.07, z, c); }
      for (const x of [-1.0, 1.0]) this.box(this.mSteel, 0.04, 0.04, 1.75, x, 2.05, 0, c).rotation.x = 1.0;
      this.box(this.mHazard, 2.1, 0.2, 0.03, 0, 1.2, 0.6, c);
      this.box(this.mWarn, 2.1, 0.5, 0.03, 0, 1.75, 0.58, c);
    } else if (key === 'duct') {
      this.box(this.mDuct, 2.15, 1.25, 0.9, 0, 2.0, 0, c);
      for (const x of [-0.7, 0, 0.7]) this.box(this.mSteel, 0.04, 1.29, 0.94, x, 2.0, 0, c);
      this.box(this.mHazard, 2.15, 0.18, 0.02, 0, 1.46, 0.46, c);
      for (const x of [-0.9, 0.9]) this.mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.8, 6), this.mSteel, x, 4.0, 0, c);
      this.mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 18).rotateX(Math.PI / 2), this.mRubber, 0.5, 2.05, 0.46, c);
    } else if (key === 'boom') {
      this.box(this.mSteel, 0.3, 1.5, 0.3, -1.05, 0.75, 0, c);
      this.box(this.mBeacon, 0.2, 0.2, 0.2, -1.05, 1.6, 0, c);
      const arm = new THREE.MeshStandardMaterial({ map: hazardTexture('#ff3b3b', '#ffffff'), roughness: 0.5 });
      this.box(arm, 2.2, 0.16, 0.1, 0.05, 1.3, 0, c);
      this.box(arm, 2.0, 0.1, 0.06, 0.1, 1.72, 0, c);
      for (const x of [-0.5, 0.2, 0.9]) this.box(this.mSteel, 0.03, 0.34, 0.03, x, 1.5, 0, c);
      this.box(this.mSteel, 0.12, 1.3, 0.12, 1.08, 0.65, 0, c);
    } else if (key === 'hang') {
      const { obj, size } = this.fitted('cargo_A_stacked', 2.0, c, 0, 0);
      obj.position.y += 1.22; obj.scale.y *= 0.7; obj.scale.z *= 0.6; obj.position.z = (size.z * 0.6) / 2 - 0.0;
      this.box(this.mSteel, 2.2, 0.12, 0.9, 0, 2.75, 0, c);
      for (const x of [-0.95, 0.95]) for (const z of [-0.35, 0.35]) this.mesh(new THREE.CylinderGeometry(0.018, 0.018, 7, 6), this.mRubber, x, 6.3, z, c);
      this.box(this.mHazard, 2.0, 0.16, 0.02, 0, 1.3, 0.62, c);
    } else if (key === 'traincar') {
      g.add(this.trains.car(Math.floor(Math.random() * this.trains.liveries)));
    } else if (key === 'train') {
      const l = Math.floor(Math.random() * this.trains.liveries);
      g.add(this.trains.car(l), this.trains.car(l, -CAR_LEN));
    } else if (key === 'car' || key === 'car>' || key === 'car<') {
      this.vehicle(g, ['car_taxi', 'car_sedan', 'car_hatchback', 'car_stationwagon'][Math.floor(Math.random() * 4)], 1.9, key !== 'car<', key !== 'car');
    } else if (key === 'police_car') {
      const size = this.vehicle(g, 'car_police', 1.9, false, false);
      this.box(this.flashRed, 0.34, 0.14, 0.3, -0.3, size.y + 0.02, -size.z * 0.47, g);
      this.box(this.flashBlue, 0.34, 0.14, 0.3, 0.3, size.y + 0.02, -size.z * 0.47, g);
    } else if (key === 'van' || key === 'van>' || key === 'van<') {
      this.vehicle(g, Math.random() < 0.5 ? 'van' : 'van_large', 1.9, key !== 'van<', key !== 'van');
    } else if (key === 'truck' || key === 'truck>' || key === 'truck<') {
      this.vehicle(g, ['truck_green', 'truck_purple', 'truck_red', 'truck_yellow'][Math.floor(Math.random() * 4)], 1.95, key !== 'truck<', key !== 'truck');
    } else if (key === 'container') {
      this.fitted(Math.random() < 0.5 ? 'cargo_A_stacked' : 'cargo_B_stacked', 2.05, g, 0, 0);
      this.fitted(Math.random() < 0.5 ? 'cargo_A_stacked' : 'cargo_B_stacked', 2.05, g, Math.PI / 2, -2.1);
    } else if (key === 'dumpster') {
      this.fitted('dumpster', 2.2, g, Math.PI / 2, 0).obj.scale.multiplyScalar(1);
    } else if (key === 'ped') {
      const look = CIVILIANS[this.civ++ % CIVILIANS.length];
      const rig = new Rig(this.assets.body(look.body), this.assets.clips, look, this.assets);
      rig.play('Walking_A', 0, 1, Math.random());
      rig.root.position.z = -0.3;
      g.add(rig.root);
      g.userData.rig = rig;
    } else {
      const [face, rim] = this.pickupMats[key as PowerKind];
      const spin = new THREE.Group();
      this.mesh(this.gDisc, [rim, face, face], 0, 0, 0, spin);
      this.mesh(this.gRing, rim, 0, 0, 0, spin);
      g.add(spin);
      g.userData.spin = spin;
    }
    if (c.children.length) g.add(c);
    g.traverse((o) => { o.frustumCulled = false; });
    g.userData.key = key;
    return g;
  }

  get(key: string) {
    const o = (this.pools[key] ??= []).pop() ?? this.build(key);
    o.visible = true;
    o.rotation.set(0, 0, 0);
    o.position.y = 0;
    return o;
  }

  release(o: THREE.Object3D) {
    o.visible = false;
    (this.pools[o.userData.key] ??= []).push(o);
  }

  /** Police/beacon flash shared by every obstacle that carries lights. */
  update(time: number) {
    const beat = (time * 2.2) % 1;
    this.flashRed.emissiveIntensity = beat < 0.5 ? 5 : 0.2;
    this.flashBlue.emissiveIntensity = beat < 0.5 ? 0.2 : 5;
    this.mBeacon.emissiveIntensity = 1.2 + Math.max(0, Math.sin(time * 5)) * 3;
  }
}
