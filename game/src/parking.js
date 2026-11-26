// The Solano Mall parking lot behind the building: 26 stalls in two rows with
// a six-metre aisle, static cars rendered as per-type instanced bodies, a
// staggering clock-driven occupancy, theft with E, and the basic player valet
// service. Every occupied static stall owns a solid AABB collider; stealing or
// emptying a stall removes it, so a player never stands in an empty slot that
// still thinks it holds a car.

import * as THREE from '../vendor/three.module.js';
import { WORLD } from './config.js';
import { periodAt } from './environment.js';
import { makeRng } from './random.js';
import { makeSignTexture, mergeGeometries } from './geo.js';
import { addBox, addCylinder, basicMaterial, material } from './world-kit.js';
import { pickVehicleColor, vehicleBodyGeometry, vehicleShape } from './vehicles.js';

const LOT_MIN_X = 38;
const LOT_MAX_X = 70;
const LOT_MIN_Z = -16;
const LOT_MAX_Z = 0;
const SLOT_WIDTH = 2.4;
const SLOT_DEPTH = 5.0;
const FIRST_SLOT_X = 39.6;
const ROWS = [
  { row: 'A', z: -13.5, yaw: 0 },
  { row: 'B', z: -2.5, yaw: Math.PI },
];
const STATIC_TYPES = ['sedan', 'taxi', 'sports', 'muscle', 'van', 'pickup'];
const OCCUPANCY = { night: 0.2, dawn: 0.35, day: 0.65, dusk: 0.9 };
const REAL_SLOT_KEYS = new Set(['A-10', 'A-11', 'A-12', 'B-11', 'B-12']);
const WHEEL_GEOMETRY = (() => {
  const geometry = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
})();

