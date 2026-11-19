// The street life: lane-following cars that obey a two-phase grid signal,
// keep their distance, yield to people, and recycle around the player; plus
// pedestrians who loop their blocks, cross at the painted crosswalks, and
// gather at the beach and pier. The whole crowd renders through seven
// instanced meshes, so thirty-odd people cost seven draw calls.

import * as THREE from '../vendor/three.module.js';
import { BLOCK_CENTERS, ROADS, WORLD } from './config.js';
import { TRAFFIC_MIX, pickVehicleColor } from './vehicles.js';
import { makeRng } from './random.js';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const TAU = Math.PI * 2;

export const LANE_OFFSET = 3.2;
const STOP_LINE = 12.4;
const CORNER = 17.4;
const MAX_PEDS = 48;
const SIDEWALK_TARGET = 24;
const BEACH_TARGET = 11;
const CAR_TARGET = 13;

const CORNERS = [
  [CORNER, CORNER],
  [-CORNER, CORNER],
  [-CORNER, -CORNER],
  [CORNER, -CORNER],
];

function cornerIndexFor(relativeX, relativeZ) {
  for (let i = 0; i < CORNERS.length; i += 1) {
    if (Math.sign(CORNERS[i][0]) === Math.sign(relativeX) && Math.sign(CORNERS[i][1]) === Math.sign(relativeZ)) {
      return i;
    }
  }
  return 0;
}

function signalGreen(axis, elapsed) {
  const phase = Math.floor(elapsed / 9) % 2;
  return (phase === 0) === (axis === 'x');
}

function laneYaw(axis, direction) {
  if (axis === 'x') return direction > 0 ? Math.PI / 2 : -Math.PI / 2;
  return direction > 0 ? 0 : Math.PI;
}

function lanePoint(axis, line, direction, along) {
  if (axis === 'x') {
    return { x: along, z: line + direction * LANE_OFFSET, yaw: laneYaw(axis, direction) };
  }
  return { x: line - direction * LANE_OFFSET, z: along, yaw: laneYaw(axis, direction) };
}

