// The street life: lane-following cars that obey a two-phase grid signal,
// keep their distance, yield to people, and recycle around the player; plus
// pedestrians who loop their blocks, cross at the painted crosswalks, and
// gather at the beach and pier. The whole crowd renders through seven
// instanced meshes, so thirty-odd people cost seven draw calls.

import * as THREE from '../vendor/three.module.js';
import { BLOCK_CENTERS_X, BLOCK_CENTERS_Z, WORLD } from './config.js';
import { makeRng } from './random.js';
import { Crowd, MAX_PEDS } from './traffic-crowd.js';
import {
  PANIC_SECONDS,
  ejectDriver,
  removeCar,
  spawnAmbientCar,
  spawnLaneCar,
  updateCars,
} from './traffic-cars.js';

export { LANE_OFFSET } from './traffic-cars.js';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const TAU = Math.PI * 2;

const CORNER = 17.4;
const SIDEWALK_TARGET = 64;
const BEACH_TARGET = 28;
const CAR_TARGET = 18;
const PANIC_RADIUS = 14;
const FLEE_SPEED = 1.6;
const ARMED_JACKET = 0x6b1e29;
const ARMED_CHANCE = 0.15;
const ARMED_DRAW_SECONDS = 0.9;
const ARMED_FIRE_SECONDS = 1.2;
const ARMED_RANGE = 30;
const ARMED_GIVE_UP_RANGE = 45;
const ARMED_GIVE_UP_SECONDS = 12;
const ARMED_DAMAGE = 9;

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

// Same ray/sphere test the Harbor PD uses, kept local so the traffic module
// stays independent of police.js.
function raySphere(origin, direction, cx, cy, cz, radius) {
  const ox = origin.x - cx;
  const oy = origin.y - cy;
  const oz = origin.z - cz;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t = -b - root;
  if (t < 0.05) {
    const t2 = -b + root;
    return t2 > 0.05 ? t2 : null;
  }
  return t;
}

