// Third-person control for Rae. On foot: camera-relative movement, sprint,
// jump, curb stepping, building and vehicle collision, and a damped follow
// camera that slides in front of walls. Behind the wheel: throttle/steer/
// brake/handbrake controls for the car, a look-ahead chase camera with a
// free-look orbit, and the enter/exit handshake with vehicles.js.

import * as THREE from '../vendor/three.module.js';
import { CAMERA, PLAYER, WEAPONS } from './config.js';
import { Humanoid } from './humanoid.js';

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
    this.driving = null;
    this.nearVehicle = null;
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
    this.driving = null;
    this.nearVehicle = null;
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
    if (!WEAPONS[key] || !this.weapons[key]?.owned) return;
    if (key === this.weaponKey) return;
    this.weaponKey = key;
    this.reloadTimer = 0;
    this.syncGunModel();
    if (this.audio) this.audio.uiClick();
  }

  startReload() {
    const spec = this.weaponSpec;
    const ammo = this.weaponAmmo;
    if (!spec || spec.melee || this.reloadTimer > 0 || ammo.ammo >= spec.mag || ammo.reserve <= 0) return;
    this.reloadTimer = spec.reload;
    this.reloadTotal = spec.reload;
    if (this.audio) this.audio.reload();
  }

  finishReload() {
    const spec = this.weaponSpec;
    const ammo = this.weaponAmmo;
    const needed = spec.mag - ammo.ammo;
    const taken = Math.min(needed, ammo.reserve);
    ammo.ammo += taken;
    ammo.reserve -= taken;
  }

  updateCombat(dt, input, camera) {
    if (this.dead) {
      this.gun.visible = false;
      return;
    }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.meleeSwing = Math.max(0, this.meleeSwing - dt);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 5.5);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);
    this.recoil = Math.max(0, this.recoil - dt * 0.24);
    if (this.knifeModel) {
      const swing = this.meleeSwing > 0 ? 1 - this.meleeSwing / 0.28 : 0;
      this.knifeModel.rotation.x = -Math.sin(swing * Math.PI) * 1.15;
    }

    if (input.wasPressed('Digit1')) this.selectWeapon('pistol');
    if (input.wasPressed('Digit2')) this.selectWeapon('smg');
    if (input.wasPressed('Digit3')) this.selectWeapon('knife');
    if (input.wasPressed('KeyR')) this.startReload();

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        this.finishReload();
        if (this.audio) this.audio.uiClick();
      }
    }

    if (this.driving) {
      this.gun.visible = false;
      if (input.wasMousePressed(0) || input.wasPressed('KeyH')) {
        if (this.audio) this.audio.horn();
      }
      return;
    }

    // The knife stays in hand while selected; the guns only come up when
    // aiming or just after a shot.
    this.gun.visible = Boolean(this.weaponSpec.melee) || this.aiming || this.fireCooldown > 0.16;
    this.gun.rotation.x = damp(this.gun.rotation.x, this.aiming ? Math.PI / 2 : 0, 18, dt);
    const wantsFire = this.weaponSpec.auto ? input.isMouseDown(0) : input.wasMousePressed(0);
    if (wantsFire) this.fireWeapon(camera);
  }

  fireWeapon(camera) {
    const spec = this.weaponSpec;
    const ammo = this.weaponAmmo;
    if (this.reloadTimer > 0 || this.fireCooldown > 0) return;
    if (spec.melee) {
      this.meleeAttack(camera);
      return;
    }
    if (ammo.ammo <= 0) {
      if (this.audio) this.audio.uiClick();
      this.startReload();
      return;
    }
    ammo.ammo -= 1;
    this.fireCooldown = 1 / spec.fireRate;
    this.recoil = Math.min(0.09, this.recoil + spec.kick);
    this.lastGunfire = this.playSeconds;
    // Hip fire turns the body with the camera so the tracer starts where the
    // weapon is actually pointing.
    this.facing = this.cameraYaw - Math.PI;
    this.humanoid.setFacing(this.facing);

    const origin = camera.position.clone();
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const spread = this.aiming ? spec.spread : spec.spread + spec.movingSpread;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    direction.addScaledVector(right, (Math.random() - 0.5) * spread * 2);
    direction.addScaledVector(up, (Math.random() - 0.5) * spread * 2);
    direction.normalize();

    const worldHit = this.world.raycast(origin, direction, spec.range);
    const maxDistance = worldHit ? worldHit.distance : spec.range;
    const policeTarget = this.police ? this.police.traceShot(origin, direction, maxDistance) : null;
    const missionTarget = this.missions ? this.missions.traceShot(origin, direction, maxDistance) : null;
    const pedTarget = this.traffic ? this.traffic.traceShot(origin, direction, maxDistance) : null;
    let target = policeTarget;
    if (missionTarget && (!target || missionTarget.distance < target.distance)) target = missionTarget;
    if (pedTarget && (!target || pedTarget.distance < target.distance)) target = pedTarget;
    const endpoint = new THREE.Vector3();
    if (target) {
      endpoint.copy(target.point);
      this.hitMarker = 1;
      if (target.enemy && this.missions) {
        this.missions.applyPlayerHit(target, spec.damage, { weapon: this.weaponKey });
      } else if (target.type === 'ped' && this.traffic) {
        this.traffic.applyPlayerHit(target, spec.damage);
      } else if (this.police) {
        this.police.applyPlayerHit(target, spec.damage, { weapon: this.weaponKey });
      }
    } else if (worldHit) {
      endpoint.copy(worldHit.point);
      if (this.effects) this.effects.impact(worldHit.point, worldHit.normal, worldHit.kind === 'building' ? 'concrete' : 'concrete');
    } else {
      endpoint.copy(origin).addScaledVector(direction, spec.range);
    }

    const muzzle = new THREE.Vector3(
      this.position.x + Math.sin(this.facing) * 0.62,
      this.position.y + 1.36,
      this.position.z + Math.cos(this.facing) * 0.62,
    );
    if (this.effects) {
      this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd79a);
      this.effects.tracer(muzzle, endpoint, spec.tracer);
      this.effects.shake(spec.auto ? 0.09 : 0.16);
    }
    if (this.audio) this.audio.gunshot(this.weaponKey);
    if (this.police) this.police.reportGunfire(this.position.x, this.position.z);
    if (this.weaponAmmo.ammo <= 0 && this.weaponAmmo.reserve > 0) this.startReload();
  }

  /** A 2.1 m silent swing. No ammo, no gunshot and no gunfire report. */
  meleeAttack(camera) {
    const spec = this.weaponSpec;
    if (!spec.melee || this.fireCooldown > 0) return;
    this.fireCooldown = 1 / spec.fireRate;
    this.meleeSwing = 0.28;
    this.facing = this.cameraYaw - Math.PI;
    this.humanoid.setFacing(this.facing);

    // The reach is measured from Rae's chest along the chase camera's forward
    // direction; a camera-origin ray could never touch anything in front of her.
    const origin = new THREE.Vector3(this.position.x, this.position.y + 1.2, this.position.z);
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const worldHit = this.world.raycast(origin, direction, spec.range);
    const maxDistance = worldHit ? Math.min(spec.range, worldHit.distance) : spec.range;
    const policeTarget = this.police ? this.police.traceShot(origin, direction, maxDistance) : null;
    const missionTarget = this.missions ? this.missions.traceShot(origin, direction, maxDistance) : null;
    const pedTarget = this.traffic ? this.traffic.traceShot(origin, direction, maxDistance) : null;
    let target = policeTarget;
    if (missionTarget && (!target || missionTarget.distance < target.distance)) target = missionTarget;
    if (pedTarget && (!target || pedTarget.distance < target.distance)) target = pedTarget;
    if (!target) return;

    this.hitMarker = 1;
    const meleeTarget = { ...target, headshot: false };
    if (target.enemy && this.missions) {
      this.missions.applyPlayerHit(meleeTarget, spec.damage, { weapon: 'knife' });
    } else if (target.type === 'ped' && this.traffic) {
      this.traffic.applyPlayerHit(meleeTarget, spec.damage);
    } else if (this.police) {
      this.police.applyPlayerHit(meleeTarget, spec.damage, { weapon: 'knife' });
    }
    if (this.effects) {
      this.effects.impact(target.point, null, 'metal');
      this.effects.shake(0.1);
    }
    if (this.audio) this.audio.knife();
  }

  applyDamage(amount, fromX = null, fromZ = null) {
    if (this.dead) return true;
    let remaining = Math.max(0, amount);
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.62);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health = Math.max(0, this.health - remaining);
    this.damageFlash = Math.min(1.4, this.damageFlash + 0.55 + amount * 0.012);
    if (this.effects) {
      this.effects.hurt(Math.min(0.7, amount * 0.024 + 0.08));
      this.effects.shake(Math.min(0.55, amount * 0.026));
    }
    if (this.audio) this.audio.hurt();
    if (fromX !== null && fromZ !== null) {
      this.lastHitAngle = Math.atan2(fromX - this.position.x, fromZ - this.position.z);
    }
    if (this.health <= 0) {
      this.dead = true;
      this.aiming = false;
      this.humanoid.aiming = false;
      this.gun.visible = false;
    }
    return this.dead;
  }

  heal(amount) {
    if (this.dead) return 0;
    const before = this.health;
    this.health = Math.min(100, this.health + amount);
    return this.health - before;
  }

  addArmor(amount) {
    if (this.dead) return 0;
    const before = this.armor;
    this.armor = Math.min(100, this.armor + amount);
    return this.armor - before;
  }

  grantWeapon(key, reserve = 0) {
    if (!WEAPONS[key]) return;
    const slot = this.weapons[key];
    const fresh = !slot.owned;
    slot.owned = true;
    slot.reserve = Math.min(999, slot.reserve + reserve);
    if (fresh) slot.ammo = Math.min(WEAPONS[key].mag, slot.reserve);
    if (fresh) this.selectWeapon(key);
  }

  revive(x = PLAYER.spawn.x, z = PLAYER.spawn.z, facing = PLAYER.spawnFacing, cameraYaw = facing + Math.PI) {
    this.dead = false;
    this.health = PLAYER.health;
    this.armor = PLAYER.armor;
    this.damageFlash = 0;
    this.reloadTimer = 0;
    this.aiming = false;
    this.humanoid.aiming = false;
    this.humanoid.group.rotation.z = 0;
    this.group.visible = true;
    this.teleport(x, z, facing, cameraYaw);
  }

  handleVehicleInput(input) {
    if (input.wasPressed('KeyF', 'KeyE')) {
      if (this.driving) {
        this.exitVehicle();
      } else if (this.vehicles && this.exitCooldown <= 0) {
        const car = this.vehicles.nearestEnterable(this.position, 2.25);
        if (car) this.enterVehicle(car);
      }
    }
  }

  enterVehicle(car) {
    if (!car || this.driving) return;
    if (car.type === 'police' && this.police) this.police.reportCarTheft(car);
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
    this.position.set(x, this.world.groundHeightAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.cameraYaw = cameraYaw;
    this.grounded = true;
    this.applyTransform();
    this.snapCamera();
  }
}
