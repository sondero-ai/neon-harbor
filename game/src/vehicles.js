// The harbor's traffic hardware: seven original low-poly vehicle classes, a
// shared geometry cache, wheel and light animation, arcade handling with
// throttle / brake / reverse / drift, building collision, and a pooled skid
// mark ribbon. Traffic AI lives in traffic.js; this file only obeys controls,
// so a police pursuit in a later chapter can reuse the same cars.

import * as THREE from '../vendor/three.module.js';
import { WORLD } from './config.js';
import { canvasTexture, makeGlowSprite, mergeGeometries } from './geo.js';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

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
function getWheelGeometry() {
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
function getWheelMaterial() {
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
function getPoliceDecalTexture() {
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

function geometryFor(type) {
  if (!geometryCache.has(type)) geometryCache.set(type, buildClass(type));
  return geometryCache.get(type);
}

const paintPalettes = {
  sedan: [0x8a3b45, 0x2f5964, 0xd9c9ad, 0x40364e, 0x9a5a34, 0x6f7c74, 0x252a36],
  taxi: [0xe0a92f],
  sports: [0xd9483f, 0x2fc0ae, 0xe8d9bd, 0x2f4a9a, 0xe37b2f, 0x8a2a6e],
  muscle: [0x8c2f2f, 0x274c57, 0xd4a33e, 0x5b3c77, 0x2b2f35, 0xb8692f],
  van: [0x6a7f78, 0xa8b3a4, 0x92523f, 0x3f5566, 0xc9bca2],
  pickup: [0x7b5a3a, 0x3f6a62, 0x9b4a3b, 0xc7bda6, 0x4b5160],
  police: [0x1d2029],
};

export const VEHICLE_TYPES = {
  sedan: {
    name: 'Fathom 400',
    className: 'SEDAN',
    maxSpeed: 33,
    acceleration: 8.8,
    brake: 17,
    reverseSpeed: 8,
    grip: 7.4,
    steer: 0.58,
    colors: paintPalettes.sedan,
  },
  taxi: {
    name: 'Harbor Cab',
    className: 'TAXI',
    maxSpeed: 32,
    acceleration: 8.2,
    brake: 16,
    reverseSpeed: 8,
    grip: 7.2,
    steer: 0.58,
    colors: paintPalettes.taxi,
  },
  sports: {
    name: 'Vela GT',
    className: 'SPORTS',
    maxSpeed: 45,
    acceleration: 14.2,
    brake: 20,
    reverseSpeed: 8,
    grip: 9.2,
    steer: 0.62,
    colors: paintPalettes.sports,
  },
  muscle: {
    name: 'Riptide 442',
    className: 'MUSCLE',
    maxSpeed: 41,
    acceleration: 12.8,
    brake: 15,
    reverseSpeed: 9,
    grip: 6.0,
    steer: 0.6,
    colors: paintPalettes.muscle,
  },
  van: {
    name: 'Mule 9',
    className: 'VAN',
    maxSpeed: 28,
    acceleration: 6.4,
    brake: 14,
    reverseSpeed: 6,
    grip: 7.8,
    steer: 0.5,
    colors: paintPalettes.van,
  },
  pickup: {
    name: 'Dune Hauler',
    className: 'PICKUP',
    maxSpeed: 31,
    acceleration: 8.2,
    brake: 15,
    reverseSpeed: 7,
    grip: 6.8,
    steer: 0.55,
    colors: paintPalettes.pickup,
  },
  police: {
    name: 'Harbor PD Cruiser',
    className: 'POLICE',
    maxSpeed: 39,
    acceleration: 12,
    brake: 20,
    reverseSpeed: 9,
    grip: 8.6,
    steer: 0.6,
    colors: paintPalettes.police,
  },
};

export const TRAFFIC_MIX = ['sedan', 'sedan', 'taxi', 'sedan', 'van', 'sports', 'pickup', 'sedan', 'muscle', 'taxi'];

const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false });
const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0x18242f,
  roughness: 0.12,
  metalness: 0.74,
  emissive: 0x0a1a24,
  emissiveIntensity: 0.42,
});
const trimMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.62,
  metalness: 0.18,
});

