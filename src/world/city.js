// The city fabric: core blocks and landmarks, the generic towers, storefronts,
// awnings, roofs, the market square and the aircraft beacons. Each function
// takes the World instance; the core branch keeps its original build order.

import * as THREE from '../../vendor/three.module.js';
import {
  BLOCK_CENTERS_X,
  BLOCK_CENTERS_Z,
  CORE_BLOCK_CENTERS,
  WORLD,
} from '../config.js';
import {
  canvasTexture,
  makeBuildingMesh,
  makeFacadeStyles,
  mergeGeometries,
} from '../geo.js';
import { buildGasStation } from '../gas-station.js';
import { buildMall } from '../mall.js';
import { makeRng } from '../random.js';
import {
  addBox,
  addCrownBand,
  addCylinder,
  addPart,
  material,
  matrixFor,
} from '../world-kit.js';
import { CORE_SET, clamp, districtForBlock } from './shared.js';

export function buildCity(world) {
  world.facadeStyles = makeFacadeStyles();
  for (const style of world.facadeStyles) {
    // The environment scales window light against this base every frame.
    style.baseEmissive = style.material.emissiveIntensity;
  }
  world.roofParts = [];
  world.crownParts = [];
  world.storefrontParts = [];
  world.extensionParts = [];

  world.storefrontTexture = canvasTexture(1024, 256, (ctx, width, height) => {
    ctx.fillStyle = '#191321';
    ctx.fillRect(0, 0, width, height);
    const rng = makeRng(0x5741);
    const bays = 8;
    const bayWidth = width / bays;
    for (let bay = 0; bay < bays; bay += 1) {
      const x = bay * bayWidth;
      const warm = rng.chance(0.55);
      const glow = warm ? ['#ffc778', '#ff9d5f'] : ['#5ae7d6', '#ff8fa0'];
      ctx.fillStyle = '#0e0a13';
      ctx.fillRect(x + 4, 62, bayWidth - 8, height - 68);
      ctx.fillStyle = rng.chance(0.5) ? '#4b3037' : '#293d42';
      ctx.fillRect(x + 8, 20, bayWidth - 16, 46);
      ctx.fillStyle = rng.pick(['#8d3d43', '#356a63', '#7d5b2d', '#4a3b6c']);
      ctx.fillRect(x + 8, 12, bayWidth - 16, 12);
      ctx.strokeStyle = 'rgba(255,236,210,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 8.5, 12.5, bayWidth - 17, height - 78);
      const glass = ctx.createLinearGradient(x, 72, x, height - 6);
      glass.addColorStop(0, glow[0]);
      glass.addColorStop(1, glow[1]);
      ctx.globalAlpha = rng.range(0.38, 0.8);
      ctx.fillStyle = glass;
      ctx.fillRect(x + 14, 72, bayWidth - 28, height - 96);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(13,10,18,0.72)';
      ctx.fillRect(x + bayWidth * 0.46, 70, 5, height - 76);
      ctx.fillRect(x + 14, 122, bayWidth - 28, 4);
      if (rng.chance(0.45)) {
        ctx.fillStyle = glow[0];
        ctx.fillRect(x + 14, 40, 18, 5);
        ctx.fillRect(x + 14, 49, 10, 3);
      }
    }
    const grime = ctx.createLinearGradient(0, 0, 0, height);
    grime.addColorStop(0, 'rgba(255,255,255,0.09)');
    grime.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = grime;
    ctx.fillRect(0, 0, width, height);
  });
  world.storefrontTexture.wrapS = THREE.RepeatWrapping;
  world.storefrontTexture.wrapT = THREE.ClampToEdgeWrapping;

  // The core first, in its original order, so the old landmarks and shots
  // keep the exact geometry they were built with.
  for (const cx of CORE_BLOCK_CENTERS) {
    for (const cz of CORE_BLOCK_CENTERS) {
      if (cx === 0 && cz === 0) continue;
      if (cx === 54 && cz === 54) {
        world.buildHotel(cx, cz);
        continue;
      }
      if (cx === -108 && cz === 54) {
        world.buildCasaLuna(cx, cz);
        continue;
      }
      if (cx === 162 && cz === 0) {
        world.buildMotorRow(cx, cz);
        continue;
      }
      if (cx === 54 && cz === 0) {
        // The enterable Solano Mall replaces the generic block; its parking
        // lot is built by parking.js once the scene is alive.
        world.mall = buildMall(world);
        continue;
      }
      if (cx === -108 && cz === 0) {
        // The Solano Fuel station replaces the generic block; its service lane
        // faces the x = -81 road.
        world.gasStation = buildGasStation(world);
        continue;
      }
      if (cx === -54 && cz === -108) {
        world.buildRadioBlock(cx, cz);
        continue;
      }
      buildBlock(world, cx, cz);
    }
  }

  // Then the 45-block extension: Old Town to the north, Foundry to the east,
  // and new neighbourhoods along the rest of the ring.
  for (const cx of BLOCK_CENTERS_X) {
    for (const cz of BLOCK_CENTERS_Z) {
      if (CORE_SET.has(cx) && CORE_SET.has(cz)) continue;
      if (cx === 0 && cz === -216) {
        buildMarketSquare(world, cx, cz);
        continue;
      }
      buildBlock(world, cx, cz, { district: districtForBlock(cx, cz), mergeBuildings: true });
    }
  }

  // The extension's tower shells share one draw call per facade style; the
  // street-level dressing still merges into the city's global batches.
  if (world.extensionParts.length > 0) {
    const byStyle = new Map();
    for (const part of world.extensionParts) {
      if (!byStyle.has(part.styleIndex)) byStyle.set(part.styleIndex, []);
      byStyle.get(part.styleIndex).push(part);
    }
    for (const [styleIndex, parts] of byStyle) {
      const mesh = new THREE.Mesh(
        mergeGeometries(parts),
        world.facadeStyles[styleIndex % world.facadeStyles.length].material,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      world.root.add(mesh);
    }
  }
}

export function styleFor(world, cx, cz, rng, district = null) {
  // Old Town keeps the warm brick and ribbon-glass facades; the Foundry
  // wears the darker warehouse palette. Core blocks ignore the district.
  if (district === 'oldtown') return rng.pick([0, 2, 4, 6, 7, 0, 2]);
  if (district === 'foundry') return rng.pick([6, 3, 0, 7, 6]);
  // The four blocks that frame Luna Plaza stay warm and masonry-heavy, so
  // the fountain reads against brick and ribbon glass rather than a wall of
  // lit teal squares.
  if (cx === 0 || cz === 0) {
    if (Math.abs(cx) + Math.abs(cz) === 54) return rng.pick([0, 2, 4, 6, 3]);
  }
  const east = clamp((cx + 142) / 338, 0, 1);
  const core = 1 - clamp((Math.abs(cx - 70) + Math.abs(cz - 55)) / 300, 0, 1);
  const downtown = east * 0.68 + core * 0.32;
  const glassy = downtown > 0.34 ? rng.chance(0.55) : rng.chance(0.2);
  if (glassy) return rng.pick([1, 5, 3, 2]);
  return rng.pick([0, 2, 4, 6, 7, 3, 1]);
}

export function buildBlock(world, cx, cz, { district = null, mergeBuildings = false } = {}) {
  const rng = world.rng;
  let height;
  let split;
  if (district === 'oldtown') {
    height = 7 + rng.range(0, 7);
    split = rng.chance(0.22);
  } else if (district === 'foundry') {
    height = 8 + rng.range(0, 8);
    split = rng.chance(0.7);
  } else {
    const east = clamp((cx + 142) / 338, 0, 1);
    const core = 1 - clamp((Math.abs(cx - 70) + Math.abs(cz - 55)) / 280, 0, 1);
    const downtown = clamp(east * 0.7 + core * 0.3, 0, 1);
    height = 8 + downtown * (26 + rng.range(0, 34));
    split = rng.chance(downtown > 0.45 ? 0.26 : 0.38);
  }
  const styleA = styleFor(world, cx, cz, rng, district);
  const styleB = styleFor(world, cx, cz, rng, district);
  const options = { district, mergeBuildings };

  if (split) {
    // Foundry warehouses split front-to-back so two wide, shallow sheds
    // face the street; the other districts keep the existing coin toss.
    const alongX = district === 'foundry' ? false : rng.chance(0.5);
    const gap = 1.8;
    if (alongX) {
      const width = (WORLD.blockSize - 8 - gap) / 2;
      const depth = rng.range(29, 32);
      buildTower(world,
        cx - 4 - width / 2 - gap / 2,
        cz,
        width,
        depth,
        Math.max(7, height * rng.range(0.42, 0.68)),
        styleA,
        rng,
        options,
      );
      buildTower(world,
        cx + 4 + width / 2 + gap / 2,
        cz,
        width,
        depth,
        height,
        styleB,
        rng,
        options,
      );
    } else {
      const depth = (WORLD.blockSize - 8 - gap) / 2;
      const width = rng.range(29, 32);
      buildTower(world,
        cx,
        cz - 4 - depth / 2 - gap / 2,
        width,
        depth,
        Math.max(7, height * rng.range(0.42, 0.68)),
        styleA,
        rng,
        options,
      );
      buildTower(world,
        cx,
        cz + 4 + depth / 2 + gap / 2,
        width,
        depth,
        height,
        styleB,
        rng,
        options,
      );
    }
  } else {
    const width = rng.range(29, 32.5);
    const depth = rng.range(29, 32.5);
    buildTower(world, cx, cz, width, depth, height, styleA, rng, options);
  }
}

export function buildTower(world, cx, cz, width, depth, height, styleIndex, rng, options = {}) {
  const { district = null, mergeBuildings = false } = options;
  const x0 = cx - width / 2;
  const x1 = cx + width / 2;
  const z0 = cz - depth / 2;
  const z1 = cz + depth / 2;
  const y0 = WORLD.sidewalkHeight;
  const h = clamp(height, 7, 80);
  const style = world.facadeStyles[styleIndex % world.facadeStyles.length];

  const mesh = makeBuildingMesh(width, h, depth, style);
  if (mergeBuildings) {
    world.extensionParts.push({
      styleIndex: styleIndex % world.facadeStyles.length,
      geometry: mesh.geometry,
      matrix: matrixFor(cx, y0 + h / 2, cz),
    });
  } else {
    mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.root.add(mesh);
  }

  world.roofParts.push({
    geometry: new THREE.BoxGeometry(width + 0.3, 0.42, depth + 0.3),
    matrix: matrixFor(cx, y0 + h + 0.2, cz),
    color: 0x2b2430,
  });
  addStorefront(world, cx, cz, width, depth);
  if (district === 'oldtown') addAwnings(world, cx, cz, width, depth, rng);

  const building = { cx, cz, x0, x1, z0, z1, baseY: y0, height: h, styleIndex };
  world.buildings.push(building);
  const collider = {
    kind: 'building',
    minX: x0,
    maxX: x1,
    minZ: z0,
    maxZ: z1,
    minY: 0,
    maxY: y0 + h + 0.5,
  };
  world.colliders.push(collider);

  if (h > 29) {
    const neon = rng.pick([0x3fe0cf, 0xff6f61, 0xffc95c]);
    addCrownBand(world.crownParts, cx, cz, width + 0.55, depth + 0.55, y0 + h + 0.52, neon);
    if (rng.chance(0.55)) {
      addBox(world.crownParts, 0.14, h * rng.range(0.32, 0.6), 0.14, x0 + 0.1, y0 + h * 0.72, z0 + 0.1, neon);
    }
  }

  let topY = y0 + h;
  let topW = width;
  let topD = depth;
  if (h > 27 && rng.chance(0.58)) {
    const upperWidth = width * rng.range(0.52, 0.7);
    const upperDepth = depth * rng.range(0.52, 0.7);
    const upperHeight = rng.range(6, Math.min(22, h * 0.5));
    const offsetX = rng.range(-(width - upperWidth) / 2, (width - upperWidth) / 2) * 0.55;
    const offsetZ = rng.range(-(depth - upperDepth) / 2, (depth - upperDepth) / 2) * 0.55;
    const ux = cx + offsetX;
    const uz = cz + offsetZ;
    const upper = makeBuildingMesh(upperWidth, upperHeight, upperDepth, style);
    if (mergeBuildings) {
      world.extensionParts.push({
        styleIndex: styleIndex % world.facadeStyles.length,
        geometry: upper.geometry,
        matrix: matrixFor(ux, topY + upperHeight / 2, uz),
      });
    } else {
      upper.position.set(ux, topY + upperHeight / 2, uz);
      upper.castShadow = true;
      upper.receiveShadow = true;
      world.root.add(upper);
    }
    world.roofParts.push({
      geometry: new THREE.BoxGeometry(upperWidth + 0.25, 0.38, upperDepth + 0.25),
      matrix: matrixFor(ux, topY + upperHeight + 0.18, uz),
      color: 0x2b2430,
    });
    if (h + upperHeight > 31) {
      const neon = rng.pick([0x3fe0cf, 0xff8f7d, 0xffc95c]);
      addCrownBand(world.crownParts, ux, uz, upperWidth + 0.45, upperDepth + 0.45, topY + upperHeight + 0.48, neon, 0.2);
    }
    collider.maxY = topY + upperHeight + 0.6;
    building.height = h + upperHeight;
    topY += upperHeight;
    topW = upperWidth;
    topD = upperDepth;
    if (district === null) addRoofProps(world, ux, uz, upperWidth, upperDepth, topY, rng);
  } else if (district === null) {
    addRoofProps(world, cx, cz, width, depth, topY, rng);
  }
  if (district === 'oldtown') addOldTownRoof(world, cx, cz, width, depth, topY, rng);
  if (district === 'foundry') addFoundryYard(world, cx, cz, width, depth, topY, rng);

  if (topW > 8 && topD > 8 && building.height > 50 && rng.chance(0.22)) {
    const mastHeight = rng.range(8, 17);
    addCylinder(world.roofParts, 0.08, 0.13, mastHeight, 5, cx + topW * 0.18, topY + mastHeight / 2, cz + topD * 0.18, 0x5b5764);
    addBeacon(world, cx + topW * 0.18, topY + mastHeight + 0.2, cz + topD * 0.18, 0.9);
  }
}

export function addStorefront(world, cx, cz, width, depth) {
  const y = WORLD.sidewalkHeight + 1.68;
  const faces = [
    { length: width, x: cx, z: cz + depth / 2 + 0.045, ry: 0 },
    { length: width, x: cx, z: cz - depth / 2 - 0.045, ry: Math.PI },
    { length: depth, x: cx + width / 2 + 0.045, z: cz, ry: Math.PI / 2 },
    { length: depth, x: cx - width / 2 - 0.045, z: cz, ry: -Math.PI / 2 },
  ];
  for (const face of faces) {
    const geometry = new THREE.PlaneGeometry(face.length, 3.25);
    const uv = geometry.attributes.uv;
    const repeat = Math.max(1, face.length / 5.2);
    for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) * repeat);
    world.storefrontParts.push({
      geometry,
      matrix: matrixFor(face.x, y, face.z, { ry: face.ry }),
    });
  }
}

