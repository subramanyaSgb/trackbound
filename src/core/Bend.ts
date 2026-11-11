import * as THREE from 'three';

/**
 * Curved-world rendering. The simulation runs on a straight track; every
 * built-in material is patched so vertices are displaced sideways and
 * vertically by the square of their distance ahead of the player. The road
 * therefore sweeps into bends, climbs and dips on screen while gameplay,
 * collision and spawning stay exact. Shadows use the same displacement.
 *
 * x: sideways curvature, y: vertical curvature, z: world z the bend is measured from.
 */
export const BEND = { value: new THREE.Vector4(0, 0, 0, 0) };

const FN = `
uniform vec4 uBend;
vec4 bendWorld( vec4 wp ) {
	float bz = min( 0.0, wp.z - uBend.z );
	float b2 = bz * bz;
	wp.x += uBend.x * b2;
	wp.y += uBend.y * b2;
	return wp;
}
`;

let installed = false;
export function installBend() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;
  C.common = C.common + '\n#ifndef BEND_FN\n#define BEND_FN\n' + FN + '\n#endif\n';
  C.project_vertex = C.project_vertex.replace(
    'mvPosition = modelViewMatrix * mvPosition;',
    'mvPosition = viewMatrix * bendWorld( modelMatrix * mvPosition );',
  );
  C.worldpos_vertex = C.worldpos_vertex.replace(
    'worldPosition = modelMatrix * worldPosition;',
    'worldPosition = bendWorld( modelMatrix * worldPosition );',
  );
  if (!C.project_vertex.includes('bendWorld') || !C.worldpos_vertex.includes('bendWorld')) throw new Error('three.js shader chunks changed: curved-world patch did not apply');
  // every material (including the internal shadow depth material) receives the shared uniform
  THREE.Material.prototype.onBeforeCompile = function (shader) { shader.uniforms.uBend = BEND; };
}

/** GLSL for hand-written ShaderMaterials that should follow the bend (pass uBend: BEND as a uniform). */
export const BEND_GLSL = FN;

/**
 * Smoothly wandering curvature. Strengths come from the current zone; the
 * values drift between random targets so bends and hills arrive and leave gradually.
 */
export class BendDriver {
  private x = 0;
  private y = 0;
  private tx = 0;
  private ty = 0;
  private nextAt = 0;
  private seed = 7;

  private rand() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  reset(d = 0) { this.x = this.y = this.tx = this.ty = 0; this.nextAt = d + 60; }

  update(dt: number, d: number, originZ: number, curve: number, hills: number) {
    if (d >= this.nextAt) {
      this.nextAt = d + 140 + this.rand() * 260;
      const r = this.rand();
      // a third of the time the road runs straight
      this.tx = r < 0.33 ? 0 : (this.rand() < 0.5 ? -1 : 1) * (0.35 + this.rand() * 0.65) * 0.0011 * curve;
      this.ty = (this.rand() - 0.62) * 0.0009 * hills;
    }
    const k = 1 - Math.exp(-dt * 0.55);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    BEND.value.set(this.x, this.y, originZ, 0);
  }

  /** Flatten immediately (menus, cinematics). */
  flat(originZ: number) { this.x = this.y = this.tx = this.ty = 0; BEND.value.set(0, 0, originZ, 0); }
}
