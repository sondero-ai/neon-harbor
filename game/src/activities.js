// Free-roam work that pays between story beats: cash stashes on the street, a
// rotating hot-car delivery, a three-star heat run, and the safehouse that
// saves the game. Everything is optional and runs on the same player/police
// systems; no separate economy or combat layer.

import * as THREE from '../vendor/three.module.js';
import { makeGlowSprite } from './geo.js';

const GOLD = 0xffc95c;
const TEAL = 0x3fe0cf;
const CORAL = 0xff6f61;

const SAFEHOUSE = { x: -71.5, z: 36.6 };
const MOTOR_SHOP = { x: 162, z: 18.2 };
const HEAT_RUN = { x: 143, z: 6 };

const CASH_SPOTS = [
  { x: -54, z: 35.4, amount: 220 },
  { x: -109, z: 35.4, amount: 260 },
  { x: 36, z: 72.2, amount: 300 },
  { x: 162, z: 23, amount: 240 },
  { x: -186, z: 64, amount: 320 },
  { x: -54, z: -75, amount: 280 },
];

const THEFT_SPOTS = [
  { x: 117, z: 21.4, yaw: Math.PI / 2, type: 'sports', color: 0x3fe0cf, reward: 900, name: 'Vela GT' },
  { x: 12, z: 32.7, yaw: -Math.PI / 2, type: 'muscle', color: 0xffc95c, reward: 1100, name: 'Riptide 442' },
  { x: -99, z: 74.2, yaw: Math.PI / 2, type: 'pickup', color: 0xff6f61, reward: 1300, name: 'Dune Hauler' },
];

const distance2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function signTexture(title, sub, accent = '#3fe0cf') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0712';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = accent;
  ctx.fillRect(10, 10, 12, canvas.height - 20);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f7e8d2';
  ctx.font = '900 62px "Bahnschrift", "Arial Narrow", sans-serif';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
  ctx.fillText(title, 42, 78);
  ctx.fillStyle = accent;
  ctx.font = '700 25px "Bahnschrift", "Segoe UI", sans-serif';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  ctx.fillText(sub, 44, 137);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeRing(color, radius, opacity = 0.62) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 30), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);
  return { group, ring, material };
}

function makeCrateSign(title, sub, accent) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a2020, roughness: 0.86 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), wood);
  post.position.set(-0.8, 0.9, 0);
  post.castShadow = true;
  const postB = post.clone();
  postB.position.x = 0.8;
  group.add(post, postB);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 0.86),
    new THREE.MeshBasicMaterial({ map: signTexture(title, sub, accent), toneMapped: false, side: THREE.DoubleSide }),
  );
  board.position.y = 2.2;
  group.add(board);
  const glow = makeGlowSprite(accent === '#ff6f61' ? CORAL : accent === '#ffc95c' ? GOLD : TEAL, 3.4, 0.34);
  glow.position.y = 2.2;
  group.add(glow);
  return group;
}

export class Activities {
  constructor(scene, world, vehicles, player, police, effects, audio, options = {}) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.player = player;
    this.police = police;
    this.effects = effects;
    this.audio = audio;
    this.onToast = options.onToast ?? (() => {});
    this.onReward = options.onReward ?? (() => {});
    this.onSave = options.onSave ?? (() => {});
    this.missionActive = options.missionActive ?? (() => false);
    this.time = 0;
    this.suspended = false;

    this.cashGroup = new THREE.Group();
    this.cashGroup.name = 'cash-stashes';
    scene.add(this.cashGroup);
    this.stashMaterials = {
      bill: new THREE.MeshStandardMaterial({ color: 0x8da778, roughness: 0.8 }),
      band: new THREE.MeshStandardMaterial({ color: 0xffc95c, roughness: 0.4, metalness: 0.3, emissive: 0x3b2a04 }),
      grip: new THREE.MeshStandardMaterial({ color: 0x1a161e, roughness: 0.7 }),
    };
    this.stashes = CASH_SPOTS.map((spot) => this.buildStash(spot));

