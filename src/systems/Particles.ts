import * as THREE from 'three';
import { softDot } from '../world/textures';

const MAX = 360;

/** One pooled point cloud for every burst effect (coins, dust, impacts, pickups). */
export class Particles {
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private span = new Float32Array(MAX);
  private base = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private cursor = 0;
  private points: THREE.Points;
  private c = new THREE.Color();
  budget = 1; // scaled by graphics quality

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { map: { value: softDot() }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vc; uniform float scale;
        void main(){ vc = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vc;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vc.rgb, vc.a * t.a);
        #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  resize(h: number) { (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = h * 0.9; }

  burst(x: number, y: number, z: number, color: number, count: number, speed: number, size: number, life: number, gravity = 6, up = 1) {
    const n = Math.max(1, Math.round(count * this.budget));
    this.c.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2, e = Math.random();
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(a) * speed * e, (Math.random() * 0.8 + 0.2) * speed * up, Math.sin(a) * speed * e], i * 3);
      this.col.set([this.c.r, this.c.g, this.c.b, 1], i * 4);
      this.life[i] = this.span[i] = life * (0.6 + Math.random() * 0.4);
      this.base[i] = size * (0.6 + Math.random() * 0.6);
      this.grav[i] = gravity;
    }
  }

  /** `carry` moves live particles with the player so bursts do not fall behind at speed. */
  update(dt: number, carry: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.span[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt - carry;
      this.col[i * 4 + 3] = t;
      this.size[i] = this.life[i] > 0 ? this.base[i] * (0.4 + t * 0.6) : 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
  }
}
