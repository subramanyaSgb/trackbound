import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import type { Accessory, LookDef } from '../data/characters';

export type Clip =
  | 'Idle' | 'Unarmed_Idle' | 'Walking_A' | 'Running_A' | 'Running_B' | 'Running_Strafe_Left' | 'Running_Strafe_Right'
  | 'Jump_Start' | 'Jump_Idle' | 'Jump_Land' | 'Dodge_Forward' | 'Dodge_Left' | 'Dodge_Right'
  | 'Hit_A' | 'Hit_B' | 'Death_A' | 'Death_B' | 'Cheer' | 'Use_Item' | 'Interact' | 'PickUp' | 'Throw'
  | 'Sit_Chair_Idle' | 'Sit_Floor_Idle' | 'Sit_Floor_Down' | 'Lie_Down' | 'Lie_Idle'
  | '1H_Ranged_Aiming' | '1H_Ranged_Shoot' | 'Spellcast_Raise' | 'Spellcast_Shoot' | 'Block' | 'Blocking'
  | 'Unarmed_Melee_Attack_Punch_A' | 'Unarmed_Melee_Attack_Kick';

const ONCE = new Set<string>(['Jump_Start', 'Jump_Land', 'Dodge_Forward', 'Dodge_Left', 'Dodge_Right', 'Hit_A', 'Hit_B', 'Death_A', 'Death_B', 'Use_Item', 'Interact', 'PickUp', 'Throw',
  'Sit_Floor_Down', 'Lie_Down', '1H_Ranged_Shoot', 'Spellcast_Raise', 'Spellcast_Shoot', 'Block', 'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick']);

const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

/**
 * One skinned character: model + mixer + cross-fading clip player, plus
 * procedural layers applied on top of the clips every frame (whole-body pitch
 * for slides and flight, torso lean, arm sweep, head turn, squash and stretch).
 *
 * Hierarchy: root (world position/yaw) > pitch (tilt about the hips) > model.
 */
export class Rig {
  readonly root = new THREE.Group();
  readonly pitch = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private bones: Record<string, THREE.Object3D | undefined> = {};
  private meshes: THREE.Mesh[] = [];
  current: Clip | '' = '';
  /** Procedural layers (radians / 0..1); eased by the owner, applied here. */
  lean = 0;
  armsBack = 0;
  headYaw = 0;
  /** Vertical squash (1 = none): <1 crouches, >1 stretches. Volume is preserved. */
  squash = 1;

  constructor(readonly model: THREE.Object3D, clips: THREE.AnimationClip[], readonly look: LookDef, assets: Assets) {
    this.root.add(this.pitch);
    this.pitch.add(model);
    // size by the body only, so hats and helmets do not shrink the character
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh && /Body|Leg|Head/.test(o.name) && !/Hat|Helmet/.test(o.name)) box.expandByObject(o); });
    if (box.isEmpty()) box.setFromObject(model);
    model.scale.setScalar(look.height / (box.max.y - box.min.y));
    model.rotation.y = Math.PI; // models face +Z; the track runs toward -Z

    const hide = new RegExp(look.hide);
    const skin = assets.skin(look);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((o as THREE.Bone).isBone) this.bones[o.name] = o;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      m.material = skin;
      if (hide.test(m.name)) m.visible = false;
      this.meshes.push(m);
    });
    for (const a of look.accessories) this.accessorize(a, assets);

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      const a = this.mixer.clipAction(clip);
      if (ONCE.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(clip.name, a);
    }
  }

  /** Show or hide meshes by name (capes, helmets). */
  show(pattern: string, visible: boolean) {
    const re = new RegExp(pattern);
    for (const m of this.meshes) if (re.test(m.name)) m.visible = visible;
  }

  play(name: Clip, fade = 0.12, timeScale = 1, from = 0, restart = false) {
    if (this.current === name && !restart) { this.actions.get(name)?.setEffectiveTimeScale(timeScale); return; }
    const next = this.actions.get(name);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset();
    next.time = from;
    next.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    this.current = name;
  }

  rate(scale: number) { if (this.current) this.actions.get(this.current)?.setEffectiveTimeScale(scale); }

  stop() { this.mixer.stopAllAction(); this.current = ''; }

  /** Rotate a bone about an axis given in model space, on top of the clip pose. */
  private twist(bone: THREE.Object3D | undefined, axis: THREE.Vector3, angle: number) {
    if (!bone || !bone.parent || Math.abs(angle) < 1e-4) return;
    this.model.getWorldQuaternion(_q);
    _axis.copy(axis).applyQuaternion(_q);
    bone.parent.getWorldQuaternion(_pq);
    _axis.applyQuaternion(_pq.invert()); // axis in the bone's parent space
    bone.quaternion.premultiply(_q.setFromAxisAngle(_axis, angle));
  }

  update(dt: number) {
    this.mixer.update(dt);
    if (this.lean) this.twist(this.bones.spine, X, this.lean);
    if (this.armsBack) {
      this.twist(this.bones.upperarml, X, this.armsBack * 1.15);
      this.twist(this.bones.upperarmr, X, this.armsBack * 1.15);
    }
    if (this.headYaw) this.twist(this.bones.head, Y, this.headYaw);
    const s = this.squash;
    this.pitch.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
  }

  // ---------------------------------------------------------------- accessories
  private accessorize(kind: Accessory, assets: Assets) {
    const head = this.bones.head;
    const chest = this.bones.chest ?? this.bones.spine;
    if (!head || !chest) return;
    // measure the (visible) head in model space to fit accessories to any body
    const hb = new THREE.Box3();
    this.model.traverse((o) => { if ((o as THREE.Mesh).isMesh && /Head/.test(o.name) && o.visible) hb.expandByObject(o); });
    const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
    hb.applyMatrix4(inv);
    const c = hb.getCenter(new THREE.Vector3());
    const r = (hb.max.x - hb.min.x) / 2;
    const top = hb.max.y;
    const g = assets.accessory(kind, this.look.color, r);
    const holder = new THREE.Group();
    holder.add(g);
    if (kind === 'sack') {
      const cp = chest.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      holder.position.set(cp.x + r * 0.25, cp.y + r * 0.15, cp.z - r * 0.95);
    } else if (kind === 'cap' || kind === 'beanie') holder.position.set(c.x, top - r * 0.1, c.z);
    else if (kind === 'headband') holder.position.set(c.x, top - r * 0.42, c.z);
    else if (kind === 'visor') holder.position.set(c.x, c.y + r * 0.02, c.z);
    else holder.position.set(c.x, c.y - r * 0.42, c.z); // mask (bandana over the lower face)
    this.model.add(holder);
    holder.updateMatrixWorld(true);
    (kind === 'sack' ? chest : head).attach(holder); // keeps the fitted placement, then follows the bone
    holder.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
  }
}
