// Deterministic screenshot scenes behind ?shot=start|street|chase|mission&seed=1. Each one builds
// its moment from the real systems (real traffic, real cameras, real HUD), runs 600 fixed steps
// synchronously so nothing depends on wall-clock time, and leaves the frame ready to paint. No
// pointer lock, no waits, no input: the same seed always produces the same picture.
import * as THREE from '../vendor/three.module.js';
import { STEP } from './config.js';

const IDLE_HELD = { forward: false, back: false, left: false, right: false, sprint: false, jump: false, fire: false, aim: false };

function stubInput(held = {}, actions = []) {
  const pressed = new Set(actions);
  return {
    held: { ...IDLE_HELD, ...held },
    mouse: { dx: 0, dy: 0, wheel: 0 },
    take: (action) => pressed.delete(action),
    readMouse: () => ({ dx: 0, dy: 0, wheel: 0 }),
    lock() {},
    setLockAllowed() {},
    clear() {},
  };
}

function runSteps(ctx, count, held = {}, options = {}) {
  const { world, player, vehicles, traffic, police, missions, effects, state, camera } = ctx;
  const input = stubInput(held);
  for (let i = 0; i < count; i += 1) {
    state.time += STEP;
    world.update(STEP, state.time);
    if (!options.freezePlayer) player.update(STEP, input, vehicles, camera);
    vehicles.update(STEP);
    traffic.update(STEP, player);
    if (!options.freezePolice) police.update(STEP, player);
    if (!options.freezeMissions) missions.update(STEP, null);
    effects.update(STEP);
  }
}

function faceCamera(ctx, yaw, pitch = 0.05) {
  const { player, camera } = ctx;
  player.orbitYaw = yaw;
  player.orbitPitch = pitch;
  player.cameraFov = 62;
  camera.fov = 62;
  camera.updateProjectionMatrix();
  player.updateCamera(STEP, camera, { dx: 0, dy: 0 });
}

function clearDialogue(ctx) {
  ctx.missions.state.dialogue = null;
}