// Old Town's street wall wears canvas awnings: one striped box per storefront
// bay, angled over the pavement, merged into the city's roof batch.
export function addAwnings(world, cx, cz, width, depth, rng) {
  const colors = [0x8d3d43, 0x356a63, 0x7d5b2d, 0xa4585c];
  const y = WORLD.sidewalkHeight + 3.28;
  const faces = [
    { length: width, x: cx, z: cz + depth / 2, ry: 0 },
    { length: width, x: cx, z: cz - depth / 2, ry: Math.PI },
    { length: depth, x: cx + width / 2, z: cz, ry: Math.PI / 2 },
    { length: depth, x: cx - width / 2, z: cz, ry: -Math.PI / 2 },
  ];
  for (const face of faces) {
    if (rng.chance(0.28)) continue;
    const segments = Math.max(2, Math.round(face.length / 4.2));
    const segment = face.length / segments;
    const nx = Math.sin(face.ry);
    const nz = Math.cos(face.ry);
    for (let i = 0; i < segments; i += 1) {
      const along = -face.length / 2 + segment * (i + 0.5);
      const px = face.x + Math.cos(face.ry) * along + nx * 0.72;
      const pz = face.z - Math.sin(face.ry) * along + nz * 0.72;
      addBox(
        world.roofParts,
        segment - 0.12,
        0.09,
        1.55,
        px,
        y,
        pz,
        colors[(i + Math.round(face.ry * 2)) % colors.length],
        { ry: face.ry, rx: -0.2 },
      );
      addBox(world.roofParts, 0.08, 0.62, 0.08, px + nx * 0.62, y - 0.42, pz + nz * 0.62, 0x3a2f2c);
    }
  }
}

