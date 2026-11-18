// The heat: 0-5 wanted stars, cruisers that spawn out of sight and chase, officers who get out and
// shoot at two stars, a helicopter at four, and the hiding rule that cools the stars down when
// nobody has seen the player for a while. Busted is a timer, not a script.
import * as THREE from '../vendor/three.module.js';
import { CRIME } from './config.js';
import { createPedestrian, animatePedestrian } from './humanoid.js';

const OFFICER_PALETTE = { skin: '#b07a54', hair: '#1a1718', jacket: '#33507f', pants: '#1a2030', shoes: '#15151a', accent: '#9fc0ff' };

export function createPolice(scene, world, vehicles, effects, audio, random) {
  const officers = [];
  const cruisers = [];
  const state = {
    heat: 0, stars: 0, sinceCrime: 99, hidden: 0, bustTimer: 0,
    helicopters: 0, alerts: [], time: 0,
  };
  const callbacks = { onBusted: null, onStars: null };
  let heli = null;
  let playerRef = null;

  function buildHelicopter() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 5.2), new THREE.MeshStandardMaterial({ color: '#22304a', metalness: 0.5, roughness: 0.4 }));
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 2.0), new THREE.MeshStandardMaterial({ color: '#0e1a24', metalness: 0.8, roughness: 0.15 }));
    cabin.position.set(0, 0.4, 1.4);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4.0), new THREE.MeshStandardMaterial({ color: '#22304a', roughness: 0.5 }));
    tail.position.set(0, 0.3, -4.2);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: '#141820', roughness: 0.6 }));
    rotor.position.y = 1.2;
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.4), new THREE.MeshStandardMaterial({ color: '#141820' }));
    tailRotor.position.set(0.3, 0.4, -6.2);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(7, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = -16;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#e8f4ff', toneMapped: false }));
    lamp.position.y = -0.4;
    group.add(body, cabin, tail, rotor, tailRotor, beam, lamp);
    group.visible = false;
    scene.add(group);
    return { group, rotor, tailRotor, beam };
  }

  function spawnCruiser() {
    const player = playerRef;
    if (!player) return null;
    const point = world.randomRoadPoint(random, player.pos, 110);
    const car = vehicles.spawnCar('police', point.x, point.z, random() * 6.28, { driver: 'ai', siren: true });
    car.ai = { chase: true, deploy: 0, stuck: 0, ram: 0 };
    car.health = 260;
    car.maxHealth = 260;
    cruisers.push(car);
    state.alerts.push({ text: 'POLICE UNITS RESPONDING', time: 3 });
    return car;
  }

  function spawnOfficer(x, z) {
    const rig = createPedestrian(OFFICER_PALETTE, random() * 6.28);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), new THREE.MeshStandardMaterial({ color: '#191920', metalness: 0.8, roughness: 0.3 }));
    gun.position.set(0.36, 1.16, 0.28);
    rig.group.add(gun);
    scene.add(rig.group);
    const officer = {
      rig, pos: new THREE.Vector3(x, world.surfaceHeight(x, z), z), heading: random() * 6.28,
      speed: 0, hp: 110, dead: false, fireTimer: 1 + random(), deadTimer: 20, kind: 'police',
      strafe: random() < 0.5 ? -1 : 1, targetOffset: random() * 3,
    };
    rig.group.position.copy(officer.pos);
    officers.push(officer);
    return officer;
  }

  function officerHurt(officer, amount) {
    if (officer.dead) return;
    officer.hp -= amount;
    effects.spark(officer.pos.x, 1.2, officer.pos.z, { life: 0.4, size: 0.45, r: 0.9, g: 0.2, b: 0.2, vy: 1.4 });
    if (officer.hp <= 0) {
      officer.dead = true;
      officer.deadTimer = 24;
      officer.rig.group.rotation.z = 1.5;
      officer.rig.group.position.y = officer.pos.y + 0.25;
      addHeat(0.7);
      audio.crash(officer.pos, 0.5);
    }
  }

  function addHeat(amount, reason = '') {
    state.heat = Math.min(5, state.heat + amount);
    state.sinceCrime = 0;
    state.hidden = 0;
    if (reason) state.alerts.push({ text: reason, time: 2.5 });
  }

  function hasLineOfSight(fromX, fromZ, toX, toZ) {
    return !world.lineBlocked(fromX, fromZ, toX, toZ);
  }

  function updateCruiser(car, dt, player) {
    if (car.wrecked) return;
    const dx = player.pos.x - car.pos.x, dz = player.pos.z - car.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 230) {
      const point = world.randomRoadPoint(random, player.pos, 90);
      car.pos.set(point.x, 0, point.z);
      car.speed = 8;
      return;
    }
    const desired = Math.atan2(dx, dz);
    let delta = Math.atan2(Math.sin(desired - car.heading), Math.cos(desired - car.heading));
    car.steer = Math.max(-1, Math.min(1, delta * 1.7));
    car.throttle = distance > 9 ? 1 : distance > 5 ? 0 : -1;
    // Off the road and stuck against a wall: reverse out.
    if (Math.abs(car.speed) < 0.6 && car.throttle > 0) {
      car.ai.stuck += dt;
      if (car.ai.stuck > 1.6) {
        car.throttle = -1;
        car.steer = -car.steer;
        if (car.ai.stuck > 2.6) car.ai.stuck = 0;
      }
    } else car.ai.stuck = 0;
    car.ai.ram += dt;
    if (distance < 4.2 && Math.abs(car.speed) > 9 && car.ai.ram > 1.2) {
      car.ai.ram = 0;
      player.takeDamage(7);
      effects.shake(0.4);
      audio.crash(car.pos, 0.8);
    }
    // Deploy officers when the player is on foot and close.
    if (!player.car && distance < 30 && Math.abs(car.speed) < 3 && state.stars >= 2) {
      car.ai.deploy += dt;
      if (car.ai.deploy > 1.4) {
        car.ai.deploy = 0;
        const side = car.heading + Math.PI / 2;
        spawnOfficer(car.pos.x + Math.cos(side) * 2.4, car.pos.z - Math.sin(side) * 2.4);
        spawnOfficer(car.pos.x - Math.cos(side) * 2.4, car.pos.z + Math.sin(side) * 2.4);
      }
    }
  }

  function updateOfficer(officer, dt, player) {
    if (officer.dead) {
      officer.deadTimer -= dt;
      return;
    }
    const dx = player.pos.x - officer.pos.x, dz = player.pos.z - officer.pos.z;
    const distance = Math.hypot(dx, dz);
    const los = hasLineOfSight(officer.pos.x, officer.pos.z, player.pos.x, player.pos.z);
    const wanted = distance > 8 ? 4.4 : distance < 4 ? -3.4 : 0;
    const heading = Math.atan2(dx, dz);
    officer.heading += Math.atan2(Math.sin(heading - officer.heading), Math.cos(heading - officer.heading)) * Math.min(1, dt * 6);
    officer.speed += (wanted - officer.speed) * Math.min(1, dt * 4);
    const sideX = Math.cos(officer.heading) * officer.strafe;
    const sideZ = -Math.sin(officer.heading) * officer.strafe;
    officer.pos.x += Math.sin(officer.heading) * officer.speed * dt + sideX * 0.6 * dt;
    officer.pos.z += Math.cos(officer.heading) * officer.speed * dt + sideZ * 0.6 * dt;
    if (distance < 1.4) officer.speed = 0;
    officer.pos.y = world.surfaceHeight(officer.pos.x, officer.pos.z);
    world.resolveCollision(officer.pos, 0.4);
    officer.rig.group.position.copy(officer.pos);
    officer.rig.group.rotation.y = officer.heading;
    animatePedestrian(officer.rig, dt, Math.abs(officer.speed));
    officer.fireTimer -= dt;
    if (los && distance < 26 && officer.fireTimer <= 0 && state.stars >= 2) {
      officer.fireTimer = 1.1 + random() * 0.8;
      const muzzle = new THREE.Vector3(officer.pos.x + Math.sin(officer.heading) * 0.5, officer.pos.y + 1.35, officer.pos.z + Math.cos(officer.heading) * 0.5);
      const target = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
      effects.tracer(muzzle, target, '#9fd0ff');
      effects.muzzle(muzzle, '#bcdcff');
      audio.gunshot('pistol');
      const hitChance = Math.max(0.18, 0.72 - distance * 0.02);
      if (random() < hitChance) {
        player.takeDamage(7 + random() * 6);
        effects.shake(0.28);
      } else {
        effects.spark(target.x + (random() - 0.5) * 2, target.y, target.z + (random() - 0.5) * 2, { life: 0.2, size: 0.3, r: 1, g: 0.8, b: 0.5 });
      }
    }
  }

  function updateHelicopter(dt, player) {
    if (state.stars < 4) {
      if (heli) heli.group.visible = false;
      return;
    }
    if (!heli) heli = buildHelicopter();
    heli.group.visible = true;
    const t = state.time;
    const angle = state.time * 0.22 + t;
    const radius = 58;
    const targetX = player.pos.x + Math.cos(angle) * radius;
    const targetZ = player.pos.z + Math.sin(angle) * radius;
    const height = 42 + Math.sin(angle * 1.7) * 4;
    const current = heli.group.position;
    heli.group.position.x += (targetX - current.x) * Math.min(1, dt * 0.9);
    heli.group.position.z += (targetZ - current.z) * Math.min(1, dt * 0.9);
    heli.group.position.y += (height - current.y) * Math.min(1, dt * 0.9);
    heli.group.lookAt(player.pos.x, 0, player.pos.z);
    heli.rotor.rotation.y += dt * 26;
    heli.tailRotor.rotation.x += dt * 34;
    heli.beam.position.y = -16;
  }

  function update(dt, player) {
    playerRef = player;
    state.time += dt;
    state.sinceCrime += dt;
    const sighted = (() => {
      for (const car of cruisers) {
        if (car.wrecked) continue;
        if (Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z) < 70 && hasLineOfSight(car.pos.x, car.pos.z, player.pos.x, player.pos.z)) return true;
      }
      for (const officer of officers) {
        if (officer.dead) continue;
        if (Math.hypot(officer.pos.x - player.pos.x, officer.pos.z - player.pos.z) < 45 && hasLineOfSight(officer.pos.x, officer.pos.z, player.pos.x, player.pos.z)) return true;
      }
      if (heli && heli.group.visible) return true;
      return false;
    })();
    if (sighted) {
      state.hidden = 0;
      state.sinceCrime = Math.min(state.sinceCrime, CRIME.coolDelay - 0.1);
    } else {
      state.hidden += dt;
      if (state.sinceCrime > CRIME.coolDelay && state.hidden > 2) state.heat = Math.max(0, state.heat - CRIME.coolRate * dt);
    }
    const stars = Math.min(5, Math.floor(state.heat + 0.001));
    if (stars !== state.stars) {
      state.stars = stars;
      player.wanted = stars;
      if (callbacks.onStars) callbacks.onStars(stars);
    }
    // Keep a fleet on the player.
    const wantedCruisers = state.stars === 0 ? 0 : Math.min(5, 1 + Math.floor(state.stars * 1.1));
    if (cruisers.length < wantedCruisers && state.alerts.length < 4) spawnCruiser();
    for (let i = cruisers.length - 1; i >= 0; i -= 1) {
      const car = cruisers[i];
      if (car.wrecked && Math.abs(car.speed) < 0.5) {
        if (random() < dt * 0.5) {
          vehicles.removeCar(car);
          cruisers.splice(i, 1);
        }
        continue;
      }
      updateCruiser(car, dt, player);
    }
    for (let i = officers.length - 1; i >= 0; i -= 1) {
      const officer = officers[i];
      updateOfficer(officer, dt, player);
      const distance = Math.hypot(officer.pos.x - player.pos.x, officer.pos.z - player.pos.z);
      if (officer.dead && officer.deadTimer <= 0) {
        scene.remove(officer.rig.group);
        officers.splice(i, 1);
        continue;
      }
      if (!player.car && state.stars > 0 && distance < 3.4 && !officer.dead) {
        state.bustTimer += dt;
        if (state.bustTimer > 1.3) {
          state.bustTimer = 0;
          if (callbacks.onBusted) callbacks.onBusted();
        }
      }
    }
    if (officers.every((officer) => officer.dead)) state.bustTimer = 0;
    updateHelicopter(dt, player);
    for (const alert of state.alerts) alert.time -= dt;
    state.alerts = state.alerts.filter((alert) => alert.time > 0);
    if (state.stars === 0) {
      for (const car of cruisers.slice()) {
        if (Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z) > 90) {
          vehicles.removeCar(car);
          cruisers.splice(cruisers.indexOf(car), 1);
        }
      }
    }
  }

  function clear() {
    state.heat = 0;
    state.stars = 0;
    state.bustTimer = 0;
    for (const car of cruisers) vehicles.removeCar(car);
    cruisers.length = 0;
    for (const officer of officers) scene.remove(officer.rig.group);
    officers.length = 0;
    if (heli) heli.group.visible = false;
  }

  function shootables() {
    return officers.filter((officer) => !officer.dead).map((officer) => ({
      x: officer.pos.x, y: 1.2, z: officer.pos.z, radius: 0.6, dead: officer.dead,
      kind: 'police', ref: officer, hurt: (amount) => officerHurt(officer, amount),
    }));
  }

  return {
    officers, cruisers, state, callbacks, addHeat, update, clear, shootables, spawnOfficer, spawnCruiser,
    get stars() { return state.stars; },
    get wanted() { return state.stars; },
  };
}
