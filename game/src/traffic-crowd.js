// The pedestrian renderer: nine instanced meshes (torso, head, hair, arms,
// legs, hat, bag) sharing one fixed 168-slot pool, so any number of live
// walkers still costs nine draw calls. Traffic owns the slots and simulation;
// this module only writes matrices and colours.

import * as THREE from '../vendor/three.module.js';

export const MAX_PEDS = 168;
const TAU = Math.PI * 2;

export class Crowd {
  constructor(scene, capacity = MAX_PEDS) {
    this.capacity = capacity;
    this.meshes = {};

    const torsoGeometry = new THREE.BoxGeometry(0.4, 0.54, 0.25);
    torsoGeometry.translate(0, 0.27, 0);
    const headGeometry = new THREE.SphereGeometry(0.157, 8, 6);
    headGeometry.translate(0, 0.16, 0);
    headGeometry.scale(0.94, 1.03, 0.92);
    const hairGeometry = new THREE.SphereGeometry(0.165, 8, 5, 0, TAU, 0, Math.PI * 0.58);
    hairGeometry.translate(0, 0.17, 0);
    const armGeometry = new THREE.BoxGeometry(0.11, 0.49, 0.12);
    armGeometry.translate(0, -0.245, 0);
    const legGeometry = new THREE.BoxGeometry(0.145, 0.78, 0.165);
    legGeometry.translate(0, -0.39, 0);
    const hatGeometry = new THREE.CylinderGeometry(0.15, 0.185, 0.1, 8);
    hatGeometry.translate(0, 0.05, 0);
    // A shopping bag hangs from the right hand on the walk to the food court.
    const bagGeometry = new THREE.BoxGeometry(0.22, 0.2, 0.12);

    const makeMaterial = (roughness, metalness = 0.02) => new THREE.MeshStandardMaterial({ roughness, metalness });
    const materials = {
      torso: makeMaterial(0.88),
      head: makeMaterial(0.7),
      hair: makeMaterial(0.96),
      arm: makeMaterial(0.9),
      leg: makeMaterial(0.92),
      hat: makeMaterial(0.82),
      bag: makeMaterial(0.8),
    };

    const parts = {
      torso: [torsoGeometry, materials.torso],
      head: [headGeometry, materials.head],
      hair: [hairGeometry, materials.hair],
      armLeft: [armGeometry, materials.arm],
      armRight: [armGeometry, materials.arm],
      legLeft: [legGeometry, materials.leg],
      legRight: [legGeometry, materials.leg],
      hat: [hatGeometry, materials.hat],
      bag: [bagGeometry, materials.bag],
    };

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [name, [geometry, material]] of Object.entries(parts)) {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      for (let i = 0; i < capacity; i += 1) {
        mesh.setMatrixAt(i, zero);
        mesh.setColorAt(i, new THREE.Color(0xffffff));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      this.meshes[name] = mesh;
    }
    this.zero = zero;
    this._base = new THREE.Matrix4();
    this._local = new THREE.Matrix4();
    this._out = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._color = new THREE.Color();
  }

  setColors(slot, spec) {
    this.meshes.torso.setColorAt(slot, this._color.setHex(spec.cloth));
    this.meshes.armLeft.setColorAt(slot, this._color.setHex(spec.cloth).multiplyScalar(0.86));
    this.meshes.armRight.setColorAt(slot, this._color.setHex(spec.cloth).multiplyScalar(0.86));
    this.meshes.legLeft.setColorAt(slot, this._color.setHex(spec.pants));
    this.meshes.legRight.setColorAt(slot, this._color.setHex(spec.pants));
    this.meshes.head.setColorAt(slot, this._color.setHex(spec.skin));
    this.meshes.hair.setColorAt(slot, this._color.setHex(spec.hair));
    this.meshes.hat.setColorAt(slot, this._color.setHex(spec.hatColor));
    this.meshes.bag.setColorAt(slot, this._color.setHex(spec.bagColor ?? 0x3a2a44));
    for (const mesh of Object.values(this.meshes)) mesh.instanceColor.needsUpdate = true;
  }

  hide(slot) {
    for (const mesh of Object.values(this.meshes)) {
      mesh.setMatrixAt(slot, this.zero);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  write(ped) {
    if (!ped.active) return;
    const slot = ped.slot;
    const seated = Boolean(ped.sitting);
    const bob = seated ? 0 : Math.abs(Math.sin(ped.phase)) * 0.034 * ped.motion;
    const scale = ped.scale;
    const fall = ped.fall ?? 0;
    this._euler.set(-fall * 1.45, ped.yaw, 0);
    this._quaternion.setFromEuler(this._euler);
    this._position.set(ped.x, ped.y + bob + 0.12 * fall, ped.z);
    this._scale.set(scale, scale, scale);
    this._base.compose(this._position, this._quaternion, this._scale);

    const swing = seated ? 0 : Math.sin(ped.phase) * 0.6 * ped.motion;
    const arms = swing * 0.78;
    // A seated body drops to chair height, thighs forward and hands on the
    // knees. Standing keeps the original eight-part walk pose.
    this.writePart('torso', slot, 0, seated ? 0.62 : 0.84, 0, 0.04);
    this.writePart('head', slot, 0, seated ? 1.08 : 1.36, 0, 0);
    this.writePart('hair', slot, 0, seated ? 1.09 : 1.37, 0, 0);
    this.writePart('legLeft', slot, 0.102, seated ? 0.62 : 0.83, 0, seated ? -1.36 : swing);
    this.writePart('legRight', slot, -0.102, seated ? 0.62 : 0.83, 0, seated ? -1.36 : -swing);
    this.writePart('armLeft', slot, 0.262, seated ? 1.04 : 1.3, 0, seated ? -0.52 : -arms);
    this.writePart('armRight', slot, -0.262, seated ? 1.04 : 1.3, 0, seated ? -0.52 : arms);
    if (ped.hat) {
      this.writePart('hat', slot, 0, seated ? 1.3 : 1.61, 0, 0);
    } else {
      this.meshes.hat.setMatrixAt(slot, this.zero);
    }
    if (ped.bag) {
      this.writePart('bag', slot, -0.32, seated ? 0.7 : 0.82, 0.08, 0);
    } else {
      this.meshes.bag.setMatrixAt(slot, this.zero);
    }
    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  writePart(name, slot, x, y, z, rotationX) {
    this._local.makeRotationX(rotationX);
    this._local.setPosition(x, y, z);
    this._out.multiplyMatrices(this._base, this._local);
    this.meshes[name].setMatrixAt(slot, this._out);
  }
}