export function pickVehicleColor(rng, type) {
  const palette = paintPalettes[type] ?? paintPalettes.sedan;
  return palette[Math.floor(rng() * palette.length) % palette.length];
}

export class SkidMarks {
  constructor(scene, maxQuads = 900) {
    this.maxQuads = maxQuads;
    this.cursor = 0;
    this.positions = new Float32Array(maxQuads * 6 * 3);
    this.positions.fill(-80);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setDrawRange(0, maxQuads * 6);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x0b0910,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }

  reset() {
    this.cursor = 0;
    this.positions.fill(-80);
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  add(x, z, directionX, directionZ, y, width = 0.26, length = 0.72) {
    const sideX = -directionZ;
    const sideZ = directionX;
    const halfWidth = width / 2;
    const halfLength = length / 2;
    const ax = x - directionX * halfLength + sideX * halfWidth;
    const az = z - directionZ * halfLength + sideZ * halfWidth;
    const bx = x + directionX * halfLength + sideX * halfWidth;
    const bz = z + directionZ * halfLength + sideZ * halfWidth;
    const cx = x + directionX * halfLength - sideX * halfWidth;
    const cz = z + directionZ * halfLength - sideZ * halfWidth;
    const dx = x - directionX * halfLength - sideX * halfWidth;
    const dz = z - directionZ * halfLength - sideZ * halfWidth;
    const offset = this.cursor * 18;
    const p = this.positions;
    const height = y + 0.028;
    p[offset] = ax; p[offset + 1] = height; p[offset + 2] = az;
    p[offset + 3] = bx; p[offset + 4] = height; p[offset + 5] = bz;
    p[offset + 6] = cx; p[offset + 7] = height; p[offset + 8] = cz;
    p[offset + 9] = ax; p[offset + 10] = height; p[offset + 11] = az;
    p[offset + 12] = cx; p[offset + 13] = height; p[offset + 14] = cz;
    p[offset + 15] = dx; p[offset + 16] = height; p[offset + 17] = dz;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.cursor = (this.cursor + 1) % this.maxQuads;
  }
}

const _local = new THREE.Vector3();

export class Vehicle {
  constructor(type, { x = 0, z = 0, yaw = 0, color = null } = {}) {
    const spec = VEHICLE_TYPES[type] ?? VEHICLE_TYPES.sedan;
    const shape = geometryFor(type);
    this.type = type;
    this.spec = spec;
    this.shape = shape;
    this.name = spec.name;
    this.className = spec.className;
    this.color = color ?? spec.colors[0];
    this.driver = null;
    this.controls = { throttle: 0, brake: 1, steer: 0, handbrake: true };
    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.steerAngle = 0;
    this.wheelSpin = 0;
    this.impact = 0;
    this.skidDistance = 0;
    this.ai = null;
    this.removed = false;

    this.group = new THREE.Group();
    this.group.name = `vehicle-${type}`;
    this.group.rotation.order = 'YXZ';

    this.paintMaterial = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.4,
      metalness: 0.36,
    });
    this.paintMesh = new THREE.Mesh(shape.paint, this.paintMaterial);
    this.paintMesh.castShadow = true;
    this.paintMesh.receiveShadow = true;
    this.group.add(this.paintMesh);

    this.trimMesh = new THREE.Mesh(shape.trim, trimMaterial);
    this.trimMesh.castShadow = true;
    this.trimMesh.receiveShadow = true;
    this.group.add(this.trimMesh);

    this.glassMesh = new THREE.Mesh(shape.glass, glassMaterial);
    this.glassMesh.castShadow = false;
    this.group.add(this.glassMesh);

    this.headMesh = new THREE.Mesh(shape.head, headlightMaterial);
    this.group.add(this.headMesh);

