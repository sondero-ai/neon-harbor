// The Harbor PD foot officer: the navy uniform mesh and the short-range
// pursuit and sidearm behaviour. The class keeps its own `this`; the Police
// instance passes itself to update so the officer can read the down state.

import * as THREE from '../vendor/three.module.js';

const damp = THREE.MathUtils.damp;

// ---------------------------------------------------------------- officer

let officerMaterials = null;
function getOfficerMaterials() {
  if (officerMaterials) return officerMaterials;
  officerMaterials = {
    navy: new THREE.MeshStandardMaterial({ color: 0x1c2a45, roughness: 0.8, metalness: 0.08 }),
    navyDark: new THREE.MeshStandardMaterial({ color: 0x131d31, roughness: 0.85 }),
    vest: new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.75, metalness: 0.12 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xa77456, roughness: 0.82 }),
    skinB: new THREE.MeshStandardMaterial({ color: 0x6f4835, roughness: 0.82 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x111a2c, roughness: 0.7 }),
    badge: new THREE.MeshStandardMaterial({ color: 0xffc95c, roughness: 0.3, metalness: 0.7, emissive: 0x4a3005 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x2d2b36, roughness: 0.35, metalness: 0.7 }),
  };
  return officerMaterials;
}

export class Officer {
  constructor(scene, world, x, z, rng) {
    this.scene = scene;
    this.world = world;
    this.x = x;
    this.z = z;
    this.y = world.groundHeightAt(x, z);
    this.yaw = rng.range(0, Math.PI * 2);
    this.health = 100;
    this.speed = 0;
    this.phase = rng.range(0, Math.PI * 2);
    this.shootTimer = rng.range(0.5, 1.6);
    this.losTimer = rng.range(0, 0.3);
    this.los = false;
    this.dead = false;
    this.deadTimer = 0;
    this.removed = false;
    this.build(getOfficerMaterials(), rng);
    this.applyTransform();
  }

  build(materials, rng) {
    this.group = new THREE.Group();
    this.group.name = 'harbor-pd-officer';
    const skin = rng.chance(0.5) ? materials.skin : materials.skinB;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.24), materials.navyDark);
    hips.position.y = 0.92;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.3), materials.navy);
    torso.position.y = 1.28;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.34), materials.vest);
    vest.position.y = 1.32;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.32), materials.navyDark);
    collar.position.y = 1.58;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skin);
    head.position.y = 1.74;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.19, 0.13, 10), materials.cap);
    cap.position.y = 1.9;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.035, 0.14), materials.cap);
    brim.position.set(0, 1.85, 0.14);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.02), materials.badge);
    badge.position.set(-0.15, 1.44, 0.165);
    this.group.add(hips, torso, vest, collar, head, cap, brim, badge);

    // Both arms are held in a low ready position; the right hand carries the
    // sidearm so the silhouette says "police" at a glance.
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.56, 0.17), materials.navyDark);
      arm.position.set(side * 0.31, 1.32, 0.12);
      arm.rotation.x = -0.72;
      arm.rotation.z = side * -0.12;
      this.group.add(arm);
    }
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.26), materials.gun);
    this.gun.position.set(0.31, 1.26, 0.62);
    this.group.add(this.gun);

    this.legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, 0.9, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.84, 0.19), materials.navyDark);
      leg.position.y = -0.42;
      pivot.add(leg);
      this.group.add(pivot);
      this.legs.push(pivot);
    }
    this.group.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.scene.add(this.group);
  }

  get muzzle() {
    return {
      x: this.x + Math.sin(this.yaw) * 0.66,
      y: this.y + 1.33,
      z: this.z + Math.cos(this.yaw) * 0.66,
    };
  }

  applyTransform() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
  }

  update(dt, player, police) {
    if (this.removed) return;
    if (this.dead) {
      this.deadTimer -= dt;
      this.group.rotation.z = damp(this.group.rotation.z, Math.PI / 2, 7, dt);
      this.group.position.y = damp(this.group.position.y, this.y - 0.28, 3.5, dt);
      if (this.deadTimer <= 0) this.remove();
      return;
    }
    const dx = player.position.x - this.x;
    const dz = player.position.z - this.z;
    const distance = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);
    this.yaw += Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw)) * (1 - Math.exp(-10 * dt));

    let move = 0;
    if (!police.down && distance > 3.2) {
      const speed = distance > 16 ? 4.6 : 3.3;
      move = 1;
      this.phase += dt * (5.4 + speed * 0.7);
      const step = speed * dt;
      const nx = this.x + (dx / Math.max(0.001, distance)) * step;
      const nz = this.z + (dz / Math.max(0.001, distance)) * step;
      const full = this.world.resolveCircle(nx, nz, 0.38);
      if (Math.hypot(full.x - nx, full.z - nz) < 0.01) {
        this.x = full.x;
        this.z = full.z;
      } else {
        const slideX = this.world.resolveCircle(nx, this.z, 0.38);
        if (Math.abs(slideX.x - nx) < 0.01 && Math.abs(slideX.z - this.z) < 0.01) {
          this.x = slideX.x;
        } else {
          const slideZ = this.world.resolveCircle(this.x, nz, 0.38);
          if (Math.abs(slideZ.z - nz) < 0.01 && Math.abs(slideZ.x - this.x) < 0.01) this.z = slideZ.z;
        }
      }
    } else if (!police.down && distance < 12) {
      // Hold the perimeter but keep shuffling so they are not statues.
      this.phase += dt * 3.2;
      move = 0.35;
    }

    this.legs[0].rotation.x = Math.sin(this.phase) * 0.58 * move;
    this.legs[1].rotation.x = Math.sin(this.phase + Math.PI) * 0.58 * move;
    this.y = damp(this.y, this.world.groundHeightAt(this.x, this.z), 16, dt);
    this.speed = move * (distance > 16 ? 4.6 : 3.3);
    this.applyTransform();
  }

  remove() {
    this.removed = true;
    this.scene.remove(this.group);
  }
}