export function addOldTownRoof(world, cx, cz, width, depth, topY, rng) {
  const chimneys = rng.int(1, 2);
  for (let i = 0; i < chimneys; i += 1) {
    const x = cx + rng.range(-width * 0.3, width * 0.3);
    const z = cz + rng.range(-depth * 0.3, depth * 0.3);
    const height = rng.range(1.8, 3.4);
    addBox(world.roofParts, 0.9, height, 0.9, x, topY + height / 2, z, 0x6d4238);
    addBox(world.roofParts, 1.05, 0.18, 1.05, x, topY + height, z, 0x3b2c2a);
  }
  if (rng.chance(0.4)) {
    addBox(world.roofParts, width * 0.34, 0.12, depth * 0.34, cx, topY + 0.1, cz, 0x5a4038);
  }
}

// The Foundry: a brick stack with a band and a red aircraft light, plus a
// pair of steel rails running along the block's yard.
export function addFoundryYard(world, cx, cz, width, depth, topY, rng) {
  if (rng.chance(0.62)) {
    const sx = cx + (rng.chance(0.5) ? -1 : 1) * (width * 0.32);
    const sz = cz + (rng.chance(0.5) ? -1 : 1) * (depth * 0.32);
    const stackHeight = rng.range(16, 26);
    addCylinder(world.roofParts, 0.85, 1.25, stackHeight, 10, sx, topY + stackHeight / 2, sz, 0x5a4038);
    addCylinder(world.roofParts, 1.0, 1.0, 0.5, 10, sx, topY + stackHeight - 2.2, sz, 0x8b6a52);
    addCylinder(world.roofParts, 0.9, 0.9, 0.35, 10, sx, topY + stackHeight - 4.4, sz, 0x8b6a52);
    addBeacon(world, sx, topY + stackHeight + 0.2, sz, 1.1);
  }
  const railColor = 0x6b6772;
  for (const side of [-1, 1]) {
    addBox(world.roofParts, 0.12, 0.08, depth + 6, cx + side * 1.2, WORLD.sidewalkHeight + 0.05, cz, railColor);
  }
  for (let z = -depth / 2; z <= depth / 2; z += 2.4) {
    addBox(world.roofParts, 2.9, 0.06, 0.28, cx, WORLD.sidewalkHeight + 0.03, cz + z, 0x3d3230);
  }
}

