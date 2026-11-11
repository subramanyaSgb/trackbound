import * as THREE from 'three';
import type { Player } from '../player/Player';

export type CamMode = 'menu' | 'run' | 'over';

/** Damped third-person camera with menu/run/game-over poses, speed FOV and shake. */
export class FollowCamera {
  readonly cam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  private pos = new THREE.Vector3(2.4, 1.7, -4.6);
  private look = new THREE.Vector3(0, 1.1, 0);
  private tp = new THREE.Vector3();
  private tl = new THREE.Vector3();
  private shake = 0;
  private portrait = false;
  private t = 0;
  /** 0..1: how far a bottom sheet is open in the menu (frames the character higher). */
  lift = 0;
  private liftNow = 0;

  resize(w: number, h: number) {
    this.cam.aspect = w / h;
    this.portrait = h > w;
    this.cam.updateProjectionMatrix();
  }

  kick(amount: number) { this.shake = Math.max(this.shake, amount); }

  snap(p: Player, mode: CamMode) { this.target(p, mode); this.pos.copy(this.tp); this.look.copy(this.tl); }

  private target(p: Player, mode: CamMode) {
    const z = -p.d;
    if (mode === 'menu') {
      const a = Math.sin(this.t * 0.25) * 0.12 + (this.portrait ? 0.3 : 0.5);
      const r = (this.portrait ? 5.6 : 4.4) + this.liftNow * 1.6;
      this.tp.set(Math.sin(a) * r + (this.portrait ? 0 : 1.5), 1.7 + this.liftNow * 0.2, z - Math.cos(a) * r);
      this.tl.set(p.x + (this.portrait ? 0 : 1.5), (this.portrait ? 1.15 : 1.0) - this.liftNow * (this.portrait ? 1.25 : 0.5), z);
    } else if (mode === 'over') {
      this.tp.set(p.x * 0.8, 2.7, z + 4.4);
      this.tl.set(p.x, 0.4 - (this.portrait ? 1.3 : 0.3), z - 0.4);
    } else {
      const back = this.portrait ? 6.6 : 7.0;
      this.tp.set(p.x * 0.74, 4.1 + p.y * 0.4 - (p.sliding ? 0.4 : 0), z + back);
      this.tl.set(p.x * 0.86, 1.6 + p.y * 0.32, z - 9);
    }
  }

  update(dt: number, p: Player, mode: CamMode, speedFrac: number) {
    this.t += dt;
    this.liftNow += (this.lift - this.liftNow) * (1 - Math.exp(-dt * 6));
    this.target(p, mode);
    if (mode === 'run') {
      // z is locked to the player so the track never lags; x/y are eased
      const k = 1 - Math.exp(-dt * 9);
      this.pos.x += (this.tp.x - this.pos.x) * k;
      this.pos.y += (this.tp.y - this.pos.y) * k;
      this.pos.z += (this.tp.z - this.pos.z) * (1 - Math.exp(-dt * 30));
      this.look.lerp(this.tl, 1 - Math.exp(-dt * 12));
    } else {
      const k = 1 - Math.exp(-dt * 3.2);
      this.pos.lerp(this.tp, k);
      this.look.lerp(this.tl, k);
    }
    const fov = (this.portrait ? 74 : 58) + (mode === 'run' ? speedFrac * 8 : 0);
    if (Math.abs(fov - this.cam.fov) > 0.01) {
      this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 3);
      this.cam.updateProjectionMatrix();
    }
    this.cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      this.cam.position.x += (Math.random() - 0.5) * this.shake;
      this.cam.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 7);
    }
    this.cam.lookAt(this.look);
  }
}
