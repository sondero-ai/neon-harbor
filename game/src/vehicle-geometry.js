// Pure vehicle builders, textures and shared materials. Every class is baked
// from boxes and cylinders into one merged geometry per material slot, and the
// wheels bake once for the whole fleet. Physics lives in vehicles.js and the
// fleet manager in vehicle-fleet.js; this module never touches either.

import * as THREE from '../vendor/three.module.js';
import { canvasTexture, mergeGeometries } from './geo.js';

function matrixFor(x, y, z, { rx = 0, ry = 0, rz = 0 } = {}) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(1, 1, 1));
  return matrix;
}

function addPart(parts, width, height, depth, x, y, z, options = {}) {
  parts.push({
    geometry: new THREE.BoxGeometry(width, height, depth),
    matrix: matrixFor(x, y, z, options),
  });
}

function addColored(parts, width, height, depth, x, y, z, color, options = {}) {
  parts.push({
    geometry: new THREE.BoxGeometry(width, height, depth),
    matrix: matrixFor(x, y, z, options),
    color,
  });
}

function addCylinder(parts, radiusTop, radiusBottom, height, segments, x, y, z, color, options = {}) {
  parts.push({
    geometry: new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    matrix: matrixFor(x, y, z, options),
    color,
  });
}

// A wheel is baked so its axle runs along local X; spinning is rotation.x and
// steering is the pivot's rotation.y. The tires and hubs share one geometry
// for every car, scaled per class.
let wheelGeometry = null;
export function getWheelGeometry() {
  if (wheelGeometry) return wheelGeometry;
  const parts = [];
  addCylinder(parts, 0.36, 0.36, 0.26, 14, 0, 0, 0, 0x17141d, { rz: Math.PI / 2 });
  addCylinder(parts, 0.19, 0.19, 0.285, 10, 0, 0, 0, 0x6f6b78, { rz: Math.PI / 2 });
  addCylinder(parts, 0.07, 0.07, 0.31, 6, 0, 0, 0, 0xb9b0a8, { rz: Math.PI / 2 });
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    parts.push({
      geometry: new THREE.BoxGeometry(0.3, 0.055, 0.3),
      matrix: matrixFor(0, Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, { rx: angle }),
      color: 0x8a8592,
    });
  }
  wheelGeometry = mergeGeometries(parts);
  return wheelGeometry;
}

let wheelMaterial = null;
export function getWheelMaterial() {
  if (!wheelMaterial) {
    wheelMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.24,
    });
  }
  return wheelMaterial;
}

let policeDecalTexture = null;
export function getPoliceDecalTexture() {
  if (policeDecalTexture) return policeDecalTexture;
  policeDecalTexture = canvasTexture(256, 64, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(12,13,20,0.72)';
    ctx.fillRect(0, 8, width, height - 16);
    ctx.strokeStyle = 'rgba(247,232,210,0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 12, width - 8, height - 24);
    ctx.font = '800 30px "Bahnschrift", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2ead7';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.fillText('HARBOR PD', width / 2, height / 2 + 1);
  });
  return policeDecalTexture;
}