export function stageShot(name, ctx) {
  const { player, vehicles, traffic, police, missions, effects, state, camera, world, scene } = ctx;
  state.time = 12;
  state.loading = 1;
  state.hasSave = false;
  state.toasts = [];
  state.alert = null;
  state.radio = 0;
  state.clockText = '19:42';
  player.hurtFlash = 0;
  player.cash = 420;
  player.health = 100;
  player.armor = 0;
  player.wanted = 0;
  traffic.reset();
  police.clear();

  if (name === 'start' || name === 'title') {
    traffic.spawnCrowd();
    // Let the backdrop traffic settle into the avenues.
    runSteps(ctx, 240, {}, { freezePlayer: true, freezePolice: true, freezeMissions: true });
    state.mode = 'title';
    state.menuIndex = 0;
    state.hasSave = false;
    state.objective = '';
    player.pos.set(world.landmarks.spawn.x, 0.3, world.landmarks.spawn.z);
    player.heading = world.landmarks.spawn.heading;
    camera.fov = 54;
    camera.position.set(-90, 60, 275);
    camera.lookAt(215, 18, 5);
    camera.updateProjectionMatrix();
    return;
  }

  if (name === 'street') {
    traffic.spawnCrowd();
    player.pos.set(-49.5, 0.3, 118);
    player.heading = Math.PI;
    player.orbitYaw = Math.PI;
    player.orbitPitch = 0.035;
    player.health = 92;
    player.armor = 40;
    player.cash = 1275;
    player.selectWeapon('pistol');
    missions.begin(0);
    clearDialogue(ctx);
    missions.setMarker(-40, 30, true);
    state.objective = 'Steal the Vanto GT parked on Vega Street';
    // Traffic framed on the avenue: a taxi rolling away, a sedan coming the other way.
    const taxi = vehicles.spawnCar('taxi', -45, 88, Math.PI, { driver: 'ai' });
    taxi.ai = null;
    taxi.speed = 6;
    const sedan = vehicles.spawnCar('sedan', -33, 66, 0, { driver: 'ai' });
    sedan.ai = null;
    sedan.speed = 4;
    const muscle = vehicles.spawnCar('muscle', -36, 148, 0, { driver: 'ai' });
    muscle.ai = null;
    // A few walkers on the pavements in frame.
    traffic.spawnWalker(-50, 96);
    traffic.spawnWalker(-50, 146);
    traffic.spawnWalker(-30, 92);
    traffic.spawnWalker(-30, 140);
    traffic.spawnWalker(-31, 76);
    runSteps(ctx, 560, {}, { freezeMissions: true });
    runSteps(ctx, 40, { forward: true }, { freezeMissions: true });
    player.cash = 1275;
    player.health = 92;
    player.armor = 40;
    player.speed = 4.4;
    player.pos.set(-49.5, 0.3, 116);
    faceCamera(ctx, Math.PI, 0.02);
    state.mode = 'play';
    state.prompt = 'F / E  ENTER Kestrel 88';
    return;
  }

  if (name === 'chase') {
    traffic.reset();
    const car = vehicles.spawnCar('sports', -40, 250, Math.PI, {});
    player.pos.copy(car.pos);
    player.enterCar(vehicles);
    car.speed = 22;
    car.throttle = 0.7;
    // One civilian in the opposite lane far ahead, otherwise a clean run.
    const van = vehicles.spawnCar('van', -34, 110, 0, { driver: 'ai' });
    van.ai = null;
    van.speed = 7;
    runSteps(ctx, 150, { forward: true });
    car.speed = 21;
    car.throttle = 0.6;
    // Three cruisers tucked in close behind, bars lit.
    const formation = [{ dx: -4.9, dz: 3.8 }, { dx: 4.9, dz: 5.6 }];
    for (const slot of formation) {
      const cruiser = vehicles.spawnCar('police', car.pos.x + slot.dx, car.pos.z + slot.dz, Math.PI, { driver: 'ai', siren: true });
      cruiser.speed = 20;
      cruiser.throttle = 0.7;
      cruiser.ai = { chase: true, deploy: 0, stuck: 0, ram: 0 };
      police.cruisers.push(cruiser);
    }
    police.state.heat = 3.4;
    police.state.stars = 3;
    player.wanted = 3;
    state.mode = 'play';
    vehicles.update(STEP);
    car.speed = 21;
    state.objective = 'Lose the police';
    state.toasts = [];
    const h = car.heading;
    const forwardX = Math.sin(h), forwardZ = Math.cos(h);
    camera.fov = 64;
    camera.position.set(car.pos.x - forwardX * 15 + forwardZ * 2.4, 7.0, car.pos.z - forwardZ * 15 - forwardX * 2.4);
    camera.lookAt(car.pos.x + forwardX * 9, 1.5, car.pos.z + forwardZ * 9);
    camera.updateProjectionMatrix();
    return;
  }

  // The pier firefight for the final mission.
  traffic.reset();
  player.pos.set(638, 1.05, 6);
  player.heading = Math.atan2(660 - 638, 4 - 6);
  player.orbitYaw = player.heading;
  player.orbitPitch = 0.02;
  player.health = 68;
  player.armor = 52;
  player.cash = 2140;
  player.selectWeapon('smg');
  player.aiming = true;
  player.weapons.smg.clip = 18;
  police.state.heat = 2.2;
  police.state.stars = 2;
  player.wanted = 2;
  const gunman = police.spawnOfficer(660, 6);
  gunman.heading = Math.atan2(player.pos.x - gunman.pos.x, player.pos.z - gunman.pos.z);
  gunman.rig.group.rotation.y = gunman.heading;
  const second = police.spawnOfficer(651, -5);
  second.heading = Math.atan2(player.pos.x - second.pos.x, player.pos.z - second.pos.z);
  second.rig.group.rotation.y = second.heading;
  // A police cruiser parked across the pier head with its bar lit.
  const cruiser = vehicles.spawnCar('police', 664, 16, Math.PI / 2, { siren: true });
  cruiser.speed = 0;
  police.cruisers.push(cruiser);
  missions.state.index = 3;
  missions.state.active = true;
  missions.state.timer = 88;
  missions.state.objective = 'Fight through to the boat — 22 m';
  missions.setMarker(world.landmarks.boat.x, world.landmarks.boat.z, true);
  state.objective = 'Fight through to the boat — 22 m';
  state.alert = null;
  runSteps(ctx, 120, {}, { freezePlayer: true, freezePolice: true, freezeMissions: true });
  // Re-aim after the settle and light the shot in the last instant.
  player.pos.set(638, 1.05, 6);
  player.heading = Math.atan2(660 - 638, 4 - 6);
  player.orbitYaw = player.heading;
  player.aiming = true;
  player.rig.group.position.copy(player.pos);
  player.rig.group.rotation.y = player.heading;
  player.rig.rightArm.rotation.x = -1.4;
  player.rig.leftArm.rotation.x = -1.15;
  gunman.rig.group.position.set(660, 1.05, 6);
  gunman.rig.group.rotation.y = Math.atan2(player.pos.x - 660, player.pos.z - 6);
  const forwardX = Math.sin(player.heading), forwardZ = Math.cos(player.heading);
  const rightX = Math.cos(player.heading), rightZ = -Math.sin(player.heading);
  const muzzle = new THREE.Vector3(player.pos.x + forwardX * 1.38 + rightX * 0.22, player.pos.y + 1.36, player.pos.z + forwardZ * 1.38 + rightZ * 0.22);
  const target = new THREE.Vector3(660, 1.45, 6);
  effects.muzzle(muzzle);
  effects.tracer(muzzle, target, '#ffe2a0');
  effects.spark(target.x, target.y, target.z, { life: 0.4, size: 0.6, r: 1, g: 0.5, b: 0.25, vy: 1.5 });
  const replyMuzzle = new THREE.Vector3(659.5, 1.55, 6.2);
  effects.muzzle(replyMuzzle, '#ffb08a');
  effects.tracer(replyMuzzle, new THREE.Vector3(player.pos.x, 1.5, player.pos.z), '#ff8a6a');
  effects.spark(player.pos.x + 0.8, 1.5, player.pos.z + 0.4, { life: 0.35, size: 0.4, r: 1, g: 0.55, b: 0.3 });
  effects.shake(0.5);
  state.mode = 'play';
  state.prompt = '';
  camera.fov = 55;
  camera.position.set(
    player.pos.x - forwardX * 2.7 + rightX * 1.5,
    2.75,
    player.pos.z - forwardZ * 2.7 + rightZ * 1.5,
  );
  camera.lookAt(target.x, 1.55, target.z);
  camera.updateProjectionMatrix();
  state.time = 12;
}