// A block-sized market square in Old Town: paving, eight striped stalls, a
// central bandstand and a pylon sign. No tower, so the district has an open
// public room instead of another street wall.
export function buildMarketSquare(world, cx, cz) {
  const rng = world.rng;
  const stone = canvasTexture(256, 256, (ctx, width, height) => {
    ctx.fillStyle = '#7d6458';
    ctx.fillRect(0, 0, width, height);
    const rngInner = makeRng(0x0a7b);
    ctx.strokeStyle = 'rgba(38,28,32,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= width; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }
    for (let i = 0; i < 500; i += 1) {
      const shade = rngInner.range(70, 150);
      ctx.fillStyle = `rgba(${shade},${shade - 18},${shade - 24},${rngInner.range(0.04, 0.2)})`;
      ctx.fillRect(rngInner.range(0, width), rngInner.range(0, height), rngInner.range(0.6, 2.2), rngInner.range(0.6, 2.2));
    }
  }, { repeat: [6, 6] });
  const paving = new THREE.Mesh(
    new THREE.CylinderGeometry(17.2, 17.2, 0.1, 40),
    material(0xffffff, { map: stone, roughness: 0.9, metalness: 0.01 }),
  );
  paving.position.set(cx, WORLD.sidewalkHeight + 0.05, cz);
  paving.receiveShadow = true;
  world.root.add(paving);

  const canopyColors = [0xc25a52, 0xe0c58f, 0x3f7a70, 0xd9935a];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + 0.3;
    const x = cx + Math.cos(angle) * 11.6;
    const z = cz + Math.sin(angle) * 11.6;
    const ry = -angle;
    addBox(world.roofParts, 2.8, 0.12, 1.9, x, WORLD.sidewalkHeight + 2.45, z, canopyColors[i % canopyColors.length], { ry });
    addBox(world.roofParts, 2.5, 0.8, 0.45, x, WORLD.sidewalkHeight + 0.55, z, 0x6f4c36, { ry });
    for (const side of [-1, 1]) {
      const px = x + Math.cos(angle + Math.PI / 2) * side * 1.15;
      const pz = z + Math.sin(angle + Math.PI / 2) * side * 1.15;
      addBox(world.roofParts, 0.1, 2.35, 0.1, px, WORLD.sidewalkHeight + 1.2, pz, 0x4a382c);
    }
    world.colliders.push({
      kind: 'prop',
      minX: x - 1.5, maxX: x + 1.5,
      minZ: z - 1.1, maxZ: z + 1.1,
      minY: 0, maxY: WORLD.sidewalkHeight + 2.5,
    });
  }

  addCylinder(world.roofParts, 2.6, 2.9, 0.6, 16, cx, WORLD.sidewalkHeight + 0.3, cz, 0x8b7161);
  addCylinder(world.roofParts, 0.35, 0.5, 3.1, 8, cx, WORLD.sidewalkHeight + 2.1, cz, 0x5c4a42);
  addBox(world.roofParts, 2.2, 0.18, 2.2, cx, WORLD.sidewalkHeight + 3.7, cz, 0x40342f);
  world.colliders.push({
    kind: 'prop',
    minX: cx - 2.7, maxX: cx + 2.7,
    minZ: cz - 2.7, maxZ: cz + 2.7,
    minY: 0, maxY: WORLD.sidewalkHeight + 1.2,
  });
  world.landmarks.market = { x: cx, z: cz };
  world.buildPylonSign({
    x: cx, z: cz + 23.4, baseY: WORLD.sidewalkHeight, height: 4.6,
    title: 'OLD TOWN MARKET', sub: 'STALLS OPEN BEFORE DAWN', color: '#ffc95c', accent: '#ff6f61',
    width: 9.0,
  });
  // Warm string lights over the square, at stall height.
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const x = cx + Math.cos(angle) * 8.2;
    const z = cz + Math.sin(angle) * 8.2;
    addPart(world.roofParts, new THREE.SphereGeometry(0.09, 5, 4), x, WORLD.sidewalkHeight + 3.4, z, 0xffc47a);
  }
  world.marketRng = rng;
}

