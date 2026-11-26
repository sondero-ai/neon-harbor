// Rae's movement and camera: on-foot acceleration, sprint and jump, curb
// stepping, wall and vehicle collision, the knockdown from a car hit, the
// enter/exit handshake, and the damped foot and chase cameras. Every function
// takes the Player instance; the fields, weapons and save shape stay in
// player.js.

import * as THREE from '../vendor/three.module.js';
import { CAMERA, PLAYER } from './config.js';

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

export function update(player, dt, input) {
  player.playSeconds += dt;
  if (player.exitCooldown > 0) player.exitCooldown -= dt;
  if (player.vehicleHitCooldown > 0) player.vehicleHitCooldown = Math.max(0, player.vehicleHitCooldown - dt);
  const mouse = input.consumeMouse();

  if (player.dead) {
    player.aiming = false;
    player.humanoid.aiming = false;
    player.speed = 0;
    player.nearVehicle = null;
    player.humanoid.update(dt, 0, false);
    return;
  }

  if (player.driving) {
    player.aiming = false;
    player.humanoid.aiming = false;
    player.updateDriving(dt, input, mouse);
    return;
  }

  // Seated: the camera still orbits, but there is no movement, fire or
  // vehicle entry. E (through Interactions) or Space stands up.
  if (player.sitting) {
    player.aiming = false;
    player.humanoid.aiming = false;
    if (mouse.x !== 0) player.cameraYaw -= mouse.x * CAMERA.sensitivity;
    if (mouse.y !== 0) player.cameraPitch = clamp(player.cameraPitch + mouse.y * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
    if (mouse.wheel !== 0) {
      player.cameraDistance = clamp(player.cameraDistance + mouse.wheel * 0.0035, CAMERA.minDistance, CAMERA.maxDistance);
    }
    const axes = player.inputBlocked ? { forward: 0, strafe: 0 } : input.moveAxis();
    // E/Space stand through the interaction layer; a movement key stands too,
    // as the design promises. Movement resumes on the next frame.
    if (!player.inputBlocked && (axes.forward !== 0 || axes.strafe !== 0 || input.wasPressed('Space'))) {
      player.stand();
    }
    player.velocity.set(0, 0, 0);
    player.speed = 0;
    player.nearVehicle = null;
    player.applyTransform();
    player.humanoid.update(dt, 0, false);
    return;
  }

  if (player.knockdown > 0) {
    player.updateKnockdown(dt);
    player.nearVehicle = null;
    player.applyTransform();
    player.humanoid.update(dt, 0, !player.grounded);
    return;
  }

  player.aiming = input.isMouseDown(2) && !player.inputBlocked;
  player.humanoid.aiming = player.aiming;

  if (mouse.x !== 0) player.cameraYaw -= mouse.x * CAMERA.sensitivity;
  if (mouse.y !== 0) player.cameraPitch = clamp(player.cameraPitch + mouse.y * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
  if (mouse.wheel !== 0) {
    player.cameraDistance = clamp(player.cameraDistance + mouse.wheel * 0.0035, CAMERA.minDistance, CAMERA.maxDistance);
  }

  const axes = player.inputBlocked ? { forward: 0, strafe: 0 } : input.moveAxis();
  const forward = axes.forward;
  const strafe = axes.strafe;
  const hasInput = forward !== 0 || strafe !== 0;
  const sprint = !player.inputBlocked && input.isDown('ShiftLeft', 'ShiftRight');
  const sin = Math.sin(player.cameraYaw);
  const cos = Math.cos(player.cameraYaw);
  let wishX = -sin * forward + cos * strafe;
  let wishZ = -cos * forward - sin * strafe;
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 1) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }

  const maxSpeed = player.aiming ? 2.65 : sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const targetX = hasInput ? wishX * maxSpeed : 0;
  const targetZ = hasInput ? wishZ * maxSpeed : 0;
  const acceleration = (player.grounded ? PLAYER.acceleration : PLAYER.airAcceleration) * dt;
  if (hasInput) {
    player.velocity.x = moveTowards(player.velocity.x, targetX, acceleration);
    player.velocity.z = moveTowards(player.velocity.z, targetZ, acceleration);
  } else if (player.grounded) {
    const friction = PLAYER.friction * dt;
    player.velocity.x = moveTowards(player.velocity.x, 0, friction);
    player.velocity.z = moveTowards(player.velocity.z, 0, friction);
  }

  if (!player.inputBlocked && input.wasPressed('Space') && player.grounded) {
    player.velocity.y = PLAYER.jumpSpeed;
    player.grounded = false;
  }

  player.moveHorizontal(dt);
  player.resolveVehicleContacts();

  player.velocity.y -= PLAYER.gravity * dt;
  player.position.y += player.velocity.y * dt;
  const ground = player.world.groundHeightAt(player.position.x, player.position.z);
  if (player.position.y <= ground) {
    player.position.y = ground;
    player.velocity.y = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }
  if (player.grounded && ground > player.position.y) player.position.y = ground;

  const horizontal = Math.hypot(player.velocity.x, player.velocity.z);
  player.speed = damp(player.speed, horizontal, 14, dt);
  if (player.aiming) {
    player.facing = dampAngle(player.facing, player.cameraYaw - Math.PI, 18, dt);
  } else if (horizontal > 0.25) {
    const desiredFacing = Math.atan2(player.velocity.x, player.velocity.z);
    player.facing = dampAngle(player.facing, desiredFacing, 13, dt);
  }

  if (player.position.y < -6) player.resetToSpawn();
  player.nearVehicle = player.vehicles ? player.vehicles.nearestEnterable(player.position, 2.2) : null;
  player.applyTransform();
  player.humanoid.update(dt, horizontal, !player.grounded);
}

