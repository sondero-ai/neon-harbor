// Lane-following car AI: spawn a car on the grid lane, keep a safe gap,
// queue at the two-phase signals, yield to the player and to crossing
// pedestrians, recycle far or stuck cars, and eject an AI driver when the
// player carjacks. Every function takes the Traffic instance; Vehicle physics
// lives in vehicles.js and the road grid in config.js.

import * as THREE from '../vendor/three.module.js';
import { ROADS_X, ROADS_Z, WORLD } from './config.js';
import { TRAFFIC_MIX, pickVehicleColor } from './vehicles.js';
import { signalState } from './traffic-signals.js';

const clamp = THREE.MathUtils.clamp;
export const LANE_OFFSET = 3.2;
const STOP_LINE = 12.4;
// The ejected driver runs on the same panic timer as the pedestrian crowd, so
// the pedestrian module imports this one value instead of duplicating it.
export const PANIC_SECONDS = 6;

/** The car rule is exactly the lamp rule; amber and red both stop. */
function signalGreen(axis, elapsed) {
  return signalState(axis, elapsed) === 'green';
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

export function spawnLaneCar(traffic, type, axis, direction, line, along, cruise = 11, options = {}) {
  const point = lanePoint(axis, line, direction, along);
  const car = traffic.vehicles.spawn(type, {
    x: point.x,
    z: point.z,
    yaw: point.yaw,
    color: options.color ?? pickVehicleColor(traffic.rng, type),
    driver: 'ai',
    speed: cruise * 0.72,
  });
  car.ai = {
    axis,
    direction,
    line,
    cruise,
    speedBias: traffic.rng.range(0.9, 1.08),
    stuckTime: 0,
    mode: 'drive',
  };
  car.controls.brake = 0;
  car.fuel = options.fuel ?? 1;
  traffic.cars.push(car);
  return car;
}

export function spawnAmbientCar(traffic, player, minDistance = 60, maxDistance = 170) {
  const px = player.position.x;
  const pz = player.position.z;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const axis = traffic.rng.chance(0.5) ? 'x' : 'z';
    // A car on axis 'x' drives along a z road line, and a car on axis 'z'
    // drives along an x road line. Picking the other list put cars on the
    // beach at x = -189 and -243, where they queued at phantom signals.
    const line = traffic.rng.pick(axis === 'x' ? ROADS_Z : ROADS_X);
    const direction = traffic.rng.sign();
    const along = axis === 'x'
      ? traffic.rng.range(WORLD.cityMinX + 18, WORLD.cityMaxX - 18)
      : traffic.rng.range(WORLD.cityMinZ + 18, WORLD.cityMaxZ - 18);
    const point = lanePoint(axis, line, direction, along);
    const distance = Math.hypot(point.x - px, point.z - pz);
    if (distance < minDistance || distance > maxDistance) continue;
    let clear = true;
    for (const car of traffic.vehicles.list) {
      if (car === traffic.player.driving) continue;
      if (Math.hypot(car.position.x - point.x, car.position.z - point.z) < 12) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const type = traffic.rng.pick(TRAFFIC_MIX);
    const car = traffic.spawnLaneCar(type, axis, direction, line, along, traffic.rng.range(10.5, 15));
    car.fuel = traffic.rng.chance(0.22) ? traffic.rng.range(0.1, 0.34) : 1;
    return car;
  }
  return null;
}

export function removeCar(traffic, car) {
  const index = traffic.cars.indexOf(car);
  if (index !== -1) traffic.cars.splice(index, 1);
  traffic.vehicles.remove(car);
  traffic.gasStation?.releaseCar(car);
}

/**
 * Pull the AI driver out at the driver door and send them running for six
 * seconds. Returns the new pedestrian, or null when the crowd has no slot
 * or the door is blocked (the caller then skips the toast).
 */
export function ejectDriver(traffic, car) {
  if (!car || car.removed) return null;
  const cos = Math.cos(car.yaw);
  const sin = Math.sin(car.yaw);
  // Driver's door: car-local left, just outside the bodywork, toward the
  // front of the cabin.
  const candidates = [
    [-(car.halfWidth + 0.65), 0.35],
    [car.halfWidth + 0.65, 0.35],
    [-(car.halfWidth + 0.65), -0.6],
  ];
  let spot = null;
  for (const [side, forward] of candidates) {
    const x = car.position.x + cos * side + sin * forward;
    const z = car.position.z - sin * side + cos * forward;
    if (traffic.world.collides(x, z, 0.36)) continue;
    if (traffic.vehicles.blocksPoint(x, z, 0.36, car)) continue;
    spot = { x, z };
    break;
  }
  if (!spot) return null;
  const ped = traffic.spawnPed({
    x: spot.x,
    z: spot.z,
    yaw: Math.atan2(car.position.x - spot.x, car.position.z - spot.z),
    mode: 'idle',
    armed: false,
  });
  if (!ped) return null;
  // No block route to resume: this is a one-way run away from the car.
  ped.blockX = 0;
  ped.blockZ = 0;
  ped.cornerIndex = 0;
  ped.crossingAxis = null;
  ped.nextBlockX = 0;
  ped.nextBlockZ = 0;
  ped.fleeResumeTarget = null;
  ped.pause = 0;
  ped.motion = 1;
  ped.fleeTimer = PANIC_SECONDS;
  ped.fleeFromX = car.position.x;
  ped.fleeFromZ = car.position.z;
  const dx = spot.x - car.position.x;
  const dz = spot.z - car.position.z;
  const length = Math.hypot(dx, dz) || 1;
  ped.target = { x: spot.x + (dx / length) * 12, z: spot.z + (dz / length) * 12 };
  ped.y = traffic.world.groundHeightAt(spot.x, spot.z);
  return ped;
}

export function updateCars(traffic, dt, elapsed, player) {
  const px = player.position.x;
  const pz = player.position.z;
  for (const car of [...traffic.cars]) {
    if (car.removed) continue;
    if (car.driver !== 'ai') {
      // A player who carjacks a car at a pump must free that pad at once:
      // its station AI is gone, so the state machine would never release it.
      traffic.gasStation?.releaseCar(car);
      continue;
    }
    const ai = car.ai;
    if (!ai) continue;
    // Remove a car that is not on its road grid: an ambient spawn from an
    // older build, or one knocked onto the sand. It would otherwise queue
    // at a traffic signal that does not exist on the beach.
    const laneSet = ai.axis === 'x' ? ROADS_Z : ROADS_X;
    const offGrid = !laneSet.includes(ai.line) || car.position.x < WORLD.cityMinX - 1;
    const blockedZone = typeof traffic.world.vehicleBlocked === 'function'
      && traffic.world.vehicleBlocked(car.position.x, car.position.z, false);
    if (offGrid || blockedZone) {
      traffic.removeCar(car);
      continue;
    }
    // A car this station owns is driven by the forecourt state machine, not
    // by the lane rules; a low-fuel car on the adjacent lane may divert in.
    if (traffic.gasStation) {
      if (traffic.gasStation.owns(car)) {
        traffic.gasStation.updateCar(car, dt);
        continue;
      }
      traffic.gasStation.maybeDivert(car, ai, dt);
    }
    const along = ai.axis === 'x' ? car.position.x : car.position.z;
    const forwardX = Math.sin(car.yaw);
    const forwardZ = Math.cos(car.yaw);
    const sideX = Math.cos(car.yaw);
    const sideZ = -Math.sin(car.yaw);

    let desired = ai.cruise * ai.speedBias;

    // Stop line for the next intersection, and the two-phase city signal.
    const axisRoads = ai.axis === 'x' ? ROADS_X : ROADS_Z;
    let nextRoad = null;
    if (ai.direction > 0) {
      for (const road of axisRoads) if (road > along + 2.5) { nextRoad = road; break; }
    } else {
      for (let i = axisRoads.length - 1; i >= 0; i -= 1) if (axisRoads[i] < along - 2.5) { nextRoad = axisRoads[i]; break; }
    }
    if (nextRoad !== null) {
      const stopDistance = ai.direction > 0 ? nextRoad - STOP_LINE - along : along - (nextRoad + STOP_LINE);
      if (!signalGreen(ai.axis, elapsed) && stopDistance > -0.4 && stopDistance < 26) {
        desired = Math.min(desired, Math.max(0, (stopDistance - 0.7) * 0.55));
      }
    }

    // Keep a safe gap to anything rolling in the same lane.
    for (const other of traffic.vehicles.list) {
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

    for (const ped of traffic.peds) {
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

    const minAlong = ai.axis === 'x' ? WORLD.cityMinX : WORLD.cityMinZ;
    const maxAlong = ai.axis === 'x' ? WORLD.cityMaxX : WORLD.cityMaxZ;
    const beyondMin = along < minAlong + 2;
    const beyondMax = along > maxAlong - 2;
    const farAway = Math.hypot(car.position.x - px, car.position.z - pz) > 250;
    const stuckTooLong = ai.stuckTime > 16 && Math.hypot(car.position.x - px, car.position.z - pz) > 60;
    if (beyondMin || beyondMax || farAway || stuckTooLong) traffic.removeCar(car);
  }

  traffic.spawnTimer -= dt;
  if (traffic.spawnTimer <= 0) {
    traffic.spawnTimer = 0.65;
    const activeAi = traffic.cars.filter((car) => car.driver === 'ai').length;
    if (activeAi < traffic.carTarget) traffic.spawnAmbientCar(player, 55, 175);
  }
}