    this.tailMaterial = new THREE.MeshBasicMaterial({ color: 0x8f2017, toneMapped: false });
    this.tailMesh = new THREE.Mesh(shape.tail, this.tailMaterial);
    this.group.add(this.tailMesh);

    if (type === 'police') {
      this.decalMesh = new THREE.Mesh(
        buildPoliceDecalGeometry(shape),
        new THREE.MeshBasicMaterial({
          map: getPoliceDecalTexture(),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      this.group.add(this.decalMesh);
      this.lightbarBase = new THREE.Group();
      this.lightbarBase.position.set(0, 1.5, -0.2);
      this.group.add(this.lightbarBase);
      this.lightbarRed = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.12, 0.24),
        new THREE.MeshBasicMaterial({ color: 0xff2d22, toneMapped: false }),
      );
      this.lightbarRed.position.set(-0.27, 0.06, 0);
      this.lightbarBlue = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.12, 0.24),
        new THREE.MeshBasicMaterial({ color: 0x2f5bff, toneMapped: false }),
      );
      this.lightbarBlue.position.set(0.27, 0.06, 0);
      this.lightbarBase.add(this.lightbarRed, this.lightbarBlue);
      this.lightGlowRed = makeGlowSprite(0xff4938, 1.5, 0.55);
      this.lightGlowBlue = makeGlowSprite(0x4e7bff, 1.5, 0.55);
      this.lightGlowRed.position.set(-0.27, 0.08, 0);
      this.lightGlowBlue.position.set(0.27, 0.08, 0);
      this.lightbarBase.add(this.lightGlowRed, this.lightGlowBlue);
    }

    this.wheels = [];
    this.frontPivots = [];
    for (const zSide of [1, -1]) {
      for (const xSide of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(xSide * shape.wheelHalfTrack, shape.wheelRadius, zSide * shape.wheelbase / 2);
        const wheel = new THREE.Mesh(getWheelGeometry(), getWheelMaterial());
        wheel.scale.setScalar(shape.wheelRadius / 0.36);
        wheel.castShadow = true;
        pivot.add(wheel);
        this.group.add(pivot);
        this.wheels.push(wheel);
        if (zSide === 1) this.frontPivots.push(pivot);
      }
    }

    this.position.y = 0;
    this.group.position.copy(this.position);
    this.group.rotation.y = yaw;
  }

  get speed() {
    return this.velocity.x * Math.sin(this.yaw) + this.velocity.z * Math.cos(this.yaw);
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  get gear() {
    const forward = this.speed;
    if (forward < -0.5) return 'R';
    if (Math.abs(forward) < 0.5) return 'N';
    const ratio = Math.abs(forward) / this.spec.maxSpeed;
    return String(Math.min(6, 1 + Math.floor(ratio * 5.9)));
  }

  get engineRpm() {
    const ratio = clamp(Math.abs(this.speed) / this.spec.maxSpeed, 0, 1);
    const throttle = Math.max(0, this.controls.throttle);
    if (!this.driver) return 0;
    return clamp(820 + ratio * 4300 + throttle * 900, 820, 6400);
  }

  get engineOn() {
    return Boolean(this.driver);
  }

  get engineState() {
    return {
      on: this.engineOn,
      rpm: this.engineRpm,
      load: Math.abs(this.controls.throttle),
      gear: this.gear,
      speed: this.speed,
    };
  }

  get halfLength() {
    return this.shape.length / 2;
  }

  get halfWidth() {
    return this.shape.width / 2;
  }

  setPose(x, z, yaw = this.yaw) {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.steerAngle = 0;
    this.group.position.set(x, 0, z);
    this.group.rotation.set(0, yaw, 0);
  }

  setDriver(driver) {
    this.driver = driver;
    if (!driver) {
      this.controls.throttle = 0;
      this.controls.brake = 1;
      this.controls.steer = 0;
      this.controls.handbrake = true;
      this.velocity.multiplyScalar(0.9);
    } else {
      this.controls.brake = 0;
      this.controls.handbrake = false;
    }
  }

  localPoint(x, z) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    _local.set(dx * cos - dz * sin, 0, dx * sin + dz * cos);
    return _local;
  }

  distanceToBox(x, z) {
    const local = this.localPoint(x, z);
    const outsideX = Math.max(0, Math.abs(local.x) - this.halfWidth);
    const outsideZ = Math.max(0, Math.abs(local.z) - this.halfLength);
    return Math.hypot(outsideX, outsideZ);
  }

  collidesAt(x, z, world) {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const forwardX = sin;
    const forwardZ = cos;
    const sideX = cos;
    const sideZ = -sin;
    const probes = [
      [0, 0],
      [0, this.halfLength],
      [0, -this.halfLength],
      [this.halfWidth, this.halfLength * 0.82],
      [-this.halfWidth, this.halfLength * 0.82],
      [this.halfWidth, -this.halfLength * 0.82],
      [-this.halfWidth, -this.halfLength * 0.82],
    ];
    for (const [side, forward] of probes) {
      const px = x + forwardX * forward + sideX * side;
      const pz = z + forwardZ * forward + sideZ * side;
      if (world.collides(px, pz, 0.2)) return true;
    }
    return false;
  }

  update(dt, elapsed, world, skids) {
    if (this.removed) return;
    if (this.driver) this.stepPhysics(dt, world, skids);
    else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    this.alignToGround(dt, world);
    this.animate(dt, elapsed);
  }

  stepPhysics(dt, world, skids) {
    const controls = this.controls;
    const spec = this.spec;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const forwardX = sin;
    const forwardZ = cos;
    const sideX = cos;
    const sideZ = -sin;

    let forwardSpeed = this.velocity.x * forwardX + this.velocity.z * forwardZ;
    let lateralSpeed = this.velocity.x * sideX + this.velocity.z * sideZ;

    const throttle = clamp(controls.throttle, -1, 1);
    const brake = clamp(controls.brake, 0, 1);

    if (throttle > 0) {
      if (forwardSpeed < -0.4) {
        forwardSpeed += spec.brake * 0.55 * throttle * dt;
      } else {
        const ratio = clamp(forwardSpeed / spec.maxSpeed, 0, 1);
        const power = spec.acceleration * (1 - ratio * 0.72);
        forwardSpeed += power * throttle * dt;
      }
    } else if (throttle < 0) {
      if (forwardSpeed > 0.4) {
        forwardSpeed += spec.brake * throttle * dt;
      } else {
        const reverseRatio = clamp(-forwardSpeed / spec.reverseSpeed, 0, 1);
        forwardSpeed += spec.acceleration * 0.55 * throttle * (1 - reverseRatio * 0.7) * dt;
      }
    }

    if (brake > 0 && Math.abs(forwardSpeed) > 0.12) {
      forwardSpeed -= Math.sign(forwardSpeed) * spec.brake * brake * dt;
    }

    const rolling = 0.55 + Math.abs(forwardSpeed) * 0.018;
    if (Math.abs(forwardSpeed) > 0.05) forwardSpeed -= Math.sign(forwardSpeed) * rolling * dt;
    else if (Math.abs(throttle) < 0.02) forwardSpeed = 0;

    forwardSpeed = clamp(forwardSpeed, -spec.reverseSpeed, spec.maxSpeed);

    const speedRatio = clamp(Math.abs(forwardSpeed) / spec.maxSpeed, 0, 1);
    const steerLimit = spec.steer * (1 - speedRatio * 0.44);
    const steerTarget = clamp(controls.steer, -1, 1) * steerLimit;
    this.steerAngle = damp(this.steerAngle, steerTarget, 9.5, dt);

    const yawRate = (forwardSpeed / Math.max(0.6, this.shape.wheelbase)) * Math.tan(this.steerAngle)
      * (controls.handbrake ? 1.32 : 1);
    this.yaw += yawRate * dt;

    let grip = spec.grip;
    if (controls.handbrake) grip = 1.15;
    else grip *= 1 - clamp(Math.abs(lateralSpeed) / 22, 0, 0.36);
    lateralSpeed *= Math.exp(-grip * dt);

    if (controls.handbrake && Math.abs(forwardSpeed) > 0.2) {
      forwardSpeed -= Math.sign(forwardSpeed) * 5.4 * dt;
    }

    const newSin = Math.sin(this.yaw);
    const newCos = Math.cos(this.yaw);
    this.velocity.x = newSin * forwardSpeed + newCos * lateralSpeed;
    this.velocity.z = newCos * forwardSpeed - newSin * lateralSpeed;

    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    const distance = Math.hypot(dx, dz);
    const substeps = clamp(Math.ceil(distance / 0.72), 1, 7);
    const stepX = dx / substeps;
    const stepZ = dz / substeps;
    for (let i = 0; i < substeps; i += 1) {
      const nextX = this.position.x + stepX;
      const nextZ = this.position.z + stepZ;
      if (!this.collidesAt(nextX, nextZ, world)) {
        this.position.x = nextX;
        this.position.z = nextZ;
        continue;
      }
      const movedX = !this.collidesAt(nextX, this.position.z, world);
      const movedZ = !this.collidesAt(this.position.x, nextZ, world);
      if (movedX) this.position.x = nextX;
      if (movedZ) this.position.z = nextZ;
      this.velocity.x *= movedX ? 0.45 : -0.08;
      this.velocity.z *= movedZ ? 0.45 : -0.08;
      this.impact = Math.min(1, this.impact + Math.abs(forwardSpeed) * 0.035);
      break;
    }

    if (this.position.x < WORLD.bounds.minX + 1 || this.position.x > WORLD.bounds.maxX - 1
      || this.position.z < WORLD.bounds.minZ + 1 || this.position.z > WORLD.bounds.maxZ - 1) {
      this.velocity.multiplyScalar(0.2);
    }

    this.impact = damp(this.impact, 0, 7, dt);

    const skidding = Math.abs(lateralSpeed) > 2.3
      || (controls.handbrake && Math.abs(forwardSpeed) > 3.5)
      || (brake > 0.65 && Math.abs(forwardSpeed) > 11);
    if (skids && skidding) {
      this.skidDistance += distance;
      if (this.skidDistance > 0.34) {
        this.skidDistance = 0;
        const travel = Math.hypot(this.velocity.x, this.velocity.z) || 1;
        const directionX = this.velocity.x / travel;
        const directionZ = this.velocity.z / travel;
        const rearZ = -this.shape.wheelbase / 2;
        for (const side of [-1, 1]) {
          const wheelX = this.position.x + newCos * side * this.shape.wheelHalfTrack + newSin * rearZ;
          const wheelZ = this.position.z - newSin * side * this.shape.wheelHalfTrack + newCos * rearZ;
          const ground = world.groundHeightAt(wheelX, wheelZ);
          skids.add(wheelX, wheelZ, directionX, directionZ, ground, 0.28, 0.74);
        }
      }
    } else {
      this.skidDistance = 0;
    }
  }

  alignToGround(dt, world) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const frontX = this.position.x + sin * this.halfLength * 0.82;
    const frontZ = this.position.z + cos * this.halfLength * 0.82;
    const rearX = this.position.x - sin * this.halfLength * 0.82;
    const rearZ = this.position.z - cos * this.halfLength * 0.82;
    const leftX = this.position.x + cos * this.halfWidth;
    const leftZ = this.position.z - sin * this.halfWidth;
    const rightX = this.position.x - cos * this.halfWidth;
    const rightZ = this.position.z + sin * this.halfWidth;
    const centerGround = world.groundHeightAt(this.position.x, this.position.z);
    const frontGround = world.groundHeightAt(frontX, frontZ);
    const rearGround = world.groundHeightAt(rearX, rearZ);
    const leftGround = world.groundHeightAt(leftX, leftZ);
    const rightGround = world.groundHeightAt(rightX, rightZ);
    const ground = Math.max(centerGround, frontGround, rearGround, leftGround, rightGround);
    const targetPitch = -Math.atan2(frontGround - rearGround, this.halfLength * 1.64);
    const targetRoll = Math.atan2(rightGround - leftGround, this.halfWidth * 2);
    this.pitch = damp(this.pitch, targetPitch, 10, dt);
    this.roll = damp(this.roll, targetRoll, 10, dt);
    const targetY = ground + this.impact * 0.045;
    this.position.y = damp(this.position.y, targetY, 18, dt);
    this.group.position.set(this.position.x, this.position.y, this.position.z);
    this.group.rotation.set(this.pitch, this.yaw, this.roll);
  }

  animate(dt, elapsed) {
    const forwardSpeed = this.speed;
    this.wheelSpin += (forwardSpeed / Math.max(0.12, this.shape.wheelRadius)) * dt;
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelSpin;
    const visualSteer = this.driver ? this.steerAngle : 0;
    for (const pivot of this.frontPivots) pivot.rotation.y = visualSteer;

    const braking = Boolean(this.driver) && (this.controls.brake > 0.35
      || (this.controls.throttle < 0 && forwardSpeed > 0.2)
      || this.controls.handbrake);
    const reversing = Boolean(this.driver) && forwardSpeed < -0.4;
    if (this.tailMaterial) {
      if (reversing) this.tailMaterial.color.setHex(0xffd9c4);
      else if (braking && Math.sin(elapsed * 9) > -0.6) this.tailMaterial.color.setHex(0xff5a3c);
      else this.tailMaterial.color.setHex(0x9c2218);
    }

    if (this.lightbarRed) {
      const phase = Math.floor(elapsed * 7) % 4;
      const redOn = phase === 0 || phase === 1;
      const blueOn = phase === 2 || phase === 3;
      this.lightbarRed.material.color.setHex(redOn ? 0xff3526 : 0x43090b);
      this.lightbarBlue.material.color.setHex(blueOn ? 0x3d63ff : 0x0a0d3a);
      this.lightGlowRed.material.opacity = redOn ? 0.68 : 0.06;
      this.lightGlowBlue.material.opacity = blueOn ? 0.68 : 0.06;
    }
  }

  dispose() {
    this.removed = true;
    this.group.removeFromParent();
    this.paintMaterial.dispose();
    this.tailMaterial.dispose();
    if (this.lightbarRed) {
      this.lightbarRed.material.dispose();
      this.lightbarBlue.material.dispose();
      this.lightGlowRed.material.dispose();
      this.lightGlowBlue.material.dispose();
      this.decalMesh.material.dispose();
    }
  }
}

