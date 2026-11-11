import * as THREE from 'three';
import { StaticBatch } from './StaticBatch';

export const CAR_LEN = 7;
const LIVERIES: [number, number][] = [[0xff5a3c, 0xffe9c7], [0x2a8cff, 0xffd43b], [0x19b98a, 0xffffff], [0x8d5bff, 0xffd15c], [0xffc21a, 0x2b2f3a]];

/**
 * Original metro car built from real geometry (extruded rounded shell, inset
 * glass, doors, roof units, bogies, wheels, lights). The geometry is built
 * once and shared by every car; only the body/accent materials vary per livery.
 */
export class TrainFactory {
  private parts: { geo: THREE.BufferGeometry; slot: 'body' | 'accent' | THREE.Material }[] = [];
  private bodyMats = LIVERIES.map(([c]) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.25 }));
  private accentMats = LIVERIES.map(([, c]) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.15 }));

  constructor() {
    const body = new THREE.MeshStandardMaterial();
    const accent = new THREE.MeshStandardMaterial();
    const glass = new THREE.MeshStandardMaterial({ color: 0x0f1a2b, metalness: 1, roughness: 0.06, envMapIntensity: 1.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f28, roughness: 0.7, metalness: 0.3 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xd5dae2, roughness: 0.4, metalness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 3 });
    const red = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2010, emissiveIntensity: 2 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff9a00, emissiveIntensity: 1.6 });

    const b = new StaticBatch();
    const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => b.addGeometry(new THREE.BoxGeometry(w, h, d), m, x, y, z);
    const W = 0.89, BEVEL = 0.06, Y0 = 0.6, Y1 = 3.0, R = 0.38, Z0 = -0.15, LEN = CAR_LEN - 0.3;

    // shell: rounded cross-section extruded along the car
    const sh = new THREE.Shape();
    sh.moveTo(-W + 0.08, Y0); sh.lineTo(W - 0.08, Y0); sh.quadraticCurveTo(W, Y0, W, Y0 + 0.08);
    sh.lineTo(W, Y1 - R); sh.quadraticCurveTo(W, Y1, W - R, Y1); sh.lineTo(-W + R, Y1); sh.quadraticCurveTo(-W, Y1, -W, Y1 - R);
    sh.lineTo(-W, Y0 + 0.08); sh.quadraticCurveTo(-W, Y0, -W + 0.08, Y0);
    const shell = new THREE.ExtrudeGeometry(sh, { depth: LEN - 0.12, bevelEnabled: true, bevelSize: BEVEL, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 6 });
    b.addGeometry(shell, body, 0, 0, Z0 - LEN + 0.06);

    for (const s of [-1, 1]) {
      const x = s * (W + BEVEL + 0.006);
      box(accent, 0.02, 0.16, LEN - 0.3, x, 1.22, Z0 - LEN / 2); // waist stripe
      box(dark, 0.02, 0.24, LEN - 0.2, x, 0.74, Z0 - LEN / 2); // skirt
      const layout: ['w' | 'd', number][] = [['w', 0.75], ['d', 1.85], ['w', 2.95], ['w', 3.95], ['d', 5.05], ['w', 6.15]];
      for (const [kind, zc] of layout) {
        const z = Z0 - zc + 0.1;
        if (kind === 'w') {
          box(dark, 0.02, 0.86, 0.92, x, 1.98, z);
          box(glass, 0.03, 0.72, 0.78, x + s * 0.008, 1.98, z);
        } else {
          box(accent, 0.024, 1.86, 0.96, x, 1.72, z);
          box(dark, 0.03, 1.86, 0.03, x + s * 0.004, 1.72, z);
          for (const dz of [-0.24, 0.24]) box(glass, 0.03, 0.74, 0.34, x + s * 0.01, 2.02, z + dz);
          box(trim, 0.03, 0.05, 0.96, x + s * 0.004, 0.8, z);
        }
      }
    }
    // cab ends
    for (const [z, dir] of [[Z0, 1], [Z0 - LEN, -1]] as [number, number][]) {
      const zf = z + dir * 0.075;
      box(dark, 1.56, 1.02, 0.04, 0, 2.06, zf);
      box(glass, 1.42, 0.88, 0.05, 0, 2.06, zf + dir * 0.01);
      box(amber, 0.9, 0.15, 0.05, 0, 2.72, zf);
      box(accent, 1.7, 0.14, 0.05, 0, 1.3, zf);
      box(dark, 1.74, 0.26, 0.22, 0, 0.66, z + dir * 0.08);
      box(dark, 0.3, 0.16, 0.3, 0, 0.5, z + dir * 0.2);
      for (const sx of [-1, 1]) {
        b.addGeometry(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 14).rotateX(Math.PI / 2), white, sx * 0.62, 1.02, zf);
        b.addGeometry(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 12).rotateX(Math.PI / 2), red, sx * 0.4, 1.02, zf);
      }
    }
    // roof equipment
    for (const zc of [1.9, 5.0]) {
      box(trim, 1.2, 0.2, 1.5, 0, Y1 + 0.1, Z0 - zc);
      box(dark, 1.0, 0.04, 1.2, 0, Y1 + 0.21, Z0 - zc);
    }
    box(dark, 0.06, 0.5, 0.06, 0, Y1 + 0.3, Z0 - 3.45);
    box(dark, 1.3, 0.05, 0.08, 0, Y1 + 0.56, Z0 - 3.45);
    // running gear
    for (const zc of [1.45, 5.25]) {
      const z = Z0 - zc;
      box(dark, 1.5, 0.22, 1.9, 0, 0.36, z);
      for (const sx of [-1, 1]) for (const dz of [-0.55, 0.55]) {
        b.addGeometry(new THREE.CylinderGeometry(0.3, 0.3, 0.13, 18).rotateZ(Math.PI / 2), dark, sx * 0.62, 0.42, z + dz);
        b.addGeometry(new THREE.CylinderGeometry(0.14, 0.14, 0.15, 12).rotateZ(Math.PI / 2), trim, sx * 0.63, 0.42, z + dz);
      }
    }
    box(dark, 1.3, 0.3, 1.3, 0, 0.42, Z0 - 3.35);

    const tmp = new THREE.Group();
    for (const m of b.build(tmp)) this.parts.push({ geo: m.geometry, slot: m.material === body ? 'body' : m.material === accent ? 'accent' : (m.material as THREE.Material) });
  }

  get liveries() { return LIVERIES.length; }

  /** One car occupying local z in [-CAR_LEN, 0]. */
  car(livery: number, z = 0): THREE.Group {
    const g = new THREE.Group();
    for (const p of this.parts) {
      const mat = p.slot === 'body' ? this.bodyMats[livery] : p.slot === 'accent' ? this.accentMats[livery] : p.slot;
      const m = new THREE.Mesh(p.geo, mat);
      m.castShadow = p.slot === 'body';
      g.add(m);
    }
    g.position.z = z;
    return g;
  }
}