export function addRoofProps(world, cx, cz, width, depth, topY, rng) {
  const margin = Math.min(width, depth) * 0.22;
  const count = rng.int(1, 3);
  for (let i = 0; i < count; i += 1) {
    const w = rng.range(1.0, 2.4);
    const d = rng.range(1.0, 2.2);
    const h = rng.range(0.7, 1.5);
    const x = cx + rng.range(-width / 2 + margin, width / 2 - margin);
    const z = cz + rng.range(-depth / 2 + margin, depth / 2 - margin);
    addBox(world.roofParts, w, h, d, x, topY + h / 2 + 0.1, z, rng.pick([0x7d7b86, 0x676670, 0x8b8178]));
    if (rng.chance(0.5)) {
      addBox(world.roofParts, w * 0.45, 0.35, d * 0.45, x, topY + h + 0.3, z, 0x55535e);
    }
  }
  if (width > 13 && depth > 13 && rng.chance(0.28)) {
    const tx = cx + rng.range(-width * 0.18, width * 0.18);
    const tz = cz + rng.range(-depth * 0.18, depth * 0.18);
    const legHeight = rng.range(1.8, 2.8);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addBox(world.roofParts, 0.16, legHeight, 0.16, tx + sx * 1.35, topY + legHeight / 2, tz + sz * 1.35, 0x4a3b34);
      }
    }
    addCylinder(world.roofParts, 1.9, 1.9, 3.2, 10, tx, topY + legHeight + 1.6, tz, 0x7c4e3a);
    addCylinder(world.roofParts, 0.15, 2.05, 1.0, 10, tx, topY + legHeight + 3.7, tz, 0x53352a);
  }
  if (rng.chance(0.18)) {
    const mx = cx + rng.range(-width * 0.25, width * 0.25);
    const mz = cz + rng.range(-depth * 0.25, depth * 0.25);
    const mast = rng.range(4, 9);
    addCylinder(world.roofParts, 0.05, 0.09, mast, 5, mx, topY + mast / 2, mz, 0x625e6b);
    addBeacon(world, mx, topY + mast + 0.15, mz, 0.7);
  }
}

export function addBeacon(world, x, y, z, scale = 1) {
  const glowIndex = world.glowField.add({
    x, y, z,
    scaleX: 6 * scale,
    scaleY: 6 * scale,
    color: 0xff5446,
    brightness: 0.85,
  });
  world.beacons.push({
    glowIndex,
    phase: world.rng.range(0, 6.28),
    speed: world.rng.range(1.1, 2.1),
  });
}