export function updateDriving(player, dt, input, mouse) {
  const car = player.driving;
  if (!car || car.removed) {
    player.driving = null;
    player.group.visible = true;
    return;
  }

  if (mouse.x !== 0) {
    player.driveOrbitYaw = clamp(player.driveOrbitYaw - mouse.x * CAMERA.sensitivity * 1.05, -2.7, 2.7);
    player.driveLookHold = 2.1;
  }
  if (mouse.y !== 0) {
    player.drivePitch = clamp(player.drivePitch + mouse.y * CAMERA.sensitivity, -0.12, 0.62);
    player.driveLookHold = 2.1;
  }
  if (player.driveLookHold > 0) player.driveLookHold -= dt;
  else player.driveOrbitYaw = damp(player.driveOrbitYaw, 0, 1.8, dt);

  const { forward, strafe } = player.inputBlocked ? { forward: 0, strafe: 0 } : input.moveAxis();
  car.controls.throttle = forward;
  car.controls.steer = -strafe;
  car.controls.brake = player.inputBlocked ? 1 : 0;
  car.controls.handbrake = player.inputBlocked || input.isDown('Space');
  car.controls.engine = true;

  player.position.copy(car.position);
  player.facing = car.yaw;
  player.speed = Math.abs(car.speed);
  player.applyTransform();
}

export function syncFromVehicle(player) {
  if (!player.driving) return;
  player.position.copy(player.driving.position);
  player.facing = player.driving.yaw;
  player.speed = Math.abs(player.driving.speed);
  player.applyTransform();
}

export function handleVehicleInput(player, input, { allowE = true } = {}) {
  if (player.knockdown > 0 || player.dead || player.sitting) return;
  const use = input.wasPressed('KeyF') || (allowE && input.wasPressed('KeyE'));
  if (!use) return;
  if (player.driving) {
    player.exitVehicle();
  } else if (player.vehicles && player.exitCooldown <= 0) {
    const car = player.vehicles.nearestEnterable(player.position, 2.25);
    if (car) player.enterVehicle(car);
  }
}

