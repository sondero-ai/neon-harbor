// Street dressing: beach umbrellas and loungers, palms, streetlights and their
// light pools, every neon sign, arch and billboard. Each function takes the
// World instance and adds to world.root.

import * as THREE from '../../vendor/three.module.js';
import {
  BLOCK_CENTERS_X,
  BLOCK_CENTERS_Z,
  ROADS_X,
  ROADS_Z,
  WORLD,
} from '../config.js';
import {
  makeBillboardTexture,
  makeGlowTexture,
  makeLampGeometry,
  makePalmGeometry,
  makePalmMaterial,
  makeSignTexture,
  makeStreetlightGeometry,
  mergeGeometries,
} from '../geo.js';
import { makeRng } from '../random.js';
import {
  addBox,
  addCylinder,
  addPart,
  basicMaterial,
  material,
} from '../world-kit.js';
import { DECK, ROAD_HALF, UP } from './shared.js';

export function buildBeachProps(world) {
  const parts = [];
  const rng = makeRng(0xbeac);
  const umbrellaColors = [0xff6f61, 0x3fe0cf, 0xffc95c, 0xff8fa0, 0x56c9a4];
  for (let i = 0; i < 8; i += 1) {
    const x = rng.range(-220, -160);
    const z = rng.range(-175, 175);
    if (Math.abs(z - DECK.z) < 18) continue;
    const y = world.beachHeight(x, z);
    const color = umbrellaColors[i % umbrellaColors.length];
    addCylinder(parts, 0.06, 0.08, 2.9, 6, x, y + 1.45, z, 0x6d5342);
    addPart(parts, new THREE.ConeGeometry(2.45, 0.85, 12), x, y + 2.95, z, color);
    addBox(parts, 1.5, 0.04, 0.85, x + rng.range(-1.6, 1.6), y + 0.05, z + rng.range(-1.5, 1.5), rng.pick([0xe9d8b5, 0xea8d7d, 0x6fd3c7]), { ry: rng.range(-0.8, 0.8) });
    addBox(parts, 0.85, 0.16, 0.85, x + 1.7, y + 0.15, z - 0.7, 0xd7c0a2, { ry: rng.range(-0.5, 0.5) });
    // A wooden lounger under each umbrella, facing the water. Its low seat
    // is the beach's sittable anchor.
    const lx = x - 2.5;
    const lz = z + 0.4;
    addBox(parts, 1.9, 0.14, 0.72, lx, y + 0.2, lz, 0x8a6248);
    addBox(parts, 0.16, 0.58, 0.72, lx + 0.92, y + 0.46, lz, 0x9b7154, { rz: 0.34 });
    addBox(parts, 0.5, 0.04, 0.5, lx + 0.25, y + 0.29, lz, rng.pick([0xff6f61, 0x3fe0cf, 0xffc95c]), { ry: 0.12 });
    world.seats.push({ x: lx, z: lz, y, yaw: -Math.PI / 2, kind: 'beach', occupant: null });
  }

  // Lifeguard tower, looking north along the beach.
  const lx = -208;
  const lz = -42;
  const ly = world.beachHeight(lx, lz);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(parts, 0.18, 2.5, 0.18, lx + sx * 1.65, ly + 1.25, lz + sz * 1.15, 0x6d5141);
    }
  }
  addBox(parts, 4.2, 0.28, 3.3, lx, ly + 2.5, lz, 0xe0c49a);
  addBox(parts, 3.1, 1.8, 2.3, lx, ly + 3.6, lz, 0xcf9f78);
  addBox(parts, 3.3, 0.15, 2.5, lx, ly + 4.55, lz, 0x3d5c55);
  addBox(parts, 2.2, 0.8, 0.05, lx, ly + 3.7, lz + 1.17, 0x2b3a40);
  addCylinder(parts, 0.05, 0.05, 3.5, 5, lx + 1.7, ly + 5.4, lz - 1.1, 0x5d4b3f);
  addBox(parts, 0.04, 0.75, 1.2, lx + 1.7, ly + 6.5, lz - 1.7, 0xff6f61);

  // Small shoreline rocks.
  for (let i = 0; i < 12; i += 1) {
    const x = rng.range(-229, -214);
    const z = rng.range(-180, 180);
    if (Math.abs(z - DECK.z) < 14) continue;
    const size = rng.range(0.5, 1.8);
    addPart(
      parts,
      new THREE.DodecahedronGeometry(size, 0),
      x,
      world.beachHeight(x, z) + size * 0.24,
      z,
      0x40393c,
      { rx: rng.range(0, 3), ry: rng.range(0, 3), sx: rng.range(0.7, 1.5), sy: rng.range(0.4, 0.9), sz: rng.range(0.7, 1.4) },
    );
  }

  const mesh = new THREE.Mesh(
    mergeGeometries(parts),
    material(0xffffff, { vertexColors: true, roughness: 0.88, metalness: 0 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.root.add(mesh);
}

export function buildVegetation(world) {
  const variants = [0, 1, 2].map((variant) => ({
    geometry: makePalmGeometry(variant),
    items: [],
  }));
  const rng = makeRng(0x9a17);
  const addPalm = (x, z, y, scale) => {
    const variant = rng.int(0, 2);
    variants[variant].items.push({
      x, z, y,
      scale: scale * rng.range(0.82, 1.18),
      rotation: rng.range(0, Math.PI * 2),
    });
  };

  for (let i = 0; i < 28; i += 1) {
    const x = rng.range(-216, -151);
    const z = rng.range(-190, 190);
    if (Math.abs(z - DECK.z) < 14) continue;
    addPalm(x, z, world.beachHeight(x, z), 1.05);
  }
  for (let i = 0; i < 10; i += 1) {
    const z = -170 + i * 38;
    if (Math.abs(z - DECK.z) < 14) continue;
    addPalm(-146, z, world.beachHeight(-146, z), 0.95);
  }
  for (const cx of BLOCK_CENTERS_X) {
    for (const cz of BLOCK_CENTERS_Z) {
      if (rng.chance(0.56)) {
        const cornerX = cx + (rng.chance(0.5) ? -1 : 1) * 17.7;
        const cornerZ = cz + (rng.chance(0.5) ? -1 : 1) * 17.7;
        addPalm(cornerX, cornerZ, WORLD.sidewalkHeight, 0.82);
      }
    }
  }
  for (const spot of world.plazaPalmSpots ?? []) {
    addPalm(spot.x, spot.z, WORLD.sidewalkHeight, 0.9);
  }

  const palmMaterial = makePalmMaterial();
  for (const variant of variants) {
    if (variant.items.length === 0) continue;
    const mesh = new THREE.InstancedMesh(variant.geometry, palmMaterial, variant.items.length);
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    variant.items.forEach((item, index) => {
      quaternion.setFromAxisAngle(UP, item.rotation);
      position.set(item.x, item.y, item.z);
      scale.set(item.scale, item.scale, item.scale);
      mesh.setMatrixAt(index, new THREE.Matrix4().compose(position, quaternion, scale));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.root.add(mesh);
  }
}

export function buildStreetlights(world) {
  const entries = [];
  const step = 34;
  const nearRoad = (value, roads) => roads.some((road) => Math.abs(value - road) < 11);
  ROADS_X.forEach((line, lineIndex) => {
    for (let z = WORLD.cityMinZ + 16; z < WORLD.cityMaxZ - 10; z += step) {
      if (nearRoad(z, ROADS_Z)) continue;
      const side = (Math.round((z - WORLD.cityMinZ) / step) + lineIndex) % 2 === 0 ? 1 : -1;
      entries.push({ x: line + side * (ROAD_HALF + 1.3), z, y: 0.15, ry: side === 1 ? Math.PI : 0 });
    }
  });
  ROADS_Z.forEach((line, lineIndex) => {
    for (let x = WORLD.cityMinX + 16; x < WORLD.cityMaxX - 10; x += step) {
      if (nearRoad(x, ROADS_X)) continue;
      const side = (Math.round((x - WORLD.cityMinX) / step) + lineIndex) % 2 === 0 ? 1 : -1;
      entries.push({ x, z: line + side * (ROAD_HALF + 1.3), y: 0.15, ry: side === 1 ? Math.PI / 2 : -Math.PI / 2 });
    }
  });

  const lightGeometry = makeStreetlightGeometry();
  const lightMaterial = material(0xffffff, { vertexColors: true, roughness: 0.55, metalness: 0.35 });
  const lights = new THREE.InstancedMesh(lightGeometry, lightMaterial, entries.length);
  const lampGeometry = makeLampGeometry();
  const lampMaterial = basicMaterial(0xffc37a);
  world.lampMaterial = lampMaterial;
  const lamps = new THREE.InstancedMesh(lampGeometry, lampMaterial, entries.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  entries.forEach((entry, index) => {
    quaternion.setFromAxisAngle(UP, entry.ry);
    position.set(entry.x, entry.y, entry.z);
    matrix.compose(position, quaternion, scale);
    lights.setMatrixAt(index, matrix);
    lamps.setMatrixAt(index, matrix);
  });
  lights.castShadow = true;
  lights.receiveShadow = true;
  world.root.add(lights, lamps);

  entries.forEach((entry, index) => {
    if (index % 5 !== 0) return;
    const offsetX = Math.sin(entry.ry + Math.PI / 2) * 0;
    const glowIndex = world.glowField.add({
      x: entry.x + Math.cos(entry.ry) * 1.56,
      y: entry.y + 5.94,
      z: entry.z - Math.sin(entry.ry) * 1.56 + offsetX,
      scaleX: 3.0,
      color: 0xffb668,
      brightness: 0.38,
    });
    world.streetGlowIndices.push(glowIndex);
  });
  world.streetlightCount = entries.length;
  buildStreetPools(world, entries);
}

// Warm pools under the lamps and a few coloured spills under the strip's
// blade signs. One instanced additive quad, so the road gets light without
// adding per-frame draw calls.
export function buildStreetPools(world, entries) {
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.rotateX(-Math.PI / 2);
  const poolMaterial = new THREE.MeshBasicMaterial({
    map: makeGlowTexture(),
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  world.streetPoolMaterial = poolMaterial;
  const pools = [];
  for (let i = 0; i < entries.length; i += 2) {
    const entry = entries[i];
    pools.push({
      x: entry.x + Math.cos(entry.ry) * 1.56,
      z: entry.z - Math.sin(entry.ry) * 1.56,
      y: entry.y + 0.03,
      sx: 4.6,
      sz: 4.6,
      color: 0xffb668,
    });
  }
  const signColors = [0xff6f61, 0x3fe0cf, 0xffc95c];
  for (let i = 0; i < 12; i += 1) {
    pools.push({
      x: -126 + i * 18,
      z: i % 2 === 0 ? 18.4 : 35.6,
      y: WORLD.sidewalkHeight + 0.025,
      sx: 8.6,
      sz: 4.4,
      color: signColors[i % signColors.length],
    });
  }
  const mesh = new THREE.InstancedMesh(quad, poolMaterial, pools.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  pools.forEach((pool, index) => {
    position.set(pool.x, pool.y, pool.z);
    scale.set(pool.sx, 1, pool.sz);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.setHex(pool.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  world.root.add(mesh);
}

export function buildSigns(world) {
  const find = (x, z, minHeight = 0) => {
    let best = null;
    let bestScore = Infinity;
    for (const building of world.buildings) {
      const score = Math.abs(building.cx - x) + Math.abs(building.cz - z) + (building.height < minHeight ? 100 : 0);
      if (score < bestScore) {
        best = building;
        bestScore = score;
      }
    }
    return best;
  };

  const casa = world.landmarks.casa ?? find(-108, 54);
  if (casa) {
    addWallSign(world, {
      x: casa.x0 - 0.16, y: 13.2, z: casa.cz, ry: -Math.PI / 2,
      width: 4.3, height: 11.2,
      texture: makeSignTexture({
        title: 'CASA LUNA', sub: 'HOTEL · BEACH', color: '#ff8a72',
        bg: '#170d1c', vertical: true, accent: '#3fe0cf',
      }),
      color: 0xff7e6c, glow: 1.15, flicker: 0.12,
    });
  }

  const hotel = world.landmarks.hotel;
  if (hotel) {
    addWallSign(world, {
      x: hotel.x0 - 0.2, y: 52, z: hotel.cz - 3.5, ry: -Math.PI / 2,
      width: 5.0, height: 14.0,
      texture: makeSignTexture({
        title: 'SUNSET', sub: 'HOTEL', color: '#ffb45f',
        bg: '#140d18', vertical: true, accent: '#ff6f61',
      }),
      color: 0xffb45f, glow: 1.25, flicker: 0.06,
    });
    addWallSign(world, {
      x: hotel.cx + 4, y: 58, z: hotel.z1 + 0.2, ry: 0,
      width: 17.5, height: 3.6,
      texture: makeSignTexture({
        title: 'SUNSET HOTEL', sub: 'ROOMS · BAR · ROOF', color: '#ffc95c',
        bg: '#170f1a', accent: '#3fe0cf', width: 1024, height: 211,
      }),
      color: 0xffc95c, glow: 0.8, flicker: 0.04,
    });
  }

  const tideBuilding = find(-54, 54);
  if (tideBuilding) {
    addWallSign(world, {
      x: tideBuilding.x0 - 0.16, y: 9.6, z: tideBuilding.cz + 2, ry: -Math.PI / 2,
      width: 9.4, height: 3.3,
      texture: makeSignTexture({
        title: 'NIGHT TIDE', sub: '88.3 FM', color: '#3fe0cf',
        bg: '#0e131c', accent: '#ff8a72',
      }),
      color: 0x3fe0cf, glow: 0.9, flicker: 0.22,
    });
  }

  const solanoBuilding = find(108, 54, 30);
  if (solanoBuilding) {
    addWallSign(world, {
      x: solanoBuilding.x0 - 0.16, y: 17, z: solanoBuilding.cz, ry: -Math.PI / 2,
      width: 10.5, height: 3.4,
      texture: makeSignTexture({
        title: 'SOLANO', sub: 'IMPORTS · PIER 9', color: '#ffc95c',
        bg: '#130e18', accent: '#3fe0cf',
      }),
      color: 0xffc95c, glow: 0.75, flicker: 0.05,
    });
  }

  const motor = world.landmarks.motor;
  if (motor) {
    addWallSign(world, {
      x: motor.cx, y: 10.3, z: motor.z1 + 0.2, ry: 0,
      width: 18.5, height: 4.1,
      texture: makeSignTexture({
        title: 'MOTOR ROW', sub: 'SERVICE · PARTS · SPEED', color: '#ff6f61',
        bg: '#150e16', accent: '#3fe0cf', width: 1024, height: 227,
      }),
      color: 0xff6f61, glow: 0.9, flicker: 0.16,
    });
  }

  const foundrySign = find(270, 0, 10);
  if (foundrySign) {
    addWallSign(world, {
      x: foundrySign.cx, y: 8.4, z: foundrySign.z1 + 0.2, ry: 0,
      width: 16.5, height: 3.6,
      texture: makeSignTexture({
        title: 'FOUNDRY', sub: 'STEEL · RAIL · SHIPYARD', color: '#ff8a72',
        bg: '#150e16', accent: '#ffc95c', width: 1024, height: 223,
      }),
      color: 0xff8a72, glow: 0.9, flicker: 0.12,
    });
  }

  const oldTownSign = find(54, -216, 7);
  if (oldTownSign) {
    addWallSign(world, {
      x: oldTownSign.x0 - 0.16, y: 8.4, z: oldTownSign.cz, ry: -Math.PI / 2,
      width: 7.6, height: 3.2,
      texture: makeSignTexture({
        title: 'OLD TOWN', sub: 'MARKET ROW', color: '#ffc95c',
        bg: '#170d1c', vertical: true, accent: '#3fe0cf',
      }),
      color: 0xffc95c, glow: 0.85, flicker: 0.1,
    });
  }

  const radio = world.landmarks.radio;
  if (radio) {
    addWallSign(world, {
      x: radio.cx, y: 7.0, z: radio.z1 + 0.2, ry: 0,
      width: 10.5, height: 2.9,
      texture: makeSignTexture({
        title: 'RADIO 88.3', sub: 'NIGHT TIDE', color: '#3fe0cf',
        bg: '#0e131b', accent: '#ffc95c',
      }),
      color: 0x3fe0cf, glow: 0.8, flicker: 0.35,
    });
  }

  // Blade signs hanging over Vega Strip, angled to read down the street.
  const bladeTitles = ['NIGHT', 'EL MAR', 'ARCADE', 'RADIO', 'TIDE', 'SURF', 'MOTEL', 'LUNA'];
  const bladeColors = ['#3fe0cf', '#ffc95c', '#ff8a72', '#ff6f61'];
  const northX = [-108, -54, 54, 108];
  northX.forEach((x, index) => {
    const sign = makeBladeSignTexture(world, bladeTitles[index], bladeColors[index % bladeColors.length]);
    addBladeSign(world, x, 7.4, 35.3, sign, index % 2 === 0 ? 0x3fe0cf : 0xffc95c, 1);
  });
  const southX = [-108, -54, 54, 108];
  southX.forEach((x, index) => {
    const sign = makeBladeSignTexture(world, bladeTitles[index + 4], bladeColors[(index + 2) % bladeColors.length]);
    addBladeSign(world, x, 7.0, 18.7, sign, index % 2 === 0 ? 0xff8a72 : 0xffc95c, -1);
  });

  buildStreetArch(world, {
    x: -112, z: 27, span: 19, baseY: 0.15, height: 7.7,
    title: 'VEGA STRIP', sub: 'TEN BLOCKS OF LIGHT', color: '#ff6f61', accent: '#3fe0cf',
    glow: 0xff6f61,
  });
  buildStreetArch(world, {
    x: -150, z: DECK.z, span: 16, baseY: world.beachHeight(-150, DECK.z), height: 5.5,
    title: 'PIER 9', sub: 'END OF THE LINE', color: '#3fe0cf', accent: '#ffc95c',
    glow: 0x3fe0cf,
  });

  buildPylonSign(world, {
    x: 0, z: -19.3, baseY: 0.15, height: 4.4,
    title: 'LUNA PLAZA', sub: 'MEET UNDER THE RING', color: '#ffc95c', accent: '#ff6f61',
    width: 8.0,
  });

  // Two roof boards, one facing the sea and one facing the strip.
  const nightTide = find(-54, 54);
  if (nightTide) {
    addBillboard(world, {
      x: nightTide.x0 - 1.4, y: nightTide.baseY + nightTide.height + 5.4, z: nightTide.cz,
      width: 16, height: 8, ry: -Math.PI / 2,
      texture: makeBillboardTexture({
        title: 'NIGHT TIDE', sub: '88.3 FM · ALL NIGHT', accent: '#3fe0cf', second: '#ffc95c',
      }),
      color: 0x3fe0cf,
    });
  }
  const harborBoard = find(54, 0, 22);
  if (harborBoard) {
    addBillboard(world, {
      x: harborBoard.cx, y: harborBoard.baseY + harborBoard.height + 5.2, z: harborBoard.z1 + 1.2,
      width: 16, height: 8, ry: 0,
      texture: makeBillboardTexture({
        title: 'NEON HARBOR', sub: 'LAST EXIT BEFORE THE SEA', accent: '#ff6f61', second: '#3fe0cf',
      }),
      color: 0xff6f61,
    });
  }
}

export function makeBladeSignTexture(world, title, color) {
  return makeSignTexture({
    title,
    sub: '',
    color,
    bg: '#120b18',
    vertical: true,
    accent: '#ffd8b0',
    width: 176,
    height: 410,
  });
}

export function addWallSign(world, { x, y, z, ry, width, height, texture, color, glow = 1, flicker = 0 }) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  world.root.add(mesh);
  const nx = Math.sin(ry);
  const nz = Math.cos(ry);
  const glowIndex = world.glowField.add({
    x: x + nx * 0.75,
    y,
    z: z + nz * 0.75,
    scaleX: width * 1.6,
    scaleY: height * 1.4,
    color,
    brightness: 0.26 * glow,
  });
  world.neonSigns.push({
    material: mat,
    glowIndex,
    phase: world.rng.range(0, Math.PI * 2),
    flicker,
    baseGlow: 0.26 * glow,
  });
  return mesh;
}

export function addBladeSign(world, x, y, z, texture, color, side) {
  const geometry = new THREE.PlaneGeometry(2.7, 6.3);
  const eastMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: true });
  const westMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: true });
  const east = new THREE.Mesh(geometry, eastMaterial);
  east.position.set(x + 0.035, y, z);
  east.rotation.y = Math.PI / 2;
  const west = new THREE.Mesh(geometry, westMaterial);
  west.position.set(x - 0.035, y, z);
  west.rotation.y = -Math.PI / 2;
  world.root.add(east, west);
  // Bracket back to the building that owns this stretch of sidewalk.
  const wallZ = side > 0 ? 38.1 : 15.9;
  const bracketZ = (z + wallZ) / 2;
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, Math.abs(wallZ - z)),
    material(0x322a33, { roughness: 0.65, metalness: 0.3 }),
  );
  bracket.position.set(x, y + 3.0, bracketZ);
  world.root.add(bracket);
  const glowIndex = world.glowField.add({
    x, y, z,
    scaleX: 5.4,
    scaleY: 8.4,
    color,
    brightness: 0.34,
  });
  for (const [material, sign] of [[eastMaterial, east], [westMaterial, west]]) {
    world.neonSigns.push({
      material,
      glowIndex,
      phase: world.rng.range(0, Math.PI * 2),
      flicker: 0.18,
      baseGlow: 0.34,
    });
  }
}

export function buildStreetArch(world, { x, z, span, baseY, height, title, sub, color, accent, glow }) {
  const pylonMaterial = material(0x29232d, { roughness: 0.55, metalness: 0.35 });
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.7, height, 0.7), pylonMaterial);
    pylon.position.set(x, baseY + height / 2, z + side * span / 2);
    pylon.castShadow = true;
    pylon.receiveShadow = true;
    world.root.add(pylon);
    world.colliders.push({
      kind: 'prop',
      minX: x - 0.5, maxX: x + 0.5,
      minZ: z + side * span / 2 - 0.5, maxZ: z + side * span / 2 + 0.5,
      minY: baseY, maxY: baseY + height,
    });
  }
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.5, span + 0.7),
    pylonMaterial,
  );
  beam.position.set(x, baseY + height - 0.25, z);
  beam.castShadow = true;
  world.root.add(beam);

  const texture = makeSignTexture({
    title, sub, color, bg: '#120b18', accent,
    width: 1024,
    height: Math.max(128, Math.round((1024 * 2.5) / (span - 1.2))),
  });
  const signY = baseY + height - 2.1;
  for (const direction of [1, -1]) {
    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.FrontSide, fog: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span - 1.2, 2.5), mat);
    mesh.position.set(x + direction * 0.45, signY, z);
    mesh.rotation.y = direction * Math.PI / 2;
    world.root.add(mesh);
    world.neonSigns.push({
      material: mat,
      phase: world.rng.range(0, 6.28),
      flicker: 0.08,
      baseGlow: 0,
    });
  }
  world.glowField.add({
    x,
    y: signY,
    z,
    scaleX: span * 1.2,
    scaleY: 7.5,
    color: glow,
    brightness: 0.32,
  });
}

