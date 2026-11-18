// Traffic and street life. Cars follow the avenue lanes, keep to the right, stop at red lights,
// brake for whatever is in front and are recycled around the player; pedestrians loop the
// pavements, cross at the corners, dodge each other and run when a gun goes off or a horn sounds.
// The same modules make a carjack's driver bail out and a body fall where it was shot.
import * as THREE from '../vendor/three.module.js';
import { CITY } from './config.js';
import { createPedestrian, animatePedestrian } from './humanoid.js';

const PED_PALETTES = [
  { skin: '#c78e64', hair: '#231a1a', jacket: '#4a6b8a', pants: '#2a2d38', shoes: '#1a1a20', accent: '#e8d7c0' },
  { skin: '#8d5a3c', hair: '#12100f', jacket: '#8a3b4a', pants: '#22242c', shoes: '#2a2622', accent: '#f0c9a0' },
  { skin: '#e0b090', hair: '#5a3a22', jacket: '#3f7a5e', pants: '#31323b', shoes: '#1c1a1a', accent: '#c9b8a0' },
  { skin: '#a06a48', hair: '#2e1d18', jacket: '#c9a34a', pants: '#25242c', shoes: '#241f1c', accent: '#8a4a3a' },
  { skin: '#d9a273', hair: '#1a1a22', jacket: '#5a4a8a', pants: '#2a2c33', shoes: '#1a1a1c', accent: '#9fd0ff' },
  { skin: '#b87a52', hair: '#33251e', jacket: '#d0d0d8', pants: '#3a3a44', shoes: '#242024', accent: '#7a6a5a' },
  { skin: '#7a4e34', hair: '#101014', jacket: '#2f6f78', pants: '#2a2a30', shoes: '#232020', accent: '#ffd08a' },
  { skin: '#c28a60', hair: '#40281e', jacket: '#8a5a2f', pants: '#232630', shoes: '#1c1a1a', accent: '#5a7a4a' },
];

const TRAFFIC_TYPES = ['sedan', 'taxi', 'sedan', 'van', 'muscle', 'sports', 'taxi', 'sedan', 'van'];