function buildPoliceDecalGeometry(shape) {
  const parts = [];
  for (const side of [-1, 1]) {
    parts.push({
      geometry: new THREE.PlaneGeometry(1.5, 0.38),
      matrix: matrixFor(side * (shape.width / 2 + 0.012), 0.66, -0.05, { ry: side * Math.PI / 2 }),
    });
  }
  return mergeGeometries(parts);
}

export class Vehicles {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.skids = new SkidMarks(scene);
  }

  spawn(type, options = {}) {
    const vehicle = new Vehicle(type, options);
    if (options.driver) vehicle.setDriver(options.driver);
    if (options.speed) {
      vehicle.velocity.set(Math.sin(vehicle.yaw) * options.speed, 0, Math.cos(vehicle.yaw) * options.speed);
    }
    this.scene.add(vehicle.group);
    this.list.push(vehicle);
    return vehicle;
  }

  remove(vehicle) {
    const index = this.list.indexOf(vehicle);
    if (index !== -1) this.list.splice(index, 1);
    vehicle.dispose();
  }

  clear() {
    for (const vehicle of [...this.list]) vehicle.dispose();
    this.list.length = 0;
    this.skids.reset();
  }

  update(dt, elapsed) {
    for (const vehicle of this.list) vehicle.update(dt, elapsed, this.world, this.skids);
    this.resolveContacts();
  }

  resolveContacts() {
    const cars = this.list;
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.removed) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.removed) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        if (Math.abs(dx) > 7 || Math.abs(dz) > 7) continue;

        // Three circles down each car's spine read the body as a capsule: wide
        // enough to catch a bumper, narrow enough to let neighbouring lanes
        // pass without pushing each other around.
        const radiusA = a.halfWidth + 0.16;
        const radiusB = b.halfWidth + 0.16;
        const sinA = Math.sin(a.yaw);
        const cosA = Math.cos(a.yaw);
        const sinB = Math.sin(b.yaw);
        const cosB = Math.cos(b.yaw);
        let overlap = 0;
        let nx = 0;
        let nz = 0;
        for (const offsetA of [-a.halfLength * 0.58, 0, a.halfLength * 0.58]) {
          const ax = a.position.x + sinA * offsetA;
          const az = a.position.z + cosA * offsetA;
          for (const offsetB of [-b.halfLength * 0.58, 0, b.halfLength * 0.58]) {
            const bx = b.position.x + sinB * offsetB;
            const bz = b.position.z + cosB * offsetB;
            const cdx = bx - ax;
            const cdz = bz - az;
            const distance = Math.hypot(cdx, cdz);
            const minDistance = radiusA + radiusB;
            if (distance >= minDistance || distance < 1e-4) continue;
            const penetration = minDistance - distance;
            if (penetration > overlap) {
              overlap = penetration;
              nx = cdx / distance;
              nz = cdz / distance;
            }
          }
        }
        if (overlap <= 0) continue;

        const push = overlap * 0.5;
        const aMoving = Boolean(a.driver);
        const bMoving = Boolean(b.driver);
        if (aMoving) { a.position.x -= nx * push; a.position.z -= nz * push; }
        if (bMoving) { b.position.x += nx * push; b.position.z += nz * push; }
        if (!aMoving && bMoving) { b.position.x += nx * push; b.position.z += nz * push; }
        if (!bMoving && aMoving) { a.position.x -= nx * push; a.position.z -= nz * push; }
        a.velocity.multiplyScalar(aMoving ? 0.68 : 1);
        b.velocity.multiplyScalar(bMoving ? 0.68 : 1);
        a.impact = Math.min(1, a.impact + 0.22);
        b.impact = Math.min(1, b.impact + 0.22);
      }
    }
  }

  nearestEnterable(point, reach = 2.0) {
    let best = null;
    let bestDistance = reach;
    for (const vehicle of this.list) {
      if (vehicle.removed) continue;
      if (vehicle.driver === 'player') continue;
      if (Math.abs(vehicle.speed) > 4.5) continue;
      const distance = vehicle.distanceToBox(point.x, point.z);
      if (distance < bestDistance) {
        best = vehicle;
        bestDistance = distance;
      }
    }
    return best;
  }

  blocksPoint(x, z, radius, ignore = null) {
    for (const vehicle of this.list) {
      if (vehicle === ignore || vehicle.removed) continue;
      const local = vehicle.localPoint(x, z);
      if (Math.abs(local.x) < vehicle.halfWidth + radius && Math.abs(local.z) < vehicle.halfLength + radius) {
        return vehicle;
      }
    }
    return null;
  }

  closestTo(x, z, maxDistance = 120) {
    let best = null;
    let bestDistance = maxDistance * maxDistance;
    for (const vehicle of this.list) {
      const dx = vehicle.position.x - x;
      const dz = vehicle.position.z - z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        best = vehicle;
        bestDistance = distance;
      }
    }
    return best;
  }

  get count() {
    return this.list.length;
  }
}
