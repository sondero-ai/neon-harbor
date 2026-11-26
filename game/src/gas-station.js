// Solano Fuel: the gas station on block (-108, 0). It replaces one generic
// block with a forecourt, a canopy, two pump islands with four nozzles, a
// kiosk with a service bay, an air/water stand and a service lane parallel to
// the x = -81 road. Static geometry is merged by material so the whole
// forecourt costs about a dozen draw calls rather than one per part.
//
// The station also owns the two pump slots and, in a later task, the NPC
// pull-in / pump / pull-out state machine. Pumps, kiosk, canopy columns and
// the air stand are normal world colliders, so walkers and cars resolve
// against them through the existing 2D circle tests.

import * as THREE from '../vendor/three.module.js';
import { WORLD } from './config.js';
import { quoteService } from './fuel.js';
import { makeSignTexture, mergeGeometries } from './geo.js';
import { addBox, addCylinder, basicMaterial, material } from './world-kit.js';

const clamp = THREE.MathUtils.clamp;

export const STATION_BOUNDS = { minX: -128, maxX: -88, minZ: -20, maxZ: 20 };
export const STATION_LABEL = 'SOLANO FUEL';
export const PUMP_POINTS = [
  { x: -97.2, z: -8 },
  { x: -97.2, z: 8 },
];
export const PUMP_SLOTS = [
  { x: -96.5, z: -11, yaw: -Math.PI / 2, pump: 0 },
  { x: -96.5, z: 11, yaw: -Math.PI / 2, pump: 1 },
];

const GROUND = WORLD.sidewalkHeight;
const KIOSK = { minX: -125, maxX: -115, minZ: -4, maxZ: 4 };
const ISLANDS = [
  { x: -100, z: -8 },
  { x: -100, z: 8 },
];
const COLUMNS = [
  { x: -107.5, z: -9 },
  { x: -107.5, z: 9 },
  { x: -92.5, z: -9 },
  { x: -92.5, z: 9 },
];
const AIR_STAND = { x: -116, z: 13 };
const CANOPY = { minX: -108, maxX: -92, minZ: -10, maxZ: 10, y: 4.7 };

function addCollider(world, kind, minX, maxX, minZ, maxZ, maxY) {
  world.colliders.push({ kind, minX, maxX, minZ, maxZ, minY: 0, maxY });
}

function signMesh({ title, sub, color, accent, bg, width = 512, height = 160, planeWidth = 10, planeHeight = 1 }) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(planeWidth, planeHeight),
    new THREE.MeshBasicMaterial({
      map: makeSignTexture({ title, sub, color, accent, bg, width, height }),
      toneMapped: false,
    }),
  );
}

