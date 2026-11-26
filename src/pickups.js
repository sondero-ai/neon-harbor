// Street pickups: weapon crates, medkits and armor vests on small chrome rings.
// They float, turn and read from a distance through their glow sprites. Walking
// over one applies it and starts a respawn timer; there are no prompts because
// the collection radius is generous and the HUD announces what was taken.

import * as THREE from '../vendor/three.module.js';
import { PICKUPS, WEAPONS } from './config.js';
import { makeGlowSprite } from './geo.js';

const COLORS = {
  pistol: 0xffc95c,
  smg: 0x3fe0cf,
  health: 0x7dff9f,
  armor: 0x7f9dff,
};

const RESPAWN = 38;

function flatRing(color) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.62, 20),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(0.33, 18),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.002;
  group.add(inner);
  return group;
}

function buildIcon(kind, materials) {
  const group = new THREE.Group();
  if (kind === 'health') {
    const white = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.15, 0.46), materials.white);
    const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.095), materials.health);
    const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.17, 0.28), materials.health);
    group.add(white, crossA, crossB);
    return group;
  }
  if (kind === 'armor') {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.58), materials.blue);
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.16), materials.dark);
    collar.position.set(0, 0.01, -0.26);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.05), materials.white);
    plate.position.set(0, 0.01, 0.3);
    group.add(vest, collar, plate);
    return group;
  }
  const isSmg = kind === 'smg';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(isSmg ? 0.12 : 0.1, isSmg ? 0.14 : 0.12, isSmg ? 0.62 : 0.46),
    materials.steel,
  );
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.1), materials.dark);
  grip.position.set(0, -0.13, isSmg ? 0.02 : -0.04);
  grip.rotation.x = 0.22;
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.035, isSmg ? 0.2 : 0.14),
    isSmg ? materials.teal : materials.gold,
  );
  accent.position.set(0, 0.085, isSmg ? 0.12 : 0.08);
  group.add(body, grip, accent);
  return group;
}

export class Pickups {
  constructor(scene, world, effects, options = {}) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.onPickup = options.onPickup ?? null;
    this.audio = options.audio ?? null;
    this.items = [];
    this.time = 0;
    this.materials = {
      steel: new THREE.MeshStandardMaterial({ color: 0x4d4b59, roughness: 0.35, metalness: 0.75 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x17141d, roughness: 0.65, metalness: 0.3 }),
      teal: new THREE.MeshStandardMaterial({ color: 0x3fe0cf, roughness: 0.4, metalness: 0.2, emissive: 0x0d514c }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc95c, roughness: 0.4, metalness: 0.2, emissive: 0x5a3b06 }),
      white: new THREE.MeshStandardMaterial({ color: 0xefe3cd, roughness: 0.6, metalness: 0.08 }),
      health: new THREE.MeshStandardMaterial({ color: 0x5cff8a, roughness: 0.5, emissive: 0x12602b }),
      blue: new THREE.MeshStandardMaterial({ color: 0x637fd8, roughness: 0.45, metalness: 0.25, emissive: 0x112355 }),
    };
    for (const spot of PICKUPS) this.addItem(spot);
  }

  addItem(spec) {
    const color = COLORS[spec.kind] ?? 0xffffff;
    const y = this.world.groundHeightAt(spec.x, spec.z);
    const group = new THREE.Group();
    group.position.set(spec.x, y, spec.z);
    group.add(flatRing(color));
    const icon = buildIcon(spec.kind, this.materials);
    icon.position.y = 0.95;
    const bob = new THREE.Group();
    bob.add(icon);
    group.add(bob);
    const glow = makeGlowSprite(color, 2.6, 0.5);
    glow.position.y = 1.0;
    group.add(glow);
    this.scene.add(group);
    this.items.push({
      ...spec,
      group,
      icon: bob,
      glow,
      y,
      callback: null,
      collected: false,
      respawn: 0,
    });
  }

  reset() {
    for (const item of this.items) {
      item.collected = false;
      item.respawn = 0;
      item.group.visible = true;
    }
  }

  get hint() {
    let nearest = null;
    let nearestDistance = 9;
    for (const item of this.items) {
      if (item.collected) continue;
      const distance = Math.hypot(item.x - this.playerX, item.z - this.playerZ);
      if (distance < nearestDistance) {
        nearest = item;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  update(dt, player) {
    this.time += dt;
    this.playerX = player.position.x;
    this.playerZ = player.position.z;
    for (const item of this.items) {
      if (item.collected) {
        item.respawn -= dt;
        if (item.respawn <= 0) {
          item.collected = false;
          item.group.visible = true;
        }
        continue;
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.2 + item.x * 0.1);
      item.icon.position.y = 0.92 + Math.sin(this.time * 1.6 + item.z * 0.17) * 0.1;
      item.icon.rotation.y += dt * 0.9;
      item.glow.material.opacity = 0.32 + pulse * 0.24;
      item.glow.scale.setScalar(2.3 + pulse * 0.5);
      if (player.dead) continue;
      const distance = Math.hypot(item.x - player.position.x, item.z - player.position.z);
      if (distance < 1.75 && Math.abs(player.position.y - item.y) < 2.6) this.collect(item, player);
    }
  }

  collect(item, player) {
    item.collected = true;
    item.respawn = RESPAWN;
    item.group.visible = false;
    let message = item.label;
    if (item.kind === 'health') {
      const gained = player.heal(38);
      message = `${item.label} · +${Math.round(gained)} HP`;
    } else if (item.kind === 'armor') {
      const gained = player.addArmor(45);
      message = `${item.label} · +${Math.round(gained)} ARMOR`;
    } else if (item.kind === 'smg') {
      const first = !player.weapons.smg.owned;
      player.grantWeapon('smg', 96);
      message = first ? 'KESTREL SMG · 32 / 96' : `KESTREL SMG · +${WEAPONS.smg.mag} AMMO`;
    } else if (item.kind === 'pistol') {
      player.grantWeapon('pistol', 48);
      message = 'SOLANO 9 · AMMO +48';
    }
    if (this.effects) {
      this.effects.flash(item.x, item.y + 0.95, item.z, { color: COLORS[item.kind], scale: 2.4, life: 0.28, grow: 3.2 });
      this.effects.spark(item.x, item.y + 0.8, item.z, null, COLORS[item.kind], 8, 3.4);
    }
    if (this.audio) this.audio.pickup();
    if (this.onPickup) this.onPickup(message, item);
  }
}