// Every class is measured from the road: y = 0 is the wheel contact patch.
// paint parts take the car's paint colour; trim / glass / lights are shared.
function buildClass(type) {
  const paint = [];
  const trim = [];
  const glass = [];
  const head = [];
  const tail = [];

  let length = 4.6;
  let width = 1.84;
  let wheelbase = 2.72;
  let wheelRadius = 0.33;
  let roof = 1.36;

  if (type === 'sedan' || type === 'taxi' || type === 'police') {
    length = type === 'police' ? 4.78 : 4.6;
    width = type === 'police' ? 1.92 : 1.84;
    wheelbase = 2.74;
    wheelRadius = type === 'police' ? 0.35 : 0.33;
    roof = 1.36;

    addPart(paint, 1.68, 0.34, length - 0.24, 0, 0.55, 0);
    addPart(paint, 1.82, 0.18, length - 0.4, 0, 0.74, 0);
    addPart(paint, 1.66, 0.1, 1.18, 0, 0.85, 1.45);
    addPart(paint, 1.66, 0.1, 0.95, 0, 0.85, -1.68);
    addPart(paint, 1.44, 0.08, 1.62, 0, 1.34, -0.18);
    addPart(paint, 0.1, 0.4, 1.8, 0.74, 1.1, -0.16);
    addPart(paint, 0.1, 0.4, 1.8, -0.74, 1.1, -0.16);

    addColored(glass, 1.5, 0.42, 2.02, 0, 1.09, -0.14, 0xffffff);
    addColored(glass, 1.48, 0.26, 0.06, 0, 1.06, 0.94, 0xffffff, { rx: -0.34 });
    addColored(glass, 1.46, 0.26, 0.06, 0, 1.06, -1.18, 0xffffff, { rx: 0.34 });

    addColored(trim, 1.88, 0.2, 0.2, 0, 0.4, length / 2 - 0.03, 0x24212c);
    addColored(trim, 1.88, 0.2, 0.2, 0, 0.4, -length / 2 + 0.03, 0x24212c);
    addColored(trim, 0.94, 0.15, 0.07, 0, 0.58, length / 2 + 0.03, 0x15131c);
    addColored(trim, 0.06, 0.13, 2.9, 0.92, 0.35, 0, 0x1d1a24);
    addColored(trim, 0.06, 0.13, 2.9, -0.92, 0.35, 0, 0x1d1a24);
    addColored(trim, 0.16, 0.1, 0.2, 0.96, 1.02, 0.58, 0x2a2632);
    addColored(trim, 0.16, 0.1, 0.2, -0.96, 1.02, 0.58, 0x2a2632);
    for (const side of [-1, 1]) {
      addColored(trim, 0.015, 0.26, 0.035, side * 0.912, 0.66, 0.35, 0x17141d);
      addColored(trim, 0.02, 0.035, 0.16, side * 0.915, 0.78, 0.05, 0xc9bda8);
      addColored(tail, 0.42, 0.13, 0.06, side * 0.58, 0.7, -length / 2 + 0.005, 0xff2418);
      addColored(head, 0.4, 0.11, 0.06, side * 0.58, 0.71, length / 2 - 0.005, 0xfff0c4);
    }
    addColored(head, 0.4, 0.07, 0.05, 0, 0.55, length / 2 + 0.045, 0xffe2a8);

    if (type === 'taxi') {
      addColored(trim, 0.55, 0.2, 0.26, 0, 1.49, -0.18, 0xfff2c8);
      addColored(head, 0.51, 0.15, 0.03, 0, 1.49, -0.045, 0xffd88e);
      addColored(head, 0.51, 0.15, 0.03, 0, 1.49, -0.315, 0xffd88e);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 10; i += 1) {
          addColored(trim, 0.018, 0.1, 0.18, side * 0.916, 0.62, -1.55 + i * 0.34, i % 2 === 0 ? 0xf2e6cb : 0x1c1822);
        }
      }
    }

    if (type === 'police') {
      addColored(trim, 0.025, 0.34, 1.34, 0.952, 0.64, 0.16, 0xf1e8d4);
      addColored(trim, 0.025, 0.34, 1.34, -0.952, 0.64, 0.16, 0xf1e8d4);
      addColored(trim, 0.06, 0.3, 0.06, 0.55, 0.55, length / 2 + 0.13, 0x24212c);
      addColored(trim, 0.06, 0.3, 0.06, -0.55, 0.55, length / 2 + 0.13, 0x24212c);
      addColored(trim, 1.4, 0.07, 0.09, 0, 0.7, length / 2 + 0.15, 0x35313a);
      addColored(trim, 1.1, 0.06, 0.28, 0, 1.43, -0.2, 0x24212c);
    }
  } else if (type === 'sports') {
    length = 4.32;
    width = 1.96;
    wheelbase = 2.58;
    wheelRadius = 0.32;
    roof = 1.1;

    addPart(paint, 1.86, 0.28, 4.14, 0, 0.46, 0);
    addPart(paint, 1.74, 0.16, 1.16, 0, 0.59, 1.4, { rx: -0.05 });
    addPart(paint, 1.74, 0.14, 0.94, 0, 0.62, -1.66);
    addPart(paint, 1.48, 0.3, 1.52, 0, 0.86, -0.06);
    addPart(paint, 1.34, 0.065, 1.2, 0, 1.05, -0.14);
    addPart(paint, 1.7, 0.06, 0.34, 0, 1.02, -1.98);
    addPart(paint, 0.07, 0.24, 0.09, 0.62, 0.89, -1.98);
    addPart(paint, 0.07, 0.24, 0.09, -0.62, 0.89, -1.98);

    addColored(glass, 1.42, 0.31, 1.64, 0, 0.91, -0.1, 0xffffff);
    addColored(glass, 1.4, 0.22, 0.06, 0, 0.88, 0.69, 0xffffff, { rx: -0.44 });
    addColored(glass, 1.38, 0.2, 0.06, 0, 0.88, -0.89, 0xffffff, { rx: 0.44 });

    addColored(trim, 1.94, 0.12, 0.3, 0, 0.34, length / 2 - 0.1, 0x1b1822);
    addColored(trim, 1.94, 0.12, 0.26, 0, 0.34, -length / 2 + 0.08, 0x1b1822);
    addColored(trim, 0.06, 0.1, 2.7, 0.96, 0.3, 0, 0x1d1a24);
    addColored(trim, 0.06, 0.1, 2.7, -0.96, 0.3, 0, 0x1d1a24);
    addColored(trim, 0.18, 0.16, 0.5, 0.98, 0.66, -0.55, 0x17141d);
    addColored(trim, 0.18, 0.16, 0.5, -0.98, 0.66, -0.55, 0x17141d);
    addColored(trim, 0.16, 0.08, 0.18, 0.99, 0.92, 0.5, 0x2a2632);
    addColored(trim, 0.16, 0.08, 0.18, -0.99, 0.92, 0.5, 0x2a2632);
    for (const side of [-1, 1]) {
      addColored(head, 0.46, 0.07, 0.06, side * 0.58, 0.62, length / 2 - 0.01, 0xfff1c8);
      addColored(tail, 0.4, 0.1, 0.055, side * 0.6, 0.66, -length / 2 + 0.01, 0xff2418);
    }
    addColored(tail, 1.34, 0.055, 0.04, 0, 0.79, -length / 2 + 0.02, 0xff3a20);
  } else if (type === 'muscle') {
    length = 4.76;
    width = 1.98;
    wheelbase = 2.82;
    wheelRadius = 0.35;
    roof = 1.42;

    addPart(paint, 1.9, 0.38, 4.54, 0, 0.55, 0);
    addPart(paint, 1.98, 0.16, 4.36, 0, 0.79, 0);
    addPart(paint, 1.82, 0.14, 1.5, 0, 0.91, 1.36);
    addPart(paint, 1.82, 0.12, 1.08, 0, 0.92, -1.56);
    addPart(paint, 1.56, 0.4, 1.58, 0, 1.12, -0.36);
    addPart(paint, 1.44, 0.08, 1.34, 0, 1.4, -0.4);
    addPart(paint, 1.86, 0.07, 0.28, 0, 1.06, -2.12);
    addPart(paint, 0.08, 0.28, 0.1, 0.7, 0.92, -2.1);
    addPart(paint, 0.08, 0.28, 0.1, -0.7, 0.92, -2.1);

    addColored(glass, 1.5, 0.4, 1.7, 0, 1.15, -0.4, 0xffffff);
    addColored(glass, 1.48, 0.26, 0.06, 0, 1.12, 0.51, 0xffffff, { rx: -0.42 });
    addColored(glass, 1.46, 0.24, 0.06, 0, 1.12, -1.3, 0xffffff, { rx: 0.42 });

    addColored(trim, 1.5, 0.14, 0.7, 0, 0.97, 1.18, 0x22202a);
    addColored(trim, 0.5, 0.1, 0.5, 0, 1.05, 1.24, 0x111016);
    addColored(trim, 1.94, 0.16, 0.22, 0, 0.38, length / 2 - 0.03, 0x1e1b25);
    addColored(trim, 1.94, 0.16, 0.22, 0, 0.38, -length / 2 + 0.03, 0x1e1b25);
    addColored(trim, 0.07, 0.12, 3.1, 0.98, 0.32, 0, 0x1b1822);
    addColored(trim, 0.07, 0.12, 3.1, -0.98, 0.32, 0, 0x1b1822);
    addColored(trim, 0.18, 0.09, 0.2, 0.99, 1.02, 0.55, 0x2a2632);
    addColored(trim, 0.18, 0.09, 0.2, -0.99, 1.02, 0.55, 0x2a2632);
    for (const side of [-1, 1]) {
      addColored(trim, 0.19, 0.025, 1.46, side * 0.26, 0.985, 1.34, 0xf0dfbf);
      addColored(trim, 0.19, 0.025, 1.3, side * 0.26, 1.445, -0.4, 0xf0dfbf);
      addColored(trim, 0.19, 0.025, 1.06, side * 0.26, 0.985, -1.56, 0xf0dfbf);
      addColored(head, 0.42, 0.11, 0.06, side * 0.64, 0.75, length / 2 - 0.01, 0xffedb8);
      addColored(tail, 0.44, 0.15, 0.06, side * 0.63, 0.74, -length / 2 + 0.01, 0xff2418);
    }
    addColored(trim, 0.09, 0.09, 0.24, 0.5, 0.32, -2.43, 0x3c3944);
    addColored(trim, 0.09, 0.09, 0.24, -0.5, 0.32, -2.43, 0x3c3944);
  } else if (type === 'van') {
    length = 5.16;
    width = 2.02;
    wheelbase = 3.16;
    wheelRadius = 0.38;
    roof = 2.02;

    addPart(paint, 1.96, 0.5, 5.0, 0, 0.6, 0);
    addPart(paint, 1.98, 1.28, 4.08, 0, 1.34, -0.4);
    addPart(paint, 1.86, 0.46, 1.15, 0, 0.92, 1.9);
    addPart(paint, 2.0, 0.08, 4.18, 0, 1.99, -0.38);
    addPart(paint, 0.08, 1.28, 0.08, 0.96, 1.34, 1.62);
    addPart(paint, 0.08, 1.28, 0.08, -0.96, 1.34, 1.62);

    addColored(glass, 1.7, 0.56, 0.08, 0, 1.58, 1.58, 0xffffff, { rx: -0.14 });
    addColored(glass, 0.03, 0.46, 1.02, 0.985, 1.55, 0.52, 0xffffff);
    addColored(glass, 0.03, 0.46, 1.02, -0.985, 1.55, 0.52, 0xffffff);
    addColored(glass, 1.48, 0.44, 0.055, 0, 1.53, 1.5, 0xffffff, { rx: -0.12 });

    addColored(trim, 2.06, 0.18, 0.24, 0, 0.4, 2.5, 0x23202a);
    addColored(trim, 2.04, 0.18, 0.22, 0, 0.4, -2.52, 0x23202a);
    addColored(trim, 0.07, 0.16, 3.6, 1.01, 0.34, -0.2, 0x1b1822);
    addColored(trim, 0.07, 0.16, 3.6, -1.01, 0.34, -0.2, 0x1b1822);
    addColored(trim, 0.02, 0.9, 0.035, 0.996, 1.25, -0.9, 0x191620);
    addColored(trim, 0.02, 0.9, 0.035, -0.996, 1.25, -0.9, 0x191620);
    addColored(trim, 0.14, 0.08, 0.16, 1.02, 1.02, 1.18, 0x2a2632);
    addColored(trim, 0.14, 0.08, 0.16, -1.02, 1.02, 1.18, 0x2a2632);
    addColored(trim, 0.08, 0.09, 3.2, 0.78, 2.06, -0.4, 0x2f2c36);
    addColored(trim, 0.08, 0.09, 3.2, -0.78, 2.06, -0.4, 0x2f2c36);
    addColored(trim, 1.56, 0.06, 0.08, 0, 2.08, -1.92, 0x2f2c36);
    addColored(trim, 1.56, 0.06, 0.08, 0, 2.08, -1.1, 0x2f2c36);
    addColored(trim, 0.02, 0.04, 0.34, 0.998, 1.42, -0.96, 0x4c4654);
    for (const side of [-1, 1]) {
      addColored(head, 0.44, 0.16, 0.07, side * 0.7, 0.82, length / 2 - 0.01, 0xfff0c4);
      addColored(tail, 0.24, 0.42, 0.06, side * 0.78, 0.97, -length / 2 + 0.01, 0xff2418);
    }
  } else if (type === 'pickup') {
    length = 5.02;
    width = 1.96;
    wheelbase = 3.0;
    wheelRadius = 0.36;
    roof = 1.52;

    addPart(paint, 1.9, 0.42, 4.84, 0, 0.56, 0);
    addPart(paint, 1.82, 0.3, 1.4, 0, 0.87, 1.6);
    addPart(paint, 1.52, 0.44, 1.24, 0, 1.16, 0.3);
    addPart(paint, 1.42, 0.08, 1.22, 0, 1.42, 0.28);
    addPart(paint, 1.84, 0.1, 1.94, 0, 0.8, -1.55);
    addPart(paint, 0.12, 0.46, 1.94, 0.86, 1.03, -1.55);
    addPart(paint, 0.12, 0.46, 1.94, -0.86, 1.03, -1.55);
    addPart(paint, 1.84, 0.46, 0.12, 0, 1.03, -2.5);

    addColored(glass, 1.44, 0.4, 1.3, 0, 1.2, 0.26, 0xffffff);
    addColored(glass, 1.42, 0.24, 0.06, 0, 1.18, 0.92, 0xffffff, { rx: -0.42 });
    addColored(glass, 1.4, 0.22, 0.06, 0, 1.18, -0.38, 0xffffff, { rx: 0.42 });

    addColored(trim, 1.94, 0.18, 0.22, 0, 0.4, length / 2 - 0.03, 0x24212c);
    addColored(trim, 1.94, 0.18, 0.22, 0, 0.4, -length / 2 + 0.03, 0x24212c);
    addColored(trim, 1.6, 0.04, 1.8, 0, 0.86, -1.55, 0x191620);
    addColored(trim, 0.07, 0.14, 3.0, 0.96, 0.32, 0, 0x1b1822);
    addColored(trim, 0.07, 0.14, 3.0, -0.96, 0.32, 0, 0x1b1822);
    addColored(trim, 0.18, 0.1, 0.2, 0.99, 0.84, 0.9, 0x2a2632);
    addColored(trim, 0.18, 0.1, 0.2, -0.99, 0.84, 0.9, 0x2a2632);
    for (const side of [-1, 1]) {
      addColored(head, 0.42, 0.12, 0.06, side * 0.62, 0.74, length / 2 - 0.01, 0xfff0c4);
      addColored(tail, 0.38, 0.16, 0.06, side * 0.7, 0.78, -length / 2 + 0.01, 0xff2418);
    }
  }

  return {
    paint: mergeGeometries(paint),
    trim: mergeGeometries(trim),
    glass: mergeGeometries(glass),
    head: mergeGeometries(head),
    tail: mergeGeometries(tail),
    length,
    width,
    wheelbase,
    wheelRadius,
    wheelHalfTrack: width / 2 - 0.02,
    roof,
  };
}

