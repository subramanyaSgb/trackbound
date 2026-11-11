import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Part { geometry: THREE.BufferGeometry; material: THREE.Material; cast: boolean; receive: boolean }

const KEEP = new Set(['position', 'normal', 'uv']);
function clean(src: THREE.BufferGeometry) {
  let g = src.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (g.index) g = g.toNonIndexed();
  return g;
}

/** Bakes many placed copies of static models into one mesh per material (few draw calls). */
export class StaticBatch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private inv = new THREE.Matrix4();

  private push(mat: THREE.Material, g: THREE.BufferGeometry) {
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat)!.push(g);
  }

  /** Place a model (all its meshes). `material` overrides the model's own materials. */
  add(src: THREE.Object3D, x: number, y: number, z: number, scale: number | THREE.Vector3 = 1, rotY = 0, material?: THREE.Material) {
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
    const place = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), s);
    this.inv.copy(src.matrixWorld).invert();
    src.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = clean(mesh.geometry);
      g.applyMatrix4(this.m.multiplyMatrices(place, this.m.multiplyMatrices(this.inv, mesh.matrixWorld)));
      this.push(material ?? (mesh.material as THREE.Material), g);
    });
  }

  addGeometry(g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler) {
    const c = clean(g);
    if (rot) c.applyMatrix4(this.m.makeRotationFromEuler(rot));
    c.translate(x, y, z);
    this.push(mat, c);
  }

  get empty() { return this.groups.size === 0; }

  /** Merge into one geometry per material without creating meshes. */
  parts(cast = true, receive = true): Part[] {
    const out: Part[] = [];
    for (const [material, geos] of this.groups) {
      const geometry = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      out.push({ geometry, material, cast, receive });
    }
    this.groups.clear();
    return out;
  }

  build(parent: THREE.Object3D, cast = true, receive = true) {
    const out: THREE.Mesh[] = [];
    for (const p of this.parts(cast, receive)) {
      const mesh = new THREE.Mesh(p.geometry, p.material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      parent.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}
