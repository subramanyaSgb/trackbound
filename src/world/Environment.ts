import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { CFG, laneX } from '../core/config';
import { StaticBatch } from './StaticBatch';
import { adTexture, ballastTexture, pavingTexture, signTexture } from './textures';

const N_CHUNKS = 6;
const STATIONS = ['HOLLOW ST', 'EMBER YARD', 'KITE MARKET', 'NORTH QUAY', 'LANTERN ROW', 'OLD FOUNDRY'];
const BUILDINGS = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
const PLATFORM_Y = 0.9;
const TRACK_HALF = 3.6;

/**
 * Recycled 60 m world chunks. Track bed, rails and platforms share geometry
 * across chunks; each chunk bakes its own randomised city (buildings, lamps,
 * benches, trees, bins, billboards) into a couple of merged meshes.
 */
export class Environment {
  private chunks: THREE.Group[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, assets: Assets) {
    const L = CFG.chunkLen;
    const ballastMap = ballastTexture();
    ballastMap.repeat.set(4, 34);
    const pavingMap = pavingTexture();
    pavingMap.repeat.set(22, 30);
    const mBallast = new THREE.MeshStandardMaterial({ map: ballastMap, roughness: 1 });
    const mPaving = new THREE.MeshStandardMaterial({ map: pavingMap, roughness: 0.9 });
    const mRail = new THREE.MeshStandardMaterial({ color: 0xaab2bd, metalness: 1, roughness: 0.28 });
    const mSleeper = new THREE.MeshStandardMaterial({ color: 0x6b5a4c, roughness: 0.95 });
    const mConcrete = new THREE.MeshStandardMaterial({ color: 0xa9a297, roughness: 0.9 });
    const mEdge = new THREE.MeshStandardMaterial({ color: 0xffc928, roughness: 0.7 });
    const mSteel = new THREE.MeshStandardMaterial({ color: 0x39414f, metalness: 0.7, roughness: 0.45 });
    const mFrame = new THREE.MeshStandardMaterial({ color: 0x22262f, metalness: 0.5, roughness: 0.5 });

    // ---- geometry shared by every chunk
    const common = new StaticBatch();
    common.addGeometry(new THREE.PlaneGeometry(TRACK_HALF * 2, L).rotateX(-Math.PI / 2), mBallast, 0, 0, -L / 2);
    const railHead = new THREE.BoxGeometry(0.075, 0.05, L);
    const railWeb = new THREE.BoxGeometry(0.025, 0.09, L);
    const railFoot = new THREE.BoxGeometry(0.15, 0.025, L);
    const sleeper = new THREE.BoxGeometry(1.7, 0.1, 0.24);
    const clip = new THREE.BoxGeometry(0.2, 0.04, 0.12);
    for (let l = 0; l < 3; l++) {
      for (const s of [-0.55, 0.55]) {
        common.addGeometry(railHead, mRail, laneX(l) + s, 0.2, -L / 2);
        common.addGeometry(railWeb, mRail, laneX(l) + s, 0.13, -L / 2);
        common.addGeometry(railFoot, mRail, laneX(l) + s, 0.085, -L / 2);
      }
      for (let z = 0.375; z < L; z += 0.75) {
        common.addGeometry(sleeper, mSleeper, laneX(l), 0.03, -z);
        for (const s of [-0.55, 0.55]) common.addGeometry(clip, mFrame, laneX(l) + s, 0.09, -z);
      }
      common.addGeometry(new THREE.BoxGeometry(0.035, 0.035, L), mFrame, laneX(l), 6.1, -L / 2);
    }
    for (const s of [-1, 1]) {
      common.addGeometry(new THREE.PlaneGeometry(46, L).rotateX(-Math.PI / 2), mPaving, s * (TRACK_HALF + 23), PLATFORM_Y, -L / 2);
      common.addGeometry(new THREE.PlaneGeometry(L, PLATFORM_Y).rotateY(-s * Math.PI / 2), mConcrete, s * TRACK_HALF, PLATFORM_Y / 2, -L / 2);
      common.addGeometry(new THREE.BoxGeometry(0.45, 0.03, L), mEdge, s * (TRACK_HALF + 0.3), PLATFORM_Y + 0.012, -L / 2);
      common.addGeometry(new THREE.BoxGeometry(0.12, 0.08, L), mConcrete, s * (TRACK_HALF + 0.02), PLATFORM_Y + 0.02, -L / 2);
      // catenary portal
      common.addGeometry(new THREE.BoxGeometry(0.28, 7, 0.28), mSteel, s * (TRACK_HALF + 0.75), PLATFORM_Y + 3.5, -30);
      common.addGeometry(new THREE.BoxGeometry(0.6, 0.12, 0.6), mSteel, s * (TRACK_HALF + 0.75), PLATFORM_Y + 0.06, -30);
    }
    common.addGeometry(new THREE.BoxGeometry(TRACK_HALF * 2 + 2, 0.22, 0.22), mSteel, 0, 7.6, -30);
    common.addGeometry(new THREE.BoxGeometry(TRACK_HALF * 2 + 2, 0.12, 0.12), mSteel, 0, 6.9, -30);
    for (let x = -4; x <= 4; x += 1) common.addGeometry(new THREE.BoxGeometry(0.06, 0.7, 0.06), mSteel, x, 7.25, -30);
    for (let l = 0; l < 3; l++) common.addGeometry(new THREE.BoxGeometry(0.06, 0.75, 0.06), mFrame, laneX(l), 6.5, -30);
    const holder = new THREE.Group();
    const shared = common.build(holder, false, true);

    const signGeo = new THREE.PlaneGeometry(3.4, 0.85);
    const adGeo = new THREE.PlaneGeometry(6, 3);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    for (let c = 0; c < N_CHUNKS; c++) {
      const g = new THREE.Group();
      for (const m of shared) {
        const mesh = new THREE.Mesh(m.geometry, m.material);
        mesh.receiveShadow = true;
        mesh.castShadow = m.material === mSteel;
        g.add(mesh);
      }
      const deco = new StaticBatch();
      const far = new StaticBatch();
      for (const s of [-1, 1]) {
        const face = s < 0 ? Math.PI / 2 : -Math.PI / 2;
        // front row of buildings + taller skyline row behind
        for (let i = 0; i < 4; i++) {
          const sc = rnd(6.4, 7.4);
          deco.add(assets.prop(pick(BUILDINGS)), s * (10.2 + sc), PLATFORM_Y, -(7.5 + i * 15), new THREE.Vector3(sc, sc * rnd(0.95, 1.5), sc), face);
        }
        for (let i = 0; i < 3; i++) {
          const sc = rnd(9, 11);
          far.add(assets.prop(pick(BUILDINGS)), s * (27 + sc), PLATFORM_Y, -(10 + i * 20), new THREE.Vector3(sc, sc * rnd(1.4, 2.4), sc), face + (Math.random() < 0.5 ? Math.PI : 0));
        }
        for (let z = 7.5; z < L; z += 15) deco.add(assets.prop('streetlight'), s * (TRACK_HALF + 1.1), PLATFORM_Y, -z, 6.2, s > 0 ? 0 : Math.PI);
        for (const z of [14, 44]) {
          deco.add(assets.prop('bench'), s * 8.3, PLATFORM_Y, -(z + rnd(-2, 2)), 5.2, face);
          deco.add(assets.prop(pick(['trash_A', 'trash_B'])), s * 8.4, PLATFORM_Y, -(z + 2.6), 4.5, rnd(0, 6));
        }
        for (let i = 0; i < 3; i++) deco.add(assets.prop(pick(['trees', 'trees_tall'])), s * rnd(8.8, 9.4), PLATFORM_Y - 0.02, -(rnd(3, 8) + i * 20), rnd(3.8, 4.8), pick([0, 1, 2, 3]) * Math.PI / 2);
        for (let i = 0; i < 5; i++) deco.add(assets.prop('bush'), s * rnd(6.4, 8.8), PLATFORM_Y, -rnd(1, L - 1), rnd(3.4, 5), rnd(0, 6));
        const extra = pick(['dumpster', 'firehydrant', 'box_A', 'trafficlight_A']);
        deco.add(assets.prop(extra), s * rnd(7.4, 8.6), PLATFORM_Y, -rnd(24, 36), extra === 'dumpster' ? 4.2 : 5, extra === 'trafficlight_A' ? (s > 0 ? Math.PI : 0) : rnd(0, 6));
        if (Math.random() < 0.6) deco.add(assets.prop(pick(['car_taxi', 'car_sedan', 'car_hatchback', 'car_police', 'car_stationwagon'])), s * rnd(8.8, 9.4), PLATFORM_Y + 0.3, -rnd(50, 56), 4.6, s > 0 ? 0 : Math.PI);

        // station name board (original artwork)
        const signZ = -(22 + (s > 0 ? 8 : 0));
        deco.addGeometry(new THREE.BoxGeometry(0.1, 3, 0.1), mFrame, s * 6.2, PLATFORM_Y + 1.5, signZ - 1.5);
        deco.addGeometry(new THREE.BoxGeometry(0.1, 3, 0.1), mFrame, s * 6.2, PLATFORM_Y + 1.5, signZ + 1.5);
        deco.addGeometry(new THREE.BoxGeometry(0.12, 1, 3.6), mFrame, s * 6.2, PLATFORM_Y + 2.7, signZ);
        const sign = new THREE.Mesh(signGeo, new THREE.MeshStandardMaterial({ map: signTexture(STATIONS[c], '#16306e', '#ffffff', 'PLATFORM ' + (s > 0 ? 2 : 1)), roughness: 0.5 }));
        sign.position.set(s * 6.13, PLATFORM_Y + 2.7, signZ);
        sign.rotation.y = -s * Math.PI / 2;
        g.add(sign);
      }
      // one billboard per chunk, angled toward the approaching player
      const bs = c % 2 ? 1 : -1;
      const bz = -rnd(36, 44);
      const board = new THREE.Group();
      board.position.set(bs * 9.6, PLATFORM_Y, bz);
      board.rotation.y = -bs * 0.95;
      const ad = new THREE.Mesh(adGeo, new THREE.MeshStandardMaterial({ map: adTexture(c), roughness: 0.6, emissive: 0xffffff, emissiveMap: adTexture(c), emissiveIntensity: 0.12 }));
      ad.position.set(0, 5.4, 0.12);
      const back = new THREE.Mesh(new THREE.BoxGeometry(6.3, 3.3, 0.2), mFrame);
      back.position.y = 5.4;
      back.castShadow = true;
      board.add(ad, back);
      for (const x of [-2, 2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.8, 0.22), mSteel);
        post.position.set(x, 1.9, -0.1);
        post.castShadow = true;
        board.add(post);
      }
      g.add(board);
      deco.build(g, true, true);
      far.build(g, false, false);
      this.chunks.push(g);
      scene.add(g);
    }
    this.reset();
  }

  reset() {
    this.next = -1;
    for (const c of this.chunks) this.place(c);
  }

  private place(c: THREE.Group) {
    c.userData.index = this.next;
    c.position.z = -this.next * CFG.chunkLen;
    this.next++;
  }

  update(playerD: number) {
    for (const c of this.chunks) if ((c.userData.index + 1) * CFG.chunkLen < playerD - 25) this.place(c);
  }
}
