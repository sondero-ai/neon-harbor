// Solano Mall: a hollow, enterable building on block (54, 0). The shell is a
// 32 x 16 m box with 0.5 m walls, a 3.2 m main door on the +z (Vega Strip)
// wall and a matching lot door on the -z wall. Inside are six shop bays, a
// food court with six tables and twenty-four chairs, planters, a visual
// mezzanine band and three point lights. Static geometry is merged by
// material so the whole building costs a dozen draw calls, not hundreds.
//
// The building footprint is pedestrian-only: world.vehicleBlocked refuses it
// for every vehicle, and each wall segment is a normal collider, so the
// existing 2D resolveCircle keeps walkers, officers and mission enemies out.

import * as THREE from '../vendor/three.module.js';
import { WORLD } from './config.js';
import { canvasTexture, makeSignTexture, mergeGeometries } from './geo.js';
import { addBox, addCylinder, addPart, basicMaterial, material } from './world-kit.js';

export const MALL_LABEL = 'SOLANO MALL';
export const MALL_BOUNDS = { minX: 38, maxX: 70, minZ: 0, maxZ: 16 };
export const MALL_FLOOR = 0.16;
export const MALL_CEILING = 6.2;

const WALL = 0.5;
const DOOR_WIDTH = 3.2;
const DOOR_X = 54;
const DOOR_LEFT = DOOR_X - DOOR_WIDTH / 2;
const DOOR_RIGHT = DOOR_X + DOOR_WIDTH / 2;

const SHOP_BAYS = [
  { id: 'clothing', title: 'THREAD & TIDE', sub: 'CLOTHING', side: 'north', x: 43, color: '#ff8fa0' },
  { id: 'electronics', title: 'VOLT HOUSE', sub: 'ELECTRONICS', side: 'north', x: 49, color: '#3fe0cf' },
  { id: 'cafe', title: 'CAFE SOLANO', sub: 'COFFEE', side: 'north', x: 64, color: '#ffc95c' },
  { id: 'arcade', title: 'NEON ARCADE', sub: 'GAMES', side: 'south', x: 43, color: '#c58cff' },
  { id: 'pharmacy', title: 'HARBOR RX', sub: 'PHARMACY', side: 'south', x: 49, color: '#7fe6a0' },
  { id: 'jewelry', title: 'SOLANO GOLD', sub: 'JEWELRY', side: 'west', z: 8, color: '#ffd27d' },
];

function floorTexture() {
  return canvasTexture(256, 256, (ctx, width, height) => {
    ctx.fillStyle = '#b7a99a';
    ctx.fillRect(0, 0, width, height);
    const tile = width / 4;
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#c4b6a4' : '#a99a8b';
        ctx.fillRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
        ctx.strokeStyle = 'rgba(60,45,40,0.16)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * tile + 1.5, y * tile + 1.5, tile - 3, tile - 3);
        if ((x * 7 + y * 3) % 5 === 0) {
          ctx.fillStyle = 'rgba(255,240,214,0.1)';
          ctx.fillRect(x * tile + 8, y * tile + 10, tile - 22, 3);
        }
      }
    }
    const sheen = ctx.createLinearGradient(0, 0, 0, height);
    sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(1, 'rgba(24,16,24,0.2)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);
  }, { repeat: [8, 4] });
}

function collider(world, minX, maxX, minZ, maxZ, maxY, kind = 'mall') {
  world.colliders.push({ kind, minX, maxX, minZ, maxZ, minY: 0, maxY });
}

function wallSegment(world, shellParts, minX, maxX, minZ, maxZ, height = MALL_CEILING + 0.4) {
  addBox(
    shellParts,
    maxX - minX,
    height,
    maxZ - minZ,
    (minX + maxX) / 2,
    height / 2,
    (minZ + maxZ) / 2,
    0x5c4a56,
  );
  collider(world, minX, maxX, minZ, maxZ, height);
}