export function buildPylonSign(world, { x, z, baseY, height, title, sub, color, accent, width }) {
  const postMaterial = material(0x2d2730, { roughness: 0.6, metalness: 0.3 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, height, 0.18), postMaterial);
    post.position.set(x + side * width * 0.33, baseY + height / 2, z);
    post.castShadow = true;
    world.root.add(post);
  }
  const texture = makeSignTexture({ title, sub, color, bg: '#120b18', accent });
  const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 2.6), mat);
  mesh.position.set(x, baseY + height - 0.4, z + 0.1);
  world.root.add(mesh);
  const glowIndex = world.glowField.add({
    x,
    y: baseY + height - 0.4,
    z: z + 0.4,
    scaleX: width * 1.2,
    scaleY: 5,
    color,
    brightness: 0.28,
  });
  world.neonSigns.push({
    material: mat,
    glowIndex,
    phase: world.rng.range(0, 6.28),
    flicker: 0.1,
    baseGlow: 0.28,
  });
}

export function addBillboard(world, { x, y, z, width, height, ry, texture, color }) {
  const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide, fog: true });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  board.position.set(x, y, z);
  board.rotation.y = ry;
  world.root.add(board);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.5, height + 0.5, 0.22),
    material(0x211b25, { roughness: 0.6, metalness: 0.25 }),
  );
  frame.position.set(x - Math.sin(ry) * 0.18, y, z - Math.cos(ry) * 0.18);
  frame.rotation.y = ry;
  frame.castShadow = true;
  world.root.add(frame);
  const postHeight = Math.max(2.5, height * 0.4);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, postHeight, 0.18),
      material(0x2a232b, { roughness: 0.6 }),
    );
    const along = side * width * 0.3;
    post.position.set(x + Math.cos(ry) * along, y - height / 2 - postHeight / 2, z - Math.sin(ry) * along);
    post.castShadow = true;
    world.root.add(post);
  }
  const glowIndex = world.glowField.add({
    x: x + Math.sin(ry) * 0.9,
    y,
    z: z + Math.cos(ry) * 0.9,
    scaleX: width * 1.4,
    scaleY: height * 1.5,
    color,
    brightness: 0.18,
  });
  world.neonSigns.push({
    material: mat,
    glowIndex,
    phase: world.rng.range(0, 6.28),
    flicker: 0.03,
    baseGlow: 0.18,
  });
}