const clothing = [0xd75543, 0x3f8f8f, 0xe4d6b8, 0x6a7f54, 0x8a4f6d, 0x4b5f8c, 0xe0a94f, 0x9c3b42, 0x557a6a, 0xc7a887];
const pants = [0x252334, 0x3a3340, 0x2d3f4a, 0x51463c, 0x1d222c, 0x5d5548];
const skins = [0xb87a60, 0x8c5a44, 0xd9a37c, 0x6e4636, 0xc28d6a, 0x9c6c50];
const hairs = [0x24161c, 0x3b241c, 0x17141a, 0x6b4a2c, 0x8f8272, 0x4a2b33];class Crowd {
  constructor(scene, capacity = MAX_PEDS) {
    this.capacity = capacity;
    this.meshes = {};

    const torsoGeometry = new THREE.BoxGeometry(0.4, 0.54, 0.25);
    torsoGeometry.translate(0, 0.27, 0);
    const headGeometry = new THREE.SphereGeometry(0.157, 8, 6);
    headGeometry.translate(0, 0.16, 0);
    headGeometry.scale(0.94, 1.03, 0.92);
    const hairGeometry = new THREE.SphereGeometry(0.165, 8, 5, 0, TAU, 0, Math.PI * 0.58);
    hairGeometry.translate(0, 0.17, 0);
    const armGeometry = new THREE.BoxGeometry(0.11, 0.49, 0.12);
    armGeometry.translate(0, -0.245, 0);
    const legGeometry = new THREE.BoxGeometry(0.145, 0.78, 0.165);
    legGeometry.translate(0, -0.39, 0);
    const hatGeometry = new THREE.CylinderGeometry(0.15, 0.185, 0.1, 8);
    hatGeometry.translate(0, 0.05, 0);

    const makeMaterial = (roughness, metalness = 0.02) => new THREE.MeshStandardMaterial({ roughness, metalness });
    const materials = {
      torso: makeMaterial(0.88),
      head: makeMaterial(0.7),
      hair: makeMaterial(0.96),
      arm: makeMaterial(0.9),
      leg: makeMaterial(0.92),
      hat: makeMaterial(0.82),
    };

    const parts = {
      torso: [torsoGeometry, materials.torso],
      head: [headGeometry, materials.head],
      hair: [hairGeometry, materials.hair],
      armLeft: [armGeometry, materials.arm],
      armRight: [armGeometry, materials.arm],
      legLeft: [legGeometry, materials.leg],
      legRight: [legGeometry, materials.leg],
      hat: [hatGeometry, materials.hat],
    };

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [name, [geometry, material]] of Object.entries(parts)) {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      for (let i = 0; i < capacity; i += 1) {
        mesh.setMatrixAt(i, zero);
        mesh.setColorAt(i, new THREE.Color(0xffffff));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      this.meshes[name] = mesh;
    }
    this.zero = zero;
    this._base = new THREE.Matrix4();
    this._local = new THREE.Matrix4();
    this._out = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._color = new THREE.Color();
  }

  setColors(slot, spec) {
    this.meshes.torso.setColorAt(slot, this._color.setHex(spec.cloth));
    this.meshes.armLeft.setColorAt(slot, this._color.setHex(spec.cloth).multiplyScalar(0.86));
    this.meshes.armRight.setColorAt(slot, this._color.setHex(spec.cloth).multiplyScalar(0.86));
    this.meshes.legLeft.setColorAt(slot, this._color.setHex(spec.pants));
    this.meshes.legRight.setColorAt(slot, this._color.setHex(spec.pants));
    this.meshes.head.setColorAt(slot, this._color.setHex(spec.skin));
    this.meshes.hair.setColorAt(slot, this._color.setHex(spec.hair));
    this.meshes.hat.setColorAt(slot, this._color.setHex(spec.hatColor));
    for (const mesh of Object.values(this.meshes)) mesh.instanceColor.needsUpdate = true;
  }

  hide(slot) {
    for (const mesh of Object.values(this.meshes)) {
      mesh.setMatrixAt(slot, this.zero);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  write(ped) {
    if (!ped.active) return;
    const slot = ped.slot;
    const bob = Math.abs(Math.sin(ped.phase)) * 0.034 * ped.motion;
    const scale = ped.scale;
    this._euler.set(0, ped.yaw, 0);
    this._quaternion.setFromEuler(this._euler);
    this._position.set(ped.x, ped.y + bob, ped.z);
    this._scale.set(scale, scale, scale);
    this._base.compose(this._position, this._quaternion, this._scale);

    const swing = Math.sin(ped.phase) * 0.6 * ped.motion;
    const arms = swing * 0.78;
    this.writePart('torso', slot, 0, 0.84, 0, 0.04);
    this.writePart('head', slot, 0, 1.36, 0, 0);
    this.writePart('hair', slot, 0, 1.37, 0, 0);
    this.writePart('legLeft', slot, 0.102, 0.83, 0, swing);
    this.writePart('legRight', slot, -0.102, 0.83, 0, -swing);
    this.writePart('armLeft', slot, 0.262, 1.3, 0, -arms);
    this.writePart('armRight', slot, -0.262, 1.3, 0, arms);
    if (ped.hat) {
      this.writePart('hat', slot, 0, 1.61, 0, 0);
    } else {
      this.meshes.hat.setMatrixAt(slot, this.zero);
    }
    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  writePart(name, slot, x, y, z, rotationX) {
    this._local.makeRotationX(rotationX);
    this._local.setPosition(x, y, z);
    this._out.multiplyMatrices(this._base, this._local);
    this.meshes[name].setMatrixAt(slot, this._out);
  }
}

export class Traffic {
  constructor(scene, world, vehicles, player) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.player = player;
    this.rng = makeRng(0x51ee7);
    this.cars = [];
    this.peds = [];
    this.crowd = new Crowd(scene);
    this.spawnTimer = 0;
    this.pedTimer = 0;
    this.carTarget = CAR_TARGET;
    this.sidewalkTarget = SIDEWALK_TARGET;
    this._density = { cars: 0, walkers: 0 };
    this.reset({ spawnBeach: false });
  }

  get density() {
    let walkers = 0;
    for (const ped of this.peds) if (ped.active) walkers += 1;
    this._density.cars = this.cars.filter((car) => car.driver === 'ai').length;
    this._density.walkers = walkers;
    return this._density;
  }

  // ---------------------------------------------------------------- life cycle

  reset({ spawnBeach = true } = {}) {
    for (const car of this.cars) {
      if (car.driver === 'ai') this.vehicles.remove(car);
    }
    this.cars.length = 0;
    for (const ped of this.peds) this.crowd.hide(ped.slot);
    this.peds.length = 0;
    this.spawnTimer = 0;
    this.pedTimer = 0;
    if (spawnBeach) this.spawnBeachCrowd();
  }

  seedAmbient(player) {
    this.carTarget = CAR_TARGET;
    this.sidewalkTarget = SIDEWALK_TARGET;
    const px = player.position.x;
    const pz = player.position.z;

    // On the opening block of Vega Strip, plant a readable scene straight down
    // the view: two lanes of approaching and departing traffic, then let the
    // recycling fill the rest.
    if (px > -125 && px < -20 && Math.abs(pz - 27) < 14) {
      this.spawnLaneCar('sedan', 'x', 1, 27, -96, 9.5, { color: 0x2f5964 });
      this.spawnLaneCar('van', 'x', -1, 27, -104, 8.2, { color: 0x92523f });
      this.spawnLaneCar('taxi', 'x', 1, 27, -136, 8.6);
      this.spawnLaneCar('muscle', 'x', -1, 27, -82, 9.1, { color: 0x274c57 });
      const crosser = this.spawnPed({
        x: -71.8,
        z: 31.6,
        yaw: Math.PI,
        mode: 'cross',
        target: { x: -71.8, z: 18 },
        phase: 1.2,
      });
      if (crosser) {
        crosser.nextBlockX = -54;
        crosser.nextBlockZ = 0;
        crosser.crossingAxis = 'z';
      }
    }
    for (let i = 0; i < 5; i += 1) this.spawnAmbientCar(player, 42 + i * 14, 160);

    const spots = [
      [-67, 18.1, 1], [-74, 36.4, 3], [-96, 18.3, 1], [-52, 36.6, 2],
      [14, 18.2, 0], [-114, 36.5, 2], [-30, 36.7, 0],
    ];
    for (let i = 0; i < 4; i += 1) {
      const spot = spots[i];
      this.spawnSidewalkPed(spot[0], spot[1], spot[2]);
    }
    this.spawnBeachCrowd();
  }

  stageDrive(hero) {
    const hx = hero.position.x;

    this.spawnLaneCar('sedan', 'x', 1, 27, hx + 34, 8.4, { color: 0x8a3b45 });
    this.spawnLaneCar('van', 'x', 1, 27, hx + 76, 7.6, { color: 0xa8b3a4 });
    this.spawnLaneCar('sports', 'x', 1, 27, hx + 124, 10.2, { color: 0xd9483f });

    this.spawnLaneCar('taxi', 'x', -1, 27, hx + 40, 8.2);
    this.spawnLaneCar('muscle', 'x', -1, 27, hx + 74, 9.2, { color: 0x274c57 });
    this.spawnLaneCar('sedan', 'x', -1, 27, hx + 108, 8.0, { color: 0xd9c9ad });

    const parkedTaxi = this.vehicles.spawn('taxi', {
      x: hx + 16,
      z: 32.72,
      yaw: Math.PI / 2,
      color: 0xe0a92f,
    });
    parkedTaxi.setDriver(null);
    const parkedSedan = this.vehicles.spawn('sedan', {
      x: hx + 45,
      z: 21.28,
      yaw: -Math.PI / 2,
      color: 0x2f5964,
    });
    parkedSedan.setDriver(null);
    const parkedCruiser = this.vehicles.spawn('police', {
      x: hx + 30,
      z: 21.28,
      yaw: -Math.PI / 2,
      color: 0x1d2029,
    });
    parkedCruiser.setDriver(null);

    // A crosswalk party mid-stride, plus walkers on both sidewalks.
    const crosswalkX = hx + 23.8;
    const crossers = [
      [crosswalkX, 21.4, Math.PI],
      [crosswalkX + 0.5, 25.0, Math.PI],
      [crosswalkX - 0.4, 29.2, Math.PI],
      [crosswalkX + 0.3, 33.0, Math.PI],
    ];
    for (const [x, z, yaw] of crossers) {
      const ped = this.spawnPed({
        x, z, yaw,
        mode: 'cross',
        target: { x, z: z - 12 },
        phase: this.rng.range(0, TAU),
      });
      if (ped) {
        ped.pause = 0;
        ped.motion = 1;
      }
    }
    const walkers = [
      [hx + 8, 36.5, Math.PI / 2],
      [hx + 15, 36.3, Math.PI / 2],
      [hx + 31, 36.6, -Math.PI / 2],
      [hx - 8, 17.6, -Math.PI / 2],
      [hx + 26, 17.5, Math.PI / 2],
      [hx + 6, 17.7, -Math.PI / 2],
    ];
    for (const [x, z, yaw] of walkers) {
      const ped = this.spawnPed({ x, z, yaw, mode: 'idle', phase: this.rng.range(0, TAU) });
      if (ped) {
        ped.motion = 0.75;
        ped.target = { x: x + (Math.cos(yaw) > 0 ? 6 : -6), z };
        ped.mode = 'walk';
      }
    }

    this.polishVehicles();
    this.flushCrowd();
  }

  polishVehicles() {
    for (const vehicle of this.vehicles.list) {
      vehicle.alignToGround(0.016, this.world);
      vehicle.animate(0.016, 1.15);
    }
  }

  flushCrowd() {
    for (const ped of this.peds) this.crowd.write(ped);
  }

  spawnBeachCrowd() {
    if (this.peds.some((ped) => ped.active && ped.mode === 'beach')) return;
    const spots = [
      [-232, 66.5], [-224, 72.2], [-236, 72.8],
      [-198, 48], [-186, 42], [-164, 53], [-206, 88],
      [-184, 96], [-154, 84], [-188, 70.5], [-203, 71.5],
    ];
    for (let i = 0; i < Math.min(spots.length, BEACH_TARGET); i += 1) {
      const [x, z] = spots[i];
      const ped = this.spawnPed({
        x,
        z,
        yaw: this.rng.range(0, TAU),
        mode: 'beach',
        anchor: { x, z },
        phase: this.rng.range(0, TAU),
      });
      if (!ped) continue;
      ped.pause = this.rng.range(0.6, 3.6);
      ped.speed = this.rng.range(0.55, 1.0);
      this.pickBeachTarget(ped);
    }
  }

  // ---------------------------------------------------------------- cars

  spawnLaneCar(type, axis, direction, line, along, cruise = 11, options = {}) {
    const point = lanePoint(axis, line, direction, along);
    const car = this.vehicles.spawn(type, {
      x: point.x,
      z: point.z,
      yaw: point.yaw,
      color: options.color ?? pickVehicleColor(this.rng, type),
      driver: 'ai',
      speed: cruise * 0.72,
    });
    car.ai = {
      axis,
      direction,
      line,
      cruise,
      speedBias: this.rng.range(0.9, 1.08),
      stuckTime: 0,
    };
    car.controls.brake = 0;
    this.cars.push(car);
    return car;
  }

  spawnAmbientCar(player, minDistance = 60, maxDistance = 170) {
    const px = player.position.x;
    const pz = player.position.z;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const axis = this.rng.chance(0.5) ? 'x' : 'z';
      const line = this.rng.pick(ROADS);
      const direction = this.rng.sign();
      const along = this.rng.range(WORLD.cityMin + 18, WORLD.cityMax - 18);
      const point = lanePoint(axis, line, direction, along);
      const distance = Math.hypot(point.x - px, point.z - pz);
      if (distance < minDistance || distance > maxDistance) continue;
      let clear = true;
      for (const car of this.vehicles.list) {
        if (car === this.player.driving) continue;
        if (Math.hypot(car.position.x - point.x, car.position.z - point.z) < 12) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      const type = this.rng.pick(TRAFFIC_MIX);
      return this.spawnLaneCar(type, axis, direction, line, along, this.rng.range(10.5, 15));
    }
    return null;
  }

  removeCar(car) {
    const index = this.cars.indexOf(car);
    if (index !== -1) this.cars.splice(index, 1);
    this.vehicles.remove(car);
  }

  updateCars(dt, elapsed, player) {
    const px = player.position.x;
    const pz = player.position.z;
    for (const car of [...this.cars]) {
      if (car.removed) continue;
      if (car.driver !== 'ai') continue;
      const ai = car.ai;
      if (!ai) continue;
      const along = ai.axis === 'x' ? car.position.x : car.position.z;
      const forwardX = Math.sin(car.yaw);
      const forwardZ = Math.cos(car.yaw);
      const sideX = Math.cos(car.yaw);
      const sideZ = -Math.sin(car.yaw);

      let desired = ai.cruise * ai.speedBias;

      // Stop line for the next intersection, and the two-phase city signal.
      let nextRoad = null;
      if (ai.direction > 0) {
        for (const road of ROADS) if (road > along + 2.5) { nextRoad = road; break; }
      } else {
        for (let i = ROADS.length - 1; i >= 0; i -= 1) if (ROADS[i] < along - 2.5) { nextRoad = ROADS[i]; break; }
      }
      if (nextRoad !== null) {
        const stopDistance = ai.direction > 0 ? nextRoad - STOP_LINE - along : along - (nextRoad + STOP_LINE);
        if (!signalGreen(ai.axis, elapsed) && stopDistance > -0.4 && stopDistance < 26) {
          desired = Math.min(desired, Math.max(0, (stopDistance - 0.7) * 0.55));
        }
      }

      // Keep a safe gap to anything rolling in the same lane.
      for (const other of this.vehicles.list) {
        if (other === car || other.removed) continue;
        const dx = other.position.x - car.position.x;
        const dz = other.position.z - car.position.z;
        const ahead = dx * forwardX + dz * forwardZ;
        const lateral = dx * sideX + dz * sideZ;
        if (ahead < -0.5 || ahead > 30 || Math.abs(lateral) > 2.4) continue;
        const otherSpeed = Math.max(0, other.speed);
        const gap = ahead - car.halfLength - other.halfLength;
        const follow = Math.max(0, gap - 3.4) * 0.55 + otherSpeed;
        if (gap < 6.5) desired = 0;
        else desired = Math.min(desired, follow);
      }

      if (!player.driving) {
        const dx = px - car.position.x;
        const dz = pz - car.position.z;
        const ahead = dx * forwardX + dz * forwardZ;
        const lateral = dx * sideX + dz * sideZ;
        if (ahead > 0 && ahead < 17 && Math.abs(lateral) < 2.6) {
          desired = ahead < 10 ? 0 : Math.min(desired, (ahead - 5) * 0.6);
        }
      }

      for (const ped of this.peds) {
        if (!ped.active || ped.mode !== 'cross') continue;
        const dx = ped.x - car.position.x;
        const dz = ped.z - car.position.z;
        if (dx * dx + dz * dz > 400) continue;
        const ahead = dx * forwardX + dz * forwardZ;
        const lateral = dx * sideX + dz * sideZ;
        if (ahead > 0 && ahead < 20 && Math.abs(lateral) < 7.2) {
          if (ahead < 12) desired = 0;
          else desired = Math.min(desired, (ahead - 6) * 0.42);
        }
      }

      const speed = car.speed;
      if (speed < desired - 0.35) {
        car.controls.throttle = clamp((desired - speed) * 0.3, 0.12, 1);
        car.controls.brake = 0;
      } else if (speed > desired + 0.5) {
        car.controls.throttle = 0;
        car.controls.brake = clamp((speed - desired) * 0.32, 0.15, 1);
      } else {
        car.controls.throttle = 0;
        car.controls.brake = desired < 0.4 ? 0.35 : 0;
      }
      const headingError = Math.atan2(
        Math.sin(laneYaw(ai.axis, ai.direction) - car.yaw),
        Math.cos(laneYaw(ai.axis, ai.direction) - car.yaw),
      );
      car.controls.steer = clamp(headingError * 2.4, -0.3, 0.3);
      car.controls.handbrake = false;

      if (Math.abs(speed) < 0.4) ai.stuckTime += dt;
      else ai.stuckTime = 0;

      const beyondMin = along < WORLD.cityMin + 2;
      const beyondMax = along > WORLD.cityMax - 2;
      const farAway = Math.hypot(car.position.x - px, car.position.z - pz) > 250;
      const stuckTooLong = ai.stuckTime > 16 && Math.hypot(car.position.x - px, car.position.z - pz) > 60;
      if (beyondMin || beyondMax || farAway || stuckTooLong) this.removeCar(car);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.65;
      const activeAi = this.cars.filter((car) => car.driver === 'ai').length;
      if (activeAi < this.carTarget) this.spawnAmbientCar(player, 55, 175);
    }
  }

  // ---------------------------------------------------------------- pedestrians

  spawnPed({ x, z, yaw = 0, mode = 'loop', target = null, anchor = null, phase = null }) {
    let slot = -1;
    for (let i = 0; i < MAX_PEDS; i += 1) {
      if (!this.peds.some((ped) => ped.active && ped.slot === i)) {
        slot = i;
        break;
      }
    }
    if (slot === -1) return null;

    const spec = {
      cloth: clothing[Math.floor(this.rng() * clothing.length) % clothing.length],
      pants: pants[Math.floor(this.rng() * pants.length) % pants.length],
      skin: skins[Math.floor(this.rng() * skins.length) % skins.length],
      hair: hairs[Math.floor(this.rng() * hairs.length) % hairs.length],
      hatColor: this.rng.pick([0x2d2a36, 0x7a3e35, 0x3f5a5e, 0xd6c6a4]),
    };
    const ped = {
      active: true,
      slot,
      x,
      z,
      y: this.world.groundHeightAt(x, z),
      yaw,
      scale: this.rng.range(0.9, 1.07),
      speed: this.rng.range(1.05, 1.55),
      phase: phase ?? this.rng.range(0, TAU),
      motion: 0.6,
      mode,
      target: target ?? { x, z },
      anchor: anchor ?? { x, z },
      pause: 0,
      blockX: 0,
      blockZ: 0,
      cornerIndex: 0,
      direction: this.rng.chance(0.5) ? 1 : -1,
      crossingAxis: null,
      nextBlockX: 0,
      nextBlockZ: 0,
      hat: this.rng.chance(0.32),
    };

    if (mode === 'loop') {
      const block = this.nearestBlock(x, z);
      ped.blockX = block.x;
      ped.blockZ = block.z;
      ped.cornerIndex = cornerIndexFor(x - block.x, z - block.z);
      this.setNextCorner(ped);
    }

    this.peds.push(ped);
    this.crowd.setColors(slot, spec);
    this.crowd.write(ped);
    return ped;
  }

  spawnSidewalkPed(x, z, cornerIndex = 0) {
    const block = this.nearestBlock(x, z);
    const ped = this.spawnPed({ x, z, yaw: this.rng.range(0, TAU), mode: 'loop' });
    if (!ped) return null;
    ped.blockX = block.x;
    ped.blockZ = block.z;
    ped.cornerIndex = clamp(cornerIndex, 0, 3);
    ped.direction = this.rng.chance(0.5) ? 1 : -1;
    this.setNextCorner(ped);
    return ped;
  }

  nearestBlock(x, z) {
    let best = { x: BLOCK_CENTERS[0], z: BLOCK_CENTERS[0] };
    let bestDistance = Infinity;
    for (const cx of BLOCK_CENTERS) {
      for (const cz of BLOCK_CENTERS) {
        const distance = Math.abs(x - cx) + Math.abs(z - cz);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x: cx, z: cz };
        }
      }
    }
    return best;
  }

  setNextCorner(ped) {
    const corner = CORNERS[ped.cornerIndex];
    ped.target = { x: ped.blockX + corner[0], z: ped.blockZ + corner[1] };
  }

  despawnPed(ped) {
    ped.active = false;
    this.crowd.hide(ped.slot);
  }

  pickBeachTarget(ped) {
    const anchorOnPier = this.world.groundHeightAt(ped.anchor.x, ped.anchor.z) > 1;
    if (anchorOnPier) {
      ped.target = {
        x: clamp(ped.anchor.x + this.rng.range(-7, 7), WORLD.pier.minX + 3, WORLD.pier.maxX - 3),
        z: clamp(ped.anchor.z + this.rng.range(-3.5, 3.5), WORLD.pier.z - WORLD.pier.halfWidth + 2, WORLD.pier.z + WORLD.pier.halfWidth - 2),
      };
      return;
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = this.rng.range(0, TAU);
      const radius = this.rng.range(2, 9);
      const x = ped.anchor.x + Math.cos(angle) * radius;
      const z = ped.anchor.z + Math.sin(angle) * radius;
      if (x < WORLD.shorelineX + 2) continue;
      ped.target = { x, z };
      return;
    }
    ped.target = { ...ped.anchor };
  }

  updatePeds(dt, elapsed) {
    for (const ped of this.peds) {
      if (!ped.active) continue;
      const ground = this.world.groundHeightAt(ped.x, ped.z);
      let moving = false;

      if (ped.pause > 0) {
        ped.pause -= dt;
        ped.motion = damp(ped.motion, 0, 9, dt);
      } else if (ped.mode === 'beach') {
        moving = this.walkToward(ped, ped.speed * 0.8, dt);
        if (!moving) {
          ped.pause = this.rng.range(1.2, 4.5);
          this.pickBeachTarget(ped);
        }
      } else if (ped.mode === 'idle' || ped.mode === 'walk') {
        moving = this.walkToward(ped, ped.speed, dt);
        if (!moving) {
          ped.pause = this.rng.range(0.3, 1.6);
          if (ped.mode === 'walk') ped.target = { x: ped.x + this.rng.range(-6, 6), z: ped.z };
        }
      } else if (ped.mode === 'cross') {
        let speed = Math.max(1.5, ped.speed * 1.1);
        if (this.carNear(ped.x, ped.z, 11)) speed = 2.7;
        moving = this.walkToward(ped, speed, dt);
        if (!moving) this.finishCrossing(ped);
      } else {
        moving = this.walkToward(ped, ped.speed, dt);
        if (!moving) this.arriveCorner(ped);
      }

      if (moving) {
        ped.phase += dt * (ped.mode === 'cross' ? 7.2 : 4.9) * (ped.mode === 'cross' ? 1.15 : 1);
        ped.motion = damp(ped.motion, 1, 8, dt);
      }
      ped.y = damp(ped.y, this.world.groundHeightAt(ped.x, ped.z), 15, dt);
    }

    this.pedTimer -= dt;
    if (this.pedTimer <= 0 && this.player) {
      this.pedTimer = 0.5;
      const sidewalkCount = this.peds.filter((ped) => ped.active && ped.mode !== 'beach').length;
      if (sidewalkCount < this.sidewalkTarget) {
        this.spawnAmbientPed(this.player);
      }
      for (const ped of this.peds) {
        if (!ped.active || ped.mode === 'beach') continue;
        if (Math.hypot(ped.x - this.player.position.x, ped.z - this.player.position.z) > 190) {
          this.despawnPed(ped);
        }
      }
      if (this.peds.length > 64) this.peds = this.peds.filter((ped) => ped.active);
    }
  }

  walkToward(ped, speed, dt) {
    const dx = ped.target.x - ped.x;
    const dz = ped.target.z - ped.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) {
      ped.x = ped.target.x;
      ped.z = ped.target.z;
      return false;
    }
    const step = Math.min(distance, speed * dt);
    ped.x += (dx / distance) * step;
    ped.z += (dz / distance) * step;
    const desiredYaw = Math.atan2(dx, dz);
    const delta = Math.atan2(Math.sin(desiredYaw - ped.yaw), Math.cos(desiredYaw - ped.yaw));
    ped.yaw += delta * (1 - Math.exp(-9 * dt));
    return true;
  }

  arriveCorner(ped) {
    const corner = CORNERS[ped.cornerIndex];
    if (this.rng.chance(0.24) && this.tryCross(ped, corner)) return;
    if (this.rng.chance(0.2)) ped.pause = this.rng.range(0.4, 1.8);
    ped.cornerIndex = (ped.cornerIndex + ped.direction + 4) % 4;
    this.setNextCorner(ped);
  }

  tryCross(ped, corner) {
    const signX = Math.sign(corner[0]);
    const signZ = Math.sign(corner[1]);
    const alongX = this.rng.chance(0.5);
    if (alongX) {
      const nextX = ped.blockX + signX * 54;
      if (!BLOCK_CENTERS.includes(nextX)) return false;
      ped.nextBlockX = nextX;
      ped.nextBlockZ = ped.blockZ;
      ped.mode = 'cross';
      ped.crossingAxis = 'x';
      ped.target = { x: ped.blockX + signX * (54 - CORNER), z: ped.blockZ + signZ * CORNER };
      return true;
    }
    const nextZ = ped.blockZ + signZ * 54;
    if (!BLOCK_CENTERS.includes(nextZ)) return false;
    ped.nextBlockX = ped.blockX;
    ped.nextBlockZ = nextZ;
    ped.mode = 'cross';
    ped.crossingAxis = 'z';
    ped.target = { x: ped.blockX + signX * CORNER, z: ped.blockZ + signZ * (54 - CORNER) };
    return true;
  }

  finishCrossing(ped) {
    ped.blockX = ped.nextBlockX;
    ped.blockZ = ped.nextBlockZ;
    ped.cornerIndex = cornerIndexFor(ped.x - ped.blockX, ped.z - ped.blockZ);
    ped.mode = 'loop';
    ped.crossingAxis = null;
    ped.pause = this.rng.range(0, 0.5);
    this.setNextCorner(ped);
  }

  carNear(x, z, radius) {
    const radiusSq = radius * radius;
    for (const car of this.vehicles.list) {
      if (!car.driver) continue;
      const dx = car.position.x - x;
      const dz = car.position.z - z;
      if (dx * dx + dz * dz < radiusSq && Math.abs(car.speed) > 2) return true;
    }
    return false;
  }

  spawnAmbientPed(player) {
    const px = player.position.x;
    const pz = player.position.z;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const blockX = this.rng.pick(BLOCK_CENTERS);
      const blockZ = this.rng.pick(BLOCK_CENTERS);
      const distance = Math.hypot(blockX - px, blockZ - pz);
      if (distance < 30 || distance > 145) continue;
      const corner = CORNERS[this.rng.int(0, 3)];
      const x = blockX + corner[0];
      const z = blockZ + corner[1];
      if (Math.hypot(x - px, z - pz) < 14) continue;
      this.spawnSidewalkPed(x, z, this.rng.int(0, 3));
      return;
    }
  }

  // ---------------------------------------------------------------- per frame

  update(dt, elapsed) {
    const player = this.player;
    if (!player) return;
    this.updateCars(dt, elapsed, player);
    this.updatePeds(dt, elapsed);
    this.flushCrowd();
  }
}
