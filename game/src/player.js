// Third-person control for Rae. On foot: camera-relative movement, sprint,
// jump, curb stepping, building and vehicle collision, and a damped follow
// camera that slides in front of walls. Behind the wheel: throttle/steer/
// brake/handbrake controls for the car, a look-ahead chase camera with a
// free-look orbit, and the enter/exit handshake with vehicles.js.

import * as THREE from '../vendor/three.module.js';
import { CAMERA, PLAYER, WEAPONS } from './config.js';
import { Humanoid } from './humanoid.js';
import {
  addArmor,
  applyDamage,
  finishReload,
  fireWeapon,
  grantWeapon,
  heal,
  meleeAttack,
  selectWeapon,
  startReload,
  updateCombat,
} from './player-combat.js';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export class Player {
  constructor(scene, world, vehicles = null) {
    this.world = world;
    this.vehicles = vehicles;
    this.group = new THREE.Group();
    this.humanoid = new Humanoid();
    this.group.add(this.humanoid.group);
    scene.add(this.group);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.cameraYaw = PLAYER.spawnCameraYaw;
    this.cameraPitch = CAMERA.pitch;
    this.cameraDistance = CAMERA.distance;
    this.facing = PLAYER.spawnFacing;
    this.grounded = true;
    this.speed = 0;
    this.health = PLAYER.health;
    this.armor = PLAYER.armor;
    this.cash = PLAYER.cash;
    this.wanted = 0;
    this.mission = 0;
    this.playSeconds = 0;
    this.walkPhase = 0;
    this.driving = null;
    this.nearVehicle = null;
    this.exitCooldown = 0;
    // Sitting on a seat in the plaza, on the pier, on a beach lounger or in
    // the mall. A seated player keeps the camera, cannot move or fire, and
    // releases the seat when standing.
    this.sitting = false;
    this.seat = null;
    // A car hit pushes Rae out of the bodywork, knocks her down for 0.9 s and
    // shares one cooldown so a single impact never lands twice.
    this.knockdown = 0;
    this.vehicleHitCooldown = 0;
    this.lastVehicleHit = null;
    this.carjacked = false;
    this.driveOrbitYaw = 0;
    this.drivePitch = 0.13;
    this.driveLookHold = 0;

    // Combat. The pistol is Rae's; the SMG is found in the city. Ammo is kept
    // per weapon so switching never silently shares a magazine. The knife is
    // always on the belt and never has ammo to spend.
    this.weaponKey = 'pistol';
    this.weapons = {
      pistol: { owned: true, ammo: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
      smg: { owned: false, ammo: 0, reserve: 0 },
      knife: { owned: true },
    };
    this.aiming = false;
    this.fireCooldown = 0;
    this.meleeSwing = 0;
    this.reloadTimer = 0;
    this.reloadTotal = 0;
    this.recoil = 0;
    this.hitMarker = 0;
    this.damageFlash = 0;
    this.dead = false;
    this.lastGunfire = -99;
    this.effects = null;
    this.audio = null;
    this.police = null;
    this.missions = null;
    this.traffic = null;
    this.buildWeapons();

    this.resetToSpawn();
  }

  resetToSpawn() {
    this.clearSeat();
    this.driving = null;
    this.nearVehicle = null;
    this.knockdown = 0;
    this.vehicleHitCooldown = 0;
    this.humanoid.group.rotation.z = 0;
    this.group.visible = true;
    this.position.set(PLAYER.spawn.x, this.world.groundHeightAt(PLAYER.spawn.x, PLAYER.spawn.z), PLAYER.spawn.z);
    this.velocity.set(0, 0, 0);
    this.cameraYaw = PLAYER.spawnCameraYaw;
    this.cameraPitch = CAMERA.pitch;
    this.facing = PLAYER.spawnFacing;
    this.cameraDistance = CAMERA.distance;
    this.grounded = true;
    this.speed = 0;
    this.applyTransform();
    this.snapCamera();
  }

  loadFromSave(save) {
    this.clearSeat();
    this.driving = null;
    this.nearVehicle = null;
    this.knockdown = 0;
    this.vehicleHitCooldown = 0;
    this.carjacked = false;
    this.humanoid.group.rotation.z = 0;
    this.group.visible = true;
    this.position.set(save.position.x, save.position.y, save.position.z);
    const ground = this.world.groundHeightAt(this.position.x, this.position.z);
    if (this.position.y < ground) this.position.y = ground;
    this.velocity.set(0, 0, 0);
    this.cash = save.cash;
    this.health = Math.max(1, save.health);
    this.armor = save.armor;
    this.wanted = save.wanted;
    this.mission = save.mission;
    this.playSeconds = save.playSeconds;
    // Old saves predate the knife; it is always on the belt and never saved as
    // a consumable.
    this.weapons.knife = { owned: true };
    if (save.weapons) {
      const pistol = save.weapons.pistol;
      const smg = save.weapons.smg;
      this.weapons.pistol = {
        owned: pistol?.owned !== false,
        ammo: clamp(Math.round(Number(pistol?.ammo) || 0), 0, WEAPONS.pistol.mag),
        reserve: clamp(Math.round(Number(pistol?.reserve) || 0), 0, 999),
      };
      this.weapons.smg = {
        owned: smg?.owned === true,
        ammo: clamp(Math.round(Number(smg?.ammo) || 0), 0, WEAPONS.smg.mag),
        reserve: clamp(Math.round(Number(smg?.reserve) || 0), 0, 999),
      };
    }
    this.weaponKey = save.weaponKey === 'smg' && this.weapons.smg.owned
      ? 'smg'
      : save.weaponKey === 'knife' ? 'knife' : 'pistol';
    this.syncGunModel();
    this.cameraYaw = save.cameraYaw;
    this.cameraPitch = clamp(save.cameraPitch, CAMERA.minPitch, CAMERA.maxPitch);
    this.facing = this.cameraYaw - Math.PI;
    this.applyTransform();
    this.snapCamera();
  }

  buildWeapons() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x3b3a46, roughness: 0.35, metalness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x17141c, roughness: 0.62, metalness: 0.35 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x3fe0cf, roughness: 0.5, metalness: 0.2 });

    this.pistolModel = new THREE.Group();
    const pistolSlide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.095, 0.3), steel);
    pistolSlide.position.set(0, 0.02, 0.1);
    const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.17, 0.08), dark);
    pistolGrip.position.set(0, -0.1, -0.01);
    pistolGrip.rotation.x = 0.24;
    const pistolSight = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.03), accent);
    pistolSight.position.set(0, 0.08, 0.22);
    this.pistolModel.add(pistolSlide, pistolGrip, pistolSight);

    this.smgModel = new THREE.Group();
    const smgBody = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.38), steel);
    smgBody.position.set(0, 0.015, 0.12);
    const smgStock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.12), dark);
    smgStock.position.set(0, -0.015, -0.11);
    const smgMag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.2, 0.07), dark);
    smgMag.position.set(0, -0.11, 0.11);
    smgMag.rotation.x = -0.08;
    const smgSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.04), accent);
    smgSight.position.set(0, 0.085, 0.26);
    this.smgModel.add(smgBody, smgStock, smgMag, smgSight);

    // A small fixed blade in the right hand. The whole group swings on the
    // melee timer instead of adding per-swing meshes.
    this.knifeModel = new THREE.Group();
    const knifeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.045, 0.3), steel);
    knifeBlade.position.set(0, 0.02, 0.2);
    const knifeTip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.04, 0.1), steel);
    knifeTip.position.set(0, 0.02, 0.38);
    knifeTip.rotation.x = -0.32;
    const knifeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.14), dark);
    knifeHandle.position.set(0, 0.01, -0.02);
    const knifeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.022), accent);
    knifeGuard.position.set(0, 0.015, 0.065);
    this.knifeModel.add(knifeBlade, knifeTip, knifeHandle, knifeGuard);

    this.inputBlocked = false;
    this.gun = new THREE.Group();
    this.gun.add(this.pistolModel, this.smgModel, this.knifeModel);
    this.gun.position.set(0, -0.37, 0.055);
    this.gun.visible = false;
    this.humanoid.arms.right.elbowPivot.add(this.gun);
    this.gun.traverse((object) => {
      if (object.isMesh) object.castShadow = true;
    });
    this.syncGunModel();
  }

  syncGunModel() {
    this.pistolModel.visible = this.weaponKey === 'pistol';
    this.smgModel.visible = this.weaponKey === 'smg';
    this.knifeModel.visible = this.weaponKey === 'knife';
  }

  applyTransform() {
    this.group.position.copy(this.position);
    this.humanoid.setFacing(this.facing);
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  get saveState() {
    return {
      cash: this.cash,
      health: this.health,
      armor: this.armor,
      wanted: this.wanted,
      mission: this.mission,
      playSeconds: this.playSeconds,
      weaponKey: this.weaponKey,
      weapons: {
        pistol: { ...this.weapons.pistol },
        smg: { ...this.weapons.smg },
      },
      cameraYaw: this.cameraYaw,
      cameraPitch: this.cameraPitch,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
    };
  }

  update(dt, input) {
    this.playSeconds += dt;
    if (this.exitCooldown > 0) this.exitCooldown -= dt;
    if (this.vehicleHitCooldown > 0) this.vehicleHitCooldown = Math.max(0, this.vehicleHitCooldown - dt);
    const mouse = input.consumeMouse();

    if (this.dead) {
      this.aiming = false;
      this.humanoid.aiming = false;
      this.speed = 0;
      this.nearVehicle = null;
      this.humanoid.update(dt, 0, false);
      return;
    }

    if (this.driving) {
      this.aiming = false;
      this.humanoid.aiming = false;
      this.updateDriving(dt, input, mouse);
      return;
    }

    // Seated: the camera still orbits, but there is no movement, fire or
    // vehicle entry. E (through Interactions) or Space stands up.
    if (this.sitting) {
      this.aiming = false;
      this.humanoid.aiming = false;
      if (mouse.x !== 0) this.cameraYaw -= mouse.x * CAMERA.sensitivity;
      if (mouse.y !== 0) this.cameraPitch = clamp(this.cameraPitch + mouse.y * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
      if (mouse.wheel !== 0) {
        this.cameraDistance = clamp(this.cameraDistance + mouse.wheel * 0.0035, CAMERA.minDistance, CAMERA.maxDistance);
      }
      const axes = this.inputBlocked ? { forward: 0, strafe: 0 } : input.moveAxis();
      // E/Space stand through the interaction layer; a movement key stands too,
      // as the design promises. Movement resumes on the next frame.
      if (!this.inputBlocked && (axes.forward !== 0 || axes.strafe !== 0 || input.wasPressed('Space'))) {
        this.stand();
      }
      this.velocity.set(0, 0, 0);
      this.speed = 0;
      this.nearVehicle = null;
      this.applyTransform();
      this.humanoid.update(dt, 0, false);
      return;
    }

    if (this.knockdown > 0) {
      this.updateKnockdown(dt);
      this.nearVehicle = null;
      this.applyTransform();
      this.humanoid.update(dt, 0, !this.grounded);
      return;
    }

    this.aiming = input.isMouseDown(2) && !this.inputBlocked;
    this.humanoid.aiming = this.aiming;

    if (mouse.x !== 0) this.cameraYaw -= mouse.x * CAMERA.sensitivity;
    if (mouse.y !== 0) this.cameraPitch = clamp(this.cameraPitch + mouse.y * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
    if (mouse.wheel !== 0) {
      this.cameraDistance = clamp(this.cameraDistance + mouse.wheel * 0.0035, CAMERA.minDistance, CAMERA.maxDistance);
    }

    const axes = this.inputBlocked ? { forward: 0, strafe: 0 } : input.moveAxis();
    const forward = axes.forward;
    const strafe = axes.strafe;
    const hasInput = forward !== 0 || strafe !== 0;
    const sprint = !this.inputBlocked && input.isDown('ShiftLeft', 'ShiftRight');
    const sin = Math.sin(this.cameraYaw);
    const cos = Math.cos(this.cameraYaw);
    let wishX = -sin * forward + cos * strafe;
    let wishZ = -cos * forward - sin * strafe;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 1) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    const maxSpeed = this.aiming ? 2.65 : sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const targetX = hasInput ? wishX * maxSpeed : 0;
    const targetZ = hasInput ? wishZ * maxSpeed : 0;
    const acceleration = (this.grounded ? PLAYER.acceleration : PLAYER.airAcceleration) * dt;
    if (hasInput) {
      this.velocity.x = moveTowards(this.velocity.x, targetX, acceleration);
      this.velocity.z = moveTowards(this.velocity.z, targetZ, acceleration);
    } else if (this.grounded) {
      const friction = PLAYER.friction * dt;
      this.velocity.x = moveTowards(this.velocity.x, 0, friction);
      this.velocity.z = moveTowards(this.velocity.z, 0, friction);
    }

    if (!this.inputBlocked && input.wasPressed('Space') && this.grounded) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.grounded = false;
    }

    this.moveHorizontal(dt);
    this.resolveVehicleContacts();

    this.velocity.y -= PLAYER.gravity * dt;
    this.position.y += this.velocity.y * dt;
    const ground = this.world.groundHeightAt(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    if (this.grounded && ground > this.position.y) this.position.y = ground;

    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed = damp(this.speed, horizontal, 14, dt);
    if (this.aiming) {
      this.facing = dampAngle(this.facing, this.cameraYaw - Math.PI, 18, dt);
    } else if (horizontal > 0.25) {
      const desiredFacing = Math.atan2(this.velocity.x, this.velocity.z);
      this.facing = dampAngle(this.facing, desiredFacing, 13, dt);
    }

    if (this.position.y < -6) this.resetToSpawn();
    this.nearVehicle = this.vehicles ? this.vehicles.nearestEnterable(this.position, 2.2) : null;
    this.applyTransform();
    this.humanoid.update(dt, horizontal, !this.grounded);
  }

  updateDriving(dt, input, mouse) {
    const car = this.driving;
    if (!car || car.removed) {
      this.driving = null;
      this.group.visible = true;
      return;
    }

    if (mouse.x !== 0) {
      this.driveOrbitYaw = clamp(this.driveOrbitYaw - mouse.x * CAMERA.sensitivity * 1.05, -2.7, 2.7);
      this.driveLookHold = 2.1;
    }
    if (mouse.y !== 0) {
      this.drivePitch = clamp(this.drivePitch + mouse.y * CAMERA.sensitivity, -0.12, 0.62);
      this.driveLookHold = 2.1;
    }
    if (this.driveLookHold > 0) this.driveLookHold -= dt;
    else this.driveOrbitYaw = damp(this.driveOrbitYaw, 0, 1.8, dt);

    const { forward, strafe } = this.inputBlocked ? { forward: 0, strafe: 0 } : input.moveAxis();
    car.controls.throttle = forward;
    car.controls.steer = -strafe;
    car.controls.brake = this.inputBlocked ? 1 : 0;
    car.controls.handbrake = this.inputBlocked || input.isDown('Space');
    car.controls.engine = true;

    this.position.copy(car.position);
    this.facing = car.yaw;
    this.speed = Math.abs(car.speed);
    this.applyTransform();
  }

  syncFromVehicle() {
    if (!this.driving) return;
    this.position.copy(this.driving.position);
    this.facing = this.driving.yaw;
    this.speed = Math.abs(this.driving.speed);
    this.applyTransform();
  }

  // ---------------------------------------------------------------- combat

  get weaponSpec() {
    return WEAPONS[this.weaponKey];
  }

  get weaponAmmo() {
    return this.weapons[this.weaponKey];
  }

  get combatState() {
    const spec = this.weaponSpec;
    const ammo = this.weaponAmmo;
    const melee = Boolean(spec.melee);
    const moveBloom = Math.min(16, this.speed * 1.5);
    const baseBloom = this.aiming ? 2.5 : 8;
    return {
      key: this.weaponKey,
      weaponKey: this.weaponKey,
      name: spec.name,
      short: spec.short,
      melee,
      ammo: melee ? null : ammo.ammo,
      mag: melee ? 0 : spec.mag,
      reserve: melee ? null : ammo.reserve,
      ownedSmg: this.weapons.smg.owned,
      reloading: this.reloadTimer > 0,
      reloadProgress: this.reloadTimer > 0 ? 1 - this.reloadTimer / Math.max(0.01, this.reloadTotal) : 1,
      aiming: this.aiming,
      hitMarker: this.hitMarker,
      damageFlash: this.damageFlash,
      crosshair: melee ? 4 : spec.spread * 620 + baseBloom + moveBloom,
      dead: this.dead,
      // The five-slot strip in the HUD. The knife is always on Rae's belt;
      // the SMG is only live once it has been picked up or issued by a job.
      loadout: [
        {
          key: 'pistol',
          name: WEAPONS.pistol.name,
          short: WEAPONS.pistol.short,
          icon: 'pistol',
          owned: this.weapons.pistol.owned,
          ammo: this.weapons.pistol.ammo,
          reserve: this.weapons.pistol.reserve,
        },
        {
          key: 'smg',
          name: WEAPONS.smg.name,
          short: WEAPONS.smg.short,
          icon: 'smg',
          owned: this.weapons.smg.owned,
          locked: !this.weapons.smg.owned,
          ammo: this.weapons.smg.ammo,
          reserve: this.weapons.smg.reserve,
        },
        {
          key: 'knife',
          name: 'Street Knife',
          short: 'CQC',
          icon: 'knife',
          owned: true,
          melee: true,
          ammo: null,
          reserve: null,
        },
        {
          key: 'rifle',
          name: 'Harbor Rifle',
          short: 'RIFLE',
          icon: 'rifle',
          owned: false,
          locked: true,
          ammo: null,
          reserve: null,
        },
        {
          key: 'rpg',
          name: 'RPG',
          short: 'RPG',
          icon: 'rpg',
          owned: false,
          locked: true,
          ammo: null,
          reserve: null,
        },
      ],
    };
  }

  selectWeapon(key) {
    return selectWeapon(this, key);
  }

  startReload() {
    return startReload(this);
  }

  finishReload() {
    return finishReload(this);
  }

  updateCombat(dt, input, camera) {
    return updateCombat(this, dt, input, camera);
  }

  fireWeapon(camera) {
    return fireWeapon(this, camera);
  }

  meleeAttack(camera) {
    return meleeAttack(this, camera);
  }

  applyDamage(amount, fromX = null, fromZ = null) {
    return applyDamage(this, amount, fromX, fromZ);
  }

  heal(amount) {
    return heal(this, amount);
  }

  addArmor(amount) {
    return addArmor(this, amount);
  }

  grantWeapon(key, reserve = 0) {
    return grantWeapon(this, key, reserve);
  }

  revive(x = PLAYER.spawn.x, z = PLAYER.spawn.z, facing = PLAYER.spawnFacing, cameraYaw = facing + Math.PI) {
    this.clearSeat();
    this.dead = false;
    this.health = PLAYER.health;
    this.armor = PLAYER.armor;
    this.damageFlash = 0;
    this.reloadTimer = 0;
    this.aiming = false;
    this.knockdown = 0;
    this.vehicleHitCooldown = 0;
    this.carjacked = false;
    this.humanoid.aiming = false;
    this.humanoid.group.rotation.z = 0;
    this.group.visible = true;
    this.teleport(x, z, facing, cameraYaw);
  }

  clearSeat() {
    if (this.seat && this.seat.occupant === 'player') this.seat.occupant = null;
    this.seat = null;
    this.sitting = false;
    if (this.humanoid) this.humanoid.seated = false;
  }

  /** Snap onto a free seat and face the way the seat does. */
  sitAt(seat) {
    if (!seat || this.driving || this.dead) return false;
    if (seat.occupant && seat.occupant !== 'player') return false;
    this.clearSeat();
    this.sitting = true;
    this.seat = seat;
    seat.occupant = 'player';
    this.position.set(seat.x, this.world.groundHeightAt(seat.x, seat.z), seat.z);
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.grounded = true;
    this.knockdown = 0;
    this.facing = seat.yaw;
    this.cameraYaw = seat.yaw + Math.PI;
    this.cameraPitch = CAMERA.pitch;
    this.humanoid.seated = true;
    this.nearVehicle = null;
    this.applyTransform();
    this.snapCamera();
    return true;
  }

  stand() {
    if (!this.sitting) return;
    this.clearSeat();
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.applyTransform();
  }

  handleVehicleInput(input, { allowE = true } = {}) {
    if (this.knockdown > 0 || this.dead || this.sitting) return;
    const use = input.wasPressed('KeyF') || (allowE && input.wasPressed('KeyE'));
    if (!use) return;
    if (this.driving) {
      this.exitVehicle();
    } else if (this.vehicles && this.exitCooldown <= 0) {
      const car = this.vehicles.nearestEnterable(this.position, 2.25);
      if (car) this.enterVehicle(car);
    }
  }

  enterVehicle(car) {
    if (!car || this.driving) return;
    this.clearSeat();
    this.carjacked = false;
    if (car.type === 'police' && this.police) this.police.reportCarTheft(car);
    // An AI civilian driver bails out at the door; a cruiser's crew does not.
    if (car.type !== 'police' && (car.driver === 'ai' || Boolean(car.ai)) && this.traffic?.ejectDriver) {
      this.carjacked = Boolean(this.traffic.ejectDriver(car));
    }
    this.driving = car;
    car.driver = 'player';
    car.ai = null;
    car.setDriver('player');
    car.velocity.multiplyScalar(0.35);
    car.controls.throttle = 0;
    car.controls.brake = 0;
    car.controls.steer = 0;
    car.controls.handbrake = false;
    this.velocity.set(0, 0, 0);
    this.group.visible = false;
    this.nearVehicle = null;
    this.driveOrbitYaw = 0;
    this.drivePitch = 0.13;
    this.driveLookHold = 0;
    this.position.copy(car.position);
    this.facing = car.yaw;
    this.speed = Math.abs(car.speed);
    this._cameraInitialized = false;
  }

  exitVehicle() {
    const car = this.driving;
    if (!car) return;
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    const candidates = [
      [car.halfWidth + 0.85, 0],
      [-(car.halfWidth + 0.85), 0],
      [0, -(car.halfLength + 1.0)],
      [0, car.halfLength + 1.0],
    ];
    let placed = false;
    let spotX = car.position.x + cos * (car.halfWidth + 0.85);
    let spotZ = car.position.z - sin * (car.halfWidth + 0.85);
    for (const [side, forward] of candidates) {
      const x = car.position.x + cos * side + sin * forward;
      const z = car.position.z - sin * side + cos * forward;
      if (this.world.collides(x, z, PLAYER.radius)) continue;
      if (this.vehicles && this.vehicles.blocksPoint(x, z, PLAYER.radius, car)) continue;
      spotX = x;
      spotZ = z;
      placed = true;
      break;
    }
    if (!placed) {
      spotX = car.position.x + cos * (car.halfWidth + 1.4);
      spotZ = car.position.z - sin * (car.halfWidth + 1.4);
    }

    this.driving = null;
    car.driver = null;
    car.ai = null;
    car.setDriver(null);
    car.controls.brake = 1;
    car.controls.handbrake = true;
    this.group.visible = true;
    this.position.set(spotX, this.world.groundHeightAt(spotX, spotZ), spotZ);
    this.velocity.set(0, 0, 0);
    this.facing = Math.atan2(spotX - car.position.x, spotZ - car.position.z);
    this.cameraYaw = this.facing + Math.PI;
    this.cameraPitch = CAMERA.pitch;
    this.cameraDistance = CAMERA.distance;
    this.speed = 0;
    this.nearVehicle = null;
    this.exitCooldown = 0.65;
    this._cameraInitialized = false;
    this.applyTransform();
    this.snapCamera();
  }

  moveHorizontal(dt) {
    const radius = PLAYER.radius;
    const stepX = this.velocity.x * dt;
    if (stepX !== 0) {
      const nextX = this.position.x + stepX;
      const blockedByCar = this.vehicles && this.vehicles.blocksPoint(nextX, this.position.z, radius, this.driving);
      if (!this.world.collides(nextX, this.position.z, radius) && !blockedByCar) {
        const nextGround = this.world.groundHeightAt(nextX, this.position.z);
        if (nextGround - this.position.y <= 0.62) this.position.x = nextX;
        else this.velocity.x = 0;
      } else {
        this.velocity.x = 0;
      }
    }
    const stepZ = this.velocity.z * dt;
    if (stepZ !== 0) {
      const nextZ = this.position.z + stepZ;
      const blockedByCar = this.vehicles && this.vehicles.blocksPoint(this.position.x, nextZ, radius, this.driving);
      if (!this.world.collides(this.position.x, nextZ, radius) && !blockedByCar) {
        const nextGround = this.world.groundHeightAt(this.position.x, nextZ);
        if (nextGround - this.position.y <= 0.62) this.position.z = nextZ;
        else this.velocity.z = 0;
      } else {
        this.velocity.z = 0;
      }
    }
  }

  // ------------------------------------------------------------ vehicle hits

  /** Push Rae's centre out of the car body along the shortest exit. */
  pushOutOfVehicle(hit, car = null) {
    if (!hit || hit.penetration <= 0) return;
    const amount = hit.penetration + 0.02;
    const nextX = this.position.x + hit.nx * amount;
    const nextZ = this.position.z + hit.nz * amount;
    if (!this.world.collides(nextX, nextZ, PLAYER.radius)) {
      this.position.x = nextX;
      this.position.z = nextZ;
      return;
    }
    // A wall behind the car: keep whichever single axis is free.
    if (!this.world.collides(nextX, this.position.z, PLAYER.radius)) this.position.x = nextX;
    else if (!this.world.collides(this.position.x, nextZ, PLAYER.radius)) this.position.z = nextZ;
    if (!car || car.overlapCircle(this.position.x, this.position.z, PLAYER.radius).penetration <= 0) return;

    // Squeezed into a gap narrower than Rae between the car and a wall: the
    // straight push cannot work, so slide around the body. Sample outward from
    // the current point and take the nearest spot clear of the wall, the car
    // and every other parked body. This is the only case that may move her
    // along the car, and it never lands inside the wall.
    const startX = this.position.x;
    const startZ = this.position.z;
    for (let radius = 0.4; radius <= 5.2; radius += 0.25) {
      for (let step = 0; step < 24; step += 1) {
        const angle = (step / 24) * Math.PI * 2;
        const x = startX + Math.cos(angle) * radius;
        const z = startZ + Math.sin(angle) * radius;
        if (this.world.collides(x, z, PLAYER.radius)) continue;
        if (car.overlapCircle(x, z, PLAYER.radius).penetration > 0) continue;
        if (this.vehicles && this.vehicles.blocksPoint(x, z, PLAYER.radius, car)) continue;
        this.position.x = x;
        this.position.z = z;
        return;
      }
    }
  }

  /**
   * A moving car that overlaps Rae always pushes her clear. Above ~2.5 m/s the
   * same contact also lands one damage hit and a 0.9 s knockdown behind the
   * shared vehicleHitCooldown; below that speed it is only a shove.
   */
  resolveVehicleContacts() {
    if (!this.vehicles || this.driving || this.dead) return;
    for (const car of this.vehicles.list) {
      if (car.removed || car === this.driving) continue;
      const dx = car.position.x - this.position.x;
      const dz = car.position.z - this.position.z;
      const reach = car.halfLength + PLAYER.radius + 1;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const speed = Math.abs(car.speed);
      const closing = speed > 2.5 && this.vehicleHitCooldown <= 0;
      const hit = car.overlapCircle(this.position.x, this.position.z, PLAYER.radius + (closing ? 0.3 : 0));
      if (hit.penetration <= 0) continue;
      this.pushOutOfVehicle(hit, car);
      if (!closing) continue;
      if (this.hitByVehicle(car, Math.min(30, 8 + speed * 0.8))) break;
    }
  }

  /** The one impact path shared by civilian cars and police rams. */
  hitByVehicle(car, damage = 16) {
    if (!car || car.removed || this.dead || this.driving) return false;
    if (this.vehicleHitCooldown > 0) return false;
    const hit = car.overlapCircle(this.position.x, this.position.z, PLAYER.radius + 0.3);
    let nx = hit.nx;
    let nz = hit.nz;
    if (hit.penetration > 0) {
      this.pushOutOfVehicle(hit, car);
    } else {
      // A close police ram can land before the boxes touch: shove along the
      // centre line so the player still clears the car.
      const dx = this.position.x - car.position.x;
      const dz = this.position.z - car.position.z;
      const length = Math.hypot(dx, dz);
      if (length > 1e-4) {
        nx = dx / length;
        nz = dz / length;
        const nextX = this.position.x + nx * 0.4;
        const nextZ = this.position.z + nz * 0.4;
        if (!this.world.collides(nextX, nextZ, PLAYER.radius)) {
          this.position.x = nextX;
          this.position.z = nextZ;
        }
      }
    }
    const speed = Math.abs(car.speed);
    const push = 4 + speed * 0.7;
    this.velocity.set(nx * push, 3.4, nz * push);
    this.grounded = false;
    this.knockdown = 0.9;
    this.vehicleHitCooldown = 1.25;
    this.aiming = false;
    this.humanoid.aiming = false;
    this.gun.visible = false;
    this.facing = Math.atan2(nx, nz);
    this.humanoid.setFacing(this.facing);
    const amount = Math.max(1, Number(damage) || 0);
    this.lastVehicleHit = {
      type: car.type,
      name: car.name,
      speed: Math.round(speed * 100) / 100,
      damage: amount,
      x: car.position.x,
      z: car.position.z,
    };
    if (this.effects) {
      this.effects.impact(new THREE.Vector3(car.position.x, this.position.y + 0.9, car.position.z), null, 'metal');
      this.effects.shake(0.5);
    }
    if (this.audio) this.audio.impact(1.2);
    // Route through the police director when it exists so a lethal ram still
    // raises the wasted overlay.
    if (this.police) this.police.damagePlayer(amount, car.position.x, car.position.z);
    else this.applyDamage(amount, car.position.x, car.position.z);
    return true;
  }

  updateKnockdown(dt) {
    this.aiming = false;
    this.humanoid.aiming = false;
    // Never remain inside a body even while sliding: push out first, then let
    // the knockback carry the body away.
    this.resolveVehicleContacts();
    const friction = Math.exp(-4.2 * dt);
    this.velocity.x *= friction;
    this.velocity.z *= friction;
    this.moveHorizontal(dt);
    this.velocity.y -= PLAYER.gravity * dt;
    this.position.y += this.velocity.y * dt;
    const ground = this.world.groundHeightAt(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    this.speed = damp(this.speed, 0, 10, dt);
    this.knockdown = Math.max(0, this.knockdown - dt);
    this.humanoid.group.rotation.z = damp(this.humanoid.group.rotation.z, this.knockdown > 0 ? 1.18 : 0, 16, dt);
    if (this.knockdown <= 0) {
      this.knockdown = 0;
      this.humanoid.group.rotation.z = 0;
      this.velocity.x *= 0.2;
      this.velocity.z *= 0.2;
      // The 0.35 s post-hit grace stops an instant second hit.
      this.vehicleHitCooldown = Math.max(this.vehicleHitCooldown, 0.35);
    }
  }

  computeCameraDesired(out) {
    const aiming = this.aiming && !this.driving;
    const distance = aiming ? 3.05 : this.cameraDistance;
    const pitch = aiming ? Math.min(this.cameraPitch, 0.12) : this.cameraPitch;
    const target = this.cameraTarget.set(this.position.x, this.position.y + CAMERA.lookHeight, this.position.z);
    if (aiming) {
      // Shift the whole framing to the player's right so the shoulder and the
      // crosshair do not fight for the same pixels.
      target.x += Math.cos(this.cameraYaw) * 0.48;
      target.z -= Math.sin(this.cameraYaw) * 0.48;
    }
    const horizontal = Math.cos(pitch) * distance;
    out.set(
      target.x + Math.sin(this.cameraYaw) * horizontal,
      target.y + Math.sin(pitch) * distance + CAMERA.heightOffset,
      target.z + Math.cos(this.cameraYaw) * horizontal,
    );
    return out;
  }

  snapCamera() {
    this.computeCameraDesired(this.cameraPosition);
    this.world.clipCamera(this.cameraTarget, this.cameraPosition, 0.3, this.cameraPosition);
    this._cameraInitialized = true;
  }

  updateView(camera, dt, immediate = false) {
    if (this.driving) this.updateDriveView(camera, dt, immediate);
    else this.updateFootView(camera, dt, immediate);
  }

  updateCamera(camera, dt, immediate = false) {
    this.updateView(camera, dt, immediate);
  }

  updateFootView(camera, dt, immediate = false) {
    this.computeCameraDesired(this.cameraPosition);
    this.world.clipCamera(this.cameraTarget, this.cameraPosition, 0.3, this.cameraPosition);
    if (!this._smoothCamera) this._smoothCamera = this.cameraPosition.clone();
    if (immediate || !this._cameraInitialized) {
      this._smoothCamera.copy(this.cameraPosition);
      this._cameraInitialized = true;
    } else {
      const alpha = 1 - Math.exp(-CAMERA.damping * dt);
      this._smoothCamera.lerp(this.cameraPosition, alpha);
      this.world.clipCamera(this.cameraTarget, this._smoothCamera, 0.3, this._smoothCamera);
    }
    camera.position.copy(this._smoothCamera);
    camera.lookAt(this.cameraTarget);
    if (this.recoil > 0.0002) {
      camera.rotation.x += this.recoil * 0.8;
      camera.rotation.z += Math.sin(this.playSeconds * 83) * this.recoil * 0.12;
    }
    const targetFov = this.aiming ? 49 : CAMERA.fov;
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov = damp(camera.fov, targetFov, 11, dt);
      camera.updateProjectionMatrix();
    }
  }

  updateDriveView(camera, dt, immediate = false) {
    const car = this.driving;
    if (!car) {
      this.updateFootView(camera, dt, immediate);
      return;
    }
    const speed = Math.abs(car.speed);
    const orbit = this.driveOrbitYaw;
    const yaw = car.yaw + Math.PI + orbit;
    const cosPitch = Math.cos(this.drivePitch);
    const distance = 7.5 + Math.min(2.7, speed * 0.07);
    const lookAhead = 4.8 + speed * 0.16;
    this.cameraTarget.set(
      car.position.x + Math.sin(car.yaw) * lookAhead,
      car.position.y + 1.5,
      car.position.z + Math.cos(car.yaw) * lookAhead,
    );
    this.cameraPosition.set(
      car.position.x + Math.sin(yaw) * cosPitch * distance,
      car.position.y + 2.15 + Math.sin(this.drivePitch) * distance,
      car.position.z + Math.cos(yaw) * cosPitch * distance,
    );
    this.world.clipCamera(this.cameraTarget, this.cameraPosition, 0.45, this.cameraPosition);
    if (!this._smoothCamera) this._smoothCamera = this.cameraPosition.clone();
    if (immediate || !this._cameraInitialized) {
      this._smoothCamera.copy(this.cameraPosition);
      this._cameraInitialized = true;
    } else {
      const alpha = 1 - Math.exp(-7.4 * dt);
      this._smoothCamera.lerp(this.cameraPosition, alpha);
      this.world.clipCamera(this.cameraTarget, this._smoothCamera, 0.45, this._smoothCamera);
    }
    camera.position.copy(this._smoothCamera);
    camera.lookAt(this.cameraTarget);
    const targetFov = CAMERA.fov + clamp(speed * 0.28, 0, 11);
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov = damp(camera.fov, targetFov, 4.5, dt);
      camera.updateProjectionMatrix();
    }
  }

  faceCamera() {
    this.facing = this.cameraYaw - Math.PI;
    this.humanoid.setFacing(this.facing);
  }

  teleport(x, z, facing = this.facing, cameraYaw = facing + Math.PI) {
    this.clearSeat();
    this.position.set(x, this.world.groundHeightAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.cameraYaw = cameraYaw;
    this.grounded = true;
    this.knockdown = 0;
    this.vehicleHitCooldown = 0;
    this.humanoid.group.rotation.z = 0;
    this.applyTransform();
    this.snapCamera();
  }
}