const geometryCache = new Map();

export function geometryFor(type) {
  if (!geometryCache.has(type)) geometryCache.set(type, buildClass(type));
  return geometryCache.get(type);
}

/** The merged paint geometry for a class, used by instanced parked cars. */
export function vehicleBodyGeometry(type) {
  return geometryFor(type).paint;
}

/** The measured body dimensions and wheel layout for a class. */
export function vehicleShape(type) {
  return geometryFor(type);
}

export const paintPalettes = {
  sedan: [0x8a3b45, 0x2f5964, 0xd9c9ad, 0x40364e, 0x9a5a34, 0x6f7c74, 0x252a36],
  taxi: [0xe0a92f],
  sports: [0xd9483f, 0x2fc0ae, 0xe8d9bd, 0x2f4a9a, 0xe37b2f, 0x8a2a6e],
  muscle: [0x8c2f2f, 0x274c57, 0xd4a33e, 0x5b3c77, 0x2b2f35, 0xb8692f],
  van: [0x6a7f78, 0xa8b3a4, 0x92523f, 0x3f5566, 0xc9bca2],
  pickup: [0x7b5a3a, 0x3f6a62, 0x9b4a3b, 0xc7bda6, 0x4b5160],
  police: [0x1d2029],
};

export const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false });
const HEADLIGHT_COLOR = 0xfff0c0;

/** Day/night headlight level shared by every car through the one material. */
export function setHeadlightLevel(level) {
  const amount = Math.min(1, Math.max(0, Number(level) || 0));
  headlightMaterial.color.setHex(HEADLIGHT_COLOR).multiplyScalar(0.45 + 0.55 * amount);
}
export const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0x18242f,
  roughness: 0.12,
  metalness: 0.74,
  emissive: 0x0a1a24,
  emissiveIntensity: 0.42,
});
export const trimMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.62,
  metalness: 0.18,
});

export function pickVehicleColor(rng, type) {
  const palette = paintPalettes[type] ?? paintPalettes.sedan;
  return palette[Math.floor(rng() * palette.length) % palette.length];
}

export function buildPoliceDecalGeometry(shape) {
  const parts = [];
  for (const side of [-1, 1]) {
    parts.push({
      geometry: new THREE.PlaneGeometry(1.5, 0.38),
      matrix: matrixFor(side * (shape.width / 2 + 0.012), 0.66, -0.05, { ry: side * Math.PI / 2 }),
    });
  }
  return mergeGeometries(parts);
}
