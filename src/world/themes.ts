import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { CFG, laneX } from '../core/config';
import type { ThemeId } from '../data/missions';
import type { GenMods } from './generator';
import { StaticBatch, type Part } from './StaticBatch';
import { adTexture, ballastTexture, brickTexture, concreteTexture, corrugatedTexture, gantryTexture, hazardTexture, pavingTexture, roadTexture, signTexture, tapeTexture, waterTexture, windowsTexture, zebraTexture, type RoadKind } from './textures';

const L = CFG.chunkLen;
export const ROAD_HALF = 3.6;

/** Lighting and atmosphere for an environment; blended across zone boundaries. */
export interface ThemeLook {
  fog: number; fogNear: number; fogFar: number;
  skyTop: number; skyMid: number; skyHor: number;
  sun: number; sunI: number;
  hemiSky: number; hemiGround: number; hemiI: number;
  env: number; clouds: boolean;
}

export interface ThemeDef {
  id: ThemeId;
  look: ThemeLook;
  mods: GenMods;
  /** Tunnel-like: closed overhead, so its ends get portal walls. */
  enclosed: boolean;
  variants: number;
  /** Which variant chunk index i uses (defaults to a hash). */
  variantFor?: (i: number) => number;
  /** Height of the ground beside the road (for props placed by the story). */
  sideY: number;
  /** Obstacle models used for each kind of track cell. */
  obstacles: { jump: string[]; slide: string[]; block: string[]; train: string[] };
  /** Ambient soundscape id. */
  ambience: 'street' | 'rail' | 'tunnel' | 'alley' | 'yard' | 'highway' | 'night' | 'docks';
  build(k: Kit, variant: number): Part[];
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const BUILDINGS = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
const CARS = ['car_taxi', 'car_sedan', 'car_hatchback', 'car_stationwagon'];
const STATIONS = ['HOLLOW ST', 'EMBER YARD', 'KITE MARKET', 'NORTH QUAY', 'LANTERN ROW', 'OLD FOUNDRY'];

/** Shared materials, geometry helpers and the asset store for every theme builder. */
export class Kit {
  private mats = new Map<string, THREE.Material>();
  /** Materials animated by World.update (police lights, beacons). */
  readonly flashRed = new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2030, emissiveIntensity: 3 });
  readonly flashBlue = new THREE.MeshStandardMaterial({ color: 0x111855, emissive: 0x2f6bff, emissiveIntensity: 3 });
  readonly beacon = new THREE.MeshStandardMaterial({ color: 0xffa51f, emissive: 0xff7a00, emissiveIntensity: 2.4 });

  constructor(readonly assets: Assets) {}

  mat(key: string, make: () => THREE.Material) {
    let m = this.mats.get(key);
    if (!m) { m = make(); this.mats.set(key, m); }
    return m;
  }
  /** Cached standard material; the parameters (and any textures in them) are only built on first use. */
  std(key: string, p: () => THREE.MeshStandardMaterialParameters) { return this.mat(key, () => new THREE.MeshStandardMaterial(p())); }
  color(hex: number, rough = 0.85, metal = 0) { return this.std(`c${hex}-${rough}-${metal}`, () => ({ color: hex, roughness: rough, metalness: metal })); }
  glow(hex: number, intensity = 2.5) { return this.std(`g${hex}-${intensity}`, () => ({ color: hex, emissive: hex, emissiveIntensity: intensity })); }
  road(kind: RoadKind) { return this.std('road-' + kind, () => ({ map: roadTexture(kind), roughness: 0.92 })); }
  get steel() { return this.color(0x39414f, 0.45, 0.7); }
  get frame() { return this.color(0x22262f, 0.5, 0.5); }
  get concrete() { return this.std('concrete', () => ({ map: concreteTexture('#9a9c9f', false), roughness: 0.95 })); }
  get paving() { return this.std('paving', () => ({ map: pavingTexture(), roughness: 0.9 })); }
  get hazard() { return this.std('hazard', () => ({ map: hazardTexture('#ffcf33', '#1b1b1f'), roughness: 0.55 })); }

  /** Horizontal plane, w wide (x) by len long (z), texture repeated u by v times. */
  hplane(b: StaticBatch, mat: THREE.Material, w: number, len: number, x: number, y: number, z: number, u = 1, v = 1) {
    const g = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
    scaleUV(g, u, v);
    b.addGeometry(g, mat, x, y, z);
  }
  /** Vertical wall running along z at x, facing the road (side = sign of x). */
  wall(b: StaticBatch, mat: THREE.Material, len: number, h: number, x: number, y0: number, z: number, u = 1, v = 1) {
    const g = new THREE.PlaneGeometry(len, h).rotateY(x > 0 ? -Math.PI / 2 : Math.PI / 2);
    scaleUV(g, u, v);
    b.addGeometry(g, mat, x, y0 + h / 2, z);
  }
  /** Vertical wall across the track (facing +z, toward the approaching player). */
  face(b: StaticBatch, mat: THREE.Material, w: number, h: number, x: number, y0: number, z: number, u = 1, v = 1) {
    const g = new THREE.PlaneGeometry(w, h);
    scaleUV(g, u, v);
    b.addGeometry(g, mat, x, y0 + h / 2, z);
  }
  box(b: StaticBatch, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rot?: THREE.Euler) {
    b.addGeometry(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rot);
  }
  /** Cylinder lying along z. */
  pipe(b: StaticBatch, mat: THREE.Material, r: number, len: number, x: number, y: number, z: number) {
    b.addGeometry(new THREE.CylinderGeometry(r, r, len, 10).rotateX(Math.PI / 2), mat, x, y, z);
  }
  post(b: StaticBatch, mat: THREE.Material, r: number, h: number, x: number, y0: number, z: number) {
    b.addGeometry(new THREE.CylinderGeometry(r, r, h, 10), mat, x, y0 + h / 2, z);
  }
  prop(b: StaticBatch, name: string, x: number, y: number, z: number, scale: number | THREE.Vector3 = 1, rotY = 0) {
    b.add(this.assets.prop(name), x, y, z, scale, rotY);
  }
  /** Billboard with an original advert, angled toward the approaching player. */
  billboard(b: StaticBatch, i: number, side: number, x: number, y: number, z: number) {
    const rot = new THREE.Euler(0, -side * 0.95, 0);
    const tex = adTexture(i);
    const ad = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.14 });
    const c = Math.cos(-side * 0.95), s = Math.sin(-side * 0.95);
    b.addGeometry(new THREE.PlaneGeometry(6, 3), ad, x + s * 0.12, y + 5.4, z + c * 0.12, rot);
    b.addGeometry(new THREE.BoxGeometry(6.3, 3.3, 0.2), this.frame, x, y + 5.4, z, rot);
    for (const o of [-2, 2]) b.addGeometry(new THREE.BoxGeometry(0.22, 3.8, 0.22), this.steel, x + c * o, y + 1.9, z - s * o);
  }
  /** Row of city buildings with a taller skyline row behind. */
  skyline(near: StaticBatch, far: StaticBatch, side: number, x0: number, y: number, slots: [number, number][] | null = null, night = false) {
    const face = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    for (const [z, sc] of slots ?? [[7.5, rnd(6.4, 7.4)], [22.5, rnd(6.4, 7.4)], [37.5, rnd(6.4, 7.4)], [52.5, rnd(6.4, 7.4)]] as [number, number][])
      near.add(this.assets.prop(pick(BUILDINGS)), side * (x0 + sc), y, -z, new THREE.Vector3(sc, sc * rnd(0.95, 1.5), sc), face);
    for (let i = 0; i < 3; i++) {
      const sc = rnd(9, 11);
      if (night) {
        const h = sc * rnd(2.2, 4.4);
        const t = this.std('nightwin' + (i % 3), () => ({ map: windowsTexture('#161c2e', 0.3), emissive: 0xffffff, emissiveMap: windowsTexture('#000000', 0.3), emissiveIntensity: 0.9, roughness: 0.8 }));
        const g = new THREE.BoxGeometry(sc * 1.6, h, sc * 1.6);
        scaleUV(g, 2, Math.round(h / 8));
        far.addGeometry(g, t, side * (x0 + 22 + sc), y + h / 2, -(10 + i * 20));
      } else far.add(this.assets.prop(pick(BUILDINGS)), side * (x0 + 17 + sc), y, -(10 + i * 20), new THREE.Vector3(sc, sc * rnd(1.4, 2.4), sc), face + (Math.random() < 0.5 ? Math.PI : 0));
    }
  }
  /** Parked police car with roof lights that flash. */
  policeCar(b: StaticBatch, x: number, y: number, z: number, rotY: number) {
    this.prop(b, 'car_police', x, y + 0.28, z, 4.6, rotY);
    const c = Math.cos(rotY), s = Math.sin(rotY);
    this.box(b, this.flashRed, 0.34, 0.16, 0.3, x - c * 0.3, y + 1.92, z + s * 0.3, new THREE.Euler(0, rotY, 0));
    this.box(b, this.flashBlue, 0.34, 0.16, 0.3, x + c * 0.3, y + 1.92, z - s * 0.3, new THREE.Euler(0, rotY, 0));
  }
}

