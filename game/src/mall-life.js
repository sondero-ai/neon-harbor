// Mall life. Shopper counts follow the city clock (quiet at night, busy at
// dusk), shoppers enter at one door, wander the shops and food court, occasionally
// take a chair for 20-60 in-game minutes, and leave through the other door.
// Everything is driven by the existing crowd: each shopper is a normal traffic
// pedestrian with mode 'mall' and a route, so panic, death, loot and the crowd
// renderer all keep working without a second crowd system.

import { CLOCK_MINUTES_PER_SECOND } from './config.js';
import { periodAt } from './environment.js';
import { makeRng } from './random.js';

const SHOPPER_TARGET = { night: 4, dawn: 10, day: 20, dusk: 30 };
const WAYPOINTS = [
  { x: 44.5, z: 8 },
  { x: 50, z: 5.2 },
  { x: 52, z: 10.5 },
  { x: 57, z: 4.8 },
  { x: 58.5, z: 8 },
  { x: 59.5, z: 12 },
  { x: 64, z: 7 },
  { x: 46, z: 13 },
  { x: 47, z: 3.4 },
  { x: 64, z: 11.7 },
];
const DOOR_INSIDE = [
  { x: 54, z: 14.4 },
  { x: 54, z: 1.6 },
];

export class MallLife {
  constructor(traffic, mall, environment = null) {
    this.traffic = traffic;
    this.mall = mall;
    this.environment = environment;
    this.rng = makeRng(0x6d411);
    this.shoppers = [];
    this.target = 0;
    this.spawnTimer = 0;
    this.lastMinutes = null;
  }

  targetFor(minutes) {
    return SHOPPER_TARGET[periodAt(minutes)] ?? SHOPPER_TARGET.night;
  }

  get activeShoppers() {
    return this.shoppers.filter((ped) => ped.active && !ped.dead && ped.mode === 'mall');
  }

  reset() {
    for (const seat of this.mall?.seats ?? []) {
      if (seat.occupant && seat.occupant !== 'player') seat.occupant = null;
    }
    for (const ped of this.shoppers) {
      ped.active = false;
      ped.sitting = false;
      ped.seat = null;
    }
    this.shoppers = [];
    this.target = 0;
    this.spawnTimer = 0;
    this.lastMinutes = null;
  }

  freeSeatNear(x, z, reach = 16) {
    let best = null;
    let bestDistance = reach;
    for (const seat of this.mall?.seats ?? []) {
      if (seat.occupant) continue;
      const distance = Math.hypot(seat.x - x, seat.z - z);
      if (distance < bestDistance) {
        best = seat;
        bestDistance = distance;
      }
    }
    return best;
  }

  seatPed(ped, seat, minutes = null) {
    if (!seat || seat.occupant) return false;
    ped.sitting = true;
    ped.seat = seat;
    seat.occupant = ped;
    ped.x = seat.x;
    ped.z = seat.z;
    ped.y = this.traffic.world.groundHeightAt(seat.x, seat.z);
    ped.yaw = seat.yaw;
    ped.motion = 0;
    ped.sitTimer = minutes ?? this.rng.range(20, 60);
    return true;
  }

  standPed(ped) {
    this.traffic.releasePedSeat(ped);
    if (ped.route && ped.routeIndex < ped.route.length) {
      ped.target = { ...ped.route[ped.routeIndex] };
    } else {
      ped.target = ped.target ?? { x: ped.x, z: ped.z };
    }
    ped.pause = this.rng.range(0.2, 0.8);
  }

  makeRoute(fromDoor, toDoor) {
    const picks = [];
    const pool = [...WAYPOINTS];
    for (let i = 0; i < 4 && pool.length > 0; i += 1) {
      const index = Math.floor(this.rng() * pool.length) % pool.length;
      picks.push(pool.splice(index, 1)[0]);
    }
    return [DOOR_INSIDE[fromDoor], ...picks, DOOR_INSIDE[toDoor]];
  }