export function enterVehicle(player, car) {
  if (!car || player.driving) return;
  player.clearSeat();
  player.carjacked = false;
  if (car.type === 'police' && player.police) player.police.reportCarTheft(car);
  // An AI civilian driver bails out at the door; a cruiser's crew does not.
  if (car.type !== 'police' && (car.driver === 'ai' || Boolean(car.ai)) && player.traffic?.ejectDriver) {
    player.carjacked = Boolean(player.traffic.ejectDriver(car));
  }
  player.driving = car;
  car.driver = 'player';
  car.ai = null;
  car.setDriver('player');
  car.velocity.multiplyScalar(0.35);
  car.controls.throttle = 0;
  car.controls.brake = 0;
  car.controls.steer = 0;
  car.controls.handbrake = false;
  player.velocity.set(0, 0, 0);
  player.group.visible = false;
  player.nearVehicle = null;
  player.driveOrbitYaw = 0;
  player.drivePitch = 0.13;
  player.driveLookHold = 0;
  player.position.copy(car.position);
  player.facing = car.yaw;
  player.speed = Math.abs(car.speed);
  player._cameraInitialized = false;
}

export function exitVehicle(player) {
  const car = player.driving;
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
    if (player.world.collides(x, z, PLAYER.radius)) continue;
    if (player.vehicles && player.vehicles.blocksPoint(x, z, PLAYER.radius, car)) continue;
    spotX = x;
    spotZ = z;
    placed = true;
    break;
  }
  if (!placed) {
    spotX = car.position.x + cos * (car.halfWidth + 1.4);
    spotZ = car.position.z - sin * (car.halfWidth + 1.4);
  }

  player.driving = null;
  car.driver = null;
  car.ai = null;
  car.setDriver(null);
  car.controls.brake = 1;
  car.controls.handbrake = true;
  player.group.visible = true;
  player.position.set(spotX, player.world.groundHeightAt(spotX, spotZ), spotZ);
  player.velocity.set(0, 0, 0);
  player.facing = Math.atan2(spotX - car.position.x, spotZ - car.position.z);
  player.cameraYaw = player.facing + Math.PI;
  player.cameraPitch = CAMERA.pitch;
  player.cameraDistance = CAMERA.distance;
  player.speed = 0;
  player.nearVehicle = null;
  player.exitCooldown = 0.65;
  player._cameraInitialized = false;
  player.applyTransform();
  player.snapCamera();
}

export function moveHorizontal(player, dt) {
  const radius = PLAYER.radius;
  const stepX = player.velocity.x * dt;
  if (stepX !== 0) {
    const nextX = player.position.x + stepX;
    const blockedByCar = player.vehicles && player.vehicles.blocksPoint(nextX, player.position.z, radius, player.driving);
    if (!player.world.collides(nextX, player.position.z, radius) && !blockedByCar) {
      const nextGround = player.world.groundHeightAt(nextX, player.position.z);
      if (nextGround - player.position.y <= 0.62) player.position.x = nextX;
      else player.velocity.x = 0;
    } else {
      player.velocity.x = 0;
    }
  }
  const stepZ = player.velocity.z * dt;
  if (stepZ !== 0) {
    const nextZ = player.position.z + stepZ;
    const blockedByCar = player.vehicles && player.vehicles.blocksPoint(player.position.x, nextZ, radius, player.driving);
    if (!player.world.collides(player.position.x, nextZ, radius) && !blockedByCar) {
      const nextGround = player.world.groundHeightAt(player.position.x, nextZ);
      if (nextGround - player.position.y <= 0.62) player.position.z = nextZ;
      else player.velocity.z = 0;
    } else {
      player.velocity.z = 0;
    }
  }
}

// ------------------------------------------------------------ vehicle hits

