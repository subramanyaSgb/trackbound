import * as THREE from 'three';
import type { Assets } from '../core/Assets';

export const HORIZON = 0xd4ecff;

/** Gradient sky dome with a sun glow, plus drifting instanced clouds. */
export class Sky {
  private dome: THREE.Mesh;
  private clouds: THREE.InstancedMesh;
  private seeds: { x: number; y: number; o: number; s: number; r: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, assets: Assets) {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(380, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color(0x2f86ff) }, mid: { value: new THREE.Color(0x8fcbff) }, hor: { value: new THREE.Color(HORIZON) }, sun: { value: new THREE.Vector3(-0.37, 0.9, 0.25).normalize() } },
        vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 d; uniform vec3 top, mid, hor, sun;
          void main(){ float h = clamp(d.y, 0.0, 1.0);
            vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, h)); c = mix(c, top, smoothstep(0.2, 0.9, h));
            float s = max(dot(normalize(d), sun), 0.0);
            c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.25);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    const src = assets.mesh('cloud');
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xdfeaff, emissiveIntensity: 0.55, fog: false });
    this.clouds = new THREE.InstancedMesh(src.geometry, mat, 26);
    this.clouds.frustumCulled = false;
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      this.seeds.push({ x: side * (30 + Math.random() * 150), y: 38 + Math.random() * 45, o: Math.random() * 520, s: 14 + Math.random() * 22, r: Math.random() * 6 });
    }
    scene.add(this.clouds);
  }

  set cloudsVisible(v: boolean) { this.clouds.visible = v; }

  update(time: number, camPos: THREE.Vector3, playerD: number) {
    this.dome.position.copy(camPos);
    if (!this.clouds.visible) return;
    this.seeds.forEach((c, i) => {
      const rel = (((c.o - playerD * 0.25 - time * 1.5) % 520) + 520) % 520; // slow parallax drift
      this.p.set(c.x, c.y, -(playerD + rel - 40));
      this.s.set(c.s * 1.6, c.s * 0.55, c.s);
      this.clouds.setMatrixAt(i, this.m.compose(this.p, this.q.setFromAxisAngle(this.up, c.r), this.s));
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}
