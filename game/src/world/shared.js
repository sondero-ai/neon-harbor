// Constants and small helpers shared by the world builder modules. Every
// value moved verbatim out of world.js: the grid, the pier deck, the sun
// direction and the district split are read by more than one module.

import * as THREE from '../../vendor/three.module.js';
import { CORE_BLOCK_CENTERS, WORLD } from '../config.js';

export const ROAD_HALF = WORLD.roadWidth / 2;
export const BLOCK_HALF = WORLD.blockSize / 2;
export const DECK = WORLD.pier;
export const WATER_Y = -0.44;
export const SUN_DIR = new THREE.Vector3(...WORLD.sunDir).normalize();
export const UP = new THREE.Vector3(0, 1, 0);
export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
export const CORE_SET = new Set(CORE_BLOCK_CENTERS);

// The extension blocks are generated after the original core, in a fixed
// order, so every core tower and sign keeps the exact geometry it had before
// the city grew. The two new districts are chosen by block centre.
export function districtForBlock(cx, cz) {
  if (cx >= 216) return 'foundry';
  if (cz <= -162) return 'oldtown';
  return null;
}

export function segmentHit(origin, direction, maxDistance, box, radius) {
  let near = 0;
  let far = maxDistance;
  for (const axis of ['x', 'y', 'z']) {
    const min = axis === 'y'
      ? (box.minY ?? 0)
      : (axis === 'x' ? box.minX : box.minZ) - radius;
    const max = axis === 'y'
      ? (box.maxY ?? 30)
      : (axis === 'x' ? box.maxX : box.maxZ) + radius;
    const start = origin[axis];
    const delta = direction[axis];
    if (Math.abs(delta) < 1e-6) {
      if (start < min || start > max) return null;
      continue;
    }
    let first = (min - start) / delta;
    let second = (max - start) / delta;
    if (first > second) {
      const swap = first;
      first = second;
      second = swap;
    }
    if (first > near) near = first;
    if (second < far) far = second;
    if (near > far) return null;
  }
  return near > 0.02 ? near : 0.02;
}