export function createTraffic(scene, world, vehicles, effects, audio, random) {
  const peds = [];
  const trafficCars = [];
  let playerRef = null;
  let elapsedTime = 0;

  function laneOf(axis, line, dir) {
    return axis === 'x' ? { x: null, z: line + dir * 4 } : { x: line - dir * 4, z: null };
  }

  function headingOf(axis, dir) {
    if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return dir > 0 ? 0 : Math.PI;
  }

  function assignLane(car, axis, dir, line) {
    car.ai.axis = axis;
    car.ai.dir = dir;
    car.ai.line = line;
    car.heading = headingOf(axis, dir);
    if (axis === 'x') car.pos.z = line + dir * 4;
    else car.pos.x = line - dir * 4;
  }

  function spawnTrafficCar(point) {
    const type = TRAFFIC_TYPES[Math.floor(random() * TRAFFIC_TYPES.length)];
    const axis = random() < 0.5 ? 'x' : 'z';
    const line = CITY.lines[Math.floor(random() * (CITY.lines.length - 1))];
    const dir = random() < 0.5 ? 1 : -1;
    const along = point ?? world.randomRoadPoint(random, playerRef?.pos, 70);
    const x = axis === 'x' ? along.x : line - dir * 4;
    const z = axis === 'x' ? line + dir * 4 : along.z;
    const car = vehicles.spawnCar(type, x, z, headingOf(axis, dir), {
      driver: 'ai',
      ai: { axis, dir, line, cruise: 9 + random() * 8, decision: 3 + random() * 4, wreckTimer: 0, stuck: 0 },
    });
    trafficCars.push(car);
    return car;
  }

  function recycle(car, point) {
    car.ai.axis = random() < 0.5 ? 'x' : 'z';
    car.ai.line = CITY.lines[Math.floor(random() * (CITY.lines.length - 1))];
    car.ai.dir = random() < 0.5 ? 1 : -1;
    car.ai.cruise = 9 + random() * 8;
    car.pos.set(point.x, 0, point.z);
    car.heading = headingOf(car.ai.axis, car.ai.dir);
    car.speed = 4;
    car.throttle = 0;
    if (car.ai.axis === 'x') car.pos.z = car.ai.line + car.ai.dir * 4;
    else car.pos.x = car.ai.line - car.ai.dir * 4;
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
  }

  /** The first crossing line the car is approaching, within `range` metres. */
  function crossingAhead(car, range) {
    const ai = car.ai;
    const along = ai.axis === 'x' ? car.pos.x : car.pos.z;
    let best = null, bestDistance = range;
    for (const line of CITY.lines) {
      const distance = (line - along) * ai.dir;
      if (distance > 0.5 && distance < bestDistance) {
        best = line;
        bestDistance = distance;
      }
    }
    return best;
  }

  function obstacleAhead(car) {
    const ai = car.ai;
    const forwardX = Math.sin(car.heading), forwardZ = Math.cos(car.heading);
    const check = (x, z, radius) => {
      const dx = x - car.pos.x, dz = z - car.pos.z;
      const ahead = dx * forwardX + dz * forwardZ;
      if (ahead < 1 || ahead > 9 + Math.abs(car.speed) * 0.5) return false;
      const side = Math.abs(dx * forwardZ - dz * forwardX);
      return side < 2.2 + radius;
    };
    for (const other of trafficCars) {
      if (other === car || other.wrecked) continue;
      if (check(other.pos.x, other.pos.z, 1.4)) return true;
    }
    if (playerRef) {
      if (check(playerRef.pos.x, playerRef.pos.z, 0.7)) return true;
      if (playerRef.car && check(playerRef.car.pos.x, playerRef.car.pos.z, 1.8)) return true;
    }
    for (const ped of peds) {
      if (!ped.dead && check(ped.pos.x, ped.pos.z, 0.4)) return true;
    }
    return false;
  }

  function driveTraffic(car, dt) {
    const ai = car.ai;
    if (car.wrecked) {
      ai.wreckTimer += dt;
      return;
    }
    let aimX, aimZ;
    if (ai.axis === 'x') {
      aimZ = ai.line + ai.dir * 4;
      aimX = car.pos.x + ai.dir * 24;
    } else {
      aimX = ai.line - ai.dir * 4;
      aimZ = car.pos.z + ai.dir * 24;
    }
    const desired = Math.atan2(aimX - car.pos.x, aimZ - car.pos.z);
    let delta = Math.atan2(Math.sin(desired - car.heading), Math.cos(desired - car.heading));
    car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, delta));
    car.steer = Math.max(-1, Math.min(1, delta * 2));
    // Turn at an intersection now and then.
    ai.decision -= dt;
    const crossing = crossingAhead(car, 6.5);
    if (crossing !== null && ai.decision <= 0) {
      ai.decision = 5 + random() * 5;
      const turn = random();
      if (turn < 0.34) {
        const line = crossing;
        if (ai.axis === 'x') {
          const newDir = turn < 0.17 ? -ai.dir : ai.dir;
          assignLane(car, 'z', newDir, line);
        } else {
          const newDir = turn < 0.17 ? ai.dir : -ai.dir;
          assignLane(car, 'x', newDir, line);
        }
      }
    }
    let wantSpeed = ai.cruise;
    const approach = crossingAhead(car, 14);
    if (approach !== null) {
      const signal = world.signalState();
      const state = ai.axis === 'x' ? signal.ew : signal.ns;
      if (state !== 'green') wantSpeed = 0;
    }
    if (obstacleAhead(car)) {
      wantSpeed = 0;
      if (Math.abs(car.speed) < 0.4) ai.stuck += dt;
      else ai.stuck = 0;
      if (ai.stuck > 3) {
        // Nudge around a jam rather than parking forever.
        car.heading += 0.6;
        ai.stuck = 0;
        wantSpeed = 5;
      }
    }
    car.throttle = car.speed < wantSpeed - 0.5 ? 1 : car.speed > wantSpeed + 1.2 ? -1 : 0;
    if (Math.abs(car.speed) < 0.2 && wantSpeed > 0) car.speed += 1.2 * dt;
  }

  function createPed(x, z, block) {
    const palette = PED_PALETTES[Math.floor(random() * PED_PALETTES.length)];
    const rig = createPedestrian(palette, random() * 6.28);
    scene.add(rig.group);
    const ped = {
      rig, pos: new THREE.Vector3(x, world.surfaceHeight(x, z), z), heading: random() * 6.28,
      speed: 0, mode: 'walk', target: { x, z }, block, fleeTimer: 0, dead: false, hp: 65,
      kind: 'pedestrian', deathTimer: 0, side: Math.floor(random() * 4), dirCCW: random() < 0.5 ? 1 : -1,
      cornerIndex: Math.floor(random() * 4), crossing: false, panicked: 0,
    };
    rig.group.position.copy(ped.pos);
    peds.push(ped);
    return ped;
  }

  function cornerOf(block, index) {
    const half = block.size / 2 - 4.2;
    const corners = [
      { x: block.x - half, z: block.z - half }, { x: block.x + half, z: block.z - half },
      { x: block.x + half, z: block.z + half }, { x: block.x - half, z: block.z + half },
    ];
    return corners[(index + 4) % 4];
  }

  function nextWaypoint(ped) {
    const block = ped.block;
    if (!block) return null;
    if (ped.crossing) {
      // Walk across the road to the pavement on the far side.
      const side = ped.side;
      const half = block.size / 2 - 4.2;
      const pair = [
        { x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 },
      ][side];
      return { x: ped.pos.x + pair.x * 26, z: ped.pos.z + pair.z * 26 };
    }
    ped.cornerIndex = (ped.cornerIndex + ped.dirCCW + 4) % 4;
    return cornerOf(block, ped.cornerIndex);
  }

  function pedHurt(ped, amount) {
    if (ped.dead) return;
    ped.hp -= amount;
    ped.fleeTimer = 8;
    ped.panicked = 1;
    effects.spark(ped.pos.x, 1.2, ped.pos.z, { life: 0.4, size: 0.45, r: 0.85, g: 0.12, b: 0.16, vy: 1.4, vx: (random() - 0.5) * 2, vz: (random() - 0.5) * 2 });
    if (ped.hp <= 0) {
      ped.dead = true;
      ped.deathTimer = 16;
      ped.speed = 0;
      ped.rig.group.rotation.z = 1.5;
      ped.rig.group.position.y = ped.pos.y + 0.25;
      audio.crash(ped.pos, 0.4);
    }
  }

  function fleeFrom(x, z, radius) {
    for (const ped of peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.pos.x - x, ped.pos.z - z) > radius) continue;
      ped.fleeTimer = 6 + random() * 2;
      ped.panicked = 1;
      ped.crossing = false;
    }
  }

  function updatePed(ped, dt) {
    if (ped.dead) {
      ped.deathTimer -= dt;
      return;
    }
    const awayX = ped.pos.x;
    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      ped.speed += (5.4 - ped.speed) * Math.min(1, dt * 5);
      const target = ped.target;
      const dx = target.x - ped.pos.x, dz = target.z - ped.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1.2 || ped.fleeTimer <= 0) {
        ped.crossing = false;
        ped.target = nextWaypoint(ped) ?? ped.target;
      }
      if (ped.fleeTimer <= 0 && !ped.crossing) {
        ped.block = world.blockBounds.reduce((best, block) => {
          const d = Math.hypot(block.x - ped.pos.x, block.z - ped.pos.z);
          return d < best.d ? { block, d } : best;
        }, { block: ped.block, d: Infinity }).block;
        ped.cornerIndex = 0;
        ped.target = cornerOf(ped.block, 0);
      }
    } else {
      ped.speed += (1.5 - ped.speed) * Math.min(1, dt * 4);
    }
    let dx = ped.target.x - ped.pos.x, dz = ped.target.z - ped.pos.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 1.2) {
      if (ped.crossing) {
        ped.crossing = false;
        const nearest = world.blockBounds.reduce((best, block) => {
          const d = Math.hypot(block.x - ped.pos.x, block.z - ped.pos.z);
          return d < best.d ? { block, d } : best;
        }, { block: ped.block, d: Infinity });
        ped.block = Math.max(0, Math.min(world.blockBounds.length - 1, nearest.block ? world.blockBounds.indexOf(nearest.block) : 0));
        ped.block = world.blockBounds[ped.block] ?? world.blockBounds[0];
        ped.cornerIndex = 0;
        ped.dirCCW = random() < 0.5 ? 1 : -1;
      } else if (!ped.fleeTimer && random() < 0.18) {
        ped.crossing = true;
        ped.side = Math.floor(random() * 4);
      }
      ped.target = nextWaypoint(ped) ?? { x: ped.pos.x, z: ped.pos.z };
      dx = ped.target.x - ped.pos.x;
      dz = ped.target.z - ped.pos.z;
      distance = Math.hypot(dx, dz) || 1;
    }
    const wantedHeading = Math.atan2(dx, dz);
    let delta = Math.atan2(Math.sin(wantedHeading - ped.heading), Math.cos(wantedHeading - ped.heading));
    ped.heading += delta * Math.min(1, dt * 5);
    ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
    ped.pos.y = world.surfaceHeight(ped.pos.x, ped.pos.z);
    // Avoid standing inside a building when crossing badly.
    world.resolveCollision(ped.pos, 0.4);
    ped.rig.group.position.set(ped.pos.x, ped.pos.y, ped.pos.z);
    ped.rig.group.rotation.y = ped.heading;
    animatePedestrian(ped.rig, dt, ped.speed);
    if (ped.fleeTimer > 0) {
      ped.rig.group.rotation.x = -0.15;
      ped.rig.body.position.y = Math.abs(Math.sin(ped.rig.phase)) * 0.05;
    } else {
      ped.rig.group.rotation.x = 0;
    }
  }

  function update(dt, player) {
    elapsedTime += dt;
    if (player) playerRef = player;
    for (let i = trafficCars.length - 1; i >= 0; i -= 1) {
      const car = trafficCars[i];
      if (!playerRef) break;
      if (car.wrecked) {
        car.ai.wreckTimer += dt;
        if (car.ai.wreckTimer > 30) {
          vehicles.removeCar(car);
          trafficCars.splice(i, 1);
          if (trafficCars.length < 10) spawnTrafficCar(world.randomRoadPoint(random, playerRef.pos, 90));
        }
        continue;
      }
      const distance = Math.hypot(car.pos.x - playerRef.pos.x, car.pos.z - playerRef.pos.z);
      if (distance > 300) {
        recycle(car, world.randomRoadPoint(random, playerRef.pos, 110));
        continue;
      }
      driveTraffic(car, dt);
    }
    for (const ped of peds) {
      updatePed(ped, dt);
      if (ped.dead) continue;
      // Cars hit pedestrians.
      for (const car of vehicles.cars) {
        if (car.wrecked || Math.abs(car.speed) < 4) continue;
        const distance = Math.hypot(car.pos.x - ped.pos.x, car.pos.z - ped.pos.z);
        if (distance < 2.2) {
          pedHurt(ped, 60 + Math.abs(car.speed) * 2);
          effects.spark(ped.pos.x, 1, ped.pos.z, { life: 0.5, size: 0.6, r: 0.9, g: 0.1, b: 0.15, vy: 2 });
          car.speed *= 0.75;
          audio.crash(ped.pos, 0.7);
          if (car.isPlayer && playerRef.callbacks.onCrime) playerRef.callbacks.onCrime('pedestrian', 0);
          break;
        }
      }
      // The player's car pushes pedestrians aside.
      if (playerRef.car) continue;
      if (playerRef.speed > 6 && Math.hypot(playerRef.pos.x - ped.pos.x, playerRef.pos.z - ped.pos.z) < 1.4) {
        ped.fleeTimer = 4;
      }
    }
    // Keep the crowd near the player: recycle distant people.
    for (const ped of peds) {
      if (!playerRef) break;
      if (ped.dead) {
        if (ped.deathTimer <= 0) {
          scene.remove(ped.rig.group);
          const index = peds.indexOf(ped);
          if (index !== -1) peds.splice(index, 1);
        }
        continue;
      }
      if (Math.hypot(ped.pos.x - playerRef.pos.x, ped.pos.z - playerRef.pos.z) > 190) {
        const point = world.randomRoadPoint(random, playerRef.pos, 40);
        const block = world.blockBounds[Math.floor(random() * world.blockBounds.length)];
        ped.block = block;
        ped.pos.set(block.x + (random() - 0.5) * (block.size - 14), 0.3, block.z + (random() - 0.5) * (block.size - 14));
        ped.pos.y = world.surfaceHeight(ped.pos.x, ped.pos.z);
        ped.cornerIndex = Math.floor(random() * 4);
        ped.target = cornerOf(block, ped.cornerIndex);
        ped.crossing = false;
        ped.rig.group.position.copy(ped.pos);
      }
    }
  }

  function reset() {
    for (const ped of peds) scene.remove(ped.rig.group);
    peds.length = 0;
    for (const car of trafficCars) vehicles.removeCar(car);
    trafficCars.length = 0;
  }

  function spawnCrowd() {
    // A first busload near the spawn, then the rest spread across the grid.
    const spawn = world.landmarks.spawn;
    for (let i = 0; i < 5; i += 1) {
      const angle = random() * 6.28;
      const distance = 8 + random() * 26;
      const x = spawn.x + Math.cos(angle) * distance;
      const z = spawn.z + Math.sin(angle) * distance;
      const block = world.blockBounds.reduce((best, candidate) => {
        const d = Math.hypot(candidate.x - x, candidate.z - z);
        return d < best.d ? { block: candidate, d } : best;
      }, { block: world.blockBounds[0], d: Infinity }).block;
      createPed(x, z, block);
    }
    for (let i = 0; i < 11; i += 1) {
      const block = world.blockBounds[Math.floor(random() * world.blockBounds.length)];
      const half = block.size / 2 - 4;
      const x = block.x + (random() < 0.5 ? -half : half);
      const z = block.z + (random() - 0.5) * block.size;
      createPed(x, z, block);
    }
    // Beach walkers.
    for (let i = 0; i < 4; i += 1) {
      const x = CITY.beachEdge + 8 + random() * 40;
      const z = -260 + random() * 420;
      createPed(x, z, world.blockBounds[0]);
    }
    for (let i = 0; i < 10; i += 1) spawnTrafficCar();
  }

  function onGunshot(position) {
    fleeFrom(position.x, position.z, 46);
  }

  function onHorn(position) {
    fleeFrom(position.x, position.z, 26);
  }

  function onCarjack(car) {
    // The driver bails out and runs.
    const ped = createPed(car.pos.x + 1.5, car.pos.z, world.blockBounds[0]);
    ped.fleeTimer = 9;
    ped.target = { x: car.pos.x + (random() < 0.5 ? -1 : 1) * 30, z: car.pos.z + (random() < 0.5 ? -1 : 1) * 30 };
    ped.speed = 4;
    effects.dust(car.pos.x, 0.3, car.pos.z);
  }

  function shootables() {
    return peds.filter((ped) => !ped.dead).map((ped) => ({
      x: ped.pos.x, y: 1.15, z: ped.pos.z, radius: 0.6, dead: ped.dead,
      kind: 'pedestrian', ref: ped,
      hurt: (amount) => pedHurt(ped, amount),
    }));
  }

  return { peds, trafficCars, update, reset, spawnCrowd, onGunshot, onHorn, onCarjack, shootables, fleeFrom, spawnWalker: (x, z) => createPed(x, z, world.blockBounds.reduce((best, block) => {
    const d = Math.hypot(block.x - x, block.z - z);
    return d < best.d ? { block, d } : best;
  }, { block: world.blockBounds[0], d: Infinity }).block) };
}
