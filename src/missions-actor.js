// The Solano crew actor: the thug body mesh, the shared materials and flame
// texture it is built from, and the box helper the mission runtime uses for
// crates and props. The class owns its own `this`; the scene is passed in.

import * as THREE from '../vendor/three.module.js';

export const distance2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function buildThugMaterials() {
  const jackets = [0x2b2638, 0x3a2928, 0x23342f, 0x352d22, 0x2a2335].map((color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.06 }));
  return {
    jackets,
    pants: new THREE.MeshStandardMaterial({ color: 0x17151f, roughness: 0.9 }),
    shirt: new THREE.MeshStandardMaterial({ color: 0x463b3c, roughness: 0.86 }),
    skin: [0x9c6a50, 0xb87a60, 0x8a5a44, 0x6f4838].map((color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.82 })),
    hair: new THREE.MeshStandardMaterial({ color: 0x19141a, roughness: 0.92 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xd94b52, roughness: 0.55, emissive: 0x2a0709 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5c5966, roughness: 0.36, metalness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x121016, roughness: 0.6, metalness: 0.2 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x6a4c36, roughness: 0.92 }),
    crateEdge: new THREE.MeshStandardMaterial({ color: 0x36251c, roughness: 0.9 }),
    case: new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.5, metalness: 0.35 }),
    caseTrim: new THREE.MeshStandardMaterial({ color: 0xffc95c, roughness: 0.35, metalness: 0.45, emissive: 0x3b2a04 }),
  };
}

