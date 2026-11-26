// Read-only world queries: block and pier tests, ground height, walking and
// vehicle collision, ray hits and camera clipping. Each function takes the
// World instance and reads the state built by world.js.

import * as THREE from '../../vendor/three.module.js';
import { BLOCK_CENTERS_X, BLOCK_CENTERS_Z, WORLD } from '../config.js';
import { BLOCK_HALF, DECK, clamp, lerp, segmentHit } from './shared.js';

const _origin = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _hit = new THREE.Vector3();

export function onBlock(world, x, z) {
  for (const cx of BLOCK_CENTERS_X) {
    if (Math.abs(x - cx) > BLOCK_HALF) continue;
    for (const cz of BLOCK_CENTERS_Z) {
      if (Math.abs(z - cz) <= BLOCK_HALF) return true;
    }
  }
  return false;
}

export function onPierDeck(world, x, z) {
  return x >= DECK.minX - 0.2
    && x <= DECK.maxX + 0.2
    && Math.abs(z - DECK.z) <= DECK.halfWidth + 0.15;
}

export function onRamp(world, x, z) {
  return x > DECK.maxX - 0.2
    && x < DECK.rampMaxX + 0.2
    && Math.abs(z - DECK.z) <= DECK.rampHalfWidth + 0.15;
}

/**
 * Vehicle-only terrain rule. The pier deck and its ramp are pedestrian-only
 * for every vehicle; AI cars are also kept off the sand, while a player car
 * may still be driven onto the beach. Vehicles consult this through
 * `Vehicle.collidesAt`, never through the pedestrian collider list.
 */
export function vehicleBlocked(world, x, z, isPlayer = false) {
  if (onPierDeck(world, x, z) || onRamp(world, x, z)) return true;
  if (world.mall) {
    const bounds = world.mall.bounds;
    if (x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ) return true;
  }
  if (x < WORLD.cityMinX && !isPlayer) return true;
  return false;
}

export function groundHeightAt(world, x, z) {
  if (onPierDeck(world, x, z)) return DECK.deckY;
  if (onRamp(world, x, z)) {
    const t = clamp((DECK.rampMaxX - x) / (DECK.rampMaxX - DECK.rampMinX), 0, 1);
    return lerp(beachHeight(world, x, z), DECK.deckY, t);
  }
  if (x < WORLD.cityMinX) return beachHeight(world, x, z);
  if (onBlock(world, x, z)) return WORLD.sidewalkHeight;
  return 0;
}

export function beachHeight(world, x, z = 0) {
  const t = clamp((WORLD.cityMinX - x) / (WORLD.cityMinX - WORLD.shorelineX), 0, 1);
  return -0.45 * t + Math.sin((z + x * 0.6) * 0.09) * 0.01 * t;
}

export function collides(world, x, z, radius = 0.45) {
  const bounds = WORLD.bounds;
  if (x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius) {
    return true;
  }
  if (x < WORLD.shorelineX + 0.2 && !onPierDeck(world, x, z) && !onRamp(world, x, z)) return true;
  for (const box of world.colliders) {
    if (x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius) {
      return true;
    }
  }
  return false;
}

/**
 * Pushes a circle out of every building/prop collider it overlaps. The
 * shortest axis wins, and three passes settle the corners where two boxes
 * touch. Pedestrians use this before every step so nobody walks through a
 * wall; a moved result is also the collision test for the step.
 */
export function resolveCircle(world, x, z, radius = 0.4) {
  const bounds = WORLD.bounds;
  let px = clamp(x, bounds.minX + radius, bounds.maxX - radius);
  let pz = clamp(z, bounds.minZ + radius, bounds.maxZ - radius);
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (const box of world.colliders) {
      if (px <= box.minX - radius || px >= box.maxX + radius) continue;
      if (pz <= box.minZ - radius || pz >= box.maxZ + radius) continue;
      const left = px - (box.minX - radius);
      const right = (box.maxX + radius) - px;
      const bottom = pz - (box.minZ - radius);
      const top = (box.maxZ + radius) - pz;
      const least = Math.min(left, right, bottom, top);
      if (least === left) px = box.minX - radius;
      else if (least === right) px = box.maxX + radius;
      else if (least === bottom) pz = box.minZ - radius;
      else pz = box.maxZ + radius;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: px, z: pz };
}

