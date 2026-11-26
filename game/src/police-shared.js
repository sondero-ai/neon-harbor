// Constants and pure helpers shared by the Harbor PD modules: the pursuit
// table, unit callsigns, the intersection router and the ray tests. Nothing
// here imports a police module.

import { ROADS_X, ROADS_Z } from './config.js';

export const CRUISERS_PER_STAR = [0, 1, 1, 2, 3, 4];
export const UNIT_CALLSIGNS = [12, 7, 33, 21, 44, 9, 18, 26, 31, 38, 5, 16, 24, 29, 41, 48];

export function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export function nearestRoad(value, roads) {
  let best = roads[0];
  let bestDistance = Infinity;
  for (const road of roads) {
    const distance = Math.abs(value - road);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = road;
    }
  }
  return best;
}

export function nearestNode(x, z) {
  const roadX = nearestRoad(x, ROADS_X);
  const roadZ = nearestRoad(z, ROADS_Z);
  return { x: roadX, z: roadZ, i: ROADS_X.indexOf(roadX), j: ROADS_Z.indexOf(roadZ) };
}

// Breadth-first route over the intersection grid. A hundred nodes: cheap enough
// to rebuild for every cruiser twice a second and guaranteed to follow asphalt.
export function roadRoute(fromX, fromZ, toX, toZ) {
  const sizeX = ROADS_X.length;
  const sizeZ = ROADS_Z.length;
  const start = nearestNode(fromX, fromZ);
  const goal = nearestNode(toX, toZ);
  if (start.i === goal.i && start.j === goal.j) return [{ x: goal.x, z: goal.z }];
  const total = sizeX * sizeZ;
  const previous = new Int16Array(total).fill(-1);
  const seen = new Uint8Array(total);
  const queue = [start.i + start.j * sizeX];
  const startIndex = queue[0];
  seen[startIndex] = 1;
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const i = index % sizeX;
    const j = Math.floor(index / sizeX);
    if (i === goal.i && j === goal.j) break;
    const neighbors = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
    for (const [ni, nj] of neighbors) {
      if (ni < 0 || ni >= sizeX || nj < 0 || nj >= sizeZ) continue;
      const next = ni + nj * sizeX;
      if (seen[next]) continue;
      seen[next] = 1;
      previous[next] = index;
      queue.push(next);
    }
  }
  const goalIndex = goal.i + goal.j * sizeX;
  if (!seen[goalIndex]) return [{ x: goal.x, z: goal.z }];
  const path = [];
  let cursor = goalIndex;
  while (cursor !== -1 && cursor !== startIndex) {
    const i = cursor % sizeX;
    const j = Math.floor(cursor / sizeX);
    path.push({ x: ROADS_X[i], z: ROADS_Z[j] });
    cursor = previous[cursor];
  }
  path.reverse();
  return path;
}

export function raySphere(origin, direction, cx, cy, cz, radius) {
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

export function rayLocalBox(origin, direction, yaw, px, pz, halfWidth, halfLength, minY, maxY) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const dx = origin.x - px;
  const dz = origin.z - pz;
  const ox = dx * cos - dz * sin;
  const oz = dx * sin + dz * cos;
  const oy = origin.y;
  const vx = direction.x * cos - direction.z * sin;
  const vz = direction.x * sin + direction.z * cos;
  const vy = direction.y;
  let tMin = 0.05;
  let tMax = 1e6;
  const slabs = [
    [ox, vx, -halfWidth, halfWidth],
    [oy, vy, minY, maxY],
    [oz, vz, -halfLength, halfLength],
  ];
  for (const [start, velocity, min, max] of slabs) {
    if (Math.abs(velocity) < 1e-8) {
      if (start < min || start > max) return null;
      continue;
    }
    let t1 = (min - start) / velocity;
    let t2 = (max - start) / velocity;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  return tMin;
}
