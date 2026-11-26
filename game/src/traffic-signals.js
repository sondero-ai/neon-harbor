// Visible intersection signals. One shared two-phase clock drives both the
// car AI and the lamps, so the light a driver sees and the rule that stops it
// can never disagree. The merged pole/housing pass is one draw; each colour
// and axis is one instanced lamp set; a single instanced pool carries the
// night spill.

import * as THREE from '../vendor/three.module.js';
import { ROADS_X, ROADS_Z, WORLD } from './config.js';
import { makeGlowTexture, mergeGeometries } from './geo.js';

export const SIGNAL_CYCLE = 18;
export const SIGNAL_GREEN = 7.5;
export const SIGNAL_AMBER = 1.5;

const POLE_HEIGHT = 5.4;
const HEAD_Y = 4.55;
const CORNER = 7.0;
const HEAD_OFFSET = 4.2;
const RED = 0xff3b30;
const AMBER = 0xffb020;
const GREEN = 0x39e06a;

/** The shared lamp and car rule: green, amber, red on an 18 s cycle. */
export function signalState(axis, elapsed) {
  const t = ((elapsed % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const own = axis === 'x' ? t : (t + SIGNAL_CYCLE / 2) % SIGNAL_CYCLE;
  if (own < SIGNAL_GREEN) return 'green';
  if (own < SIGNAL_GREEN + SIGNAL_AMBER) return 'amber';
  return 'red';
}

function pushBox(parts, width, height, depth, x, y, z, color) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  parts.push({ geometry, color });
}

function pushCylinder(parts, radiusTop, radiusBottom, height, segments, x, y, z, color) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  geometry.translate(x, y, z);
  parts.push({ geometry, color });
}

function lampMatrix(position, rotation, scale = 1) {
  return new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromEuler(rotation),
    new THREE.Vector3(scale, scale, scale),
  );
}

