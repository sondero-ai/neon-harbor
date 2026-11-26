// Rae's weapons and damage: weapon selection, reload, the hitscan pistol and
// SMG, the silent knife swing, hit resolution against police, mission actors
// and pedestrians, armor, health and weapon grants. Every function takes the
// Player instance; the weapon models and public getters stay in player.js.

import * as THREE from '../vendor/three.module.js';
import { WEAPONS } from './config.js';

const damp = THREE.MathUtils.damp;

export function selectWeapon(player, key) {
  if (!WEAPONS[key] || !player.weapons[key]?.owned) return;
  if (key === player.weaponKey) return;
  player.weaponKey = key;
  player.reloadTimer = 0;
  player.syncGunModel();
  if (player.audio) player.audio.uiClick();
}

export function startReload(player) {
  const spec = player.weaponSpec;
  const ammo = player.weaponAmmo;
  if (!spec || spec.melee || player.reloadTimer > 0 || ammo.ammo >= spec.mag || ammo.reserve <= 0) return;
  player.reloadTimer = spec.reload;
  player.reloadTotal = spec.reload;
  if (player.audio) player.audio.reload();
}

export function finishReload(player) {
  const spec = player.weaponSpec;
  const ammo = player.weaponAmmo;
  const needed = spec.mag - ammo.ammo;
  const taken = Math.min(needed, ammo.reserve);
  ammo.ammo += taken;
  ammo.reserve -= taken;
}

export function updateCombat(player, dt, input, camera) {
  if (player.dead) {
    player.gun.visible = false;
    return;
  }
  if (player.sitting) {
    player.aiming = false;
    player.humanoid.aiming = false;
    player.gun.visible = false;
    return;
  }
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.meleeSwing = Math.max(0, player.meleeSwing - dt);
  player.hitMarker = Math.max(0, player.hitMarker - dt * 5.5);
  player.damageFlash = Math.max(0, player.damageFlash - dt * 2.2);
  player.recoil = Math.max(0, player.recoil - dt * 0.24);
  if (player.knifeModel) {
    const swing = player.meleeSwing > 0 ? 1 - player.meleeSwing / 0.28 : 0;
    player.knifeModel.rotation.x = -Math.sin(swing * Math.PI) * 1.15;
    // The arm and hand follow the same swing, a beat behind the blade.
    player.humanoid.melee = player.meleeSwing > 0 ? swing : 0;
  }

  if (player.knockdown > 0) {
    player.aiming = false;
    player.humanoid.aiming = false;
    player.gun.visible = false;
    return;
  }

  if (input.wasPressed('Digit1')) player.selectWeapon('pistol');
  if (input.wasPressed('Digit2')) player.selectWeapon('smg');
  if (input.wasPressed('Digit3')) player.selectWeapon('knife');
  if (input.wasPressed('KeyR')) player.startReload();

  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) {
      player.reloadTimer = 0;
      player.finishReload();
      if (player.audio) player.audio.uiClick();
    }
  }

  if (player.driving) {
    player.gun.visible = false;
    if (input.wasMousePressed(0) || input.wasPressed('KeyH')) {
      if (player.audio) player.audio.horn();
    }
    return;
  }

  // The knife stays in hand while selected; the guns only come up when
  // aiming or just after a shot.
  player.gun.visible = Boolean(player.weaponSpec.melee) || player.aiming || player.fireCooldown > 0.16;
  player.gun.rotation.x = damp(player.gun.rotation.x, player.aiming ? Math.PI / 2 : 0, 18, dt);
  const wantsFire = player.weaponSpec.auto ? input.isMouseDown(0) : input.wasMousePressed(0);
  if (wantsFire) player.fireWeapon(camera);
}

export function fireWeapon(player, camera) {
  const spec = player.weaponSpec;
  const ammo = player.weaponAmmo;
  if (player.reloadTimer > 0 || player.fireCooldown > 0) return;
  if (spec.melee) {
    player.meleeAttack(camera);
    return;
  }
  if (ammo.ammo <= 0) {
    if (player.audio) player.audio.uiClick();
    player.startReload();
    return;
  }
  ammo.ammo -= 1;
  player.fireCooldown = 1 / spec.fireRate;
  player.recoil = Math.min(0.09, player.recoil + spec.kick);
  player.lastGunfire = player.playSeconds;
  // Hip fire turns the body with the camera so the tracer starts where the
  // weapon is actually pointing.
  player.facing = player.cameraYaw - Math.PI;
  player.humanoid.setFacing(player.facing);

  const origin = camera.position.clone();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const spread = player.aiming ? spec.spread : spec.spread + spec.movingSpread;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  direction.addScaledVector(right, (Math.random() - 0.5) * spread * 2);
  direction.addScaledVector(up, (Math.random() - 0.5) * spread * 2);
  direction.normalize();

  const worldHit = player.world.raycast(origin, direction, spec.range);
  const maxDistance = worldHit ? worldHit.distance : spec.range;
  const policeTarget = player.police ? player.police.traceShot(origin, direction, maxDistance) : null;
  const missionTarget = player.missions ? player.missions.traceShot(origin, direction, maxDistance) : null;
  const pedTarget = player.traffic ? player.traffic.traceShot(origin, direction, maxDistance) : null;
  let target = policeTarget;
  if (missionTarget && (!target || missionTarget.distance < target.distance)) target = missionTarget;
  if (pedTarget && (!target || pedTarget.distance < target.distance)) target = pedTarget;
  const endpoint = new THREE.Vector3();
  if (target) {
    endpoint.copy(target.point);
    player.hitMarker = 1;
    if (target.enemy && player.missions) {
      player.missions.applyPlayerHit(target, spec.damage, { weapon: player.weaponKey });
    } else if (target.type === 'ped' && player.traffic) {
      player.traffic.applyPlayerHit(target, spec.damage);
    } else if (player.police) {
      player.police.applyPlayerHit(target, spec.damage, { weapon: player.weaponKey });
    }
  } else if (worldHit) {
    endpoint.copy(worldHit.point);
    if (player.effects) player.effects.impact(worldHit.point, worldHit.normal, worldHit.kind === 'building' ? 'concrete' : 'concrete');
  } else {
    endpoint.copy(origin).addScaledVector(direction, spec.range);
  }

  const muzzle = new THREE.Vector3(
    player.position.x + Math.sin(player.facing) * 0.62,
    player.position.y + 1.36,
    player.position.z + Math.cos(player.facing) * 0.62,
  );
  if (player.effects) {
    player.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd79a);
    player.effects.tracer(muzzle, endpoint, spec.tracer);
    player.effects.shake(spec.auto ? 0.09 : 0.16);
  }
  if (player.audio) player.audio.gunshot(player.weaponKey);
  if (player.police) player.police.reportGunfire(player.position.x, player.position.z);
  if (player.weaponAmmo.ammo <= 0 && player.weaponAmmo.reserve > 0) player.startReload();
}

