// Rae Solano, built from low-poly parts with a proper hip / knee / shoulder /
// elbow hierarchy. The rig is deliberately simple, but the walk cycle, run
// lean, idle breath and jump tuck make her read at screenshot distance.

import * as THREE from '../vendor/three.module.js';

const damp = THREE.MathUtils.damp;
const clamp = THREE.MathUtils.clamp;

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0.04,
    ...options,
  });
}

function box(width, height, depth, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class Humanoid {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'rae-solano';
    this.phase = 0;
    this.idleTime = 0;
    this.motion = 0;
    this.air = 0;

    const jacket = material(0xdf5961, { roughness: 0.72 });
    const jacketDark = material(0x9c3b45, { roughness: 0.8 });
    const shirt = material(0x251f2e, { roughness: 0.88 });
    const pants = material(0x1e1b2c, { roughness: 0.9 });
    const denim = material(0x2d2941, { roughness: 0.92 });
    const skin = material(0xb87a60, { roughness: 0.82 });
    const hair = material(0x28161d, { roughness: 0.92 });
    const teal = material(0x3ec8b9, { roughness: 0.66 });
    const cream = material(0xefe1c8, { roughness: 0.82 });
    const sole = material(0xd64d58, { roughness: 0.8 });
    const dark = material(0x1b1822, { roughness: 0.86 });
    const steel = material(0x7b7987, { roughness: 0.44, metalness: 0.55 });

    // Hips and torso. The torso group leans and bobs; the legs hang off the root.
    const hips = box(0.4, 0.2, 0.26, pants, 0, 0.93, 0);
    this.group.add(hips);
    const belt = box(0.41, 0.055, 0.27, dark, 0, 1.035, 0);
    this.group.add(belt);

    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.98, 0);
    this.group.add(this.torso);

    const chest = box(0.48, 0.56, 0.29, jacket, 0, 0.3, 0);
    this.torso.add(chest);
    const shoulder = box(0.53, 0.15, 0.28, jacketDark, 0, 0.55, 0);
    this.torso.add(shoulder);
    const zip = box(0.026, 0.44, 0.012, jacketDark, 0, 0.31, 0.151);
    this.torso.add(zip);
    const collar = box(0.34, 0.07, 0.3, teal, 0, 0.6, 0);
    this.torso.add(collar);
    const undershirt = box(0.18, 0.3, 0.012, shirt, 0, 0.32, 0.152);
    this.torso.add(undershirt);

    // Messenger bag and strap: the courier silhouette.
    const bag = box(0.28, 0.28, 0.13, dark, 0.28, 0.05, -0.1);
    bag.rotation.z = -0.06;
    this.torso.add(bag);
    const bagFlap = box(0.26, 0.12, 0.02, teal, 0.28, 0.13, -0.166);
    bagFlap.rotation.z = -0.06;
    this.torso.add(bagFlap);
    const strap = box(0.055, 0.82, 0.025, teal, 0.02, 0.22, 0.162);
    strap.rotation.z = 0.48;
    this.torso.add(strap);

    // Head and hair.
    this.head = new THREE.Group();
    this.head.position.set(0, 0.72, 0);
    this.torso.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.13, 8), skin);
    neck.position.y = -0.02;
    neck.castShadow = true;
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 11), skin);
    skull.scale.set(0.94, 1.06, 0.92);
    skull.position.y = 0.12;
    skull.castShadow = true;
    this.head.add(skull);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.183, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
    hairCap.scale.set(1.0, 1.07, 0.98);
    hairCap.position.set(0, 0.155, -0.015);
    hairCap.castShadow = true;
    this.head.add(hairCap);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hair);
    bun.position.set(0, 0.155, -0.185);
    bun.scale.set(1, 0.9, 0.9);
    bun.castShadow = true;
    this.head.add(bun);
    const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.02, 0.3, 6), hair);
    ponytail.position.set(0.03, 0.01, -0.22);
    ponytail.rotation.x = -0.55;
    ponytail.rotation.z = 0.18;
    ponytail.castShadow = true;
    this.head.add(ponytail);
    const visor = box(0.255, 0.055, 0.035, dark, 0, 0.135, 0.148);
    visor.rotation.x = -0.04;
    this.head.add(visor);
    const visorShine = box(0.09, 0.018, 0.004, teal, -0.045, 0.144, 0.168);
    this.head.add(visorShine);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), skin);
    ear.position.set(0.165, 0.11, -0.01);
    this.head.add(ear);

    // Arms.
    this.arms = {};
    for (const side of [-1, 1]) {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(side * 0.305, 0.53, 0);
      this.torso.add(shoulderPivot);
      const upper = box(0.14, 0.34, 0.16, jacket, 0, -0.16, 0);
      shoulderPivot.add(upper);
      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.335, 0);
      shoulderPivot.add(elbowPivot);
      const forearm = box(0.12, 0.3, 0.13, jacketDark, 0, -0.15, 0);
      elbowPivot.add(forearm);
      const cuff = box(0.125, 0.05, 0.135, teal, 0, -0.3, 0);
      elbowPivot.add(cuff);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 6, 5), skin);
      hand.scale.set(0.8, 1.05, 0.72);
      hand.position.set(0, -0.365, 0.015);
      hand.castShadow = true;
      elbowPivot.add(hand);
      this.arms[side === -1 ? 'left' : 'right'] = { shoulderPivot, elbowPivot };
    }

    // Legs.
    this.legs = {};
    for (const side of [-1, 1]) {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(side * 0.135, 0.92, 0);
      this.group.add(hipPivot);
      const thigh = box(0.17, 0.44, 0.2, denim, 0, -0.22, 0);
      hipPivot.add(thigh);
      const thighStripe = box(0.018, 0.4, 0.01, teal, side * 0.088, -0.22, 0.1);
      hipPivot.add(thighStripe);
      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -0.44, 0);
      hipPivot.add(kneePivot);
      const shin = box(0.15, 0.4, 0.17, pants, 0, -0.2, 0);
      kneePivot.add(shin);
      const shoe = box(0.185, 0.105, 0.31, cream, 0, -0.425, 0.065);
      kneePivot.add(shoe);
      const shoeSole = box(0.19, 0.035, 0.32, sole, 0, -0.475, 0.065);
      kneePivot.add(shoeSole);
      this.legs[side === -1 ? 'left' : 'right'] = { hipPivot, kneePivot };
    }

    // A holstered sidearm for the silhouette; it becomes usable later.
    const holster = box(0.09, 0.2, 0.08, dark, -0.27, 0.02, -0.01);
    holster.rotation.z = 0.08;
    this.torso.add(holster);
    const grip = box(0.035, 0.09, 0.055, steel, -0.29, 0.13, -0.01);
    grip.rotation.z = 0.2;
    this.torso.add(grip);

    this.group.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.baseTorsoY = this.torso.position.y;
  }

  setFacing(angle) {
    this.group.rotation.y = angle;
  }

  update(dt, speed, airborne) {
    const speed01 = clamp(speed / 8.1, 0, 1.25);
    const moving = speed > 0.12;
    this.motion = damp(this.motion, moving ? clamp(speed / 4.15, 0.35, 1.8) : 0, 9, dt);
    this.air = damp(this.air, airborne ? 1 : 0, 9, dt);
    this.idleTime += dt;
    if (moving) this.phase += dt * (5.1 + speed * 0.82);

    const stride = clamp(this.motion, 0, 1.6);
    const amp = 0.42 + stride * 0.33;
    const swing = Math.sin(this.phase) * amp;
    const counter = Math.sin(this.phase + Math.PI) * amp;
    const kneeLeft = Math.max(0, Math.sin(this.phase + 0.82)) * (0.36 + stride * 0.58);
    const kneeRight = Math.max(0, Math.sin(this.phase + Math.PI + 0.82)) * (0.36 + stride * 0.58);
    const airTuck = this.air;

    this.legs.left.hipPivot.rotation.x = swing * (1 - airTuck) + airTuck * -0.5;
    this.legs.right.hipPivot.rotation.x = counter * (1 - airTuck) + airTuck * 0.35;
    this.legs.left.kneePivot.rotation.x = kneeLeft * (1 - airTuck) + airTuck * 0.95;
    this.legs.right.kneePivot.rotation.x = kneeRight * (1 - airTuck) + airTuck * 0.7;

    this.arms.left.shoulderPivot.rotation.x = counter * 0.72 * (1 - airTuck) - airTuck * 0.9;
    this.arms.right.shoulderPivot.rotation.x = swing * 0.72 * (1 - airTuck) - airTuck * 0.55;
    this.arms.left.shoulderPivot.rotation.z = 0.055 + airTuck * 0.45;
    this.arms.right.shoulderPivot.rotation.z = -0.055 - airTuck * 0.65;
    this.arms.left.elbowPivot.rotation.x = -0.12 - Math.max(0, swing) * 0.28 - airTuck * 0.25;
    this.arms.right.elbowPivot.rotation.x = -0.12 - Math.max(0, counter) * 0.28 - airTuck * 0.35;

    const bob = Math.abs(Math.sin(this.phase)) * 0.038 * stride;
    const breath = Math.sin(this.idleTime * 1.7) * 0.006 * (1 - clamp(this.motion, 0, 1));
    this.torso.position.y = this.baseTorsoY + bob + breath - airTuck * 0.035;
    this.torso.rotation.x = stride * 0.075 + airTuck * 0.12;
    this.torso.rotation.z = Math.sin(this.phase) * 0.026 * stride;
    this.head.rotation.x = -stride * 0.04 + Math.sin(this.phase * 0.5) * 0.012;
    this.head.rotation.y = Math.sin(this.idleTime * 0.42) * 0.055 * (1 - clamp(this.motion, 0, 1));
  }
}
