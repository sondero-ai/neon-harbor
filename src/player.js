// Rae's state and public surface: spawn/reset and save load, the low-poly
// body and weapon models, seat and transform helpers, and the combat readouts
// the HUD reads. Movement and the cameras live in player-controls.js, weapons
// and damage in player-combat.js; every public method here stays as a thin
// wrapper over those modules.

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
import {
  computeCameraDesired,
  enterVehicle,
  exitVehicle,
  faceCamera,
  handleVehicleInput,
  hitByVehicle,
  moveHorizontal,
  pushOutOfVehicle,
  resolveVehicleContacts,
  snapCamera,
  syncFromVehicle,
  teleport,
  update,
  updateCamera,
  updateDriveView,
  updateDriving,
  updateFootView,
  updateKnockdown,
  updateView,
} from './player-controls.js';

const clamp = THREE.MathUtils.clamp;

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
    return update(this, dt, input);
  }

  updateDriving(dt, input, mouse) {
    return updateDriving(this, dt, input, mouse);
  }

  syncFromVehicle() {
    return syncFromVehicle(this);
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

  handleVehicleInput(input, options = {}) {
    return handleVehicleInput(this, input, options);
  }

  enterVehicle(car) {
    return enterVehicle(this, car);
  }

  exitVehicle() {
    return exitVehicle(this);
  }

  moveHorizontal(dt) {
    return moveHorizontal(this, dt);
  }

  pushOutOfVehicle(hit, car = null) {
    return pushOutOfVehicle(this, hit, car);
  }

  resolveVehicleContacts() {
    return resolveVehicleContacts(this);
  }

  hitByVehicle(car, damage = 16) {
    return hitByVehicle(this, car, damage);
  }

  updateKnockdown(dt) {
    return updateKnockdown(this, dt);
  }

  computeCameraDesired(out) {
    return computeCameraDesired(this, out);
  }

  snapCamera() {
    return snapCamera(this);
  }

  updateView(camera, dt, immediate = false) {
    return updateView(this, camera, dt, immediate);
  }

  updateCamera(camera, dt, immediate = false) {
    return updateCamera(this, camera, dt, immediate);
  }

  updateFootView(camera, dt, immediate = false) {
    return updateFootView(this, camera, dt, immediate);
  }

  updateDriveView(camera, dt, immediate = false) {
    return updateDriveView(this, camera, dt, immediate);
  }

  faceCamera() {
    return faceCamera(this);
  }

  teleport(x, z, facing = this.facing, cameraYaw = facing + Math.PI) {
    return teleport(this, x, z, facing, cameraYaw);
  }
}