export class TrafficSignals {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'traffic-signals';
    scene.add(this.root);
    this.intersections = ROADS_X.length * ROADS_Z.length;
    this.elapsed = -1;
    this.night = 1;
    this.lampMaterials = new Map();
    this.build();
    this.update(0, true);
  }

  build() {
    const parts = [];
    const lampPositions = { x: [], z: [] };
    const poolPositions = [];
    for (const rx of ROADS_X) {
      for (const rz of ROADS_Z) {
        const poleX = rx + CORNER;
        const poleZ = rz + CORNER;
        pushCylinder(parts, 0.11, 0.13, POLE_HEIGHT, 8, poleX, POLE_HEIGHT / 2, poleZ, 0x2b2533);
        pushCylinder(parts, 0.22, 0.26, 0.32, 8, poleX, 0.16, poleZ, 0x211c27);
        // Arm and housing for x traffic: lamps face along +/- x.
        pushBox(parts, HEAD_OFFSET - 0.4, 0.1, 0.1, poleX - (HEAD_OFFSET + 0.4) / 2, 5.08, poleZ, 0x2b2533);
        pushBox(parts, 0.5, 1.42, 0.56, poleX - HEAD_OFFSET, HEAD_Y, poleZ, 0x17131c);
        pushBox(parts, 0.62, 0.09, 0.68, poleX - HEAD_OFFSET, HEAD_Y + 0.78, poleZ, 0x241e2a);
        // Arm and housing for z traffic: lamps face along +/- z.
        pushBox(parts, 0.1, 0.1, HEAD_OFFSET - 0.4, poleX, 5.08, poleZ - (HEAD_OFFSET + 0.4) / 2, 0x2b2533);
        pushBox(parts, 0.56, 1.42, 0.5, poleX, HEAD_Y, poleZ - HEAD_OFFSET, 0x17131c);
        pushBox(parts, 0.68, 0.09, 0.62, poleX, HEAD_Y + 0.78, poleZ - HEAD_OFFSET, 0x241e2a);

        for (const side of [-1, 1]) {
          for (const [color, y] of [[RED, HEAD_Y + 0.42], [AMBER, HEAD_Y], [GREEN, HEAD_Y - 0.42]]) {
            lampPositions.x.push({
              matrix: lampMatrix(
                new THREE.Vector3(poleX - HEAD_OFFSET + side * 0.31, y, poleZ),
                new THREE.Euler(0, 0, Math.PI / 2),
              ),
              color,
            });
            lampPositions.z.push({
              matrix: lampMatrix(
                new THREE.Vector3(poleX, y, poleZ - HEAD_OFFSET + side * 0.31),
                new THREE.Euler(Math.PI / 2, 0, 0),
              ),
              color,
            });
          }
        }
        poolPositions.push({ x: rx, z: rz });
      }
    }

    const poleGeometry = mergeGeometries(parts);
    const poleMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.32,
    });
    const poleMesh = new THREE.Mesh(poleGeometry, poleMaterial);
    poleMesh.castShadow = true;
    poleMesh.receiveShadow = true;
    this.root.add(poleMesh);

    const lampGeometry = new THREE.CylinderGeometry(0.155, 0.155, 0.08, 10);
    this.axisMeshes = { x: {}, z: {} };
    for (const axis of ['x', 'z']) {
      for (const [name, color] of [['red', RED], ['amber', AMBER], ['green', GREEN]]) {
        const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
        this.lampMaterials.set(`${axis}-${name}`, material);
        const group = lampPositions[axis].filter((lamp) => lamp.color === color);
        const mesh = new THREE.InstancedMesh(lampGeometry, material, group.length);
        group.forEach((lamp, index) => mesh.setMatrixAt(index, lamp.matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.visible = false;
        this.axisMeshes[axis][name] = mesh;
        this.root.add(mesh);
      }
    }

    const quad = new THREE.PlaneGeometry(6.4, 6.4);
    quad.rotateX(-Math.PI / 2);
    this.poolMaterial = new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.poolMesh = new THREE.InstancedMesh(quad, this.poolMaterial, poolPositions.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color(GREEN);
    poolPositions.forEach((pool, index) => {
      matrix.makeTranslation(pool.x, 0.035, pool.z);
      this.poolMesh.setMatrixAt(index, matrix);
      this.poolMesh.setColorAt(index, color);
    });
    this.poolMesh.instanceMatrix.needsUpdate = true;
    if (this.poolMesh.instanceColor) this.poolMesh.instanceColor.needsUpdate = true;
    this.poolMesh.frustumCulled = false;
    this.root.add(this.poolMesh);
  }

  update(elapsed, force = false) {
    const time = Number.isFinite(elapsed) ? elapsed : 0;
    if (!force && time === this.elapsed) return;
    this.elapsed = time;
    const stateX = signalState('x', time);
    const stateZ = signalState('z', time);
    for (const axis of ['x', 'z']) {
      const state = axis === 'x' ? stateX : stateZ;
      for (const name of ['red', 'amber', 'green']) {
        this.axisMeshes[axis][name].visible = state === name;
      }
    }
    const poolState = stateX;
    const poolColor = poolState === 'red' ? RED : poolState === 'amber' ? AMBER : GREEN;
    const pool = new THREE.Color(poolColor);
    for (let i = 0; i < this.poolMesh.count; i += 1) this.poolMesh.setColorAt(i, pool);
    if (this.poolMesh.instanceColor) this.poolMesh.instanceColor.needsUpdate = true;
  }

  stateAt(elapsed = this.elapsed) {
    return { x: signalState('x', elapsed), z: signalState('z', elapsed) };
  }

  get state() {
    return this.stateAt();
  }

  /** Which colour lamp set is currently visible for an axis. */
  lamps(axis) {
    const set = axis === 'z' ? this.axisMeshes.z : this.axisMeshes.x;
    for (const name of ['red', 'amber', 'green']) {
      if (set[name].visible) return name;
    }
    return null;
  }

  at(x, z) {
    for (const rx of ROADS_X) {
      for (const rz of ROADS_Z) {
        if (Math.abs(x - rx) < 0.5 && Math.abs(z - rz) < 0.5) {
          return { x: rx, z: rz, state: this.state };
        }
      }
    }
    return null;
  }

  applyEnvironment(palette) {
    this.night = palette.street;
    this.poolMaterial.opacity = 0.11 * palette.street;
    this.poolMesh.visible = this.poolMaterial.opacity > 0.01;
    for (const axis of ['x', 'z']) {
      for (const name of ['red', 'amber', 'green']) {
        const material = this.axisMeshes[axis][name].material;
        const base = name === 'red' ? RED : name === 'amber' ? AMBER : GREEN;
        material.color.setHex(base).multiplyScalar(0.72 + 0.28 * palette.window);
      }
    }
  }
}
