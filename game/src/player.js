// Rae Solano, courier: the on-foot controller, the third-person camera with orbit and collision,
// the pistol/SMG/fists combat with hitscan tracers and recoil, health and armour, carjacking and
// the wasted/respawn rule. The camera is a simple orbit rig; the world's colliders keep it out of
// walls, and every number that matters lives in config.js.
import * as THREE from '../vendor/three.module.js';
import { CRIME, PLAYER, WEAPONS } from './config.js';
import { createHumanoid, animateHumanoid } from './humanoid.js';

const UP = new THREE.Vector3(0, 1, 0);

const PALETTE = {
  skin: '#c78e64', hair: '#191420', jacket: '#1f6f6a', pants: '#26202e',
  shoes: '#161219', accent: '#ff5f9e',
};

export function createPlayer(scene, world, effects, audio) {
  const rig = createHumanoid(PALETTE, true);
  const group = rig.group;
  scene.add(group);
  // Courier bag and sidearm, parented to the body so they walk with it.
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.18), new THREE.MeshStandardMaterial({ color: '#8e3a4a', roughness: 0.85 }));
  bag.position.set(0, 1.28, -0.24);
  group.add(bag);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.04), new THREE.MeshStandardMaterial({ color: '#2a2430', roughness: 0.8 }));
  strap.position.set(0.12, 1.34, 0.16);
  strap.rotation.z = -0.5;
  group.add(strap);
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.9), new THREE.MeshStandardMaterial({ color: '#3c3c48', metalness: 0.75, roughness: 0.35 }));
  barrel.position.set(0, 0, 0.42);
  const muzzleTip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.14), new THREE.MeshStandardMaterial({ color: '#17171d', metalness: 0.9, roughness: 0.3 }));
  muzzleTip.position.set(0, 0, 0.9);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.15), new THREE.MeshStandardMaterial({ color: '#17171d', roughness: 0.7 }));
  grip.position.set(0, -0.18, 0.06);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.16), new THREE.MeshStandardMaterial({ color: '#24242c', roughness: 0.55 }));
  magazine.position.set(0, -0.2, 0.3);
  gun.add(barrel, muzzleTip, grip, magazine);
  gun.position.set(0, -0.58, 0.04);
  gun.rotation.x = Math.PI / 2;
  rig.rightArm.add(gun);
  gun.visible = false;

  // The third-person weapon: held across the chest, pointing where the player faces. Parented to
  // the body rather than the arm so it reads clearly from behind at any run animation phase.
  const held = new THREE.Group();
  const heldBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 1.0), new THREE.MeshStandardMaterial({ color: '#3f3f4c', metalness: 0.75, roughness: 0.35 }));
  heldBarrel.position.set(0, 0, 0.5);
  const heldStock = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.42), new THREE.MeshStandardMaterial({ color: '#24242c', roughness: 0.6 }));
  heldStock.position.set(0, -0.02, -0.15);
  const heldMag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.16), new THREE.MeshStandardMaterial({ color: '#1c1c22', roughness: 0.5 }));
  heldMag.position.set(0, -0.2, 0.3);
  const heldTip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }));
  heldTip.position.set(0, 0, 1.0);
  held.add(heldBarrel, heldStock, heldMag, heldTip);
  held.position.set(0.22, 1.34, 0.38);
  held.visible = false;
  group.add(held);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({ color: '#0a0710', transparent: true, opacity: 0.42, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const player = {
    rig, group, pos: new THREE.Vector3(world.landmarks.spawn.x, 0.3, world.landmarks.spawn.z),
    heading: world.landmarks.spawn.heading, speed: 0, vy: 0, onGround: true,
    health: PLAYER.maxHealth, armor: 0, maxHealth: PLAYER.maxHealth, maxArmor: PLAYER.maxArmor,
    cash: 420, wanted: 0, weapon: 'pistol', aiming: false, car: null,
    weapons: {
      pistol: { clip: WEAPONS.pistol.clip, reserve: WEAPONS.pistol.ammo },
      smg: { clip: WEAPONS.smg.clip, reserve: WEAPONS.smg.ammo },
      fists: { clip: Infinity, reserve: Infinity },
    },
    fireCooldown: 0, reloadTimer: 0, dead: false, deadTimer: 0, hurtFlash: 0,
    orbitYaw: world.landmarks.spawn.heading, orbitPitch: 0.06, cameraDistance: 4.6,
    cameraFov: 62, recoil: 0, nearbyCar: null, prompt: '', radio: 0,
    callbacks: { onCrime: null, onCarjack: null, onHit: null, onEnterCar: null, onExitCar: null, targets: null, onDeath: null },
    lastDamage: 0, footstep: 0, punchTimer: 0, time: 0,
  };

  gun.visible = true;
  player.pos.y = world.surfaceHeight(player.pos.x, player.pos.z);
  group.position.copy(player.pos);
  group.rotation.y = player.heading;
  world.resolveCollision(player.pos, PLAYER.radius);

  function weaponDef() {
    return WEAPONS[player.weapon];
  }

  function addCash(amount) {
    player.cash = Math.max(0, player.cash + amount);
  }

  function takeDamage(amount, sourceX, sourceZ) {
    if (player.dead) return;
    const absorbed = Math.min(player.armor, amount * 0.6);
    player.armor = Math.max(0, player.armor - absorbed);
    player.health = Math.max(0, player.health - (amount - absorbed));
    player.hurtFlash = Math.min(1, player.hurtFlash + amount * 0.012);
    effects.shake(0.32);
    if (player.health <= 0) die();
  }

  function die() {
    player.dead = true;
    player.deadTimer = PLAYER.respawnTime;
    player.speed = 0;
    group.rotation.z = 1.35;
    group.position.y = player.pos.y + 0.2;
    audio.wasted();
    if (player.car) exitCar(true);
    if (player.callbacks.onDeath) player.callbacks.onDeath();
  }

  function respawn() {
    player.dead = false;
    player.health = player.maxHealth;
    player.armor = 0;
    player.cash = Math.max(0, player.cash - 150);
    player.wanted = 0;
    player.pos.set(world.landmarks.hospital.x, 0.3, world.landmarks.hospital.z);
    player.heading = world.landmarks.hospital.heading;
    player.orbitYaw = player.heading;
    player.vy = 0;
    group.visible = true;
    group.rotation.z = 0;
    player.weapons.pistol.clip = WEAPONS.pistol.clip;
    player.weapons.smg.clip = WEAPONS.smg.clip;
  }

  function heal(amount) {
    player.health = Math.min(player.maxHealth, player.health + amount);
  }

  function addArmor(amount) {
    player.armor = Math.min(player.maxArmor, player.armor + amount);
  }

  function selectWeapon(name) {
    if (!WEAPONS[name]) return;
    player.weapon = name;
    player.reloadTimer = 0;
    gun.visible = false;
    held.visible = name !== 'fists';
    audio.ui();
  }

  function reload() {
    const def = weaponDef();
    const state = player.weapons[player.weapon];
    if (!def || player.weapon === 'fists' || player.reloadTimer > 0) return;
    if (state.clip >= def.clip || state.reserve <= 0) return;
    player.reloadTimer = def.reload;
  }

  function enterCar(vehicles) {
    if (player.car) return;
    const car = vehicles.nearestCar(player.pos, 5.2, (candidate) => !candidate.isPlayer);
    if (!car) {
      player.prompt = 'No car within reach';
      return;
    }
    if (car.driver === 'ai' && player.callbacks.onCarjack) player.callbacks.onCarjack(car);
    if (player.callbacks.onCrime) player.callbacks.onCrime('carjack', 0);
    car.isPlayer = true;
    car.driver = 'player';
    car.occupied = true;
    car.ai = null;
    car.throttle = 0;
    car.steer = 0;
    player.car = car;
    player.pos.copy(car.pos);
    player.pos.y = 0;
    group.visible = false;
    shadow.visible = false;
    gun.visible = false;
    held.visible = false;
    audio.ui();
    if (player.callbacks.onEnterCar) player.callbacks.onEnterCar(car);
  }

  function exitCar(forced = false) {
    const car = player.car;
    if (!car) return;
    car.isPlayer = false;
    car.driver = null;
    car.occupied = false;
    car.throttle = 0;
    car.steer = 0;
    car.handbrake = false;
    const side = car.heading + Math.PI / 2;
    player.pos.set(car.pos.x + Math.cos(side) * 2.3, 0, car.pos.z - Math.sin(side) * 2.3);
    world.resolveCollision(player.pos, PLAYER.radius);
    player.pos.y = world.surfaceHeight(player.pos.x, player.pos.z);
    player.heading = car.heading;
    player.orbitYaw = car.heading;
    player.vy = 0;
    player.car = null;
    group.visible = true;
    shadow.visible = true;
    held.visible = player.weapon !== 'fists';
    if (forced) takeDamage(18);
    if (player.callbacks.onExitCar) player.callbacks.onExitCar(car);
  }

  /** Nearest shootable target along a ray, including a building occlusion test. */
  function pickTarget(origin, direction, range) {
    const targets = player.callbacks.targets ? player.callbacks.targets() : [];
    let best = null, bestT = range;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    for (const target of targets) {
      if (!target || target.dead) continue;
      const cx = target.x - ox, cy = (target.y ?? 1.1) - oy, cz = target.z - oz;
      const t = cx * direction.x + cy * direction.y + cz * direction.z;
      if (t < 0.4 || t > bestT) continue;
      const px = cx - direction.x * t, py = cy - direction.y * t, pz = cz - direction.z * t;
      const miss = Math.sqrt(px * px + py * py + pz * pz);
      if (miss > (target.radius ?? 0.6)) continue;
      bestT = t;
      best = target;
    }
    return best ? { target: best, distance: bestT } : null;
  }

  function muzzlePosition() {
    const forwardX = Math.sin(player.heading), forwardZ = Math.cos(player.heading);
    return new THREE.Vector3(
      player.pos.x + forwardX * 0.55 + forwardZ * 0.22,
      player.pos.y + 1.38,
      player.pos.z + forwardZ * 0.55 - forwardX * 0.22,
    );
  }

  function shoot(camera) {
    const def = weaponDef();
    if (player.fireCooldown > 0 || player.reloadTimer > 0 || player.dead) return false;
    if (player.weapon === 'fists') {
      player.fireCooldown = def.rate;
      player.punchTimer = 0.22;
      audio.gunshot('punch');
      const targets = player.callbacks.targets ? player.callbacks.targets() : [];
      const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
      for (const target of targets) {
        if (!target || target.dead) continue;
        const dx = target.x - player.pos.x, dz = target.z - player.pos.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 2.2) continue;
        if ((dx * fx + dz * fz) / (distance || 1) < 0.5) continue;
        if (target.hurt) target.hurt(def.damage, 'melee');
        effects.spark(target.x, 1.3, target.z, { life: 0.2, size: 0.35, r: 1, g: 0.9, b: 0.7 });
        effects.shake(0.16);
        if (player.callbacks.onHit) player.callbacks.onHit('melee', target);
        break;
      }
      return true;
    }
    const state = player.weapons[player.weapon];
    if (state.clip <= 0) {
      reload();
      return false;
    }
    state.clip -= 1;
    player.fireCooldown = def.rate;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const spread = def.spread * (player.aiming ? 0.4 : 1.5);
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    direction.normalize();
    const origin = muzzlePosition();
    const hit = pickTarget(origin, direction, def.range);
    const end = hit ? new THREE.Vector3(hit.target.x, hit.target.y ?? 1.2, hit.target.z) : origin.clone().addScaledVector(direction, def.range);
    if (hit && world.lineBlocked(origin.x, origin.z, end.x, end.z)) {
      // Shot stopped by a wall.
      end.copy(origin);
    }
    effects.muzzle(origin);
    effects.tracer(origin, end, '#ffd98a');
    effects.shake(player.aiming ? 0.12 : 0.2);
    player.recoil = Math.min(0.14, player.recoil + 0.05);
    audio.gunshot(player.weapon);
    if (player.callbacks.onCrime) player.callbacks.onCrime('gunshot', 0);
    if (hit && !world.lineBlocked(origin.x, origin.z, end.x, end.z)) {
      effects.spark(end.x, end.y, end.z, { life: 0.32, size: 0.5, r: 1, g: 0.55, b: 0.35, vy: 1.8 });
      if (hit.target.hurt) hit.target.hurt(def.damage, 'bullet');
      if (player.callbacks.onHit) player.callbacks.onHit('bullet', hit.target);
    } else if (!hit) {
      effects.spark(end.x, end.y, end.z, { life: 0.22, size: 0.3, r: 0.9, g: 0.8, b: 0.7 });
    }
    return true;
  }

  function updateCamera(dt, camera, mouse) {
    const sens = 0.0026;
    player.orbitYaw -= mouse.dx * sens;
    player.orbitPitch = Math.max(-0.45, Math.min(0.85, player.orbitPitch + mouse.dy * sens * 0.85));
    player.recoil = Math.max(0, player.recoil - dt * 0.9);
    if (player.car) {
      // The camera settles behind the car's nose; the mouse gives a look-around offset.
      let delta = player.car.heading - player.orbitYaw;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      player.orbitYaw += delta * Math.min(1, dt * (Math.abs(player.car.speed) > 8 ? 3.4 : 1.4));
    }
    const yaw = player.orbitYaw;
    const pitch = player.orbitPitch + player.recoil * 0.6;
    const target = new THREE.Vector3(player.pos.x, player.pos.y + (player.car ? 1.5 : 1.55), player.pos.z);
    const baseDistance = player.car ? 8.2 : player.aiming ? 2.9 : 4.8;
    let distance = baseDistance;
    // Pull the camera in when a wall is in the way.
    const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
    for (let step = 1; step <= 10; step += 1) {
      const probe = (step / 10) * baseDistance;
      const px = target.x - forwardX * probe * Math.cos(pitch);
      const pz = target.z - forwardZ * probe * Math.cos(pitch);
      if (world.lineBlocked(target.x, target.z, px, pz)) {
        distance = Math.max(1.2, ((step - 1) / 10) * baseDistance);
        break;
      }
    }
    const height = Math.sin(pitch) * distance + (player.car ? 2.2 : 0.55);
    camera.position.set(
      target.x - forwardX * distance * Math.cos(pitch),
      target.y + height,
      target.z - forwardZ * distance * Math.cos(pitch),
    );
    if (player.car) {
      camera.position.y = Math.max(camera.position.y, player.pos.y + 3.1);
      target.y += 0.4;
    }
    camera.position.y = Math.max(camera.position.y, world.surfaceHeight(camera.position.x, camera.position.z) + 0.6);
    camera.lookAt(target.x + forwardX * 0.6, target.y + 0.15, target.z + forwardZ * 0.6);
    const targetFov = player.car ? 68 : player.aiming ? 48 : 62;
    player.cameraFov += (targetFov - player.cameraFov) * Math.min(1, dt * 6);
    if (Math.abs(camera.fov - player.cameraFov) > 0.05) {
      camera.fov = player.cameraFov;
      camera.updateProjectionMatrix();
    }
    const shake = effects.shakeOffset();
    camera.position.x += shake.x * 0.35;
    camera.position.y += shake.y * 0.35;
    camera.rotation.z += shake.roll;
  }

  function update(dt, input, vehicles, camera) {
    player.time += dt;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.hurtFlash = Math.max(0, player.hurtFlash - dt * 1.4);
    player.punchTimer = Math.max(0, player.punchTimer - dt);
    if (player.dead) {
      player.deadTimer -= dt;
      if (player.deadTimer <= 0) respawn();
      updateCamera(dt, camera, { dx: 0, dy: 0 });
      return;
    }
    const held = input.held;
    const mouse = input.readMouse();
    if (player.car) {
      const car = player.car;
      if (car.wrecked) { exitCar(true); return; }
      car.throttle = (held.forward ? 1 : 0) - (held.back ? 1 : 0);
      car.steer = (held.left ? 1 : 0) - (held.right ? 1 : 0);
      car.handbrake = held.jump || held.handbrake;
      player.pos.copy(car.pos);
      player.pos.y = world.surfaceHeight(car.pos.x, car.pos.z);
      player.heading = car.heading;
      player.speed = car.speed;
      if (input.take('enter')) exitCar();
      shadow.visible = false;
      updateCamera(dt, camera, mouse);
      player.nearbyCar = null;
      player.prompt = '';
      return;
    }
    player.aiming = held.aim;
    const cameraYaw = player.orbitYaw;
    const forwardX = Math.sin(cameraYaw), forwardZ = Math.cos(cameraYaw);
    const rightX = -Math.cos(cameraYaw), rightZ = Math.sin(cameraYaw);
    let moveX = forwardX * ((held.forward ? 1 : 0) - (held.back ? 1 : 0)) + rightX * ((held.right ? 1 : 0) - (held.left ? 1 : 0));
    let moveZ = forwardZ * ((held.forward ? 1 : 0) - (held.back ? 1 : 0)) + rightZ * ((held.right ? 1 : 0) - (held.left ? 1 : 0));
    const length = Math.hypot(moveX, moveZ);
    if (length > 0) { moveX /= length; moveZ /= length; }
    const targetSpeed = length > 0 ? (held.sprint ? 8.6 : 4.4) : 0;
    player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 9);
    if (length > 0 && player.speed > 0.3) {
      const wanted = Math.atan2(moveX, moveZ);
      let delta = wanted - player.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      player.heading += delta * Math.min(1, dt * 12);
    }
    if (player.aiming) {
      let delta = cameraYaw - player.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      player.heading += delta * Math.min(1, dt * 18);
    }
    player.pos.x += Math.sin(player.heading) * player.speed * dt;
    player.pos.z += Math.cos(player.heading) * player.speed * dt;
    if (player.pos.x > 500 && Math.abs(player.pos.z) < 10) {
      // Out on the pier: the railings keep the player on the boards.
      player.pos.x = Math.min(708, player.pos.x);
      player.pos.z = Math.max(-8.4, Math.min(8.4, player.pos.z));
    } else {
      player.pos.x = Math.max(-690, Math.min(500, player.pos.x));
      player.pos.z = Math.max(-690, Math.min(690, player.pos.z));
    }
    world.resolveCollision(player.pos, PLAYER.radius);
    // Gravity and the small kerb steps.
    const ground = world.surfaceHeight(player.pos.x, player.pos.z);
    if (held.jump && player.onGround) {
      player.vy = PLAYER.jump;
      player.onGround = false;
      effects.dust(player.pos.x, player.pos.y, player.pos.z);
    }
    player.vy -= PLAYER.gravity * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= ground) {
      if (!player.onGround && player.vy < -4) effects.dust(player.pos.x, ground, player.pos.z);
      player.pos.y = ground;
      player.vy = 0;
      player.onGround = true;
    } else if (!player.onGround && player.pos.y > ground + 0.4) {
      player.onGround = false;
    }
    if (player.pos.y < ground) player.pos.y = ground;
    // Splash when wading at the shoreline.
    if (player.pos.x > 470 && player.speed > 3 && Math.random() < dt * 8) effects.splash(player.pos.x, player.pos.z);
    // Footsteps.
    if (player.onGround && player.speed > 1) {
      player.footstep += dt * player.speed * 1.5;
      if (player.footstep > 2.4) player.footstep = 0;
    }
    group.position.set(player.pos.x, player.pos.y, player.pos.z);
    group.rotation.y = player.heading;
    shadow.visible = true;
    shadow.position.set(player.pos.x, ground + 0.04, player.pos.z);
    animateHumanoid(rig, dt, player.speed, player.time, !player.onGround);
    rig.torso.rotation.x += player.aiming ? 0.06 : 0;
    gun.position.y = -0.5;
    if (player.punchTimer > 0) {
      rig.rightArm.rotation.x = -1.5 + Math.sin(player.punchTimer * 40) * 0.4;
    }
    if (input.take('enter')) enterCar(vehicles);
    if (input.take('reload')) reload();
    if (input.take('swap') || mouse.wheel !== 0) {
      const order = ['pistol', 'smg', 'fists'];
      const at = order.indexOf(player.weapon);
      selectWeapon(order[(at + (mouse.wheel > 0 ? 1 : order.length - 1)) % order.length]);
    }
    if (input.take('weapon1')) selectWeapon('pistol');
    if (input.take('weapon2')) selectWeapon('smg');
    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) {
        const def = weaponDef();
        const state = player.weapons[player.weapon];
        const needed = def.clip - state.clip;
        const taken = Math.min(needed, state.reserve);
        state.clip += taken;
        state.reserve -= taken;
        audio.ui();
      }
    }
    if (held.fire) shoot(camera);
    if (player.weapons[player.weapon].clip === 0 && player.reloadTimer <= 0) reload();
    const nearest = vehicles.nearestCar(player.pos, 5.2, (candidate) => !candidate.isPlayer && !candidate.wrecked);
    player.nearbyCar = nearest;
    player.prompt = nearest ? 'F / E  ' + (nearest.driver === 'ai' ? 'CARJACK ' : 'ENTER ') + nearest.spec.name : '';
    updateCamera(dt, camera, mouse);
  }

  Object.assign(player, {
    update, updateCamera, takeDamage, heal, addArmor, addCash, respawn, enterCar, exitCar,
    selectWeapon, reload, shoot, die,
  });
  return player;
}