const clothing = [0xd75543, 0x3f8f8f, 0xe4d6b8, 0x6a7f54, 0x8a4f6d, 0x4b5f8c, 0xe0a94f, 0x9c3b42, 0x557a6a, 0xc7a887];
const pants = [0x252334, 0x3a3340, 0x2d3f4a, 0x51463c, 0x1d222c, 0x5d5548];
const skins = [0xb87a60, 0x8c5a44, 0xd9a37c, 0x6e4636, 0xc28d6a, 0x9c6c50];
const hairs = [0x24161c, 0x3b241c, 0x17141a, 0x6b4a2c, 0x8f8272, 0x4a2b33];

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

  spawnPed({ x, z, yaw = 0, mode = 'loop', target = null, anchor = null, phase = null, armed = null, guard = false, bag = false, valet = false }) {
    let slot = -1;
    for (let i = 0; i < MAX_PEDS; i += 1) {
      if (!this.peds.some((ped) => ped.active && ped.slot === i)) {
        slot = i;
        break;
      }
    }
    if (slot === -1) return null;

    // Only block-loop walkers carry a pistol; an explicit option from a shot or
    // a test always wins, and beach and crosswalk pedestrians stay unarmed.
    // A security guard is always armed, hostile, hatted and in a dark uniform.
    const isArmed = guard || (armed === null ? mode === 'loop' && this.rng.chance(ARMED_CHANCE) : Boolean(armed));
    const spec = {
      cloth: clothing[Math.floor(this.rng() * clothing.length) % clothing.length],
      pants: pants[Math.floor(this.rng() * pants.length) % pants.length],
      skin: skins[Math.floor(this.rng() * skins.length) % skins.length],
      hair: hairs[Math.floor(this.rng() * hairs.length) % hairs.length],
      hatColor: this.rng.pick([0x2d2a36, 0x7a3e35, 0x3f5a5e, 0xd6c6a4]),
      bagColor: this.rng.pick([0x3a2a44, 0x24414a, 0x4a332e, 0x2f3a24]),
    };
    if (guard) {
      spec.cloth = 0x252b36;
      spec.pants = 0x141821;
      spec.hair = 0x1a161c;
      spec.hatColor = 0x10141b;
    } else if (valet) {
      spec.cloth = 0x2f6f6a;
      spec.pants = 0x141821;
      spec.hatColor = 0x1d3d3a;
    } else if (isArmed) {
      spec.cloth = ARMED_JACKET;
    }
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
      health: guard ? 78 : 55,
      dead: false,
      deadTimer: 0,
      fall: 0,
      fleeTimer: 0,
      fleeFromX: 0,
      fleeFromZ: 0,
      fleeResumeTarget: null,
      armed: isArmed,
      hostile: guard,
      hostileDraw: 0,
      hostileTime: 0,
      shootTimer: 0,
      guard: Boolean(guard),
      valet: Boolean(valet),
      bag: Boolean(bag),
      sitting: false,
      seat: null,
      mode: guard ? 'guard' : mode,
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
      hat: guard ? true : this.rng.chance(0.32),
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
    let best = { x: BLOCK_CENTERS_X[0], z: BLOCK_CENTERS_Z[0] };
    let bestDistance = Infinity;
    for (const cx of BLOCK_CENTERS_X) {
      for (const cz of BLOCK_CENTERS_Z) {
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

  /** Stand a seated pedestrian up and free the chair for anyone else. */
  releasePedSeat(ped) {
    if (ped.seat && ped.seat.occupant === ped) ped.seat.occupant = null;
    ped.seat = null;
    ped.sitting = false;
  }

  despawnPed(ped) {
    this.releasePedSeat(ped);
    ped.active = false;
    this.crowd.hide(ped.slot);
  }

  /** Start every standing pedestrian near (x, z) fleeing for the panic time. */
  panic(x, z, radius = PANIC_RADIUS) {
    const radiusSq = radius * radius;
    let count = 0;
    for (const ped of this.peds) {
      if (!ped.active || ped.dead) continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      if (dx * dx + dz * dz >= radiusSq) continue;
      this.releasePedSeat(ped);
      if (!ped.fleeResumeTarget) ped.fleeResumeTarget = { x: ped.target.x, z: ped.target.z };
      ped.fleeTimer = PANIC_SECONDS;
      ped.fleeFromX = x;
      ped.fleeFromZ = z;
      count += 1;
    }
    return count;
  }

  // ---------------------------------------------------------------- combat

  /** Nearest living pedestrian the player's ray can hit, with chest and head spheres. */
  traceShot(origin, direction, maxDistance) {
    let best = null;
    for (const ped of this.peds) {
      if (!ped.active || ped.dead) continue;
      const chest = raySphere(origin, direction, ped.x, ped.y + 1.12 * ped.scale, ped.z, 0.42);
      const head = raySphere(origin, direction, ped.x, ped.y + 1.55 * ped.scale, ped.z, 0.22);
      let distance = null;
      let headshot = false;
      if (head !== null && (chest === null || head <= chest)) {
        distance = head;
        headshot = true;
      } else if (chest !== null) {
        distance = chest;
      }
      if (distance === null || distance > maxDistance) continue;
      if (!best || distance < best.distance) {
        best = {
          type: 'ped',
          ped,
          headshot,
          distance,
          point: new THREE.Vector3(origin.x + direction.x * distance, origin.y + direction.y * distance, origin.z + direction.z * distance),
        };
      }
    }
    return best;
  }

  applyPlayerHit(target, damage) {
    const ped = target?.ped;
    if (!ped || !ped.active || ped.dead) return;
    ped.health -= damage * (target.headshot ? 1.75 : 1);
    if (this.player) {
      this.player.hitMarker = 1;
      if (this.player.effects && target.point) this.player.effects.impact(target.point, null, 'metal');
      if (this.player.audio) this.player.audio.impact(0.9);
    }
    if (ped.health > 0) return;
    ped.dead = true;
    ped.deadTimer = 8;
    ped.health = 0;
    this.releasePedSeat(ped);
    // A corpse is not fleeing; stop it counting as panicked after death.
    ped.fleeTimer = 0;
    let witnesses = 0;
    for (const other of this.peds) {
      if (other === ped || !other.active || other.dead) continue;
      if (Math.hypot(other.x - ped.x, other.z - ped.z) >= PANIC_RADIUS) continue;
      witnesses += 1;
      if (!other.fleeResumeTarget) other.fleeResumeTarget = { x: other.target.x, z: other.target.z };
      if (other.armed) {
        // An armed witness stops running and reaches for the pistol.
        other.fleeTimer = 0;
        if (!other.hostile && other.hostileDraw <= 0) {
          other.hostileDraw = ARMED_DRAW_SECONDS;
          other.shootTimer = 0;
        }
        continue;
      }
      other.fleeTimer = PANIC_SECONDS;
      other.fleeFromX = ped.x;
      other.fleeFromZ = ped.z;
    }
    this.onPedDeath?.(ped, { witnesses });
  }

  pickBeachTarget(ped) {
    const anchorOnPier = this.world.groundHeightAt(ped.anchor.x, ped.anchor.z) > 1;
    if (anchorOnPier) {
      // The deck is now full of solid props. Re-roll a target that lands in
      // the shack, a bench, a barrel, a crate or a railing rather than
      // steering a walker into it.
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const x = clamp(ped.anchor.x + this.rng.range(-7, 7), WORLD.pier.minX + 3, WORLD.pier.maxX - 3);
        const z = clamp(ped.anchor.z + this.rng.range(-3.5, 3.5), WORLD.pier.z - WORLD.pier.halfWidth + 2, WORLD.pier.z + WORLD.pier.halfWidth - 2);
        if (this.world.collides(x, z, 0.3)) continue;
        ped.target = { x, z };
        return;
      }
      ped.target = {
        x: clamp(ped.anchor.x, WORLD.pier.minX + 3, WORLD.pier.maxX - 3),
        z: clamp(ped.anchor.z, WORLD.pier.z - WORLD.pier.halfWidth + 2, WORLD.pier.z + WORLD.pier.halfWidth - 2),
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
      if (ped.dead) {
        ped.deadTimer -= dt;
        ped.fall = Math.min(1, ped.fall + dt / 0.45);
        ped.motion = 0;
        this.releasePedSeat(ped);
        if (ped.deadTimer <= 0) this.despawnPed(ped);
        continue;
      }
      if (ped.armed && (ped.hostile || ped.hostileDraw > 0)) {
        this.releasePedSeat(ped);
        this.updateArmedPed(ped, dt);
        continue;
      }
      if (ped.fleeTimer > 0) {
        this.releasePedSeat(ped);
        ped.fleeTimer -= dt;
        const dx = ped.x - ped.fleeFromX;
        const dz = ped.z - ped.fleeFromZ;
        const distance = Math.hypot(dx, dz) || 1;
        ped.target = { x: ped.x + (dx / distance) * 12, z: ped.z + (dz / distance) * 12 };
        this.walkToward(ped, ped.speed * FLEE_SPEED, dt);
        ped.phase += dt * 7;
        ped.motion = damp(ped.motion, 1, 8, dt);
        ped.y = damp(ped.y, this.world.groundHeightAt(ped.x, ped.z), 15, dt);
        if (ped.fleeTimer <= 0) {
          if (ped.fleeResumeTarget) {
            ped.target = { ...ped.fleeResumeTarget };
            ped.fleeResumeTarget = null;
          }
        }
        continue;
      }
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
      } else if (ped.mode === 'mall') {
        moving = this.mallLife ? this.mallLife.updatePed(ped, dt) : false;
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
      const sidewalkCount = this.peds.filter((ped) => ped.active
        && ped.mode !== 'beach' && ped.mode !== 'mall' && ped.mode !== 'guard').length;
      if (sidewalkCount < this.sidewalkTarget) {
        this.spawnAmbientPed(this.player);
      }
      for (const ped of this.peds) {
        // Mall shoppers despawn at their door, and security guards are a
        // robbery actor rather than ambient sidewalk traffic.
        if (!ped.active || ped.mode === 'beach' || ped.mode === 'mall' || ped.mode === 'guard') continue;
        if (Math.hypot(ped.x - this.player.position.x, ped.z - this.player.position.z) > 190) {
          this.despawnPed(ped);
        }
      }
      if (this.peds.length > MAX_PEDS * 2) this.peds = this.peds.filter((ped) => ped.active);
    }
  }

  // An armed witness plants its feet, faces Rae, and fires after the draw.
  updateArmedPed(ped, dt) {
    const player = this.player;
    if (!player || player.dead) {
      ped.hostile = false;
      ped.hostileDraw = 0;
      return;
    }
    const dx = player.position.x - ped.x;
    const dz = player.position.z - ped.z;
    const distance = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);
    ped.yaw += Math.atan2(Math.sin(targetYaw - ped.yaw), Math.cos(targetYaw - ped.yaw)) * (1 - Math.exp(-12 * dt));
    ped.y = damp(ped.y, this.world.groundHeightAt(ped.x, ped.z), 15, dt);
    ped.motion = damp(ped.motion, 0.22, 8, dt);

    if (!ped.hostile) {
      ped.hostileDraw -= dt;
      if (ped.hostileDraw > 0) return;
      ped.hostileDraw = 0;
      ped.hostile = true;
      ped.hostileTime = 0;
      ped.shootTimer = 0;
      if (!this.armedAlertShown) {
        this.armedAlertShown = true;
        this.onArmedHostile?.(ped);
      }
    }

    ped.hostileTime += dt;
    if (distance > ARMED_GIVE_UP_RANGE || ped.hostileTime > ARMED_GIVE_UP_SECONDS) {
      this.sendPedFleeing(ped, player.position.x, player.position.z);
      return;
    }

    ped.shootTimer -= dt;
    if (ped.shootTimer > 0) return;
    if (distance > ARMED_RANGE) {
      ped.shootTimer = 0.25;
      return;
    }
    const blocked = this.world.lineBlocked(
      ped.x,
      ped.y + 1.3,
      ped.z,
      player.position.x,
      player.position.y + 1.2,
      player.position.z,
      0.2,
    );
    if (blocked) {
      ped.shootTimer = 0.25;
      return;
    }
    ped.shootTimer = ARMED_FIRE_SECONDS;
    this.armedPedShoot(ped);
  }

  sendPedFleeing(ped, fromX, fromZ) {
    this.releasePedSeat(ped);
    ped.hostile = false;
    ped.hostileDraw = 0;
    ped.hostileTime = 0;
    ped.shootTimer = 0;
    if (!ped.fleeResumeTarget) ped.fleeResumeTarget = { x: ped.target.x, z: ped.target.z };
    ped.fleeTimer = PANIC_SECONDS;
    ped.fleeFromX = fromX;
    ped.fleeFromZ = fromZ;
  }

  armedPedShoot(ped) {
    const player = this.player;
    if (!player) return;
    const muzzle = new THREE.Vector3(
      ped.x + Math.sin(ped.yaw) * 0.42,
      ped.y + 1.32,
      ped.z + Math.cos(ped.yaw) * 0.42,
    );
    const target = new THREE.Vector3(player.position.x, player.position.y + 1.12, player.position.z);
    const direction = target.clone().sub(muzzle).normalize();
    const hit = Math.random() < 0.6;
    const endpoint = new THREE.Vector3();
    if (hit) {
      endpoint.set(player.position.x, player.position.y + 1.05, player.position.z);
      if (this.police) this.police.damagePlayer(ARMED_DAMAGE, ped.x, ped.z, 'witness');
      else player.applyDamage(ARMED_DAMAGE, ped.x, ped.z);
    } else {
      endpoint.copy(muzzle).addScaledVector(direction, 30);
      const worldHit = this.world.raycast(muzzle, direction, 30);
      if (worldHit) endpoint.copy(worldHit.point);
    }
    if (player.effects) {
      player.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd59a);
      player.effects.tracer(muzzle, endpoint, 0xffcf8a);
    }
    if (player.audio) player.audio.gunshot('pistol');
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
    const stepX = (dx / distance) * step;
    const stepZ = (dz / distance) * step;
    const radius = 0.36;
    const wantX = ped.x + stepX;
    const wantZ = ped.z + stepZ;

    // Slide along a wall rather than walking through it: the full step first,
    // then one axis at a time, then stop and let the caller pick a new target.
    const full = this.world.resolveCircle(wantX, wantZ, radius);
    let movedX = 0;
    let movedZ = 0;
    if (Math.hypot(full.x - wantX, full.z - wantZ) < 0.01) {
      movedX = full.x - ped.x;
      movedZ = full.z - ped.z;
    } else {
      const slideX = this.world.resolveCircle(wantX, ped.z, radius);
      if (Math.abs(slideX.x - wantX) < 0.01 && Math.abs(slideX.z - ped.z) < 0.01) {
        movedX = slideX.x - ped.x;
      } else {
        const slideZ = this.world.resolveCircle(ped.x, wantZ, radius);
        if (Math.abs(slideZ.z - wantZ) < 0.01 && Math.abs(slideZ.x - ped.x) < 0.01) {
          movedZ = slideZ.z - ped.z;
        }
      }
    }
    if (Math.abs(movedX) < 0.0005 && Math.abs(movedZ) < 0.0005) return false;
    ped.x += movedX;
    ped.z += movedZ;
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
      if (!BLOCK_CENTERS_X.includes(nextX)) return false;
      ped.nextBlockX = nextX;
      ped.nextBlockZ = ped.blockZ;
      ped.mode = 'cross';
      ped.crossingAxis = 'x';
      ped.target = { x: ped.blockX + signX * (54 - CORNER), z: ped.blockZ + signZ * CORNER };
      return true;
    }
    const nextZ = ped.blockZ + signZ * 54;
    if (!BLOCK_CENTERS_Z.includes(nextZ)) return false;
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
      const blockX = this.rng.pick(BLOCK_CENTERS_X);
      const blockZ = this.rng.pick(BLOCK_CENTERS_Z);
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
