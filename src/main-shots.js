// Deterministic ?shot= staging extracted from main.js: applying a shot, the
// mission stage pose, the armed pose and the chase drama. Every function
// takes the Game instance; the shot table itself stays in shots.js.

import * as THREE from '../vendor/three.module.js';
import { CAMERA, PLAYER, START_OBJECTIVE } from './config.js';
import { SHOT_CLOCK } from './environment.js';
import { DEFAULT_TITLE_VIEW, STEP, byId } from './main-shared.js';

export function applyShot(game, shot) {
  game.shot = shot;
  // A capture should look the same on a machine that last played on low.
  if (game.quality !== 'high') {
    game.quality = 'high';
    game.applyQualityVisuals(true);
    game.refreshQualityLabel();
  }
  game.simTime = shot.time ?? 0;
  game.environment.setClock(game.timeOverride ?? SHOT_CLOCK);
  game.environment.apply(game.environmentTargets(), { force: true });
  game.hud.suppressToasts = true;
  game.hud.toast = null;
  const steps = Math.max(0, shot.prewarm ?? 0);

  if (shot.mode === 'title') {
    game.titleView = shot.titleCamera ?? DEFAULT_TITLE_VIEW;
    game.enterTitle();
    // A screenshot must not change with whatever save the machine happens to
    // hold, so the title capture always shows the fresh-slot menu.
    const continueButton = byId('btn-continue');
    if (continueButton) continueButton.disabled = true;
    if (game.ui.continueNote) game.ui.continueNote.textContent = 'No save yet';
    for (let i = 0; i < steps; i += 1) game.tick(STEP);
  } else {
    game.down = null;
    game.police.resetAfterDown();
    game.pickups.reset();
    game.missions.prepareShot();
    game.activities.suspended = true;
    game.hud.reward = null;
    game.hud.ending = null;
    game.enterPlaying({ lock: false, toast: shot.toast === true });
    game.objective = shot.objective ?? START_OBJECTIVE;
    if (game.objective.marker) {
      game.world.setObjectiveMarker(game.objective.marker.x, game.objective.marker.z);
    }
    game.player.health = PLAYER.health;
    game.player.armor = PLAYER.armor;
    game.player.cash = PLAYER.cash;
    game.player.wanted = 0;
    game.player.mission = 0;
    game.player.playSeconds = 0;
    game.player.dead = false;
    game.player.inputBlocked = false;
    game.player.humanoid.group.rotation.z = 0;
    game.player.gun.visible = false;
    if (shot.drive) {
      game.police.clearUnits();
      game.vehicles.clear();
      game.traffic.reset({ spawnBeach: false });
      game.stageDriveShot(shot.drive);
      if (shot.chase) game.police.stageChase(shot.chase, game.player.driving);
      game.player.updateCamera(game.camera, 0, true);
      for (let i = 0; i < steps; i += 1) game.tick(STEP);
      if (Number.isFinite(shot.health)) game.player.health = shot.health;
      if (Number.isFinite(shot.armor)) game.player.armor = shot.armor;
      game.player.damageFlash = 0;
      if (shot.chase) game.stageChaseDrama();
      game.hud.lastHealth = game.player.health;
      game.hud.lastArmor = game.player.armor;
      game.hud.healthFlash = 0;
      game.hud.armorFlash = 0;
    } else {
      const pose = shot.player;
      game.player.teleport(pose.x, pose.z, pose.facing, pose.cameraYaw);
      game.player.cameraPitch = pose.cameraPitch;
      game.player.cameraDistance = pose.distance;
      game.resetCityLife({ spawnBeach: shot.stage !== 'heist' });
      if (shot.police) game.police.stageChase(shot.police, game.player);
      game.player.updateCamera(game.camera, 0, true);
      for (let i = 0; i < steps; i += 1) game.tick(STEP);
    }
    if (shot.stage) game.applyStageShot(shot);
    // These final poses are applied after the simulation steps so the
    // screenshot is deterministic: the helicopter, dialogue and bodywork
    // stay exactly where the shot asked for them.
    if (shot.air) game.police.stageAir(shot.air);
    if (shot.dialogue) game.missions.subtitle = { ...shot.dialogue, life: 999 };
    if (shot.station) game.gasStation?.stageShot(shot.station);
    if (Number.isFinite(shot.health)) game.player.health = shot.health;
    if (Number.isFinite(shot.armor)) game.player.armor = shot.armor;
    game.hud.lastHealth = game.player.health;
    game.hud.lastArmor = game.player.armor;
    game.hud.healthFlash = 0;
    game.hud.armorFlash = 0;
    if (shot.weapons === 'smg') {
      game.player.weapons.smg.owned = true;
      game.player.weapons.smg.ammo = 32;
      game.player.weapons.smg.reserve = 96;
      game.player.weaponKey = 'smg';
      game.player.syncGunModel();
    }
    if (Number.isFinite(shot.condition) && game.player.driving) {
      game.player.driving.condition = shot.condition;
    }
    if (shot.armed) game.poseArmedPlayer(shot);
    if (shot.drama) game.stageChaseDrama();
  }

  game.shotLocked = true;
  game.lastHudState = game.hudState();
  if (game.hud.visible) game.hud.update(0, game.lastHudState);
  game.updateLookHint();
  game.renderer.render(game.scene, game.camera);
}