    this.safehouse = this.buildSafehouse();
    this.heatBeacon = this.buildHeatBeacon();
    this.chopBeacon = this.buildChopBeacon();
    this.chopBeacon.visible = false;

    this.theft = null;
    this.lastTheftCar = null;
    this.theftCycle = 0;
    this.theftCooldown = 2.5;
    this.heat = null;
    this.heatCooldown = 0;
    this.safehouseCooldown = 0;
    this.safehouseInside = false;
    this.heatInside = false;
  }

  reset() {
    this.suspended = false;
    for (const stash of this.stashes) {
      stash.collected = false;
      stash.respawn = 0;
      stash.group.visible = true;
    }
    if (this.theft?.car && !this.theft.car.removed) {
      if (this.player.driving !== this.theft.car) this.vehicles.remove(this.theft.car);
    }
    if (this.lastTheftCar && !this.lastTheftCar.removed && this.player.driving !== this.lastTheftCar) {
      this.vehicles.remove(this.lastTheftCar);
    }
    if (this.theft?.ring) this.theft.ring.removeFromParent();
    this.theft = null;
    this.lastTheftCar = null;
    this.theftCycle = 0;
    this.theftCooldown = 2.5;
    this.heat = null;
    this.heatCooldown = 0;
    this.safehouseCooldown = 0;
    this.safehouseInside = false;
    this.heatInside = false;
    this.chopBeacon.visible = false;
  }

  buildStash(spot) {
    const ground = this.world.groundHeightAt(spot.x, spot.z);
    const group = new THREE.Group();
    group.position.set(spot.x, ground, spot.z);
    const ring = makeRing(GOLD, 1.05, 0.55);
    group.add(ring.group);
    const icon = new THREE.Group();
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.3), this.stashMaterials.bill);
    stack.position.y = 0.06;
    const stackB = stack.clone();
    stackB.position.y = 0.18;
    stackB.rotation.y = 0.24;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.33), this.stashMaterials.band);
    band.position.y = 0.1;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), this.stashMaterials.grip);
    grip.position.set(0, 0.3, 0);
    icon.add(stack, stackB, band, grip);
    icon.position.y = 0.92;
    group.add(icon);
    const glow = makeGlowSprite(GOLD, 3.0, 0.42);
    glow.position.y = 1.0;
    group.add(glow);
    this.scene.add(group);
    return {
      ...spot,
      group,
      icon,
      glow,
      ring,
      collected: false,
      respawn: 0,
      phase: Math.random() * 6.28,
    };
  }

  buildSafehouse() {
    const group = new THREE.Group();
    group.position.set(SAFEHOUSE.x, this.world.groundHeightAt(SAFEHOUSE.x, SAFEHOUSE.z), SAFEHOUSE.z);
    const sign = makeCrateSign('RAE', 'SAFEHOUSE', '#3fe0cf');
    sign.rotation.y = Math.PI;
    group.add(sign);
    const ring = makeRing(TEAL, 1.6, 0.42);
    group.add(ring.group);
    const glow = makeGlowSprite(TEAL, 5.2, 0.24);
    glow.position.y = 2.2;
    group.add(glow);
    this.scene.add(group);
    return { group, ring, glow };
  }

  buildHeatBeacon() {
    const group = new THREE.Group();
    group.position.set(HEAT_RUN.x, this.world.groundHeightAt(HEAT_RUN.x, HEAT_RUN.z), HEAT_RUN.z);
    const sign = makeCrateSign('HEAT RUN', '3 STARS · 42 SEC', '#ff6f61');
    group.add(sign);
    const ring = makeRing(CORAL, 1.7, 0.55);
    group.add(ring.group);
    const glow = makeGlowSprite(CORAL, 5.4, 0.28);
    glow.position.y = 2.1;
    group.add(glow);
    this.scene.add(group);
    return { group, ring, glow };
  }

  buildChopBeacon() {
    const group = new THREE.Group();
    group.position.set(MOTOR_SHOP.x, this.world.groundHeightAt(MOTOR_SHOP.x, MOTOR_SHOP.z), MOTOR_SHOP.z);
    const sign = makeCrateSign('CHOP', 'MOTOR ROW BAY', '#ffc95c');
    group.add(sign);
    const ring = makeRing(GOLD, 2.1, 0.52);
    group.add(ring.group);
    const glow = makeGlowSprite(GOLD, 6.2, 0.3);
    glow.position.y = 2.4;
    group.add(glow);
    this.scene.add(group);
    return group;
  }

  get challenge() {
    if (this.heat) {
      return {
        title: 'Heat Run',
        sub: 'SURVIVE THE HARBOR PD',
        timer: this.heat.timer,
        maxTimer: this.heat.maxTimer,
        progress: { label: 'WANTED', value: this.police.wanted, max: 5 },
        tone: 'coral',
      };
    }
    if (this.theft?.phase === 'deliver') {
      return {
        title: 'Hot Cargo',
        sub: 'DELIVER THE CAR TO MOTOR ROW',
        timer: this.theft.timer,
        maxTimer: this.theft.maxTimer,
        detail: `${Math.round(distance2(this.player.position.x, this.player.position.z, MOTOR_SHOP.x, MOTOR_SHOP.z))} M`,
        tone: 'gold',
      };
    }
    return null;
  }

  handleDown(type) {
    if (this.heat) {
      this.heat = null;
      this.heatCooldown = 12;
      this.onToast({ title: 'Heat Run Failed', sub: type === 'busted' ? 'BUSTED BY HARBOR PD' : 'YOU WENT DOWN', life: 2.6 });
    }
    if (this.theft?.phase === 'deliver') this.failTheft('You went down with the car.');
  }

  award(amount, label) {
    this.player.cash += amount;
    this.audio.reward();
    this.onReward(amount, label);
    this.onSave();
  }

  update(dt) {
    if (this.suspended) return;
    this.time += dt;
    this.theftCooldown = Math.max(0, this.theftCooldown - dt);
    this.heatCooldown = Math.max(0, this.heatCooldown - dt);
    this.safehouseCooldown = Math.max(0, this.safehouseCooldown - dt);

    const player = this.player;
    const px = player.position.x;
    const pz = player.position.z;
    const missionActive = this.missionActive();

    for (const stash of this.stashes) {
      if (stash.collected) {
        stash.respawn -= dt;
        if (stash.respawn <= 0) {
          stash.collected = false;
          stash.group.visible = true;
        }
        continue;
      }
      stash.phase += dt;
      stash.icon.position.y = 0.92 + Math.sin(stash.phase * 1.8) * 0.09;
      stash.icon.rotation.y += dt * 0.85;
      stash.glow.material.opacity = 0.32 + (0.5 + Math.sin(stash.phase * 2.4) * 0.5) * 0.18;
      stash.ring.group.rotation.y += dt * 0.5;
      if (distance2(px, pz, stash.x, stash.z) < 1.95 && Math.abs(player.position.y - this.world.groundHeightAt(stash.x, stash.z)) < 2.4) {
        stash.collected = true;
        stash.respawn = 95;
        stash.group.visible = false;
        if (this.effects) this.effects.flash(stash.x, player.position.y + 0.9, stash.z, { color: GOLD, scale: 2.2, life: 0.24, grow: 2.8 });
        if (this.audio) this.audio.pickup();
        this.award(stash.amount, 'CASH STASH');
        this.onToast({ title: `Cash Stash · $${stash.amount}`, sub: 'THE STREETS PAY BOTH WAYS', life: 2.4 });
      }
    }

    const safeDistance = distance2(px, pz, SAFEHOUSE.x, SAFEHOUSE.z);
    const insideSafehouse = safeDistance < 3.0;
    if (insideSafehouse && !this.safehouseInside && this.safehouseCooldown <= 0 && !player.driving && !player.dead) {
      this.safehouseCooldown = 12;
      player.heal(22);
      player.addArmor(28);
      if (!missionActive && !this.heat) this.police.clearWanted({ quiet: true });
      this.audio.pickup();
      if (this.effects) this.effects.flash(SAFEHOUSE.x, player.position.y + 1.2, SAFEHOUSE.z, { color: TEAL, scale: 2.8, life: 0.32, grow: 3.4 });
      this.onToast({
        title: missionActive ? 'Safehouse · Patched Up' : 'Safehouse · Saved',
        sub: missionActive ? 'HEALTH · ARMOR · NO HEAT CLEARED MID-JOB' : 'HEALTH · ARMOR · PROGRESS WRITTEN',
        life: 3.0,
      });
      this.onSave();
    }
    this.safehouseInside = insideSafehouse;

    const heatDistance = distance2(px, pz, HEAT_RUN.x, HEAT_RUN.z);
    const insideHeat = heatDistance < 2.8;
    if (insideHeat && !this.heatInside && this.heatCooldown <= 0 && !this.heat && !missionActive && !player.driving && !player.dead && this.police.wanted === 0) {
      this.heat = { timer: 42, maxTimer: 42 };
      this.police.setWanted(3, { silent: true });
      this.audio.sirenBurst?.();
      this.onToast({ title: 'Heat Run', sub: 'SURVIVE 42 SECONDS · THREE STARS', life: 3.4 });
    }
    this.heatInside = insideHeat;

    if (this.heat) {
      this.heat.timer -= dt;
      if (this.police.wanted < 2 && !player.dead) this.police.setWanted(3, { silent: true });
      if (player.dead) {
        this.heat = null;
        this.heatCooldown = 12;
        this.onToast({ title: 'Heat Run Failed', sub: 'YOU WENT DOWN · THE STREETS KEEP SCORE', life: 3.0 });
      } else if (this.heat.timer <= 0) {
        const reward = 2000;
        this.heat = null;
        this.heatCooldown = 26;
        this.police.clearWanted({ quiet: true });
        this.audio.missionComplete();
        if (this.effects) this.effects.flash(px, player.position.y + 1.3, pz, { color: GOLD, scale: 3.2, life: 0.4, grow: 4.0 });
        this.onToast({ title: 'Heat Run Cleared', sub: 'HARBOR PD STOOD DOWN', life: 3.4 });
        this.award(reward, 'HEAT RUN CLEARED');
      }
    }

    if (missionActive) {
      if (this.heat) {
        this.heat = null;
        this.heatCooldown = 8;
      }
      if (this.theft?.phase === 'deliver') this.abortTheft();
    }

    this.updateTheft(dt);
    this.updateBeacons(dt);
  }

  updateTheft(dt) {
    const theft = this.theft;
    if (!theft) {
      if (this.theftCooldown <= 0 && !this.missionActive() && !this.suspended) this.spawnTheftCar();
      return;
    }
    if (theft.phase === 'steal') {
      if (theft.car.removed) {
        this.clearTheft();
        this.theftCooldown = 10;
        return;
      }
      if (theft.ring) {
        theft.ring.position.set(theft.car.position.x, this.world.groundHeightAt(theft.car.position.x, theft.car.position.z) + 0.03, theft.car.position.z);
        theft.ring.rotation.y += dt * 0.7;
      }
      if (this.player.driving === theft.car) {
        theft.phase = 'deliver';
        theft.timer = 95;
        theft.maxTimer = 95;
        this.chopBeacon.visible = true;
        if (theft.ring) {
          theft.ring.removeFromParent();
          theft.ring = null;
        }
        this.audio.uiClick();
        this.onToast({ title: 'Hot Cargo', sub: 'DELIVER THIS CAR TO THE MOTOR ROW CHOP SHOP', life: 3.4 });
      }
      return;
    }
    theft.timer -= dt;
    if (theft.car.removed) {
      this.failTheft('The car is wrecked. The buyer walked.');
      return;
    }
    if (theft.timer <= 0) {
      this.failTheft('The buyer gave up waiting. The car is yours now.');
      return;
    }
    if (theft.car.position.distanceTo(new THREE.Vector3(MOTOR_SHOP.x, theft.car.position.y, MOTOR_SHOP.z)) < 9.0) {
      const spot = theft.spot;
      const reward = spot.reward;
      this.audio.missionComplete();
      if (this.effects) {
        this.effects.flash(theft.car.position.x, theft.car.position.y + 1.1, theft.car.position.z, { color: GOLD, scale: 3.0, life: 0.35, grow: 3.6 });
      }
      this.onToast({ title: 'Hot Cargo Delivered', sub: `${spot.name.toUpperCase()} · $${reward.toLocaleString('en-US')}`, life: 3.6 });
      this.award(reward, 'HOT CAR DELIVERED');
      this.lastTheftCar = theft.car;
      this.theft = null;
      this.theftCycle = (this.theftCycle + 1) % THEFT_SPOTS.length;
      this.theftCooldown = 18;
      this.chopBeacon.visible = false;
    }
  }

  spawnTheftCar() {
    const spot = THEFT_SPOTS[this.theftCycle];
    const lastCar = this.lastTheftCar;
    if (lastCar && !lastCar.removed) {
      const far = distance2(lastCar.position.x, lastCar.position.z, this.player.position.x, this.player.position.z) > 55;
      if (this.player.driving === lastCar || !far) {
        this.theftCooldown = 4;
        return;
      }
      this.vehicles.remove(lastCar);
      this.lastTheftCar = null;
    }
    const car = this.vehicles.spawn(spot.type, {
      x: spot.x,
      z: spot.z,
      yaw: spot.yaw,
      color: spot.color,
    });
    car.setDriver(null);
    car.controls.brake = 1;
    const ringGroup = new THREE.Group();
    const ring = makeRing(GOLD, 2.3, 0.65);
    ringGroup.add(ring.group);
    ringGroup.position.set(car.position.x, this.world.groundHeightAt(car.position.x, car.position.z) + 0.03, car.position.z);
    this.scene.add(ringGroup);
    this.theft = {
      car,
      spot,
      phase: 'steal',
      timer: 0,
      maxTimer: 0,
      ring: ringGroup,
      ringMaterial: ring.material,
    };
  }

  abortTheft() {
    if (!this.theft) return;
    if (this.theft.ring) this.theft.ring.removeFromParent();
    this.theft = null;
    this.theftCooldown = 8;
    this.chopBeacon.visible = false;
  }

  failTheft(reason) {
    if (!this.theft) return;
    this.onToast({ title: 'Hot Cargo Lost', sub: reason.toUpperCase(), life: 3.2 });
    this.lastTheftCar = this.theft.car;
    if (this.theft.ring) this.theft.ring.removeFromParent();
    this.theft = null;
    this.theftCooldown = 14;
    this.chopBeacon.visible = false;
  }

  clearTheft() {
    if (this.theft?.ring) this.theft.ring.removeFromParent();
    this.theft = null;
    this.chopBeacon.visible = false;
  }

  updateBeacons(dt) {
    const pulse = 0.5 + Math.sin(this.time * 2.1) * 0.5;
    this.safehouse.ring.group.rotation.y += dt * 0.24;
    this.safehouse.glow.material.opacity = 0.16 + pulse * 0.14;
    this.heatBeacon.ring.group.rotation.y -= dt * 0.42;
    this.heatBeacon.glow.material.opacity = 0.18 + pulse * 0.18;
    if (this.heat) this.heatBeacon.glow.material.opacity = 0.34 + pulse * 0.3;
    if (this.chopBeacon.visible) this.chopBeacon.rotation.y += dt * 0.18;
  }
}