function scaleUV(g: THREE.BufferGeometry, u: number, v: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
}

const done = (ground: StaticBatch, near: StaticBatch, far: StaticBatch): Part[] => [...ground.parts(false, true), ...near.parts(true, true), ...far.parts(false, false)];
const DAY: ThemeLook = { fog: 0xd4ecff, fogNear: 70, fogFar: 240, skyTop: 0x2f86ff, skyMid: 0x8fcbff, skyHor: 0xd4ecff, sun: 0xfff0d2, sunI: 2.9, hemiSky: 0xcfe6ff, hemiGround: 0x9a8f80, hemiI: 1.15, env: 0.45, clouds: true };

// ================================================================ city streets
function city(k: Kit, v: number): Part[] {
  const ground = new StaticBatch(), near = new StaticBatch(), far = new StaticBatch();
  const cross = v === 1;
  const inCross = (z: number) => cross && z > 22 && z < 38;
  const SY = 0.17;
  k.hplane(ground, k.road('city'), ROAD_HALF * 2, L, 0, 0, -L / 2, 1, L / 12);
  const asphalt = k.color(0x43464f, 0.95);
  for (const s of [-1, 1]) {
    k.hplane(ground, asphalt, 2.3, L, s * 4.75, 0, -L / 2); // parking bay
    k.box(near, k.concrete, 0.25, 0.2, L, s * 6.02, 0.1, -L / 2); // kerb
    k.hplane(ground, k.paving, 6.2, L, s * 9.2, SY, -L / 2, 3, 30);
    k.hplane(ground, k.paving, 40, L, s * 32.3, SY - 0.01, -L / 2, 20, 30);
    k.skyline(near, far, s, 12.3, SY, cross ? [[7.5, rnd(6.4, 7.2)], [18.4, 3.6], [41.6, 3.6], [52.5, rnd(6.4, 7.2)]] : null);
    for (let z = 7.5; z < L; z += 15) if (!inCross(z)) k.prop(near, 'streetlight', s * 6.5, SY, -z, 6.2, s > 0 ? 0 : Math.PI);
    for (const z of [6, 13, 20, 44, 51, 57]) if (Math.random() < 0.55 && !inCross(z)) k.prop(near, pick(CARS), s * 4.75, 0.28, -z, 4.6, Math.random() < 0.5 ? 0 : Math.PI);
    for (const z of [14, 46]) {
      k.prop(near, 'bench', s * 10.4, SY, -(z + rnd(-2, 2)), 5.2, s < 0 ? Math.PI / 2 : -Math.PI / 2);
      k.prop(near, pick(['trash_A', 'trash_B']), s * 7.2, SY, -(z + 2.6), 4.5, rnd(0, 6));
    }
    for (let i = 0; i < 2; i++) { const z = rnd(3, 16) + i * 40; k.prop(near, pick(['trees', 'trees_tall']), s * rnd(9.6, 10.6), SY - 0.02, -z, rnd(3.2, 4), pick([0, 1, 2, 3]) * Math.PI / 2); }
    for (let i = 0; i < 3; i++) { const z = rnd(1, L - 1); if (!inCross(z)) k.prop(near, 'bush', s * rnd(7.4, 8.2), SY, -z, rnd(3.2, 4.4), rnd(0, 6)); }
    k.prop(near, 'firehydrant', s * 6.9, SY, -rnd(48, 56), 5, rnd(0, 6));
    // roadside market stall
    if (!cross && Math.random() < 0.7) {
      const z = rnd(26, 34);
      k.prop(near, 'table_round_A_small_decorated', s * 9.4, SY, -z, 0.8, rnd(0, 6));
      k.prop(near, pick(['crate_tomatoes', 'crate_carrots', 'crate_cheese', 'crate_lettuce', 'crate_buns']), s * 8.2, SY, -(z + 1.6), 0.55, rnd(0, 1));
      k.prop(near, pick(['crate_tomatoes', 'crate_carrots', 'crate_lettuce']), s * 8.3, SY, -(z - 1.5), 0.55, rnd(0, 1));
      k.prop(near, 'menu', s * 7.4, SY, -z, 1.5, s < 0 ? Math.PI / 2 : -Math.PI / 2);
      k.prop(near, 'chair_A', s * 10.6, SY, -(z + 0.8), 0.8, rnd(0, 6));
    }
    if (cross) {
      // side street, crossings and signals
      k.hplane(ground, asphalt, 40, 12, s * 26, SY + 0.012, -30);
      k.hplane(ground, asphalt, 2.6, 12, s * 4.9, 0.004, -30);
      for (const z of [22.4, 37.6]) k.prop(near, 'trafficlight_A', s * 6.5, SY, -z, 5.2, s > 0 ? Math.PI : 0);
    }
  }
  if (cross) {
    const zebra = k.std('zebra', () => ({ map: zebraTexture(), transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    for (const z of [21.6, 38.4]) k.hplane(ground, zebra, ROAD_HALF * 2, 3, 0, 0.012, -z);
  } else {
    const side = v % 2 ? 1 : -1;
    k.billboard(near, v + Math.floor(Math.random() * 6), side, side * 11.2, SY, -rnd(36, 44));
  }
  return done(ground, near, far);
}

// ================================================================ railway
function rail(k: Kit, v: number): Part[] {
  const ground = new StaticBatch(), near = new StaticBatch(), far = new StaticBatch();
  const PY = 0.9;
  const ballastMap = ballastTexture();
  const mBallast = k.std('ballast', () => ({ map: ballastMap, roughness: 1 }));
  const mRail = k.color(0xaab2bd, 0.28, 1);
  const mSleeper = k.color(0x6b5a4c, 0.95);
  const mEdge = k.color(0xffc928, 0.7);
  k.hplane(ground, mBallast, ROAD_HALF * 2, L, 0, 0, -L / 2, 4, 34);
  for (let l = 0; l < 3; l++) {
    for (const s of [-0.55, 0.55]) {
      k.box(ground, mRail, 0.075, 0.05, L, laneX(l) + s, 0.2, -L / 2);
      k.box(ground, mRail, 0.025, 0.09, L, laneX(l) + s, 0.13, -L / 2);
      k.box(ground, mRail, 0.15, 0.025, L, laneX(l) + s, 0.085, -L / 2);
    }
    for (let z = 0.375; z < L; z += 0.75) k.box(ground, mSleeper, 1.7, 0.1, 0.24, laneX(l), 0.03, -z);
    k.box(near, k.frame, 0.035, 0.035, L, laneX(l), 6.1, -L / 2);
    k.box(near, k.frame, 0.06, 0.75, 0.06, laneX(l), 6.5, -30);
  }
  for (const s of [-1, 1]) {
    k.hplane(ground, k.paving, 46, L, s * (ROAD_HALF + 23), PY, -L / 2, 22, 30);
    k.wall(ground, k.concrete, L, PY, s * ROAD_HALF, 0, -L / 2, 12, 1);
    k.box(ground, mEdge, 0.45, 0.03, L, s * (ROAD_HALF + 0.3), PY + 0.012, -L / 2);
    k.box(near, k.steel, 0.28, 7, 0.28, s * (ROAD_HALF + 0.75), PY + 3.5, -30); // catenary portal
    k.skyline(near, far, s, 10.2, PY);
    for (let z = 7.5; z < L; z += 15) k.prop(near, 'streetlight', s * (ROAD_HALF + 1.1), PY, -z, 6.2, s > 0 ? 0 : Math.PI);
    for (const z of [14, 44]) {
      k.prop(near, 'bench', s * 8.3, PY, -(z + rnd(-2, 2)), 5.2, s < 0 ? Math.PI / 2 : -Math.PI / 2);
      k.prop(near, pick(['trash_A', 'trash_B']), s * 8.4, PY, -(z + 2.6), 4.5, rnd(0, 6));
    }
    for (let i = 0; i < 3; i++) k.prop(near, pick(['trees', 'trees_tall']), s * rnd(8.8, 9.4), PY - 0.02, -(rnd(3, 8) + i * 20), rnd(3.8, 4.8), pick([0, 1, 2, 3]) * Math.PI / 2);
    for (let i = 0; i < 4; i++) k.prop(near, 'bush', s * rnd(6.4, 8.8), PY, -rnd(1, L - 1), rnd(3.4, 5), rnd(0, 6));
    // signal mast
    const sz = s > 0 ? 12 : 48;
    k.post(near, k.frame, 0.07, 4.2, s * (ROAD_HALF + 0.5), PY, -sz);
    k.box(near, k.frame, 0.5, 1.1, 0.25, s * (ROAD_HALF + 0.5), PY + 4.3, -sz);
    k.box(near, s > 0 ? k.glow(0x2bff7a, 3) : k.glow(0xff3030, 3), 0.22, 0.22, 0.05, s * (ROAD_HALF + 0.5), PY + 4.55, -sz + 0.14);
    k.box(near, k.color(0x1a1a1a), 0.22, 0.22, 0.05, s * (ROAD_HALF + 0.5), PY + 4.1, -sz + 0.14);
    // station name board
    const signZ = -(22 + (s > 0 ? 8 : 0));
    for (const o of [-1.5, 1.5]) k.box(near, k.frame, 0.1, 3, 0.1, s * 6.2, PY + 1.5, signZ + o);
    k.box(near, k.frame, 0.12, 1, 3.6, s * 6.2, PY + 2.7, signZ);
    const name = STATIONS[v % STATIONS.length];
    const sign = k.std(`station-${name}-${s}`, () => ({ map: signTexture(name, '#16306e', '#ffffff', 'PLATFORM ' + (s > 0 ? 2 : 1)), roughness: 0.5 }));
    near.addGeometry(new THREE.PlaneGeometry(3.4, 0.85), sign, s * 6.13, PY + 2.7, signZ, new THREE.Euler(0, -s * Math.PI / 2, 0));
  }
  k.box(near, k.steel, ROAD_HALF * 2 + 2, 0.22, 0.22, 0, 7.6, -30);
  k.box(near, k.steel, ROAD_HALF * 2 + 2, 0.12, 0.12, 0, 6.9, -30);
  for (let x = -4; x <= 4; x += 1) k.box(near, k.steel, 0.06, 0.7, 0.06, x, 7.25, -30);
  const bs = v % 2 ? 1 : -1;
  k.billboard(near, v + 1, bs, bs * 9.6, PY, -rnd(36, 44));
  return done(ground, near, far);
}

// ================================================================ underground tunnel
const TUN_W = 4.7, TUN_H = 5.4;
function tunnel(k: Kit, v: number): Part[] {
  const ground = new StaticBatch(), near = new StaticBatch(), far = new StaticBatch();
  const wallMat = k.std('tunnel-wall', () => ({ map: concreteTexture('#7f8288'), roughness: 0.9 }));
  const tile = k.std('tunnel-tile', () => ({ map: concreteTexture('#d9d4c4'), roughness: 0.6 }));
  const dark = k.color(0x23252b, 0.9);
  const lamp = k.glow(0xffe6b0, 3.2);
  k.hplane(ground, k.road('tunnel'), ROAD_HALF * 2, L, 0, 0, -L / 2, 1, L / 12);
  for (const s of [-1, 1]) {
    k.box(ground, k.concrete, 1.1, 0.35, L, s * (ROAD_HALF + 0.55), 0.175, -L / 2); // service walkway
    k.wall(ground, tile, L, 1.6, s * TUN_W, 0.35, -L / 2, 20, 1);
    k.wall(ground, wallMat, L, TUN_H - 1.95, s * TUN_W, 1.95, -L / 2, 15, 1);
    k.box(near, k.hazard, 0.06, 0.22, L, s * (TUN_W - 0.03), 2.0, -L / 2);
    k.pipe(near, k.color(0xb8482e, 0.5, 0.4), 0.13, L, s * (TUN_W - 0.22), 3.5, -L / 2);
    k.pipe(near, k.color(0x8d99a8, 0.4, 0.8), 0.2, L, s * (TUN_W - 0.3), 4.1, -L / 2);
    k.box(near, dark, 0.5, 0.06, L, s * (TUN_W - 0.3), 4.6, -L / 2); // cable tray
    for (let z = 5; z < L; z += 10) {
      k.box(near, k.steel, 0.18, TUN_H, 0.3, s * (TUN_W - 0.09), TUN_H / 2, -z); // ribs
      k.box(near, lamp, 0.5, 0.08, 2.4, s * 1.9, TUN_H - 0.1, -(z + 2.5));
    }
    // emergency exit sign and door
    const ez = v === 0 ? 18 : 42;
    if (s > 0 === (v === 0)) {
      k.box(near, k.color(0x2d3340, 0.6, 0.3), 0.08, 2.2, 1.2, s * (TUN_W - 0.04), 1.45, -ez);
      k.box(near, k.glow(0x35ff8a, 2.6), 0.08, 0.34, 0.9, s * (TUN_W - 0.05), 2.85, -ez);
    }
  }
  ground.addGeometry(new THREE.PlaneGeometry(TUN_W * 2, L).rotateX(Math.PI / 2), dark, 0, TUN_H, -L / 2);
  // jet fans
  const fz = v === 0 ? 40 : 15;
  for (const x of [-1.2, 1.2]) {
    near.addGeometry(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 16).rotateX(Math.PI / 2), k.color(0x9aa3ad, 0.4, 0.7), x, TUN_H - 0.75, -fz);
    near.addGeometry(new THREE.CylinderGeometry(0.46, 0.46, 2.64, 16).rotateX(Math.PI / 2), dark, x, TUN_H - 0.75, -fz);
    k.box(near, k.steel, 0.1, 0.3, 0.1, x, TUN_H - 0.12, -fz);
  }
  return done(ground, near, far);
}

// ================================================================ back alley
function alley(k: Kit, v: number): Part[] {
  const ground = new StaticBatch(), near = new StaticBatch(), far = new StaticBatch();
  const WX = 4.6, WH = 12;
  const bricks = [k.std('brick-a', () => ({ map: brickTexture('#9c5540'), roughness: 0.95 })), k.std('brick-b', () => ({ map: brickTexture('#7d6a5e'), roughness: 0.95 })), k.std('brick-c', () => ({ map: brickTexture('#8a4a52'), roughness: 0.95 }))];
  const lit = k.glow(0xffd98a, 1.6);
  const dim = k.color(0x1c2233, 0.3, 0.4);
  k.hplane(ground, k.road('alley'), ROAD_HALF * 2, L, 0, 0, -L / 2, 1, L / 12);
  for (const s of [-1, 1]) {
    k.hplane(ground, k.concrete, WX - ROAD_HALF, L, s * (ROAD_HALF + (WX - ROAD_HALF) / 2), 0.01, -L / 2, 1, 20);
    for (let seg = 0; seg < 3; seg++) {
      const z0 = seg * 20, h = WH + rnd(-2, 4);
      const m = bricks[(seg + v + (s > 0 ? 1 : 0)) % 3];
      k.wall(ground, m, 20, h, s * WX, 0, -(z0 + 10), 5, h / 4);
      k.box(near, k.concrete, 0.5, 0.4, 20, s * (WX + 0.1), h + 0.2, -(z0 + 10)); // parapet
      for (let floor = 0; floor < 3; floor++) for (let w = 0; w < 4; w++) {
        const wz = z0 + 2.5 + w * 5, wy = 3.4 + floor * 2.9;
        if (wy > h - 1.2) continue;
        k.box(near, Math.random() < 0.3 ? lit : dim, 0.06, 1.3, 1.1, s * (WX - 0.03), wy, -wz);
        k.box(near, k.concrete, 0.14, 0.1, 1.4, s * (WX - 0.07), wy - 0.72, -wz);
      }
      k.box(near, k.color(0x3a2d26, 0.8), 0.08, 2.1, 1.1, s * (WX - 0.04), 1.05, -(z0 + rnd(4, 16))); // back door
      if (Math.random() < 0.7) { // air conditioner
        const az = z0 + rnd(3, 17);
        k.box(near, k.color(0xc9ccd1, 0.6, 0.3), 0.5, 0.6, 0.9, s * (WX - 0.26), 2.9, -az);
      }
      k.post(near, k.color(0x4c5560, 0.5, 0.6), 0.07, h, s * (WX - 0.09), 0, -(z0 + 19.4)); // drainpipe
    }
    // fire escape
    const fz = s > 0 ? 14 : 44;
    for (const fy of [4.6, 7.5]) {
      k.box(near, k.frame, 0.9, 0.08, 3.4, s * (WX - 0.46), fy, -fz);
      k.box(near, k.frame, 0.05, 0.9, 3.4, s * (WX - 0.9), fy + 0.45, -fz);
      k.box(near, k.frame, 0.06, 2.95, 0.5, s * (WX - 0.6), fy - 1.45, -(fz + 1.4), new THREE.Euler(0.5, 0, 0));
    }
    k.prop(near, 'dumpster', s * 4.05, 0, -(s > 0 ? 34 : 8), 3.6, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    for (let i = 0; i < 3; i++) k.prop(near, pick(['trash_A', 'trash_B', 'box_A', 'box_B']), s * rnd(3.95, 4.2), 0, -rnd(2, L - 2), rnd(3.2, 4.2), rnd(0, 6));
    k.skyline(near, far, s, 9, 0, [], true);
  }
  // strings of lamps and washing lines overhead
  const cloths = [0xd9534f, 0xf0ad4e, 0x5bc0de, 0xf7f7f7, 0x5cb85c];
  for (let z = 6; z < L; z += 12) {
    const y = 6.2 + rnd(-0.4, 0.8);
    k.box(near, k.frame, WX * 2, 0.025, 0.025, 0, y, -z);
    if ((z / 6) % 4 < 2) for (let x = -3.6; x <= 3.6; x += 1.2) k.box(near, k.glow(0xffc46b, 2.8), 0.12, 0.16, 0.12, x, y - 0.12, -z);
    else for (let x = -3.4; x <= 3.4; x += 1) k.box(near, k.color(pick(cloths), 0.9), 0.7, rnd(0.6, 1), 0.02, x, y - 0.5, -z);
  }
  return done(ground, near, far);
}

// ================================================================ industrial yard
function industrial(k: Kit, v: number): Part[] {
  const ground = new StaticBatch(), near = new StaticBatch(), far = new StaticBatch();
  const sheds = [k.std('shed-a', () => ({ map: corrugatedTexture('#6d7f8f'), roughness: 0.7, metalness: 0.3 })), k.std('shed-b', () => ({ map: corrugatedTexture('#a3553a'), roughness: 0.7, metalness: 0.3 }))];
  k.hplane(ground, k.road('yard'), ROAD_HALF * 2, L, 0, 0, -L / 2, 1, L / 12);
  for (const s of [-1, 1]) {
    k.hplane(ground, k.concrete, 60, L, s * (ROAD_HALF + 30), -0.005, -L / 2, 12, 12);
    // stacked freight along the road
    for (let z = 4; z < L; z += rnd(5.5, 8)) {
      if (Math.abs(z - 30) < 4.5) continue;
      const x = s * rnd(6.6, 8.2), sc = 4.2;
      const kind = pick(['cargo_A_stacked', 'cargo_B_stacked', 'cargo_A_stacked', 'cargo_B_stacked', 'containers_A', 'containers_B']);
      if (kind.startsWith('cargo')) {
        k.prop(near, kind, x, 0, -z, sc, pick([0, 1, 2, 3]) * Math.PI / 2);
        if (Math.random() < 0.45) k.prop(near, pick(['cargo_A_packed', 'cargo_B_packed', 'cargo_A', 'cargo_B']), x + s * rnd(0, 0.8), sc * 1.01, -z, sc, rnd(0, 0.3));
      } else k.prop(near, kind, x - s * 1.2, 0, -z, 5, rnd(0, 6));
    }
    for (let i = 0; i < 3; i++) {
      const z = rnd(3, L - 3), x = s * rnd(4.5, 5.2);
      if (Math.abs(z - 30) < 4) continue;
      k.prop(near, pick(['Pallet_Small_Decorated_A', 'Pallet_Small', 'Barrel_A', 'Barrel_B', 'Barrel_C']), x, 0, -z, pick([0.55, 0.6]), rnd(0, 6));
    }
    for (const z of [10, 50]) k.prop(near, 'lights', s * 5.6, 0, -z, 5.5, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    k.prop(far, pick(['cargodepot_A', 'cargodepot_B', 'cargodepot_C']), s * 17, 0, -(v ? 15 : 45), 6.5, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    k.prop(far, 'structure_tall', s * 14, 0, -(v ? 46 : 14), 6.5, 0);
    // warehouse
    const m = sheds[(v + (s > 0 ? 1 : 0)) % 2];
    k.wall(far, m, L, 13, s * 26, 0, -L / 2, 30, 6);
    k.hplane(far, m, 30, L, s * 41, 13, -L / 2, 15, 30);
    for (const z of [12, 32, 52]) k.box(far, k.color(0x2b3038, 0.5, 0.5), 0.2, 6, 8, s * 25.9, 3, -z);
    for (let z = 2; z < L; z += 4) k.post(near, k.color(0xf2b705, 0.6), 0.09, 1.0, s * 3.95, 0, -z); // bollards
  }
  // pipe bridge over the road
  for (const x of [-5.6, 5.6]) { k.box(near, k.steel, 0.4, 7.4, 0.4, x, 3.7, -30); k.box(near, k.concrete, 0.9, 0.3, 0.9, x, 0.15, -30); }
  k.box(near, k.steel, 11.6, 0.3, 1.6, 0, 7.5, -30);
  for (const [dz, r, c] of [[-0.5, 0.22, 0xb8482e], [0, 0.3, 0xd9d9d9], [0.5, 0.18, 0x2f7fd0]] as [number, number, number][])
    near.addGeometry(new THREE.CylinderGeometry(r, r, 60, 10).rotateZ(Math.PI / 2), k.color(c, 0.4, 0.6), 0, 7.9 + r, -30 + dz);
  return done(ground, near, far);
}

// ================================================================ expressway / bridge
function jersey(len: number) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.3, 0); sh.lineTo(0.3, 0); sh.lineTo(0.28, 0.2); sh.lineTo(0.12, 0.45); sh.lineTo(0.09, 0.9); sh.lineTo(-0.09, 0.9); sh.lineTo(-0.12, 0.45); sh.lineTo(-0.28, 0.2); sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
}
function highway(k: Kit, v: number): Part[] {
  const ground = new StaticBatch(), near = new StaticBatch(), far = new StaticBatch();
  const bridge = v === 1;
  const asphalt = k.color(0x3f424b, 0.95);
  k.hplane(ground, k.road('highway'), ROAD_HALF * 2, L, 0, 0, -L / 2, 1, L / 12);
  const barrier = jersey(L);
  for (const s of [-1, 1]) {
    k.hplane(ground, asphalt, 2.4, L, s * 4.8, 0, -L / 2);
    k.box(ground, k.color(0xf4f1e6, 0.8), 0.14, 0.01, L, s * 5.6, 0.006, -L / 2);
    near.addGeometry(barrier, k.concrete, s * 6.3, 0, -L);
    for (let z = 10; z < L; z += 20) {
      k.post(near, k.steel, 0.1, 9, s * 6.9, 0, -z);
      k.box(near, k.steel, 2.2, 0.1, 0.14, s * 5.9, 8.9, -z);
      k.box(near, k.glow(0xfff1c9, 2.2), 0.7, 0.07, 0.24, s * 5.1, 8.82, -z);
    }
    if (bridge) {
      k.box(near, k.steel, 0.5, 1.4, L, s * 6.9, -0.7, -L / 2); // deck girder
      // pylon, main cable and hangers
      k.box(near, k.color(0xc23b2e, 0.5, 0.3), 1.2, 30, 1.6, s * 8, 9, -30);
      for (let i = 0; i < 12; i++) {
        const t = (i + 0.5) / 12, z = t * L, sag = Math.pow((z - 30) / 30, 2); // cable peaks at the pylon
        const y = 23 - sag * 17;
        const dy = (-2 * (z - 30) / 900) * 17;
        k.box(near, k.color(0xc23b2e, 0.5, 0.3), 0.22, 0.22, 5.2, s * 8, y, -z, new THREE.Euler(-Math.atan(dy), 0, 0));
        k.box(near, k.frame, 0.05, y, 0.05, s * 7.4, y / 2, -z);
      }
      k.skyline(near, far, s, 70, -14, []);
    } else {
      k.hplane(ground, k.color(0x7f9a62, 1), 70, L, s * 41.6, -0.03, -L / 2);
      k.skyline(near, far, s, 22, 0, []);
      for (let i = 0; i < 3; i++) k.prop(near, pick(['trees', 'trees_tall']), s * rnd(10, 18), -0.04, -rnd(2, L - 2), rnd(4, 5.5), pick([0, 1, 2, 3]) * Math.PI / 2);
      for (let i = 0; i < 3; i++) k.prop(near, 'bush', s * rnd(7.6, 10), 0, -rnd(1, L - 1), rnd(3.4, 5), rnd(0, 6));
    }
  }
  if (bridge) {
    k.box(near, k.color(0xc23b2e, 0.5, 0.3), 17, 1.2, 1.2, 0, 22, -30);
    k.box(near, k.color(0xc23b2e, 0.5, 0.3), 17, 0.9, 1.2, 0, 12, -30);
    const water = k.std('water-day', () => ({ map: waterTexture(false), roughness: 0.15, metalness: 0.4 }));
    k.hplane(far, water, 400, L, 0, -16, -L / 2, 40, 6);
  } else {
    // overhead direction gantry
    for (const x of [-6.9, 6.9]) k.box(near, k.steel, 0.35, 7.4, 0.35, x, 3.7, -42);
    k.box(near, k.steel, 14.2, 0.35, 0.35, 0, 7.3, -42);
    const tex = k.std('gantry' + (v % 2), () => ({ map: gantryTexture(v % 2 ? 'HARBOUR' : 'DOWNTOWN', v % 2 ? 'DOCKS 2km' : 'AIRPORT'), roughness: 0.5, emissive: 0xffffff, emissiveMap: gantryTexture('HARBOUR', 'DOCKS 2km'), emissiveIntensity: 0.08 }));
    near.addGeometry(new THREE.PlaneGeometry(6.6, 1.65), tex, 0, 6.2, -41.8);
    k.box(near, k.frame, 6.8, 1.85, 0.1, 0, 6.2, -41.9);
  }
  return done(ground, near, far);
}

// ================================================================ night roadworks
function construction(k: Kit, v: number): Part[] {
  const ground = new StaticBatch(), near = new StaticBatch(), far = new StaticBatch();
  const dirt = k.color(0x4a3d33, 1);
  const hoard = k.std('hoarding', () => ({ map: hazardTexture('#ff8a1f', '#f4f1e6'), roughness: 0.6 }));
  const tape = k.std('closed', () => ({ map: tapeTexture('ROAD CLOSED', '#ffcf33', '#1b1b1f'), roughness: 0.6 }));
  const flood = k.glow(0xf4f7ff, 4);
  k.hplane(ground, k.road('night'), ROAD_HALF * 2, L, 0, 0, -L / 2, 1, L / 12);
  for (const s of [-1, 1]) {
    k.hplane(ground, dirt, 60, L, s * (ROAD_HALF + 30), -0.01, -L / 2);
    // hoarding along the works
    for (let z = 0; z < L; z += 6) {
      k.box(near, k.color(0x8a8d93, 0.8), 0.12, 1.5, 5.8, s * 4.3, 0.75, -(z + 3));
      k.box(near, z % 12 ? hoard : tape, 0.14, 0.36, 5.8, s * 4.28, 1.2, -(z + 3));
      k.box(near, k.concrete, 0.5, 0.25, 0.6, s * 4.3, 0.125, -z);
      if (z % 12 === 0) k.box(near, k.beacon, 0.16, 0.16, 0.16, s * 4.3, 1.62, -z);
    }
    // unfinished building frame
    const bx = s * 13, floors = 4 + (v + (s > 0 ? 1 : 0)) % 3;
    for (let f = 0; f <= floors; f++) {
      k.box(near, k.concrete, 12, 0.35, 44, bx, f * 3.6 + 0.18, -30);
      if (f < floors) for (const cx of [-5.6, 0, 5.6]) for (let cz = -20; cz <= 20; cz += 10) k.box(near, k.color(0x6d7178, 0.9), 0.5, 3.6, 0.5, bx + cx, f * 3.6 + 1.8, -30 + cz);
    }
    // scaffolding on the road side
    for (let f = 0; f < Math.min(floors, 4); f++) {
      k.box(near, k.color(0x8a6a3c, 0.9), 1.2, 0.08, 44, bx - s * 6.9, f * 3.6 + 3.6, -30);
      for (let cz = -22; cz <= 22; cz += 4.4) for (const ox of [6.3, 7.5]) k.post(near, k.steel, 0.04, 3.6, bx - s * ox, f * 3.6, -30 + cz);
    }
    // tower crane
    if ((s > 0) === (v === 0)) {
      k.prop(far, 'structure_tall', s * 24, 0, -40, new THREE.Vector3(3, 16, 3), 0);
      k.box(far, k.color(0xf2b705, 0.6, 0.3), 26, 0.8, 0.8, s * 16, 32.4, -40);
      k.box(far, k.frame, 0.06, 9, 0.06, s * 6, 27.6, -40);
      k.box(far, k.beacon, 0.5, 0.5, 0.5, s * 24, 33.4, -40);
    }
    // floodlight towers
    for (const z of [8, 38]) {
      k.post(near, k.steel, 0.09, 6.5, s * 5.2, 0, -(z + (s > 0 ? 8 : 0)));
      k.box(near, flood, 0.9, 0.5, 0.12, s * 5.0, 6.6, -(z + (s > 0 ? 8 : 0)));
    }
    for (let i = 0; i < 2; i++) k.prop(near, pick(['Barrel_A', 'Barrel_C', 'Pallet_Small_Decorated_B', 'Pallet_Small']), s * rnd(5.4, 6.2), 0, -rnd(3, L - 3), 0.6, rnd(0, 6));
    near.addGeometry(new THREE.SphereGeometry(2.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.4, 0.7, 1), dirt, s * rnd(6.6, 7.4), 0, -(v ? 16 : 50)); // spoil heap
  }
  return done(ground, near, far);
}

// ================================================================ night docks
function harbor(k: Kit, v: number): Part[] {
  const ground = new StaticBatch(), near = new StaticBatch(), far = new StaticBatch();
  const quay = k.std('quay', () => ({ map: concreteTexture('#5b616b'), roughness: 0.55 }));
  const flood = k.glow(0xf4f7ff, 4);
  k.hplane(ground, k.road('night'), ROAD_HALF * 2, L, 0, 0, -L / 2, 1, L / 12);
  // left: container terminal
  k.hplane(ground, quay, 50, L, -(ROAD_HALF + 25), -0.005, -L / 2, 12, 15);
  for (let z = 4; z < L; z += 6.2) {
    if (Math.abs(z - 30) < 5) continue;
    const high = 1 + Math.floor(rnd(0, 3));
    for (let h = 0; h < high; h++) k.prop(near, pick(['cargo_A_stacked', 'cargo_B_stacked']), -rnd(8, 8.6) - h * 0.2, h * 5.05, -z, 5, pick([0, 1, 2, 3]) * Math.PI / 2);
    if (Math.random() < 0.5) k.prop(near, pick(['cargo_A_stacked', 'cargo_B_stacked']), -14, 0, -z, 5, 0);
  }
  for (const z of [12, 48]) k.prop(near, 'lights', -5.4, 0, -z, 5.5, Math.PI / 2);
  // right: quay edge and water
  k.hplane(ground, quay, 6, L, ROAD_HALF + 3, -0.005, -L / 2, 2, 15);
  k.box(near, k.color(0xf2b705, 0.7), 0.4, 0.3, L, ROAD_HALF + 6.1, 0.15, -L / 2);
  k.wall(far, k.concrete, L, 3, ROAD_HALF + 6.3, -3, -L / 2, 12, 1);
  for (let z = 5; z < L; z += 10) near.addGeometry(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 10), k.frame, ROAD_HALF + 5.4, 0.3, -z); // bollards
  const water = k.std('water-night', () => ({ map: waterTexture(true), roughness: 0.08, metalness: 0.7 }));
  k.hplane(far, water, 300, L, ROAD_HALF + 156, -2.2, -L / 2, 30, 6);
  k.skyline(near, far, 1, 120, -2, [], true);
  for (const z of [6, 36]) {
    k.post(near, k.steel, 0.09, 7, ROAD_HALF + 4.6, 0, -z);
    k.box(near, flood, 0.9, 0.5, 0.12, ROAD_HALF + 4.4, 7.1, -z);
  }
  // ship-to-shore gantry crane straddling the road
  for (const x of [-6.2, 6.2]) for (const dz of [-3.5, 3.5]) k.box(near, k.color(0xd9742b, 0.5, 0.4), 0.7, 17, 0.7, x, 8.5, -30 + dz);
  k.box(near, k.color(0xd9742b, 0.5, 0.4), 30, 1.3, 1.3, 6, 17.4, -33.5);
  k.box(near, k.color(0xd9742b, 0.5, 0.4), 30, 1.3, 1.3, 6, 17.4, -26.5);
  for (const x of [-6.2, 6.2]) k.box(near, k.color(0xd9742b, 0.5, 0.4), 0.7, 0.7, 7.7, x, 12, -30);
  k.box(near, k.frame, 2.2, 1.4, 2.4, 9, 16.2, -30);
  k.box(near, k.beacon, 0.4, 0.4, 0.4, -8.6, 18.3, -30);
  // waiting patrol cars with lights going
  if (v === 0) { k.policeCar(near, -4.9, 0, -18, 0.5); k.policeCar(near, 5.0, 0, -44, Math.PI - 0.45); }
  else k.policeCar(near, 5.0, 0, -14, Math.PI + 0.4);
  for (let i = 0; i < 3; i++) k.prop(near, pick(['Barrel_A', 'Barrel_B', 'Pallet_Small_Decorated_A', 'Pallet_Small']), -rnd(4.4, 5.2), 0, -rnd(3, L - 3), 0.6, rnd(0, 6));
  return done(ground, near, far);
}

/** Wall that closes the mouth of an enclosed theme (placed at a zone/segment boundary). */
export function portal(k: Kit): Part[] {
  const b = new StaticBatch();
  const m = k.std('portal', () => ({ map: concreteTexture('#74777d'), roughness: 0.9 }));
  for (const s of [-1, 1]) k.face(b, m, 60, 26, s * (TUN_W + 30), -2, 0, 12, 5);
  k.face(b, m, TUN_W * 2, 26 - TUN_H - 2, 0, TUN_H, 0, 2, 4);
  k.box(b, k.hazard, TUN_W * 2 + 0.6, 0.5, 0.3, 0, TUN_H + 0.25, 0.1);
  for (const s of [-1, 1]) k.box(b, k.concrete, 0.6, TUN_H + 0.5, 0.5, s * (TUN_W + 0.3), TUN_H / 2, 0.1);
  return b.parts(false, false);
}

const NIGHT: ThemeLook = { fog: 0x0e1424, fogNear: 35, fogFar: 170, skyTop: 0x05070f, skyMid: 0x0e1630, skyHor: 0x1c2748, sun: 0x9fb8ff, sunI: 1.0, hemiSky: 0x8fa5e8, hemiGround: 0x2a2c38, hemiI: 1.15, env: 0.3, clouds: false };

export const THEMES: Record<ThemeId, ThemeDef> = {
  city: {
    id: 'city', look: DAY, mods: { train: 0.7, block: 1 }, enclosed: false, variants: 3, variantFor: (i) => (i % 4 === 2 ? 1 : i % 2 ? 2 : 0), sideY: 0.17, ambience: 'street', build: city,
    obstacles: { jump: ['police', 'cones', 'crates'], slide: ['scaffold', 'gate'], block: ['car', 'van', 'ped', 'car>', 'car>', 'van>'], train: ['car<'] },
  },
  rail: {
    id: 'rail', look: { ...DAY, sun: 0xffe2b0, sunI: 2.7, skyTop: 0x3a8cf0 }, mods: { train: 1, block: 1 }, enclosed: false, variants: 3, sideY: 0.9, ambience: 'rail', build: rail,
    obstacles: { jump: ['barrier', 'crates'], slide: ['gate', 'boom'], block: ['traincar'], train: ['train'] },
  },
  tunnel: {
    id: 'tunnel', look: { fog: 0x15171d, fogNear: 30, fogFar: 150, skyTop: 0x15171d, skyMid: 0x15171d, skyHor: 0x15171d, sun: 0xffe2b8, sunI: 0.25, hemiSky: 0xffe6c4, hemiGround: 0x3a3c44, hemiI: 1.25, env: 0.25, clouds: false },
    mods: { train: 0.6, block: 0.9 }, enclosed: true, variants: 2, sideY: 0.35, ambience: 'tunnel', build: tunnel,
    obstacles: { jump: ['pipe', 'barrier', 'cones'], slide: ['duct', 'duct', 'gate'], block: ['van', 'car', 'car>'], train: ['van<'] },
  },
  alley: {
    id: 'alley', look: { fog: 0x6b5a78, fogNear: 40, fogFar: 190, skyTop: 0x2b2a5e, skyMid: 0x8a5a8c, skyHor: 0xf2a27a, sun: 0xff9e6b, sunI: 1.5, hemiSky: 0xc9b6e6, hemiGround: 0x4a3f4a, hemiI: 1.1, env: 0.35, clouds: false },
    mods: { train: 0, block: 1.3 }, enclosed: false, variants: 2, sideY: 0.01, ambience: 'alley', build: alley,
    obstacles: { jump: ['crates', 'tyres', 'barrels'], slide: ['scaffold', 'boom'], block: ['dumpster', 'dumpster', 'ped'], train: [] },
  },
  industrial: {
    id: 'industrial', look: { fog: 0xb9c0c6, fogNear: 50, fogFar: 210, skyTop: 0x8794a3, skyMid: 0xaab4bd, skyHor: 0xc9cfd3, sun: 0xffffff, sunI: 1.7, hemiSky: 0xdfe6ee, hemiGround: 0x77736c, hemiI: 1.3, env: 0.45, clouds: true },
    mods: { train: 0.7, block: 1 }, enclosed: false, variants: 2, sideY: 0, ambience: 'yard', build: industrial,
    obstacles: { jump: ['pallet', 'barrels', 'jersey'], slide: ['hang', 'boom'], block: ['container', 'truck', 'van>'], train: ['truck<'] },
  },
  highway: {
    id: 'highway', look: { fog: 0xffd9b0, fogNear: 80, fogFar: 280, skyTop: 0x3d6fd6, skyMid: 0xf0a070, skyHor: 0xffd9a8, sun: 0xffb070, sunI: 2.6, hemiSky: 0xffd9c0, hemiGround: 0x8a7a70, hemiI: 1.05, env: 0.5, clouds: true },
    mods: { train: 0, block: 1.25 }, enclosed: false, variants: 2, variantFor: (i) => (Math.floor(i / 6) % 2), sideY: 0, ambience: 'highway', build: highway,
    obstacles: { jump: ['jersey', 'cones'], slide: ['gate'], block: ['car>', 'car>', 'van>', 'truck>', 'car>'], train: [] },
  },
  construction: {
    id: 'construction', look: NIGHT, mods: { train: 0.5, block: 1.1 }, enclosed: false, variants: 2, sideY: 0, ambience: 'night', build: construction,
    obstacles: { jump: ['cones', 'barrier', 'jersey', 'barrels'], slide: ['scaffold', 'boom'], block: ['truck', 'container', 'dumpster'], train: ['truck<'] },
  },
  harbor: {
    id: 'harbor', look: { ...NIGHT, fog: 0x0b1a2a, fogNear: 40, fogFar: 190, skyMid: 0x0c1a33, skyHor: 0x17324d, sun: 0xa8c4ff, hemiSky: 0x8fb5e8, hemiGround: 0x25303a }, mods: { train: 0.5, block: 1 }, enclosed: false, variants: 2, sideY: 0, ambience: 'docks', build: harbor,
    obstacles: { jump: ['pallet', 'barrels', 'police'], slide: ['hang', 'boom'], block: ['container', 'van', 'police_car'], train: ['van<'] },
  },
};