export class ParkingLot {
  constructor(world, vehicles, traffic, player, mall) {
    this.world = world;
    this.vehicles = vehicles;
    this.traffic = traffic;
    this.player = player;
    this.mall = mall;
    this.onToast = null;
    this.rng = makeRng(0x504b);
    this.slots = [];
    this.valets = [];
    this.occupied = 0;
    this.clockMinutes = 18 * 60;
    this.changeTimer = 0;
    this.valetTimer = 0;
    this.valet = null;
    this.stolenCount = 0;
    this.entrance = { x: 68.2, z: -7.5, yaw: Math.PI / 2 };
    this.valetZone = { minX: 66.0, maxX: 69.6, minZ: -8.8, maxZ: -6.2 };
    this.podium = { x: 69.0, z: -10.4, yaw: -Math.PI / 2 };

    this.paintMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.36,
    });
    this.wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x17141d,
      roughness: 0.74,
      metalness: 0.2,
    });
    this.paintMeshes = new Map();
    for (const type of STATIC_TYPES) {
      const mesh = new THREE.InstancedMesh(vehicleBodyGeometry(type), this.paintMaterial, this.slots.length || 26);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      world.root.add(mesh);
      this.paintMeshes.set(type, mesh);
    }
    this.wheelMesh = new THREE.InstancedMesh(WHEEL_GEOMETRY, this.wheelMaterial, 26 * 4);
    this.wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheelMesh.castShadow = true;
    this.wheelMesh.frustumCulled = false;
    this.wheelMesh.count = 0;
    world.root.add(this.wheelMesh);

    this.buildSurface();
    this.buildSlots();
    this.reset(18 * 60);
  }

  // ---------------------------------------------------------------- build

  buildSurface() {
    const parts = [];
    const y = WORLD.sidewalkHeight;
    // The asphalt slab, stripes and lot lighting live in one vertex-coloured
    // batch. The lot itself stays drivable; only the stalls own car colliders.
    addBox(parts, LOT_MAX_X - LOT_MIN_X, 0.02, LOT_MAX_Z - LOT_MIN_Z, (LOT_MIN_X + LOT_MAX_X) / 2, y + 0.012, -8, 0x211d27);
    for (const row of ROWS) {
      for (let i = 0; i <= 13; i += 1) {
        addBox(parts, 0.07, 0.006, SLOT_DEPTH, LOT_MIN_X + 0.4 + i * SLOT_WIDTH, y + 0.028, row.z, 0xd8cbb2);
      }
      addBox(parts, LOT_MAX_X - LOT_MIN_X - 0.8, 0.006, 0.08, (LOT_MIN_X + LOT_MAX_X) / 2, y + 0.028, row.z - SLOT_DEPTH / 2, 0xd8cbb2);
      addBox(parts, LOT_MAX_X - LOT_MIN_X - 0.8, 0.006, 0.08, (LOT_MIN_X + LOT_MAX_X) / 2, y + 0.028, row.z + SLOT_DEPTH / 2, 0xd8cbb2);
    }
    // A teal box marks the valet zone; the aisle stays open.
    const zone = this.valetZone;
    addBox(parts, zone.maxX - zone.minX, 0.008, zone.maxZ - zone.minZ, (zone.minX + zone.maxX) / 2, y + 0.034, (zone.minZ + zone.maxZ) / 2, 0x1f6d68);
    for (const [x, z] of [[40, -1.6], [68, -1.6], [40, -14.4], [68, -14.4]]) {
      addCylinder(parts, 0.08, 0.1, 5.2, 6, x, y + 2.6, z, 0x3a3442);
      addBox(parts, 0.9, 0.12, 0.34, x, y + 5.16, z, 0xffd9a3);
    }
    const mesh = new THREE.Mesh(
      mergeGeometries(parts),
      material(0xffffff, { vertexColors: true, roughness: 0.82, metalness: 0.05 }),
    );
    mesh.receiveShadow = true;
    this.world.root.add(mesh);
    // Two soft pool lights so the stripes read at night without four more
    // point lights in the scene.
    for (const [x, z] of [[44, -8], [64, -8]]) {
      const light = new THREE.PointLight(0xffdfae, 36, 22, 2);
      light.position.set(x, 5.1, z);
      this.world.root.add(light);
    }

    // The valet podium and its sign.
    const podium = this.podium;
    const podiumParts = [];
    addBox(podiumParts, 0.62, 1.1, 0.52, podium.x, y + 0.55, podium.z, 0x4b3c49);
    addBox(podiumParts, 0.72, 0.08, 0.62, podium.x, y + 1.14, podium.z, 0xffc95c);
    const podiumMesh = new THREE.Mesh(
      mergeGeometries(podiumParts),
      material(0xffffff, { vertexColors: true, roughness: 0.6, metalness: 0.2 }),
    );
    podiumMesh.castShadow = true;
    this.world.root.add(podiumMesh);
    this.world.colliders.push({
      kind: 'prop',
      minX: podium.x - 0.32,
      maxX: podium.x + 0.32,
      minZ: podium.z - 0.28,
      maxZ: podium.z + 0.28,
      minY: 0,
      maxY: y + 1.18,
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.6),
      new THREE.MeshBasicMaterial({
        map: makeSignTexture({ title: 'VALET', sub: 'LEAVE THE KEYS', color: '#ffc95c', accent: '#3fe0cf', width: 384, height: 136 }),
        toneMapped: false,
      }),
    );
    sign.position.set(podium.x, y + 1.75, podium.z);
    sign.rotation.y = -Math.PI / 2;
    this.world.root.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), material(0x2a2230));
    post.position.set(podium.x, y + 1.4, podium.z);
    this.world.root.add(post);

    // A glowing pad at the entrance where a retrieved car appears.
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.6),
      basicMaterial(0x3fe0cf, { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(this.entrance.x, y + 0.04, this.entrance.z);
    this.world.root.add(pad);
  }

  buildSlots() {
    let index = 0;
    for (const row of ROWS) {
      for (let i = 0; i < 13; i += 1) {
        const key = `${row.row}-${i}`;
        const type = STATIC_TYPES[Math.floor(this.rng() * STATIC_TYPES.length) % STATIC_TYPES.length];
        const color = pickVehicleColor(this.rng, type);
        const real = REAL_SLOT_KEYS.has(key);
        this.slots.push({
          index,
          key,
          row: row.row,
          lane: i,
          x: FIRST_SLOT_X + i * SLOT_WIDTH,
          z: row.z,
          yaw: row.yaw,
          type,
          color,
          real,
          static: !real,
          // Keep the stall in front of the lot door clear at every occupancy
          // level: a car parked there would block the mall's only lot exit.
          doorClear: key === 'B-6',
          occupied: false,
          reserved: false,
          stolen: false,
          vehicle: null,
          collider: null,
          valet: null,
        });
        index += 1;
      }
    }
  }

  get realCount() {
    return this.slots.filter((slot) => slot.real && slot.vehicle).length;
  }

  // ---------------------------------------------------------------- instancing

  refreshInstances() {
    const counts = new Map(STATIC_TYPES.map((type) => [type, 0]));
    let wheelIndex = 0;
    for (const slot of this.slots) {
      if (!slot.static || !slot.occupied || slot.stolen) continue;
      const mesh = this.paintMeshes.get(slot.type);
      if (!mesh) continue;
      const count = counts.get(slot.type) ?? 0;
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(slot.x, 0, slot.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.yaw),
        new THREE.Vector3(1, 1, 1),
      );
      mesh.setMatrixAt(count, matrix);
      mesh.setColorAt(count, new THREE.Color(slot.color));
      counts.set(slot.type, count + 1);
      const shape = vehicleShape(slot.type);
      const cos = Math.cos(slot.yaw);
      const sin = Math.sin(slot.yaw);
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          const lx = side * (shape.width / 2 - 0.02);
          const lz = end * (shape.wheelbase / 2);
          const wheelMatrix = new THREE.Matrix4().compose(
            new THREE.Vector3(slot.x + lx * cos + lz * sin, shape.wheelRadius, slot.z - lx * sin + lz * cos),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.yaw),
            new THREE.Vector3(1, 1, 1),
          );
          this.wheelMesh.setMatrixAt(wheelIndex, wheelMatrix);
          wheelIndex += 1;
        }
      }
    }
    for (const [type, mesh] of this.paintMeshes) {
      mesh.count = counts.get(type) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.wheelMesh.count = wheelIndex;
    this.wheelMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- slots

  addSlotCollider(slot) {
    if (slot.collider) return;
    const shape = vehicleShape(slot.type);
    const cos = Math.abs(Math.cos(slot.yaw));
    const sin = Math.abs(Math.sin(slot.yaw));
    const halfX = (shape.width / 2) * cos + (shape.length / 2) * sin;
    const halfZ = (shape.width / 2) * sin + (shape.length / 2) * cos;
    slot.collider = {
      kind: 'parked-car',
      minX: slot.x - halfX,
      maxX: slot.x + halfX,
      minZ: slot.z - halfZ,
      maxZ: slot.z + halfZ,
      minY: 0,
      maxY: 1.45,
    };
    this.world.colliders.push(slot.collider);
  }

  removeSlotCollider(slot) {
    if (!slot.collider) return;
    const index = this.world.colliders.indexOf(slot.collider);
    if (index >= 0) this.world.colliders.splice(index, 1);
    slot.collider = null;
  }

  setSlotOccupied(slot, occupied) {
    if (occupied) {
      if (slot.occupied || slot.stolen || slot.reserved || slot.real || slot.doorClear) return;
      slot.occupied = true;
      this.addSlotCollider(slot);
    } else {
      if (!slot.occupied) return;
      slot.occupied = false;
      this.removeSlotCollider(slot);
    }
    this.refreshInstances();
  }

  targetFor(minutes) {
    const share = OCCUPANCY[periodAt(minutes)] ?? OCCUPANCY.night;
    return Math.round(this.slots.length * share);
  }

  staticTarget(minutes) {
    return Math.max(0, this.targetFor(minutes) - this.realCount);
  }

  settle(minutes) {
    const target = this.staticTarget(minutes);
    const candidates = this.slots.filter((slot) => slot.static && !slot.stolen && !slot.reserved && !slot.doorClear);
    for (const slot of candidates) {
      if (slot.occupied) this.setSlotOccupied(slot, false);
    }
    for (let i = 0; i < target && i < candidates.length; i += 1) {
      this.setSlotOccupied(candidates[i], true);
    }
    this.recalcOccupied();
  }

  recalcOccupied() {
    this.occupied = this.slots.filter((slot) => (slot.static && slot.occupied && !slot.stolen) || (slot.real && slot.vehicle)).length;
    this.stolenCount = this.slots.filter((slot) => slot.stolen).length;
  }

  spawnRealCars() {
    for (const slot of this.slots) {
      if (!slot.real) continue;
      if (slot.vehicle && !slot.vehicle.removed) continue;
      const car = this.vehicles.spawn(slot.type, { x: slot.x, z: slot.z, yaw: slot.yaw, color: slot.color });
      car.setDriver(null);
      slot.vehicle = car;
      slot.occupied = false;
      slot.stolen = false;
    }
  }

  reset(minutes = this.clockMinutes) {
    this.clockMinutes = minutes;
    for (const slot of this.slots) {
      this.removeSlotCollider(slot);
      slot.occupied = false;
      slot.stolen = false;
      slot.reserved = false;
      slot.valet = null;
      if (slot.real) slot.vehicle = null;
      else slot.vehicle = null;
    }
    this.valet = null;
    this.changeTimer = 0;
    this.valetTimer = 0;
    this.spawnRealCars();
    this.settle(minutes);
    this.buildValetPeds();
  }

  // ---------------------------------------------------------------- valet peds

  buildValetPeds() {
    this.valets = [];
    if (!this.traffic || typeof this.traffic.spawnPed !== 'function') return;
    for (let i = 0; i < 2; i += 1) {
      const x = this.podium.x - 1.4 + i * 1.4;
      const z = this.podium.z + 1.1;
      const ped = this.traffic.spawnPed({
        x,
        z,
        yaw: -Math.PI / 2,
        mode: 'idle',
        anchor: { x, z },
        phase: i * 1.7,
        valet: true,
      });
      if (!ped) continue;
      ped.speed = 1.05;
      ped.pause = 0.4;
      ped.target = { x, z };
      this.valets.push(ped);
    }
  }

  updateValets(dt) {
    for (const ped of this.valets) {
      if (!ped.active) continue;
      // A valet walking to a just-parked car resumes the podium loop after a
      // while; this is theater only, the car is already stored.
      if (ped.valetTask === 'parked' && Math.hypot(ped.x - ped.target.x, ped.z - ped.target.z) < 0.5) {
        ped.valetWait = (ped.valetWait ?? 0) + dt;
        if (ped.valetWait > 3) {
          ped.valetWait = 0;
          ped.valetTask = null;
          ped.target = { x: this.podium.x - 1.2, z: this.podium.z + 1.2 };
        }
      }
    }
    this.valetTimer -= dt;
    if (this.valetTimer > 0) return;
    this.valetTimer = 9;
    const ped = this.valets.find((entry) => entry.active && !entry.valetTask);
    if (!ped) return;
    const stall = this.slots[(Math.floor(this.rng() * this.slots.length) + 3) % this.slots.length];
    ped.valetTask = 'wander';
    ped.target = { x: stall.x + 1.2, z: stall.z + 3.2 };
    ped.pause = 0;
  }

  sendValetTo(slot) {
    const ped = this.valets.find((entry) => entry.active);
    if (!ped) return;
    ped.valetTask = 'parked';
    ped.valetWait = 0;
    ped.pause = 0;
    ped.target = { x: slot.x + 1.3, z: slot.z };
  }

  // ---------------------------------------------------------------- queries

  parkedNear(point, reach = 2.0) {
    let best = null;
    let bestDistance = reach;
    for (const slot of this.slots) {
      if (!slot.static || !slot.occupied || slot.stolen || slot.doorClear) continue;
      const distance = Math.hypot(slot.x - point.x, slot.z - point.z);
      if (distance < bestDistance) {
        best = slot;
        bestDistance = distance;
      }
    }
    return best;
  }

  atValetZone(point) {
    const zone = this.valetZone;
    return point.x >= zone.minX && point.x <= zone.maxX && point.z >= zone.minZ && point.z <= zone.maxZ;
  }

  atPodium(point, reach = 2.2) {
    return Math.hypot(this.podium.x - point.x, this.podium.z - point.z) <= reach;
  }

  // ---------------------------------------------------------------- theft

  steal(slot) {
    if (!slot || !slot.static || !slot.occupied || slot.stolen || slot.doorClear) return null;
    slot.occupied = false;
    slot.stolen = true;
    this.removeSlotCollider(slot);
    const car = this.vehicles.spawn(slot.type, {
      x: slot.x,
      z: slot.z,
      yaw: slot.yaw,
      color: slot.color,
      driver: 'player',
    });
    slot.vehicle = car;
    this.refreshInstances();
    this.recalcOccupied();
    if (this.player) this.player.enterVehicle(car);
    if (this.onToast) this.onToast({ title: 'Car Stolen', sub: `${car.name.toUpperCase()} · LEAVE THE LOT`, life: 2.4 });
    return car;
  }

  // ---------------------------------------------------------------- valet service

  parkValet(car) {
    const player = this.player;
    if (!car || !player || player.driving !== car) return false;
    if (!this.atValetZone(car.position) || Math.abs(car.speed) >= 0.5) return false;
    const slot = this.slots.find((entry) => entry.static && !entry.occupied && !entry.stolen && !entry.reserved && !entry.doorClear);
    if (!slot) return false;
    const type = car.type;
    const color = car.color;
    slot.reserved = true;
    slot.valet = { type, color };
    player.exitVehicle();
    this.vehicles.remove(car);
    this.valet = { type, color, slot, time: 0 };
    this.sendValetTo(slot);
    this.refreshInstances();
    if (this.onToast) this.onToast({ title: 'Valet Parked', sub: 'PRESS E AT THE PODIUM TO RETRIEVE', life: 3.0 });
    return true;
  }

  retrieveValet() {
    if (!this.valet) return null;
    const { type, color, slot } = this.valet;
    const offsets = [[0, 0], [0, 2.2], [0, -2.2], [2.4, 0], [-2.4, 0], [0, 4.0], [4.0, 0]];
    let spot = null;
    for (const [dx, dz] of offsets) {
      const x = this.entrance.x + dx;
      const z = this.entrance.z + dz;
      if (this.world.collides(x, z, 1.2)) continue;
      if (this.vehicles.blocksPoint(x, z, 1.2)) continue;
      spot = { x, z };
      break;
    }
    if (!spot) spot = { x: this.entrance.x, z: this.entrance.z };
    const car = this.vehicles.spawn(type, { x: spot.x, z: spot.z, yaw: this.entrance.yaw, color });
    car.setDriver(null);
    slot.reserved = false;
    slot.valet = null;
    this.valet = null;
    if (this.onToast) this.onToast({ title: 'Valet Returned', sub: 'YOUR CAR IS AT THE ENTRANCE', life: 2.6 });
    return car;
  }

  // ---------------------------------------------------------------- frame

  update(dt, clockMinutes) {
    if (Number.isFinite(clockMinutes)) this.clockMinutes = clockMinutes;
    // A real car driven off its stall no longer occupies it.
    for (const slot of this.slots) {
      if (!slot.real || !slot.vehicle) continue;
      const car = slot.vehicle;
      if (car.removed || car.driver === 'player' || Math.hypot(car.position.x - slot.x, car.position.z - slot.z) > 3.2) {
        slot.vehicle = null;
      }
    }

    this.changeTimer -= dt;
    if (this.changeTimer <= 0) {
      this.changeTimer = 0.15;
      const target = this.staticTarget(this.clockMinutes);
      const candidates = this.slots.filter((slot) => slot.static && !slot.stolen && !slot.reserved && !slot.doorClear);
      const filled = candidates.filter((slot) => slot.occupied).length;
      if (filled < target) {
        const slot = candidates.find((entry) => !entry.occupied);
        if (slot) this.setSlotOccupied(slot, true);
      } else if (filled > target) {
        const slot = [...candidates].reverse().find((entry) => entry.occupied);
        if (slot) this.setSlotOccupied(slot, false);
      }
    }

    if (this.valet) this.valet.time += dt;
    this.updateValets(dt);
    this.recalcOccupied();
  }
}