export function applyStageShot(game, shot) {
  game.missions.stageShot(shot.stage);
  game.objective = game.missions.objective;
  game.world.setObjectiveMarker(game.objective.marker.x, game.objective.marker.z);
  if (game.world.objectiveMarker) game.world.objectiveMarker.group.visible = false;
  if (Number.isFinite(shot.health)) game.player.health = shot.health;
  if (Number.isFinite(shot.armor)) game.player.armor = shot.armor;
  game.player.aiming = false;
  game.player.humanoid.aiming = true;
  game.player.gun.visible = true;
  game.player.facing = shot.player?.facing ?? game.player.cameraYaw - Math.PI;
  game.player.humanoid.setFacing(game.player.facing);
  for (let i = 0; i < 20; i += 1) game.player.humanoid.update(1 / 60, 0, false);
  game.player.humanoid.aiming = false;
  if (shot.camera) {
    const [x, y, z] = shot.camera.position;
    game.camera.position.set(x, y, z);
    game.camera.fov = CAMERA.fov;
    game.camera.updateProjectionMatrix();
    game.camera.lookAt(shot.camera.target[0], shot.camera.target[1], shot.camera.target[2]);
  } else {
    game.player.updateCamera(game.camera, 0, true);
  }
  game.effects.update(0.45, game.camera);
  game.missions.stageShotDrama(shot.stage);
  game.player.aiming = true;
  game.player.damageFlash = 0.34;
  game.hud.lastHealth = game.player.health;
  game.hud.lastArmor = game.player.armor;
  game.hud.healthFlash = 0;
  game.hud.armorFlash = 0;
}

export function poseArmedPlayer(game, shot) {
  const facing = shot.player?.facing ?? game.player.facing;
  game.player.aiming = true;
  game.player.humanoid.aiming = true;
  game.player.gun.visible = true;
  game.player.facing = facing;
  game.player.humanoid.setFacing(facing);
  for (let i = 0; i < 20; i += 1) game.player.humanoid.update(1 / 60, 0, false);
  game.player.humanoid.aiming = false;
  game.player.aiming = false;
  game.player.gun.visible = true;
  game.player.damageFlash = 0.34;
  game.hud.lastHealth = game.player.health;
  game.hud.lastArmor = game.player.armor;
  game.hud.healthFlash = 0;
  game.hud.armorFlash = 0;
}

export function stageChaseDrama(game) {
  let best = null;
  let bestFacing = -Infinity;
  for (const unit of game.police.units) {
    if (!unit.car || unit.car.removed) continue;
    const car = unit.car;
    const dx = game.player.position.x - car.position.x;
    const dz = game.player.position.z - car.position.z;
    const length = Math.hypot(dx, dz) || 1;
    const facing = (Math.sin(car.yaw) * dx + Math.cos(car.yaw) * dz) / length;
    if (facing > bestFacing) {
      bestFacing = facing;
      best = car;
    }
  }
  if (!best) return;
  const forwardX = Math.sin(best.yaw);
  const forwardZ = Math.cos(best.yaw);
  const muzzle = new THREE.Vector3(
    best.position.x + forwardX * (best.halfLength + 0.35),
    best.position.y + 1.08,
    best.position.z + forwardZ * (best.halfLength + 0.35),
  );
  game.effects.smokePuff(best.position.x + forwardX * 1.4, best.position.y + 0.9, best.position.z + forwardZ * 1.4, {
    scale: 2.2,
    life: 2.2,
    color: 0x5c5156,
    rise: 1.2,
  });
  game.effects.update(0.42, null);
  game.effects.tracer(muzzle, new THREE.Vector3(game.player.position.x, game.player.position.y + 0.9, game.player.position.z), 0xffd08a);
  game.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd79a);
  game.player.damageFlash = 0.55;
}

export function stageDriveShot(game, drive) {
  const car = game.vehicles.spawn(drive.type ?? 'muscle', {
    x: drive.x,
    z: drive.z,
    yaw: drive.yaw,
    color: drive.color,
  });
  game.player.enterVehicle(car);
  const speed = drive.speed ?? 18;
  car.velocity.set(Math.sin(drive.yaw) * speed, 0, Math.cos(drive.yaw) * speed);
  car.controls.throttle = 0;
  car.controls.brake = 0;
  car.controls.steer = 0;
  car.controls.handbrake = false;
  game.player.drivePitch = drive.cameraPitch ?? 0.13;
  game.player.driveOrbitYaw = drive.cameraOrbit ?? 0;
  game.player.driveLookHold = 0;
  game.player.syncFromVehicle();
  game.effects.registerVehicle(car);
  game.traffic.stageDrive(car);
  game.world.focusAt(car.position.x, car.position.z);
  game.player.updateView(game.camera, 0, true);
}