/** Push Rae's centre out of the car body along the shortest exit. */
export function pushOutOfVehicle(player, hit, car = null) {
  if (!hit || hit.penetration <= 0) return;
  const amount = hit.penetration + 0.02;
  const nextX = player.position.x + hit.nx * amount;
  const nextZ = player.position.z + hit.nz * amount;
  if (!player.world.collides(nextX, nextZ, PLAYER.radius)) {
    player.position.x = nextX;
    player.position.z = nextZ;
    return;
  }
  // A wall behind the car: keep whichever single axis is free.
  if (!player.world.collides(nextX, player.position.z, PLAYER.radius)) player.position.x = nextX;
  else if (!player.world.collides(player.position.x, nextZ, PLAYER.radius)) player.position.z = nextZ;
  if (!car || car.overlapCircle(player.position.x, player.position.z, PLAYER.radius).penetration <= 0) return;

  // Squeezed into a gap narrower than Rae between the car and a wall: the
  // straight push cannot work, so slide around the body. Sample outward from
  // the current point and take the nearest spot clear of the wall, the car
  // and every other parked body. This is the only case that may move her
  // along the car, and it never lands inside the wall.
  const startX = player.position.x;
  const startZ = player.position.z;
  for (let radius = 0.4; radius <= 5.2; radius += 0.25) {
    for (let step = 0; step < 24; step += 1) {
      const angle = (step / 24) * Math.PI * 2;
      const x = startX + Math.cos(angle) * radius;
      const z = startZ + Math.sin(angle) * radius;
      if (player.world.collides(x, z, PLAYER.radius)) continue;
      if (car.overlapCircle(x, z, PLAYER.radius).penetration > 0) continue;
      if (player.vehicles && player.vehicles.blocksPoint(x, z, PLAYER.radius, car)) continue;
      player.position.x = x;
      player.position.z = z;
      return;
    }
  }
}

/**
 * A moving car that overlaps Rae always pushes her clear. Above ~2.5 m/s the
 * same contact also lands one damage hit and a 0.9 s knockdown behind the
 * shared vehicleHitCooldown; below that speed it is only a shove.
 */
export function resolveVehicleContacts(player) {
  if (!player.vehicles || player.driving || player.dead) return;
  for (const car of player.vehicles.list) {
    if (car.removed || car === player.driving) continue;
    const dx = car.position.x - player.position.x;
    const dz = car.position.z - player.position.z;
    const reach = car.halfLength + PLAYER.radius + 1;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const speed = Math.abs(car.speed);
    const closing = speed > 2.5 && player.vehicleHitCooldown <= 0;
    const hit = car.overlapCircle(player.position.x, player.position.z, PLAYER.radius + (closing ? 0.3 : 0));
    if (hit.penetration <= 0) continue;
    player.pushOutOfVehicle(hit, car);
    if (!closing) continue;
    if (player.hitByVehicle(car, Math.min(30, 8 + speed * 0.8))) break;
  }
}

/** The one impact path shared by civilian cars and police rams. */
export function hitByVehicle(player, car, damage = 16) {
  if (!car || car.removed || player.dead || player.driving) return false;
  if (player.vehicleHitCooldown > 0) return false;
  const hit = car.overlapCircle(player.position.x, player.position.z, PLAYER.radius + 0.3);
  let nx = hit.nx;
  let nz = hit.nz;
  if (hit.penetration > 0) {
    player.pushOutOfVehicle(hit, car);
  } else {
    // A close police ram can land before the boxes touch: shove along the
    // centre line so the player still clears the car.
    const dx = player.position.x - car.position.x;
    const dz = player.position.z - car.position.z;
    const length = Math.hypot(dx, dz);
    if (length > 1e-4) {
      nx = dx / length;
      nz = dz / length;
      const nextX = player.position.x + nx * 0.4;
      const nextZ = player.position.z + nz * 0.4;
      if (!player.world.collides(nextX, nextZ, PLAYER.radius)) {
        player.position.x = nextX;
        player.position.z = nextZ;
      }
    }
  }
  const speed = Math.abs(car.speed);
  const push = 4 + speed * 0.7;
  player.velocity.set(nx * push, 3.4, nz * push);
  player.grounded = false;
  player.knockdown = 0.9;
  player.vehicleHitCooldown = 1.25;
  player.aiming = false;
  player.humanoid.aiming = false;
  player.gun.visible = false;
  player.facing = Math.atan2(nx, nz);
  player.humanoid.setFacing(player.facing);
  const amount = Math.max(1, Number(damage) || 0);
  player.lastVehicleHit = {
    type: car.type,
    name: car.name,
    speed: Math.round(speed * 100) / 100,
    damage: amount,
    x: car.position.x,
    z: car.position.z,
  };
  if (player.effects) {
    player.effects.impact(new THREE.Vector3(car.position.x, player.position.y + 0.9, car.position.z), null, 'metal');
    player.effects.shake(0.5);
  }
  if (player.audio) player.audio.impact(1.2);
  // Route through the police director when it exists so a lethal ram still
  // raises the wasted overlay.
  if (player.police) player.police.damagePlayer(amount, car.position.x, car.position.z);
  else player.applyDamage(amount, car.position.x, car.position.z);
  return true;
}

