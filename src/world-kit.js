// Small geometry and material helpers shared by the world builders. These
// moved out of world.js unchanged; mall.js and the other district modules use
// the same kit so a static part merges into the same vertex-coloured batches
// whether it belongs to a tower, the pier or the mall shell.

import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from './geo.js';

const _euler = new THREE.Euler();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();

export function matrixFor(x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _euler.set(rx, ry, rz);
  _quaternion.setFromEuler(_euler);
  _scale.set(sx, sy, sz);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _quaternion, _scale);
}

export function addPart(parts, geometry, x, y, z, color, options = {}) {
  parts.push({ geometry, matrix: matrixFor(x, y, z, options), color });
}

export function addBox(parts, width, height, depth, x, y, z, color, options = {}) {
  addPart(parts, new THREE.BoxGeometry(width, height, depth), x, y, z, color, options);
}

export function addCylinder(parts, radiusTop, radiusBottom, height, segments, x, y, z, color, options = {}) {
  addPart(parts, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), x, y, z, color, options);
}

// A neon crown is an edge band, never a solid lid: from the title camera the
// old solid box read as a giant coloured roof.
export function addCrownBand(parts, cx, cz, width, depth, y, color, thickness = 0.22) {
  addBox(parts, width, thickness, 0.24, cx, y, cz - depth / 2, color);
  addBox(parts, width, thickness, 0.24, cx, y, cz + depth / 2, color);
  addBox(parts, 0.24, thickness, depth, cx - width / 2, y, cz, color);
  addBox(parts, 0.24, thickness, depth, cx + width / 2, y, cz, color);
}

export function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.85,
    metalness: options.metalness ?? 0.03,
    ...options,
  });
}

export function basicMaterial(color, options = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    toneMapped: options.toneMapped ?? false,
    ...options,
  });
}

// Re-exported so a district module can merge its own part list without also
// importing geo.js; world.js imports it directly from geo.js.
export { mergeGeometries };