/**
 * Nearest building/prop slab hit along a ray, for hitscan, muzzle checks and
 * line-of-sight. Ground is treated as a flat plane at road level; the beach
 * and pier sit close enough that a missed low shot still lands in the dust.
 */
export function raycast(world, origin, direction, maxDistance = 120) {
  let best = null;
  const invX = direction.x !== 0 ? 1 / direction.x : 1e9;
  const invY = direction.y !== 0 ? 1 / direction.y : 1e9;
  const invZ = direction.z !== 0 ? 1 / direction.z : 1e9;
  for (const box of world.colliders) {
    let tMin = 0;
    let tMax = maxDistance;
    let axis = 0;
    let sign = -1;
    let hit = true;
    for (let i = 0; i < 3; i += 1) {
      const originValue = i === 0 ? origin.x : i === 1 ? origin.y : origin.z;
      const inverse = i === 0 ? invX : i === 1 ? invY : invZ;
      const min = i === 0 ? box.minX : i === 1 ? box.minY : box.minZ;
      const max = i === 0 ? box.maxX : i === 1 ? box.maxY : box.maxZ;
      if (Math.abs(inverse) > 1e8) {
        if (originValue < min || originValue > max) { hit = false; break; }
        continue;
      }
      let t1 = (min - originValue) * inverse;
      let t2 = (max - originValue) * inverse;
      let nearSign = -1;
      if (t1 > t2) {
        const swap = t1;
        t1 = t2;
        t2 = swap;
        nearSign = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        axis = i;
        sign = nearSign;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) { hit = false; break; }
    }
    if (!hit || tMin <= 0.02 || tMin > maxDistance) continue;
    if (!best || tMin < best.distance) {
      best = {
        distance: tMin,
        point: new THREE.Vector3(origin.x + direction.x * tMin, origin.y + direction.y * tMin, origin.z + direction.z * tMin),
        normal: new THREE.Vector3(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0),
        kind: box.kind ?? 'building',
      };
    }
  }
  if (direction.y < -0.005 && origin.y > 0.02) {
    const groundT = (origin.y - 0.02) / -direction.y;
    if (groundT > 0.02 && groundT < maxDistance && (!best || groundT < best.distance)) {
      best = {
        distance: groundT,
        point: new THREE.Vector3(origin.x + direction.x * groundT, 0.02, origin.z + direction.z * groundT),
        normal: new THREE.Vector3(0, 1, 0),
        kind: 'ground',
      };
    }
  }
  return best;
}

export function lineBlocked(world, fromX, fromY, fromZ, toX, toY, toZ, padding = 0.8) {
  _origin.set(fromX, fromY, fromZ);
  _direction.set(toX - fromX, toY - fromY, toZ - fromZ);
  const length = _direction.length();
  if (length < 0.001) return false;
  _direction.divideScalar(length);
  const hit = raycast(world, _origin, _direction, length - padding);
  return Boolean(hit);
}

export function clipCamera(world, from, to, radius, out) {
  out.copy(to);
  _origin.copy(from);
  _direction.copy(to).sub(from);
  const length = _direction.length();
  if (length < 1e-4) return out;
  _direction.divideScalar(length);
  let nearest = length;
  for (const box of world.colliders) {
    const hit = segmentHit(from, _direction, length, box, radius);
    if (hit !== null && hit < nearest) nearest = hit;
  }
  if (nearest < length) {
    out.copy(from).addScaledVector(_direction, Math.max(0.18, nearest - 0.05));
  }
  const floor = groundHeightAt(world, out.x, out.z) + 0.28;
  if (out.y < floor) out.y = floor;
  return out;
}
