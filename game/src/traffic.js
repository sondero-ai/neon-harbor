// The street life: lane-following cars that obey a two-phase grid signal,
// keep their distance, yield to people, and recycle around the player; plus
// pedestrians who loop their blocks, cross at the painted crosswalks, and
// gather at the beach and pier. Car AI lives in traffic-cars.js, the
// pedestrian simulation in traffic-peds.js and the instanced crowd in
// traffic-crowd.js; this file owns the shared state, the seeding hooks and
// the per-frame order.

import { WORLD } from './config.js';
import { makeRng } from './random.js';
import { Crowd, MAX_PEDS } from './traffic-crowd.js';
import {
  ejectDriver,
  removeCar,
  spawnAmbientCar,
  spawnLaneCar,
  updateCars,
} from './traffic-cars.js';
import {
  PANIC_RADIUS,
  applyPlayerHit,
  armedPedShoot,
  arriveCorner,
  carNear,
  despawnPed,
  finishCrossing,
  nearestBlock,
  panic,
  pickBeachTarget,
  releasePedSeat,
  sendPedFleeing,
  setNextCorner,
  spawnAmbientPed,
  spawnPed,
  spawnSidewalkPed,
  traceShot,
  tryCross,
  updateArmedPed,
  updatePeds,
  walkToward,
} from './traffic-peds.js';

export { LANE_OFFSET } from './traffic-cars.js';

const TAU = Math.PI * 2;

const SIDEWALK_TARGET = 64;
const BEACH_TARGET = 28;
const CAR_TARGET = 18;

export class Traffic {
  constructor(scene, world, vehicles, player) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.player = player;
    this.police = null;
    this.mallLife = null;
    this.gasStation = null;
    this.onPedDeath = null;
    this.onArmedHostile = null;
    this.armedAlertShown = false;
    this.rng = makeRng(0x51ee7);
    this.cars = [];
    this.peds = [];
    this.crowd = new Crowd(scene);
    this.spawnTimer = 0;
    this.pedTimer = 0;
    this.carTarget = CAR_TARGET;
    this.sidewalkTarget = SIDEWALK_TARGET;
    this.beachTarget = BEACH_TARGET;
    this.maxPeds = MAX_PEDS;
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
    this.armedAlertShown = false;
    if (spawnBeach) this.spawnBeachCrowd();
  }

  seedAmbient(player, { spawnBeach = true } = {}) {
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
      this.spawnLaneCar('taxi', 'x', -1, 27, -70, 8.8);
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
      // Old Town's market row and the Foundry's rail spur, so the new
      // districts read as lived-in from the first frame.
      [0, -198.6, 1], [54, -198.7, 2], [-54, -198.5, 3],
      [216, 18.2, 0], [270, 36.4, 1], [324, 18.3, 3],
    ];
    for (const [x, z, cornerIndex] of spots) {
      this.spawnSidewalkPed(x, z, cornerIndex);
    }
    if (spawnBeach) this.spawnBeachCrowd();
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
      [-218, 120], [-192, 132], [-166, 118], [-230, 98], [-210, 140],
      [-174, 150], [-156, 130], [-226, -118], [-200, -132], [-176, -120], [-158, -96],
      // Four extra pairs fill the raised 28-walker beach target.
      [-229, 108], [-227, 152], [-225, -64], [-214, -152], [-184, -162], [-158, -44],
    ];
    for (let i = 0; i < Math.min(spots.length, BEACH_TARGET); i += 1) {
      // The sand now ends at the shoreline, so a spot within a metre of it
      // walks in from the last dry metre instead of standing in the water.
      const [spotX, z] = spots[i];
      const x = Math.max(spotX, WORLD.shorelineX + 1);
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
    return spawnLaneCar(this, type, axis, direction, line, along, cruise, options);
  }

  spawnAmbientCar(player, minDistance = 60, maxDistance = 170) {
    return spawnAmbientCar(this, player, minDistance, maxDistance);
  }

  removeCar(car) {
    return removeCar(this, car);
  }

  ejectDriver(car) {
    return ejectDriver(this, car);
  }

  updateCars(dt, elapsed, player) {
    return updateCars(this, dt, elapsed, player);
  }

  // ---------------------------------------------------------------- pedestrians

  spawnPed(options) {
    return spawnPed(this, options);
  }

  spawnSidewalkPed(x, z, cornerIndex = 0) {
    return spawnSidewalkPed(this, x, z, cornerIndex);
  }

  nearestBlock(x, z) {
    return nearestBlock(this, x, z);
  }

  setNextCorner(ped) {
    return setNextCorner(this, ped);
  }

  releasePedSeat(ped) {
    return releasePedSeat(this, ped);
  }

  despawnPed(ped) {
    return despawnPed(this, ped);
  }

  panic(x, z, radius = PANIC_RADIUS) {
    return panic(this, x, z, radius);
  }

  traceShot(origin, direction, maxDistance) {
    return traceShot(this, origin, direction, maxDistance);
  }

  applyPlayerHit(target, damage) {
    return applyPlayerHit(this, target, damage);
  }

  pickBeachTarget(ped) {
    return pickBeachTarget(this, ped);
  }

  updatePeds(dt, elapsed) {
    return updatePeds(this, dt, elapsed);
  }

  updateArmedPed(ped, dt) {
    return updateArmedPed(this, ped, dt);
  }

  sendPedFleeing(ped, fromX, fromZ) {
    return sendPedFleeing(this, ped, fromX, fromZ);
  }

  armedPedShoot(ped) {
    return armedPedShoot(this, ped);
  }

  walkToward(ped, speed, dt) {
    return walkToward(this, ped, speed, dt);
  }

  arriveCorner(ped) {
    return arriveCorner(this, ped);
  }

  tryCross(ped, corner) {
    return tryCross(this, ped, corner);
  }

  finishCrossing(ped) {
    return finishCrossing(this, ped);
  }

  carNear(x, z, radius) {
    return carNear(this, x, z, radius);
  }

  spawnAmbientPed(player) {
    return spawnAmbientPed(this, player);
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