export class GasStation {
  constructor(world) {
    this.world = world;
    this.bounds = { ...STATION_BOUNDS };
    this.label = STATION_LABEL;
    this.pumps = PUMP_POINTS.map((point) => ({ ...point }));
    this.slots = PUMP_SLOTS.map((slot) => ({ ...slot, car: null, phase: 'free', timer: 0 }));
    this.lights = [];
    this.onToast = null;
    this.traffic = null;
    this.vehicles = null;

    const group = new THREE.Group();
    group.name = 'solano-fuel';
    world.root.add(group);
    this.group = group;

    const concrete = [];
    const canopyParts = [];
    const kioskParts = [];
    const islandParts = [];
    const columnParts = [];
    const airParts = [];
    const paint = [];
    const neon = [];
    const glass = [];

    // ---------------------------------------------------------------- slab
    // The forecourt sits on the block's sidewalk plane so cars keep the same
    // ground height they already use everywhere else on the block.
    addBox(concrete, 39.6, 0.12, 39.6, -108, GROUND / 2 - 0.03, 0, 0x3d3946);
    // A lighter apron under the canopy and a darker service-lane band.
    addBox(concrete, 17.4, 0.012, 21.4, -100, GROUND + 0.006, 0, 0x4b4652);
    addBox(concrete, 4.4, 0.014, 38.2, -92, GROUND + 0.007, 0, 0x2f2b36);
    // The two curb cuts into the service lane are flush pads, not kerbs.
    for (const z of [-18, 18]) {
      addBox(concrete, 1.8, 0.04, 4.4, -88.2, GROUND - 0.02, z, 0x8d8579);
    }

    // ---------------------------------------------------------------- canopy
    const width = CANOPY.maxX - CANOPY.minX;
    const depth = CANOPY.maxZ - CANOPY.minZ;
    const cx = (CANOPY.minX + CANOPY.maxX) / 2;
    const cz = (CANOPY.minZ + CANOPY.maxZ) / 2;
    addBox(canopyParts, width, 0.35, depth, cx, 4.55, cz, 0x8f8073);
    addBox(canopyParts, width - 0.6, 0.08, depth - 0.6, cx, 4.34, cz, 0xe6dccb);
    // Fascia: a faded red band on all four edges.
    for (const z of [CANOPY.minZ - 0.12, CANOPY.maxZ + 0.12]) {
      addBox(canopyParts, width + 0.7, 0.62, 0.28, cx, 4.5, z, 0xa63a32);
    }
    for (const x of [CANOPY.minX - 0.12, CANOPY.maxX + 0.12]) {
      addBox(canopyParts, 0.28, 0.62, depth + 0.7, x, 4.5, cz, 0xa63a32);
    }
    // A warm neon edge under the fascia, so the forecourt reads at night.
    for (const z of [CANOPY.minZ + 0.04, CANOPY.maxZ - 0.04]) {
      addBox(neon, width - 0.5, 0.07, 0.1, cx, 4.14, z, 0xffc95c);
    }
    for (const x of [CANOPY.minX + 0.04, CANOPY.maxX - 0.04]) {
      addBox(neon, 0.1, 0.07, depth - 0.5, x, 4.14, cz, 0xffc95c);
    }
    // Two lit strips over the pump rows.
    for (const z of [-4.4, 4.4]) {
      addBox(neon, 12, 0.05, 0.26, cx, 4.3, z, 0xffe4b8);
    }

    // ---------------------------------------------------------------- columns
    for (const column of COLUMNS) {
      addBox(columnParts, 0.5, 4.25, 0.5, column.x, GROUND + 2.125, column.z, 0x2a2230);
      addBox(columnParts, 0.72, 0.16, 0.72, column.x, 4.28, column.z, 0xa63a32);
      addCollider(world, 'station', column.x - 0.25, column.x + 0.25, column.z - 0.25, column.z + 0.25, 4.5);
    }

    // ---------------------------------------------------------------- islands
    for (const island of ISLANDS) {
      addBox(concrete, 6.2, 0.12, 1.4, island.x, GROUND + 0.06, island.z, 0x6b6259);
      addBox(islandParts, 6, 0.95, 1.2, island.x, GROUND + 0.475, island.z, 0xd0c2ad);
      addBox(islandParts, 6.05, 0.07, 1.26, island.x, GROUND + 0.93, island.z, 0x8f8073);
      // Hazard bands at each end of the island.
      for (const end of [-1, 1]) {
        addBox(islandParts, 0.34, 0.62, 1.22, island.x + end * 2.62, GROUND + 0.4, island.z, 0xffc95c);
        addBox(islandParts, 0.34, 0.2, 1.22, island.x + end * 2.62, GROUND + 0.3, island.z, 0x2a2230);
      }
      for (const pumpX of [island.x - 1.2, island.x + 1.2]) {
        addBox(islandParts, 0.72, 0.14, 0.62, pumpX, GROUND + 0.97, island.z, 0x3a303c);
        addBox(islandParts, 0.56, 1.28, 0.46, pumpX, GROUND + 1.66, island.z, 0xe6dccb);
        addBox(islandParts, 0.62, 0.16, 0.5, pumpX, GROUND + 2.3, island.z, 0xa63a32);
        addBox(neon, 0.36, 0.16, 0.48, pumpX, GROUND + 2.02, island.z, 0x3fe0cf);
        // A dark nozzle holster and hose on the road-facing side of each
        // pump, so the island shows four distinct nozzles rather than two
        // overlapping pairs.
        const nozzleX = pumpX + 0.36;
        addBox(islandParts, 0.14, 0.24, 0.14, nozzleX, GROUND + 1.36, island.z + 0.3, 0x1d1a24);
        addCylinder(islandParts, 0.035, 0.035, 1.1, 6, nozzleX, GROUND + 0.85, island.z + 0.3, 0x1d1a24);
      }
      addCollider(world, 'prop', island.x - 3, island.x + 3, island.z - 0.6, island.z + 0.6, 1.05);
    }

    // ---------------------------------------------------------------- kiosk
    const kx = (KIOSK.minX + KIOSK.maxX) / 2;
    const kz = (KIOSK.minZ + KIOSK.maxZ) / 2;
    const kHeight = 3.45;
    const kBase = GROUND;
    // West, north and south walls, then the east wall split by the door.
    addBox(kioskParts, 0.3, kHeight, 8, KIOSK.minX + 0.15, kBase + kHeight / 2, kz, 0x6b4c45);
    addBox(kioskParts, 9.4, kHeight, 0.3, kx, kBase + kHeight / 2, KIOSK.maxZ - 0.15, 0x6b4c45);
    addBox(kioskParts, 9.4, kHeight, 0.3, kx, kBase + kHeight / 2, KIOSK.minZ + 0.15, 0x6b4c45);
    for (const z of [-2.45, 2.45]) {
      addBox(kioskParts, 0.3, kHeight, 3.1, KIOSK.maxX - 0.15, kBase + kHeight / 2, z, 0x6b4c45);
    }
    addBox(kioskParts, 0.3, 0.95, 1.8, KIOSK.maxX - 0.15, kBase + kHeight - 0.475, 0, 0x6b4c45);
    // Roof, parapet and a lit crown.
    addBox(kioskParts, 10.5, 0.28, 8.5, kx, kBase + kHeight + 0.14, kz, 0x3a303c);
    addBox(kioskParts, 10.7, 0.16, 8.7, kx, kBase + kHeight + 0.34, kz, 0x8f8073);
    for (const z of [KIOSK.minZ - 0.28, KIOSK.maxZ + 0.28]) {
      addBox(neon, 10.5, 0.12, 0.14, kx, kBase + kHeight + 0.02, z, 0xffc95c);
    }
    for (const x of [KIOSK.minX - 0.28, KIOSK.maxX + 0.28]) {
      addBox(neon, 0.14, 0.12, 8.5, x, kBase + kHeight + 0.02, kz, 0xffc95c);
    }
    // The east-facing door glass and its frame.
    addBox(glass, 0.06, 2.5, 1.76, KIOSK.maxX - 0.02, kBase + 1.4, 0, 0x8fd8e6);
    for (const z of [-0.92, 0.92]) {
      addBox(kioskParts, 0.12, 2.7, 0.12, KIOSK.maxX - 0.02, kBase + 1.35, z, 0x2a2230);
    }
    addBox(kioskParts, 0.12, 0.12, 1.96, KIOSK.maxX - 0.02, kBase + 2.72, 0, 0x2a2230);
    // A window north of the door.
    addBox(glass, 0.06, 1.4, 2.2, KIOSK.maxX - 0.02, kBase + 1.85, 2.55, 0x8fd8e6);
    // The service-bay roll-up door on the north face.
    addBox(kioskParts, 3.6, 2.8, 0.08, kx, kBase + 1.4, KIOSK.maxZ + 0.03, 0x4b3c49);
    for (let i = 0; i < 4; i += 1) {
      addBox(kioskParts, 3.5, 0.06, 0.1, kx, kBase + 0.62 + i * 0.52, KIOSK.maxZ + 0.05, 0x6b5a66);
    }
    // A small red awning over the east door.
    addBox(kioskParts, 1.1, 0.12, 3.6, KIOSK.maxX + 0.55, kBase + 2.95, 0, 0xa63a32);
    addCollider(world, 'station', KIOSK.minX, KIOSK.maxX, KIOSK.minZ, KIOSK.maxZ, 3.9);

    // ---------------------------------------------------------------- air stand
    addBox(airParts, 0.7, 1.2, 0.7, AIR_STAND.x, GROUND + 0.6, AIR_STAND.z, 0x3a3442);
    addBox(airParts, 0.62, 0.52, 0.62, AIR_STAND.x, GROUND + 1.45, AIR_STAND.z, 0xd0c2ad);
    addBox(neon, 0.42, 0.16, 0.66, AIR_STAND.x, GROUND + 1.46, AIR_STAND.z, 0x3fe0cf);
    addCylinder(airParts, 0.04, 0.04, 1.0, 6, AIR_STAND.x + 0.42, GROUND + 0.65, AIR_STAND.z + 0.28, 0x1d1a24);
    addCollider(world, 'prop', AIR_STAND.x - 0.4, AIR_STAND.x + 0.4, AIR_STAND.z - 0.4, AIR_STAND.z + 0.4, 1.7);

    // ---------------------------------------------------------------- paint
    // Service-lane edges, kept clear of the pump islands and canopy columns.
    for (const x of [-94.1, -89.9]) {
      addBox(paint, 0.08, 0.012, 37, x, GROUND + 0.016, 0, 0xd8cbb2);
    }
    // Painted entry and exit chevrons on the road.
    for (const [z, side] of [[-18, -1], [18, 1]]) {
      addBox(paint, 1.5, 0.012, 0.16, -84.6, 0.025, z + side * -0.55, 0xf2ead7, { ry: 0.55 * side });
      addBox(paint, 1.5, 0.012, 0.16, -84.6, 0.025, z + side * 0.55, 0xf2ead7, { ry: -0.55 * side });
    }
    // Pump bay outlines and stop bars.
    for (const slot of PUMP_SLOTS) {
      for (const z of [slot.z - 1.35, slot.z + 1.35]) {
        addBox(paint, 5.2, 0.012, 0.06, slot.x, GROUND + 0.016, z, 0xffc95c);
      }
      for (const x of [slot.x - 2.6, slot.x + 2.6]) {
        addBox(paint, 0.06, 0.012, 2.7, x, GROUND + 0.016, slot.z, 0xffc95c);
      }
      addBox(paint, 0.14, 0.012, 2.2, slot.x - 2.45, GROUND + 0.017, slot.z, 0xf2ead7);
    }

    // ---------------------------------------------------------------- merging
    const merge = (parts, meshMaterial, { cast = true, receive = true } = {}) => {
      const mesh = new THREE.Mesh(mergeGeometries(parts), meshMaterial);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      group.add(mesh);
      return mesh;
    };
    merge(concrete, material(0xffffff, { vertexColors: true, roughness: 0.86, metalness: 0.03 }));
    merge(canopyParts, material(0xffffff, { vertexColors: true, roughness: 0.72, metalness: 0.12 }));
    merge(kioskParts, material(0xffffff, { vertexColors: true, roughness: 0.78, metalness: 0.06 }));
    merge(islandParts, material(0xffffff, { vertexColors: true, roughness: 0.6, metalness: 0.18 }));
    merge(columnParts, material(0xffffff, { vertexColors: true, roughness: 0.58, metalness: 0.26 }));
    merge(airParts, material(0xffffff, { vertexColors: true, roughness: 0.68, metalness: 0.16 }));
    merge(paint, material(0xffffff, { vertexColors: true, roughness: 0.9, metalness: 0.02 }), { cast: false });
    merge(neon, basicMaterial(0xffffff, { vertexColors: true }), { cast: false, receive: false });
    merge(glass, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.12,
      metalness: 0.4,
      transparent: true,
      opacity: 0.5,
      emissive: 0x1b3d46,
      emissiveIntensity: 0.4,
    }), { cast: false, receive: false });

    // ---------------------------------------------------------------- signs
    const canopySign = signMesh({
      title: STATION_LABEL,
      sub: 'FULL SERVICE · 24H',
      color: '#ffd27d',
      accent: '#3fe0cf',
      bg: '#140c16',
      width: 768,
      height: 160,
      planeWidth: 10.4,
      planeHeight: 1.0,
    });
    canopySign.position.set(CANOPY.maxX + 0.32, 4.5, 0);
    canopySign.rotation.y = Math.PI / 2;
    group.add(canopySign);

    // Lit fascias on the other approaches: cars enter from the south and leave
    // north, so the name must read from both ends of the service lane. The
    // south and north planes share the east sign's geometry and material.
    for (const [z, ry] of [[CANOPY.minZ - 0.32, Math.PI], [CANOPY.maxZ + 0.32, 0]]) {
      const fascia = new THREE.Mesh(canopySign.geometry, canopySign.material);
      fascia.position.set(cx, 4.5, z);
      fascia.rotation.y = ry;
      group.add(fascia);
    }

    const kioskSign = signMesh({
      title: STATION_LABEL,
      sub: 'KIOSK · OPEN 24H',
      color: '#ffd27d',
      accent: '#3fe0cf',
      bg: '#140c16',
      width: 512,
      height: 128,
      planeWidth: 3.2,
      planeHeight: 0.8,
    });
    kioskSign.position.set(KIOSK.maxX + 0.04, 3.12, 0);
    kioskSign.rotation.y = Math.PI / 2;
    group.add(kioskSign);

    const priceBoard = signMesh({
      title: 'FUEL 1.89',
      sub: 'DIESEL 2.05 · AIR FREE',
      color: '#3fe0cf',
      accent: '#ffd27d',
      bg: '#0d1a1c',
      width: 512,
      height: 200,
      planeWidth: 2.2,
      planeHeight: 0.86,
    });
    priceBoard.position.set(KIOSK.maxX + 0.04, 1.95, -2.3);
    priceBoard.rotation.y = Math.PI / 2;
    group.add(priceBoard);
    this.sign = canopySign;

    // ---------------------------------------------------------------- lights
    for (const [x, y, z] of [[-104, 4.2, 0], [-96, 4.2, 0]]) {
      const light = new THREE.PointLight(0xffd9a3, 80, 20, 2);
      light.position.set(x, y, z);
      group.add(light);
      this.lights.push(light);
    }
  }

  /** The nearest nozzle within `reach` of a point, or null. */
  atPump(point, reach = 3.5) {
    if (!point) return null;
    let best = null;
    let bestDistance = reach;
    for (const pump of this.pumps) {
      const distance = Math.hypot(pump.x - point.x, pump.z - point.z);
      if (distance < bestDistance) {
        best = pump;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Fill the tank and repair the body for the quoted total, paid in cash. A
   * full, undamaged car costs nothing and is not a service. A wallet short of
   * the quote is refused with a toast; the car and the cash stay as they were.
   */
  service(player) {
    const car = player?.driving;
    if (!car) return { ok: false, quote: null };
    const quote = quoteService(car);
    if (quote.total <= 0) return { ok: false, quote };
    if (player.cash < quote.total) {
      this.onToast?.({ title: 'NOT ENOUGH CASH', sub: `NEED $${quote.total}`, life: 2.6 });
      return { ok: false, quote };
    }
    player.cash -= quote.total;
    car.fuel = 1;
    car.condition = 1;
    this.onToast?.({ title: 'SERVICE COMPLETE', sub: `$${quote.total} · FULL TANK · BODY REPAIRED`, life: 2.8 });
    return { ok: true, quote };
  }

  /** Clear the slots between city resets; a fresh city has no station cars. */
  reset() {
    for (const slot of this.slots) {
      slot.car = null;
      slot.phase = 'free';
      slot.timer = 0;
    }
  }

  /**
   * Freeze the forecourt for the ?shot=station capture: one car on a pad with
   * the hose out and a low tank, plus a low-fuel car rolling up the lane.
   */
  stageShot({ pump = 0, approach = 'pickup' } = {}) {
    this.reset();
    if (!this.vehicles) return null;
    const slot = this.slots[pump] ?? this.slots[0];

    const car = this.vehicles.spawn('sedan', {
      x: slot.x,
      z: slot.z,
      yaw: slot.yaw,
      fuel: 0.22,
      driver: 'ai',
    });
    car.condition = 0.58;
    car.setPose(slot.x, slot.z, slot.yaw);
    car.controls.throttle = 0;
    car.controls.brake = 1;
    car.controls.steer = 0;
    car.controls.handbrake = false;
    car.ai = {
      mode: 'pump',
      station: {
        slot,
        waypoints: this.pulloutFor(slot),
        index: 0,
        lastX: slot.x,
        lastZ: slot.z,
      },
    };
    slot.car = car;
    slot.phase = 'pump';
    slot.timer = 3;

    if (this.traffic) {
      const lane = this.traffic.spawnLaneCar(approach, 'z', 1, -81, -16, 6, { fuel: 0.24 });
      lane.ai.stationApproach = true;
      lane.controls.brake = 0;
    }
    return car;
  }

  // ---------------------------------------------------------------- NPC flow

  /** True while this station is driving the car through its forecourt. */
  owns(car) {
    return ['pullin', 'pump', 'pullout'].includes(car?.ai?.mode);
  }

  approachFor(slot) {
    if (slot.pump === 0) {
      // Aim at the pad from the entry straight away: the final leg is long
      // enough to line up on a diagonal, so the car never has to make a
      // 90-degree turn inside its own minimum radius next to the slot.
      return [
        { x: -89, z: -19 },
        { x: slot.x, z: slot.z },
      ];
    }
    // Pump 1 is 22 m north of the entry; stay east of the east canopy columns
    // until the open stretch, then take a long diagonal onto the pad.
    return [
      { x: -89, z: -19 },
      { x: -90.4, z: -9 },
      { x: -90.4, z: 4 },
      { x: slot.x, z: slot.z },
    ];
  }

  pulloutFor(slot) {
    if (slot.pump === 0) {
      return [
        { x: -104, z: -11 },
        { x: -111, z: -11 },
        { x: -113, z: -3 },
        { x: -113, z: 11 },
        { x: -104, z: 16 },
        { x: -92, z: 17 },
        { x: -84.2, z: 18 },
      ];
    }
    return [
      { x: -104, z: 11 },
      { x: -111, z: 11 },
      { x: -113, z: 13 },
      { x: -107, z: 17 },
      { x: -92, z: 17.5 },
      { x: -84.2, z: 18 },
    ];
  }

  /**
   * A northbound car on the adjacent lane with a low tank pulls in when the
   * station is on its left, a slot is free and its cooldown has run out.
   * With both pumps busy it keeps driving and waits out a cooldown.
   */
  maybeDivert(car, ai, dt) {
    if (!car || !ai) return false;
    if (ai.stationCooldown > 0) ai.stationCooldown = Math.max(0, ai.stationCooldown - dt);
    if (ai.mode !== 'drive' || ai.axis !== 'z' || ai.line !== -81 || ai.direction !== 1) return false;
    if (car.fuel >= 0.35) return false;
    if (car.position.z <= -26 || car.position.z >= -14) return false;
    if (ai.stationCooldown > 0) return false;
    const slot = this.slots.find((entry) => !entry.car);
    if (!slot) {
      ai.stationCooldown = 20;
      return false;
    }
    slot.car = car;
    slot.phase = 'pullin';
    slot.timer = 0;
    ai.mode = 'pullin';
    ai.stuckTime = 0;
    ai.station = {
      slot,
      waypoints: this.approachFor(slot),
      index: 0,
      lastX: car.position.x,
      lastZ: car.position.z,
    };
    return true;
  }

  /** Drive a station-owned car along its waypoints, pump, and merge back. */
  updateCar(car, dt) {
    const ai = car?.ai;
    const station = ai?.station;
    if (!ai || !station) return;
    if (car.removed) {
      this.releaseCar(car);
      return;
    }
    const slot = station.slot;

    if (ai.mode === 'pump') {
      car.controls.throttle = 0;
      car.controls.brake = 1;
      car.controls.steer = 0;
      car.controls.handbrake = false;
      slot.timer = Math.max(0, slot.timer - dt);
      if (slot.timer <= 0) {
        car.fuel = 1;
        ai.mode = 'pullout';
        ai.stuckTime = 0;
        station.waypoints = this.pulloutFor(slot);
        station.index = 0;
      }
      return;
    }

    const waypoints = station.waypoints;
    const lastIndex = waypoints.length - 1;
    // A car wedged on a collider can still report a nonzero forward speed
    // while its position does not change. Measure real travel instead, so the
    // 12 s fallback always frees the slot a jammed car is holding.
    const moved = Math.hypot(car.position.x - station.lastX, car.position.z - station.lastZ);
    station.lastX = car.position.x;
    station.lastZ = car.position.z;
    let target = waypoints[station.index] ?? waypoints[lastIndex];
    let dx = target.x - car.position.x;
    let dz = target.z - car.position.z;
    let distance = Math.hypot(dx, dz);
    const reached = distance < (station.index === lastIndex ? 1.5 : 2);
    if (reached && station.index < lastIndex) {
      station.index += 1;
      target = waypoints[station.index];
      dx = target.x - car.position.x;
      dz = target.z - car.position.z;
      distance = Math.hypot(dx, dz);
    }
    const isLast = station.index === lastIndex;

    if (ai.mode === 'pullin' && isLast && distance < 1.5 && Math.abs(car.speed) < 0.5) {
      ai.mode = 'pump';
      slot.phase = 'pump';
      slot.timer = this.traffic?.rng ? this.traffic.rng.range(4, 6) : 5;
      car.controls.throttle = 0;
      car.controls.brake = 1;
      car.controls.steer = 0;
      car.controls.handbrake = false;
      return;
    }
    if (ai.mode === 'pullout' && isLast && distance < 2) {
      car.setPose(-84.2, 18, 0);
      ai.mode = 'drive';
      ai.stuckTime = 0;
      this.releaseCar(car);
      delete ai.station;
      return;
    }

    let desired = distance < 4 ? 2.2 : 5;
    if (ai.mode === 'pullin' && isLast && distance < 1.5) desired = 0;
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
    const error = Math.atan2(dx, dz) - car.yaw;
    // The forecourt turns are far tighter than a lane change: at the road
    // helper's usual 0.5 clamp the sedan's 0.58 rad steering limit works out
    // to a ~9.5 m radius, which cannot fit between the islands and columns.
    // A station car may use the full steering range while it manoeuvres.
    car.controls.steer = clamp(Math.atan2(Math.sin(error), Math.cos(error)) * 2.4, -1, 1);
    car.controls.handbrake = false;

    if (moved / Math.max(dt, 1e-6) < 0.4) ai.stuckTime += dt;
    else ai.stuckTime = 0;
    if (ai.stuckTime > 12) {
      this.releaseCar(car);
      this.traffic?.removeCar(car);
    }
  }

  /** Free the slot a car owns and detach the station data from its AI. */
  releaseCar(car) {
    if (!car) return;
    for (const slot of this.slots) {
      if (slot.car === car) {
        slot.car = null;
        slot.phase = 'free';
        slot.timer = 0;
      }
    }
    if (car.ai) car.ai.station = null;
  }
}

export function buildGasStation(world) {
  return new GasStation(world);
}