export function updateKnockdown(player, dt) {
  player.aiming = false;
  player.humanoid.aiming = false;
  // Never remain inside a body even while sliding: push out first, then let
  // the knockback carry the body away.
  player.resolveVehicleContacts();
  const friction = Math.exp(-4.2 * dt);
  player.velocity.x *= friction;
  player.velocity.z *= friction;
  player.moveHorizontal(dt);
  player.velocity.y -= PLAYER.gravity * dt;
  player.position.y += player.velocity.y * dt;
  const ground = player.world.groundHeightAt(player.position.x, player.position.z);
  if (player.position.y <= ground) {
    player.position.y = ground;
    player.velocity.y = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }
  player.speed = damp(player.speed, 0, 10, dt);
  player.knockdown = Math.max(0, player.knockdown - dt);
  player.humanoid.group.rotation.z = damp(player.humanoid.group.rotation.z, player.knockdown > 0 ? 1.18 : 0, 16, dt);
  if (player.knockdown <= 0) {
    player.knockdown = 0;
    player.humanoid.group.rotation.z = 0;
    player.velocity.x *= 0.2;
    player.velocity.z *= 0.2;
    // The 0.35 s post-hit grace stops an instant second hit.
    player.vehicleHitCooldown = Math.max(player.vehicleHitCooldown, 0.35);
  }
}

export function computeCameraDesired(player, out) {
  const aiming = player.aiming && !player.driving;
  const distance = aiming ? 3.05 : player.cameraDistance;
  const pitch = aiming ? Math.min(player.cameraPitch, 0.12) : player.cameraPitch;
  const target = player.cameraTarget.set(player.position.x, player.position.y + CAMERA.lookHeight, player.position.z);
  if (aiming) {
    // Shift the whole framing to the player's right so the shoulder and the
    // crosshair do not fight for the same pixels.
    target.x += Math.cos(player.cameraYaw) * 0.48;
    target.z -= Math.sin(player.cameraYaw) * 0.48;
  }
  const horizontal = Math.cos(pitch) * distance;
  out.set(
    target.x + Math.sin(player.cameraYaw) * horizontal,
    target.y + Math.sin(pitch) * distance + CAMERA.heightOffset,
    target.z + Math.cos(player.cameraYaw) * horizontal,
  );
  return out;
}

export function snapCamera(player) {
  player.computeCameraDesired(player.cameraPosition);
  player.world.clipCamera(player.cameraTarget, player.cameraPosition, 0.3, player.cameraPosition);
  player._cameraInitialized = true;
}

export function updateView(player, camera, dt, immediate = false) {
  if (player.driving) player.updateDriveView(camera, dt, immediate);
  else player.updateFootView(camera, dt, immediate);
}

export function updateCamera(player, camera, dt, immediate = false) {
  player.updateView(camera, dt, immediate);
}