export function makeFlameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.moveTo(64, 249);
  ctx.bezierCurveTo(18, 226, 30, 184, 41, 150);
  ctx.bezierCurveTo(20, 156, 27, 119, 45, 107);
  ctx.bezierCurveTo(39, 78, 55, 44, 66, 15);
  ctx.bezierCurveTo(73, 57, 96, 72, 94, 106);
  ctx.bezierCurveTo(117, 120, 105, 160, 99, 181);
  ctx.bezierCurveTo(113, 217, 96, 241, 64, 249);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 252, 0, 8);
  gradient.addColorStop(0, 'rgba(255, 244, 186, 0.98)');
  gradient.addColorStop(0.38, 'rgba(255, 197, 63, 0.98)');
  gradient.addColorStop(0.72, 'rgba(255, 92, 18, 0.94)');
  gradient.addColorStop(1, 'rgba(255, 40, 6, 0.72)');
  ctx.shadowColor = 'rgba(255, 114, 24, 0.8)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'source-atop';
  const hot = ctx.createRadialGradient(62, 208, 2, 62, 208, 66);
  hot.addColorStop(0, 'rgba(255, 255, 232, 0.9)');
  hot.addColorStop(0.55, 'rgba(255, 236, 150, 0.34)');
  hot.addColorStop(1, 'rgba(255, 220, 120, 0)');
  ctx.fillStyle = hot;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const lick = ctx.createLinearGradient(0, 120, 0, 20);
  lick.addColorStop(0, 'rgba(255, 100, 18, 0)');
  lick.addColorStop(1, 'rgba(255, 54, 8, 0.55)');
  ctx.fillStyle = lick;
  ctx.fillRect(40, 8, 50, 130);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function addBox(parent, width, height, depth, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export class Thug {
  constructor(scene, world, materials, spec, index) {
    this.scene = scene;
    this.world = world;
    this.spec = spec;
    this.index = index;
    this.x = spec.x;
    this.z = spec.z;
    this.y = world.groundHeightAt(spec.x, spec.z);
    this.anchorX = spec.x;
    this.anchorZ = spec.z;
    this.health = spec.health ?? 105;
    this.maxHealth = this.health;
    this.boss = Boolean(spec.boss);
    this.name = spec.name ?? 'Solano Crew';
    this.damage = spec.damage ?? (this.boss ? 12 : 7);
    this.dead = false;
    this.removed = false;
    this.deadTimer = 0;
    this.yaw = spec.yaw ?? 0;
    this.speed = spec.speed ?? (this.boss ? 2.15 : 2.7);
    this.phase = Math.random() * Math.PI * 2;
    this.shootTimer = 0.7 + Math.random() * 1.5;
    this.losTimer = 0;
    this.los = false;
    this.hitFlash = 0;
    this.aim = 0;
    this.walk = 0;
    this.group = new THREE.Group();
    this.group.name = `solano-enforcer-${index}`;
    this.group.position.set(this.x, this.y, this.z);
    scene.add(this.group);
    this.build(materials);
    this.setPose(this.yaw);
    if (spec.dead) {
      this.dead = true;
      this.deadTimer = 1.4;
      this.group.rotation.z = 1.48;
      this.group.position.y = this.y + 0.2;
    }
  }

  build(materials) {
    const jacket = materials.jackets[this.index % materials.jackets.length];
    const skin = materials.skin[this.index % materials.skin.length];
    this.materials = materials;
    const root = this.group;
    addBox(root, 0.38, 0.18, 0.24, materials.pants, 0, 0.92, 0);
    this.torso = new THREE.Group();
    this.torso.position.y = 0.99;
    root.add(this.torso);
    addBox(this.torso, 0.47, 0.55, 0.28, jacket, 0, 0.3, 0);
    addBox(this.torso, 0.5, 0.13, 0.29, materials.pants, 0, 0.55, 0);
    addBox(this.torso, 0.16, 0.3, 0.012, materials.shirt, 0, 0.3, 0.15);
    if (this.boss) {
      addBox(this.torso, 0.12, 0.46, 0.02, materials.accent, 0.12, 0.31, 0.157);
    }
    this.head = new THREE.Group();
    this.head.position.y = 0.73;
    this.torso.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 7), skin);
    neck.position.y = -0.02;
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 9), skin);
    skull.scale.set(0.93, 1.05, 0.92);
    skull.position.y = 0.12;
    skull.castShadow = true;
    this.head.add(skull);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), materials.hair);
    cap.position.y = 0.148;
    cap.castShadow = true;
    this.head.add(cap);
    if (this.boss) addBox(this.head, 0.24, 0.035, 0.05, materials.accent, 0, 0.12, 0.155);

    this.arms = {};
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.29, 0.51, 0);
      this.torso.add(shoulder);
      addBox(shoulder, 0.13, 0.32, 0.15, jacket, 0, -0.15, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -0.31;
      shoulder.add(elbow);
      addBox(elbow, 0.115, 0.28, 0.125, materials.shirt, 0, -0.14, 0);
      this.arms[side === -1 ? 'left' : 'right'] = { shoulder, elbow };
    }
    this.gun = new THREE.Group();
    addBox(this.gun, 0.06, 0.08, 0.34, materials.dark, 0, 0, 0.12);
    addBox(this.gun, 0.05, 0.13, 0.07, materials.dark, 0, -0.08, -0.02);
    this.gun.position.set(0, -0.34, 0.04);
    this.arms.right.elbow.add(this.gun);

    this.legs = {};
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.125, 0.9, 0);
      root.add(hip);
      addBox(hip, 0.16, 0.42, 0.18, materials.pants, 0, -0.21, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      addBox(knee, 0.14, 0.38, 0.16, materials.pants, 0, -0.19, 0);
      addBox(knee, 0.17, 0.1, 0.28, materials.dark, 0, -0.41, 0.05);
      this.legs[side === -1 ? 'left' : 'right'] = { hip, knee };
    }
  }

  get chestY() {
    return this.y + 1.18;
  }

  get headY() {
    return this.y + 1.72;
  }

  setPose(yaw) {
    this.yaw = yaw;
    this.group.rotation.y = yaw;
  }

  update(dt, player, missions) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.dead) {
      this.deadTimer += dt;
      this.group.rotation.z = Math.min(1.48, this.group.rotation.z + dt * 3.4);
      this.group.position.y = this.y + Math.min(0.2, this.deadTimer * 0.3);
      this.gun.visible = false;
      return;
    }
    const dx = player.position.x - this.x;
    const dz = player.position.z - this.z;
    const distance = Math.hypot(dx, dz) || 0.001;
    const playerVisible = distance < 46 && !player.dead;
    if (playerVisible) {
      const targetYaw = Math.atan2(dx, dz);
      this.setPose(targetYaw);
      this.aim = Math.min(1, this.aim + dt * 7);
    } else {
      this.aim = Math.max(0, this.aim - dt * 4);
    }

    const anchorDistance = distance2(this.x, this.z, this.anchorX, this.anchorZ);
    let moving = false;
    if (playerVisible && distance > (this.boss ? 6.5 : 7.2) && distance < 36 && anchorDistance < 24) {
      const step = this.speed * dt;
      const nextX = this.x + (dx / distance) * step;
      const nextZ = this.z + (dz / distance) * step;
      const resolved = this.world.resolveCircle(nextX, nextZ, 0.36);
      const ground = this.world.groundHeightAt(resolved.x, resolved.z);
      if (Math.abs(ground - this.y) < 0.55) {
        this.x = resolved.x;
        this.z = resolved.z;
        this.y = ground;
        moving = true;
      }
    }
    if (playerVisible && distance < 11) moving = false;
    this.walk += dt * (moving ? 8.4 : 1.6);
    const stride = moving ? 0.48 : 0;
    this.legs.left.hip.rotation.x = Math.sin(this.walk) * stride;
    this.legs.right.hip.rotation.x = Math.sin(this.walk + Math.PI) * stride;
    this.legs.left.knee.rotation.x = Math.max(0, Math.sin(this.walk + 0.7)) * stride * 1.2;
    this.legs.right.knee.rotation.x = Math.max(0, Math.sin(this.walk + Math.PI + 0.7)) * stride * 1.2;
    this.arms.left.shoulder.rotation.x = -Math.sin(this.walk) * stride * 0.7;
    this.arms.left.shoulder.rotation.z = 0.08;
    this.arms.right.shoulder.rotation.x = -1.25 * this.aim + Math.sin(this.walk) * stride * 0.2;
    this.arms.right.shoulder.rotation.z = -0.08;
    this.arms.right.elbow.rotation.x = -0.2 - this.aim * 0.2;
    this.torso.rotation.x = moving ? 0.05 : 0.015;
    this.group.position.set(this.x, this.y + (moving ? Math.abs(Math.sin(this.walk)) * 0.025 : 0), this.z);
    this.group.rotation.y = this.yaw;

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.5;
      this.los = playerVisible && distance < 39 && !this.world.lineBlocked(
        this.x, this.y + 1.32, this.z,
        player.position.x, player.position.y + 1.2, player.position.z,
        0.2,
      );
    }
    this.shootTimer -= dt;
    if (!this.staged && this.los && this.shootTimer <= 0 && !player.dead && distance < 38) {
      this.shootTimer = (this.boss ? 1.25 : 1.7) + Math.random() * 1.1;
      missions.enemyShoot(this, player);
    }
  }

  remove() {
    this.removed = true;
    this.scene.remove(this.group);
  }

  muzzle(out = new THREE.Vector3()) {
    return out.set(
      this.x + Math.sin(this.yaw) * 0.62,
      this.y + 1.34,
      this.z + Math.cos(this.yaw) * 0.62,
    );
  }
}