  spawnShopper(fromDoor = null) {
    const entry = fromDoor === null ? (this.rng.chance(0.5) ? 0 : 1) : fromDoor;
    const door = DOOR_INSIDE[entry];
    const route = this.makeRoute(entry, entry === 0 ? 1 : 0);
    const ped = this.traffic.spawnPed({
      x: door.x,
      z: door.z,
      yaw: entry === 0 ? Math.PI : 0,
      mode: 'mall',
      anchor: { x: door.x, z: door.z },
      phase: this.rng.range(0, Math.PI * 2),
      armed: false,
      bag: this.rng.chance(0.45),
    });
    if (!ped) return null;
    ped.speed = this.rng.range(0.95, 1.35);
    ped.route = route;
    ped.routeIndex = 1;
    ped.target = { ...route[1] };
    ped.pause = 0;
    ped.mallShopper = true;
    this.shoppers.push(ped);
    return ped;
  }

  /** Seat a share of the crowd straight away after a clock seek or a load. */
  seedSeated() {
    const seated = this.activeShoppers.filter((ped) => ped.sitting).length;
    const want = Math.min(8, Math.floor(this.target / 4));
    let assigned = seated;
    for (const ped of this.activeShoppers) {
      if (assigned >= want) break;
      if (ped.sitting) continue;
      const seat = this.freeSeatNear(ped.x, ped.z, 40);
      if (!seat) continue;
      if (ped.routeIndex >= ped.route.length - 1) {
        ped.routeIndex = 1;
        ped.target = { ...ped.route[1] };
      }
      if (this.seatPed(ped, seat)) assigned += 1;
    }
  }

  settle(target) {
    let active = this.activeShoppers;
    while (active.length < target) {
      const ped = this.spawnShopper();
      if (!ped) break;
      active = this.activeShoppers;
    }
    while (active.length > target) {
      const candidate = [...active].reverse().find((ped) => !ped.sitting) ?? active[active.length - 1];
      this.traffic.despawnPed(candidate);
      active = this.activeShoppers;
    }
    this.seedSeated();
  }

  update(dt, clockMinutes) {
    const target = this.targetFor(clockMinutes);
    this.target = target;
    const seek = this.lastMinutes === null || Math.abs(clockMinutes - this.lastMinutes) > 5;
    this.lastMinutes = clockMinutes;
    if (seek) {
      this.settle(target);
      return;
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.45;
    const active = this.activeShoppers;
    if (active.length < target) {
      this.spawnShopper();
    } else if (active.length > target) {
      const candidate = [...active].reverse().find((ped) => !ped.sitting) ?? active[active.length - 1];
      this.traffic.despawnPed(candidate);
    }
  }

  /** Drive one mall pedestrian; returns true while it is walking. */
  updatePed(ped, dt) {
    if (!ped.active || ped.dead) {
      this.traffic.releasePedSeat(ped);
      return false;
    }
    if (ped.sitting) {
      ped.sitTimer -= dt * CLOCK_MINUTES_PER_SECOND;
      if (ped.sitTimer <= 0) this.standPed(ped);
      return false;
    }
    if (!ped.route) {
      ped.target = { x: 54, z: 8 };
      return this.traffic.walkToward(ped, ped.speed, dt);
    }
    if (ped.routeIndex >= ped.route.length) {
      this.traffic.despawnPed(ped);
      return false;
    }
    const moving = this.traffic.walkToward(ped, ped.speed, dt);
    if (moving) return true;

    // Reached a waypoint: a shopper near the food court may take a chair.
    if (ped.x > 55 && this.rng.chance(0.55)) {
      const seat = this.freeSeatNear(ped.x, ped.z, 12);
      if (seat && this.seatPed(ped, seat)) return false;
    }
    ped.routeIndex += 1;
    if (ped.routeIndex >= ped.route.length) {
      this.traffic.despawnPed(ped);
      return false;
    }
    ped.target = { ...ped.route[ped.routeIndex] };
    ped.pause = this.rng.range(0.2, 1.0);
    return false;
  }
}