/** A 2.1 m silent swing. No ammo, no gunshot and no gunfire report. */
export function meleeAttack(player, camera) {
  const spec = player.weaponSpec;
  if (!spec.melee || player.fireCooldown > 0) return;
  player.fireCooldown = 1 / spec.fireRate;
  player.meleeSwing = 0.28;
  player.facing = player.cameraYaw - Math.PI;
  player.humanoid.setFacing(player.facing);

  // The reach is measured from Rae's chest along the chase camera's forward
  // direction; a camera-origin ray could never touch anything in front of her.
  const origin = new THREE.Vector3(player.position.x, player.position.y + 1.2, player.position.z);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const worldHit = player.world.raycast(origin, direction, spec.range);
  const maxDistance = worldHit ? Math.min(spec.range, worldHit.distance) : spec.range;
  const policeTarget = player.police ? player.police.traceShot(origin, direction, maxDistance) : null;
  const missionTarget = player.missions ? player.missions.traceShot(origin, direction, maxDistance) : null;
  const pedTarget = player.traffic ? player.traffic.traceShot(origin, direction, maxDistance) : null;
  let target = policeTarget;
  if (missionTarget && (!target || missionTarget.distance < target.distance)) target = missionTarget;
  if (pedTarget && (!target || pedTarget.distance < target.distance)) target = pedTarget;
  if (!target) return;

  player.hitMarker = 1;
  const meleeTarget = { ...target, headshot: false };
  if (target.enemy && player.missions) {
    player.missions.applyPlayerHit(meleeTarget, spec.damage, { weapon: 'knife' });
  } else if (target.type === 'ped' && player.traffic) {
    player.traffic.applyPlayerHit(meleeTarget, spec.damage);
  } else if (player.police) {
    player.police.applyPlayerHit(meleeTarget, spec.damage, { weapon: 'knife' });
  }
  if (player.effects) {
    player.effects.impact(target.point, null, 'metal');
    player.effects.shake(0.1);
  }
  if (player.audio) player.audio.knife();
}

export function applyDamage(player, amount, fromX = null, fromZ = null) {
  if (player.dead) return true;
  let remaining = Math.max(0, amount);
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, remaining * 0.62);
    player.armor -= absorbed;
    remaining -= absorbed;
  }
  player.health = Math.max(0, player.health - remaining);
  player.damageFlash = Math.min(1.4, player.damageFlash + 0.55 + amount * 0.012);
  if (player.effects) {
    player.effects.hurt(Math.min(0.7, amount * 0.024 + 0.08));
    player.effects.shake(Math.min(0.55, amount * 0.026));
  }
  if (player.audio) player.audio.hurt();
  if (fromX !== null && fromZ !== null) {
    player.lastHitAngle = Math.atan2(fromX - player.position.x, fromZ - player.position.z);
  }
  if (player.health <= 0) {
    player.dead = true;
    player.aiming = false;
    player.humanoid.aiming = false;
    player.gun.visible = false;
  }
  return player.dead;
}

export function heal(player, amount) {
  if (player.dead) return 0;
  const before = player.health;
  player.health = Math.min(100, player.health + amount);
  return player.health - before;
}

export function addArmor(player, amount) {
  if (player.dead) return 0;
  const before = player.armor;
  player.armor = Math.min(100, player.armor + amount);
  return player.armor - before;
}

export function grantWeapon(player, key, reserve = 0) {
  if (!WEAPONS[key]) return;
  const slot = player.weapons[key];
  const fresh = !slot.owned;
  slot.owned = true;
  slot.reserve = Math.min(999, slot.reserve + reserve);
  if (fresh) slot.ammo = Math.min(WEAPONS[key].mag, slot.reserve);
  if (fresh) player.selectWeapon(key);
}