export function updateFootView(player, camera, dt, immediate = false) {
  player.computeCameraDesired(player.cameraPosition);
  player.world.clipCamera(player.cameraTarget, player.cameraPosition, 0.3, player.cameraPosition);
  if (!player._smoothCamera) player._smoothCamera = player.cameraPosition.clone();
  if (immediate || !player._cameraInitialized) {
    player._smoothCamera.copy(player.cameraPosition);
    player._cameraInitialized = true;
  } else {
    const alpha = 1 - Math.exp(-CAMERA.damping * dt);
    player._smoothCamera.lerp(player.cameraPosition, alpha);
    player.world.clipCamera(player.cameraTarget, player._smoothCamera, 0.3, player._smoothCamera);
  }
  camera.position.copy(player._smoothCamera);
  camera.lookAt(player.cameraTarget);
  if (player.recoil > 0.0002) {
    camera.rotation.x += player.recoil * 0.8;
    camera.rotation.z += Math.sin(player.playSeconds * 83) * player.recoil * 0.12;
  }
  const targetFov = player.aiming ? 49 : CAMERA.fov;
  if (Math.abs(camera.fov - targetFov) > 0.02) {
    camera.fov = damp(camera.fov, targetFov, 11, dt);
    camera.updateProjectionMatrix();
  }
}

export function updateDriveView(player, camera, dt, immediate = false) {
  const car = player.driving;
  if (!car) {
    player.updateFootView(camera, dt, immediate);
    return;
  }
  const speed = Math.abs(car.speed);
  const orbit = player.driveOrbitYaw;
  const yaw = car.yaw + Math.PI + orbit;
  const cosPitch = Math.cos(player.drivePitch);
  const distance = 7.5 + Math.min(2.7, speed * 0.07);
  const lookAhead = 4.8 + speed * 0.16;
  player.cameraTarget.set(
    car.position.x + Math.sin(car.yaw) * lookAhead,
    car.position.y + 1.5,
    car.position.z + Math.cos(car.yaw) * lookAhead,
  );
  player.cameraPosition.set(
    car.position.x + Math.sin(yaw) * cosPitch * distance,
    car.position.y + 2.15 + Math.sin(player.drivePitch) * distance,
    car.position.z + Math.cos(yaw) * cosPitch * distance,
  );
  player.world.clipCamera(player.cameraTarget, player.cameraPosition, 0.45, player.cameraPosition);
  if (!player._smoothCamera) player._smoothCamera = player.cameraPosition.clone();
  if (immediate || !player._cameraInitialized) {
    player._smoothCamera.copy(player.cameraPosition);
    player._cameraInitialized = true;
  } else {
    const alpha = 1 - Math.exp(-7.4 * dt);
    player._smoothCamera.lerp(player.cameraPosition, alpha);
    player.world.clipCamera(player.cameraTarget, player._smoothCamera, 0.45, player._smoothCamera);
  }
  camera.position.copy(player._smoothCamera);
  camera.lookAt(player.cameraTarget);
  const targetFov = CAMERA.fov + clamp(speed * 0.28, 0, 11);
  if (Math.abs(camera.fov - targetFov) > 0.02) {
    camera.fov = damp(camera.fov, targetFov, 4.5, dt);
    camera.updateProjectionMatrix();
  }
}

export function faceCamera(player) {
  player.facing = player.cameraYaw - Math.PI;
  player.humanoid.setFacing(player.facing);
}

export function teleport(player, x, z, facing = player.facing, cameraYaw = facing + Math.PI) {
  player.clearSeat();
  player.position.set(x, player.world.groundHeightAt(x, z), z);
  player.velocity.set(0, 0, 0);
  player.facing = facing;
  player.cameraYaw = cameraYaw;
  player.grounded = true;
  player.knockdown = 0;
  player.vehicleHitCooldown = 0;
  player.humanoid.group.rotation.z = 0;
  player.applyTransform();
  player.snapCamera();
}