export function buildMall(world) {
  const group = new THREE.Group();
  group.name = 'solano-mall';
  world.root.add(group);

  const shellParts = [];
  const trimParts = [];
  const glassParts = [];
  const neonParts = [];
  const furnitureParts = [];
  const seats = [];
  const doors = [];

  const minX = MALL_BOUNDS.minX;
  const maxX = MALL_BOUNDS.maxX;
  const minZ = MALL_BOUNDS.minZ;
  const maxZ = MALL_BOUNDS.maxZ;
  const floorY = MALL_FLOOR;

  // ---------------------------------------------------------------- shell
  // Four walls; the two long walls split around their 3.2 m door gap. The
  // gaps are the only pedestrian openings; the whole footprint is vehicle-
  // blocked in world.vehicleBlocked.
  wallSegment(world, shellParts, minX, DOOR_LEFT, maxZ - WALL, maxZ + 0.02);
  wallSegment(world, shellParts, DOOR_RIGHT, maxX, maxZ - WALL, maxZ + 0.02);
  wallSegment(world, shellParts, minX, DOOR_LEFT, minZ - 0.02, minZ + WALL);
  wallSegment(world, shellParts, DOOR_RIGHT, maxX, minZ - 0.02, minZ + WALL);
  wallSegment(world, shellParts, minX - 0.02, minX + WALL, minZ, maxZ);
  wallSegment(world, shellParts, maxX - WALL, maxX + 0.02, minZ, maxZ);

  // Door lintels keep the wall visually continuous above the 3.2 m opening.
  addBox(shellParts, DOOR_WIDTH, MALL_CEILING - 3.4, 0.5, DOOR_X, (MALL_CEILING + 3.4) / 2, maxZ - WALL / 2, 0x5c4a56);
  addBox(shellParts, DOOR_WIDTH, MALL_CEILING - 3.4, 0.5, DOOR_X, (MALL_CEILING + 3.4) / 2, minZ + WALL / 2, 0x5c4a56);

  // Ceiling: two slabs with a glass skylight strip down the middle, plus a
  // parapet and a neon crown so the building reads from the strip.
  addBox(shellParts, maxX - minX + 0.5, 0.3, 6.5, (minX + maxX) / 2, MALL_CEILING + 0.15, minZ + 3.25, 0x4b3c49);
  addBox(shellParts, maxX - minX + 0.5, 0.3, 6.5, (minX + maxX) / 2, MALL_CEILING + 0.15, maxZ - 3.25, 0x4b3c49);
  for (const z of [6.5, 9.5]) {
    addBox(shellParts, maxX - minX, 0.35, 0.22, (minX + maxX) / 2, MALL_CEILING - 0.05, z, 0x3a2d39);
  }
  addBox(glassParts, maxX - minX - 4, 0.06, 3.0, (minX + maxX) / 2, MALL_CEILING + 0.02, 8, 0x9fe8ff, {});
  addBox(shellParts, maxX - minX + 1.2, 0.7, 0.45, (minX + maxX) / 2, MALL_CEILING + 0.55, maxZ + 0.2, 0x3a2d39);
  addBox(shellParts, maxX - minX + 1.2, 0.7, 0.45, (minX + maxX) / 2, MALL_CEILING + 0.55, minZ - 0.2, 0x3a2d39);
  addBox(shellParts, 0.45, 0.7, maxZ - minZ, minX - 0.2, MALL_CEILING + 0.55, 8, 0x3a2d39);
  addBox(shellParts, 0.45, 0.7, maxZ - minZ, maxX + 0.2, MALL_CEILING + 0.55, 8, 0x3a2d39);
  const neon = 0xffc95c;
  addBox(neonParts, maxX - minX + 0.9, 0.14, 0.16, (minX + maxX) / 2, MALL_CEILING + 0.92, maxZ + 0.44, neon);
  addBox(neonParts, maxX - minX + 0.9, 0.14, 0.16, (minX + maxX) / 2, MALL_CEILING + 0.92, minZ - 0.44, neon);
  addBox(neonParts, 0.16, 0.14, maxZ - minZ, minX - 0.44, MALL_CEILING + 0.92, 8, neon);
  addBox(neonParts, 0.16, 0.14, maxZ - minZ, maxX + 0.44, MALL_CEILING + 0.92, 8, neon);

  // Exterior facade bands and glass storefronts, broken by the main door.
  for (const [x0, x1] of [[minX + 0.4, DOOR_LEFT - 0.3], [DOOR_RIGHT + 0.3, maxX - 0.4]]) {
    addBox(glassParts, x1 - x0, 2.3, 0.08, (x0 + x1) / 2, 2.55, maxZ + 0.06, 0x6fd3d8, {});
    addBox(trimParts, x1 - x0, 0.18, 0.16, (x0 + x1) / 2, 1.28, maxZ + 0.1, 0x2a2230);
    addBox(trimParts, x1 - x0, 0.18, 0.16, (x0 + x1) / 2, 3.82, maxZ + 0.1, 0x2a2230);
  }
  for (const x of [minX - 0.06, maxX + 0.06]) {
    addBox(glassParts, 0.08, 2.3, maxZ - minZ - 3, x, 2.55, 8, 0x6fd3d8, {});
  }

  // A canopy over the main entrance on two posts clear of the door gap.
  addBox(trimParts, 8.4, 0.28, 2.6, DOOR_X, 3.66, maxZ + 1.3, 0x2f2635);
  for (const x of [DOOR_X - 3.9, DOOR_X + 3.9]) {
    addBox(trimParts, 0.22, 3.5, 0.22, x, 1.75, maxZ + 2.4, 0x2a2230);
    collider(world, x - 0.16, x + 0.16, maxZ + 2.24, maxZ + 2.56, 3.5, 'prop');
  }
  addBox(neonParts, 8.0, 0.08, 0.1, DOOR_X, 3.44, maxZ + 2.58, 0x3fe0cf);
  addBox(trimParts, 6.6, 0.24, 2.0, DOOR_X, 3.4, minZ - 1.0, 0x2f2635);
  for (const x of [DOOR_X - 3.0, DOOR_X + 3.0]) {
    addBox(trimParts, 0.2, 3.2, 0.2, x, 1.6, minZ - 1.8, 0x2a2230);
    collider(world, x - 0.15, x + 0.15, minZ - 1.95, minZ - 1.65, 3.2, 'prop');
  }

  // ---------------------------------------------------------------- doors
  // Two 1.6 m glass leaves per door. Only the visuals move; the gap itself is
  // already open in the wall colliders.
  for (const spec of [
    { name: 'main', x: DOOR_X, z: maxZ - WALL / 2, facing: 1 },
    { name: 'lot', x: DOOR_X, z: minZ + WALL / 2, facing: -1 },
  ]) {
    const leaves = [];
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(DOOR_WIDTH / 2, 3.0, 0.1),
        new THREE.MeshStandardMaterial({
          color: 0x8fd8e6,
          roughness: 0.12,
          metalness: 0.35,
          transparent: true,
          opacity: 0.42,
          emissive: 0x1c4c55,
          emissiveIntensity: 0.5,
        }),
      );
      const closedX = spec.x + side * DOOR_WIDTH / 4;
      mesh.position.set(closedX, floorY + 1.5, spec.z);
      mesh.castShadow = false;
      group.add(mesh);
      leaves.push({ mesh, closedX, openX: closedX + side * DOOR_WIDTH / 2, offset: 0 });
    }
    // A slim threshold strip and the door frame.
    addBox(trimParts, DOOR_WIDTH + 0.2, 0.06, WALL, spec.x, floorY + 0.02, spec.z, 0x8d7a63);
    addBox(trimParts, 0.18, 3.2, WALL + 0.04, DOOR_LEFT - 0.09, floorY + 1.6, spec.z, 0x2a2230);
    addBox(trimParts, 0.18, 3.2, WALL + 0.04, DOOR_RIGHT + 0.09, floorY + 1.6, spec.z, 0x2a2230);
    doors.push({ name: spec.name, x: spec.x, z: spec.z, width: DOOR_WIDTH, leaves });
  }

  // ---------------------------------------------------------------- floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(maxX - minX - WALL, floorY, maxZ - minZ - WALL),
    material(0xffffff, { map: floorTexture(), roughness: 0.78, metalness: 0.02 }),
  );
  floor.position.set((minX + maxX) / 2, floorY / 2, (minZ + maxZ) / 2);
  floor.receiveShadow = true;
  group.add(floor);
  // A wet-look centre runner inlaid down the hall.
  addBox(trimParts, maxX - minX - 8, 0.02, 2.0, 54, floorY + 0.012, 8, 0x8d7a92);

  // ---------------------------------------------------------------- shops
  const signMeshes = [];
  for (const bay of SHOP_BAYS) {
    const north = bay.side === 'north';
    const south = bay.side === 'south';
    const west = bay.side === 'west';
    const bx = west ? minX + WALL + 0.18 : bay.x;
    const bz = west ? bay.z : north ? maxZ - WALL - 0.18 : minZ + WALL + 0.18;
    const backDepth = 0.16;
    // Bay back panel, counter and a pair of lit display cases.
    if (west) {
      addBox(trimParts, backDepth, 3.4, 4.2, bx, floorY + 1.7, bz, 0x2a2230);
      addBox(furnitureParts, 1.0, 0.95, 4.0, bx + 0.9, floorY + 0.475, bz, 0x5a4656);
      collider(world, bx + 0.4, bx + 1.4, bz - 2.0, bz + 2.0, 0.95, 'prop');
      addBox(glassParts, 0.9, 0.55, 3.8, bx + 0.95, floorY + 1.22, bz, 0x9fe8ff, {});
    } else {
      addBox(trimParts, 5.4, 3.4, backDepth, bx, floorY + 1.7, bz, 0x2a2230);
      addBox(furnitureParts, 5.0, 0.95, 0.9, bx, floorY + 0.475, bz + (north ? -0.75 : 0.75), 0x5a4656);
      collider(world, bx - 2.5, bx + 2.5, bz + (north ? -1.2 : 0.3), bz + (north ? -0.3 : 1.2), 0.95, 'prop');
      addBox(glassParts, 4.8, 0.55, 0.78, bx, floorY + 1.22, bz + (north ? -0.75 : 0.75), 0x9fe8ff, {});
    }
    // Interior sign, facing the hall.
    const texture = makeSignTexture({
      title: bay.title,
      sub: bay.sub,
      color: bay.color,
      bg: '#120b1a',
      accent: '#3fe0cf',
      width: 512,
      height: 148,
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 1.16),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    if (north) sign.position.set(bx, 4.35, bz - 0.12);
    else if (south) { sign.position.set(bx, 4.35, bz + 0.12); sign.rotation.y = Math.PI; }
    else { sign.position.set(bx + 0.12, 4.35, bz); sign.rotation.y = Math.PI / 2; }
    group.add(sign);
    signMeshes.push(sign);
    addBox(neonParts, west ? 0.13 : 4.2, 0.1, west ? 4.2 : 0.13, north ? bx : west ? bx + 0.14 : bx, 3.7, north ? bz - 0.14 : south ? bz + 0.14 : bz, bay.color ? Number(`0x${bay.color.slice(1)}`) : 0xffc95c);
  }

  // The jewelry register, on the west counter, facing the hall.
  const register = { x: minX + WALL + 1.35, y: floorY + 1.12, z: 8 };
  addBox(neonParts, 0.5, 0.28, 0.42, register.x, register.y, register.z, 0xffd27d);
  addBox(trimParts, 0.34, 0.16, 0.3, register.x, register.y - 0.22, register.z, 0x2a2230);
  addBox(neonParts, 1.5, 0.04, 0.06, register.x + 0.6, floorY + 2.6, register.z, 0xffc95c);

  // ---------------------------------------------------------------- food court
  // The vendor counter closes the east end of the hall and gives the interior
  // shot a lit focal point.
  addBox(furnitureParts, 0.9, 1.05, 7.0, maxX - WALL - 0.55, floorY + 0.525, 8, 0x6b4c3c);
  addBox(trimParts, 1.1, 0.1, 7.2, maxX - WALL - 0.55, floorY + 1.1, 8, 0x8d7a63);
  addBox(glassParts, 0.08, 0.7, 6.6, maxX - WALL - 1.0, floorY + 1.45, 8, 0x9fe8ff, {});
  collider(world, maxX - WALL - 1.0, maxX - WALL - 0.1, 4.5, 11.5, 1.15, 'prop');
  const foodSign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 1.5),
    new THREE.MeshBasicMaterial({
      map: makeSignTexture({ title: 'FOOD COURT', sub: 'SIX TABLES · OPEN LATE', color: '#ffc95c', accent: '#3fe0cf', width: 640, height: 172 }),
      toneMapped: false,
    }),
  );
  foodSign.position.set(maxX - WALL - 0.08, 3.6, 8);
  foodSign.rotation.y = -Math.PI / 2;
  group.add(foodSign);

  // Six tables, four chairs each, on the east side. Every chair is a seat in
  // the shared world registry.
  const tableSpots = [];
  for (const x of [61.5, 66.5]) {
    for (const z of [4, 8, 12]) tableSpots.push({ x, z });
  }
  for (const table of tableSpots) {
    addCylinder(furnitureParts, 0.72, 0.72, 0.08, 16, table.x, floorY + 0.75, table.z, 0xd9c8b4);
    addCylinder(furnitureParts, 0.1, 0.16, 0.72, 8, table.x, floorY + 0.37, table.z, 0x3a303c);
    collider(world, table.x - 0.5, table.x + 0.5, table.z - 0.5, table.z + 0.5, 0.82, 'prop');
    for (const [dx, dz] of [[1.05, 0], [-1.05, 0], [0, 1.05], [0, -1.05]]) {
      const cx = table.x + dx;
      const cz = table.z + dz;
      const yaw = Math.atan2(table.x - cx, table.z - cz);
      addBox(furnitureParts, 0.46, 0.07, 0.46, cx, floorY + 0.46, cz, 0x8a5f46);
      addBox(furnitureParts, 0.44, 0.52, 0.07, cx - Math.sin(yaw) * 0.2, floorY + 0.72, cz - Math.cos(yaw) * 0.2, 0x8a5f46, { ry: yaw });
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
        addBox(furnitureParts, 0.05, 0.44, 0.05, cx + lx, floorY + 0.22, cz + lz, 0x3a303c);
      }
      seats.push({ x: cx, z: cz, y: WORLD.sidewalkHeight, yaw, kind: 'mall', occupant: null });
    }
  }

  // A central bench cluster and four planters. The hall centre (54, 8) stays
  // open so the mall-interior camera and the player's path through the doors
  // have a clear spine.
  for (const [bx, bz, ry] of [[45.2, 5.2, 0], [45.2, 6.8, 0], [46.8, 4.4, Math.PI / 2]]) {
    addBox(furnitureParts, 2.0, 0.14, 0.58, bx, floorY + 0.5, bz, 0x6b4c3c, { ry });
    addBox(furnitureParts, 0.14, 0.42, 0.5, bx - Math.cos(ry) * 0.7, floorY + 0.25, bz + Math.sin(ry) * 0.7, 0x3a303c, { ry });
    addBox(furnitureParts, 0.14, 0.42, 0.5, bx + Math.cos(ry) * 0.7, floorY + 0.25, bz - Math.sin(ry) * 0.7, 0x3a303c, { ry });
    collider(world, bx - 1.05, bx + 1.05, bz - 0.35, bz + 0.35, 0.7, 'prop');
  }
  for (const [px, pz, size] of [[44, 3.2, 1.4], [44, 12.8, 1.2], [67, 14.2, 1.1], [59.5, 14.2, 1.1]]) {
    addBox(furnitureParts, size, 0.7, size, px, floorY + 0.35, pz, 0x5a4656);
    addBox(furnitureParts, size + 0.12, 0.12, size + 0.12, px, floorY + 0.76, pz, 0x8d7a63);
    addCylinder(furnitureParts, 0.1, 0.14, 2.0, 6, px, floorY + 1.7, pz, 0x5b4030);
    addPart(furnitureParts, new THREE.ConeGeometry(0.95, 1.8, 8), px, floorY + 3.1, pz, 0x2f6a52);
    collider(world, px - size / 2, px + size / 2, pz - size / 2, pz + size / 2, 0.86, 'prop');
  }

  // ---------------------------------------------------------------- mezzanine
  // A visual band and glass rail (no traversable second floor).
  for (const side of [-1, 1]) {
    const z = side === -1 ? 2.0 : 14.0;
    addBox(trimParts, 24, 0.34, 0.9, 54, 3.9, z, 0x4b3c49);
    addBox(glassParts, 23.6, 0.72, 0.06, 54, 4.42, z + side * 0.34, 0x9fe8ff, {});
    for (let x = 42; x <= 66; x += 4) {
      addBox(trimParts, 0.08, 0.8, 0.08, x, 4.4, z + side * 0.34, 0x2a2230);
    }
  }
  addBox(trimParts, 0.9, 0.34, 11, minX + WALL + 1.6, 3.9, 8, 0x4b3c49);
  addBox(glassParts, 0.06, 0.72, 10.6, minX + WALL + 2.06, 4.42, 8, 0x9fe8ff, {});

  // Emissive ceiling troughs add light without adding point lights.
  for (const z of [4.0, 12.0]) {
    addBox(neonParts, 18, 0.07, 0.32, 54, MALL_CEILING - 0.18, z, 0xffe4b8);
  }

  // ---------------------------------------------------------------- merging
  const shellMesh = new THREE.Mesh(
    mergeGeometries(shellParts),
    material(0xffffff, { vertexColors: true, roughness: 0.84, metalness: 0.05 }),
  );
  shellMesh.castShadow = true;
  shellMesh.receiveShadow = true;
  group.add(shellMesh);

  const trimMesh = new THREE.Mesh(
    mergeGeometries(trimParts),
    material(0xffffff, { vertexColors: true, roughness: 0.62, metalness: 0.24 }),
  );
  trimMesh.castShadow = true;
  trimMesh.receiveShadow = true;
  group.add(trimMesh);

  const furnitureMesh = new THREE.Mesh(
    mergeGeometries(furnitureParts),
    material(0xffffff, { vertexColors: true, roughness: 0.74, metalness: 0.06 }),
  );
  furnitureMesh.castShadow = true;
  furnitureMesh.receiveShadow = true;
  group.add(furnitureMesh);

  const glassMesh = new THREE.Mesh(
    mergeGeometries(glassParts),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.14,
      metalness: 0.42,
      transparent: true,
      opacity: 0.52,
      emissive: 0x1b3d46,
      emissiveIntensity: 0.42,
    }),
  );
  glassMesh.receiveShadow = false;
  group.add(glassMesh);

  const neonMesh = new THREE.Mesh(
    mergeGeometries(neonParts),
    basicMaterial(0xffffff, { vertexColors: true }),
  );
  group.add(neonMesh);

  // The mall sign over the main entrance.
  const signTexture = makeSignTexture({
    title: MALL_LABEL,
    sub: 'SHOPS · DINING · PARKING',
    color: '#ffd27d',
    accent: '#3fe0cf',
    bg: '#140c1c',
    width: 768,
    height: 192,
  });
  const mallSign = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 3.4),
    new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false }),
  );
  mallSign.position.set(54, 4.9, maxZ + 0.08);
  group.add(mallSign);

  // ---------------------------------------------------------------- lights
  const lights = [];
  for (const [x, y, z, color, intensity] of [
    [46, 4.9, 5, 0xffd9a3, 110],
    [62, 5.0, 8, 0xffe4b8, 120],
    [46, 4.9, 12, 0xffd9a3, 100],
  ]) {
    const light = new THREE.PointLight(color, intensity, 24, 2);
    light.position.set(x, y, z);
    group.add(light);
    lights.push(light);
  }

  world.seats.push(...seats);

  const mall = {
    bounds: { ...MALL_BOUNDS },
    doors,
    register,
    seats,
    label: MALL_LABEL,
    interior: {
      minX: minX + WALL,
      maxX: maxX - WALL,
      minZ: minZ + WALL,
      maxZ: maxZ - WALL,
      floorY,
      ceilingY: MALL_CEILING,
    },
    group,
    lights,
    sign: mallSign,
    update(dt, player) {
      if (!player) return;
      for (const door of doors) {
        const distance = Math.hypot(player.position.x - door.x, player.position.z - door.z);
        const target = distance < 3 ? 1 : 0;
        for (const leaf of door.leaves) {
          leaf.offset += (target - leaf.offset) * Math.min(1, dt * 6.5);
          leaf.mesh.position.x = leaf.closedX + (leaf.openX - leaf.closedX) * leaf.offset;
        }
      }
    },
  };
  return mall;
}
