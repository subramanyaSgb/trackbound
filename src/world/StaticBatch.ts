import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bakes many placed copies of static models into one mesh per material (few draw calls). */
export class StaticBatch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private inv = new THREE.Matrix4();

  add(src: THREE.Object3D, x: number, y: number, z: number, scale: number | THREE.Vector3 = 1, rotY = 0) {
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
    const place = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), s);
    this.inv.copy(src.matrixWorld).invert();
    src.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let g = mesh.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(this.m.multiplyMatrices(place, this.m.multiplyMatrices(this.inv, mesh.matrixWorld)));
      const mat = mesh.material as THREE.Material;
      if (!this.groups.has(mat)) this.groups.set(mat, []);
      this.groups.get(mat)!.push(g);
    });
  }

  addGeometry(g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
    let c = g.clone();
    if (c.index) c = c.toNonIndexed();
    c.translate(x, y, z);
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat)!.push(c);
  }

  build(parent: THREE.Object3D, cast = true, receive = true) {
    const out: THREE.Mesh[] = [];
    for (const [mat, geos] of this.groups) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      parent.add(mesh);
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}
