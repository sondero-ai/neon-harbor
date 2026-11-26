// Named landmark buildings: the Sunset Hotel, Casa Luna, Motor Row, the radio
// block and Luna Plaza. Each function takes the World instance and shares the
// city's storefront, roof-prop and beacon builders through it.

import * as THREE from '../../vendor/three.module.js';
import { WORLD } from '../config.js';
import {
  canvasTexture,
  makeBuildingMesh,
  makeGlowSprite,
  mergeGeometries,
} from '../geo.js';
import {
  addBox,
  addCrownBand,
  basicMaterial,
  material,
  matrixFor,
} from '../world-kit.js';

export function buildHotel(world, cx, cz) {
  const rng = world.rng;
  const width = 31;
  const depth = 31;
  const baseHeight = 32;
  const towerWidth = 21;
  const towerDepth = 21;
  const towerHeight = 34;
  const y0 = WORLD.sidewalkHeight;
  const baseStyle = world.facadeStyles[2];
  const towerStyle = world.facadeStyles[4];

  const base = makeBuildingMesh(width, baseHeight, depth, baseStyle);
  base.position.set(cx, y0 + baseHeight / 2, cz);
  base.castShadow = true;
  base.receiveShadow = true;
  world.root.add(base);
  world.roofParts.push({
    geometry: new THREE.BoxGeometry(width + 0.3, 0.45, depth + 0.3),
    matrix: matrixFor(cx, y0 + baseHeight + 0.22, cz),
    color: 0x2b2430,
  });
  const tower = makeBuildingMesh(towerWidth, towerHeight, towerDepth, towerStyle);
  tower.position.set(cx, y0 + baseHeight + towerHeight / 2, cz);
  tower.castShadow = true;
  tower.receiveShadow = true;
  world.root.add(tower);
  world.roofParts.push({
    geometry: new THREE.BoxGeometry(towerWidth + 0.3, 0.45, towerDepth + 0.3),
    matrix: matrixFor(cx, y0 + baseHeight + towerHeight + 0.22, cz),
    color: 0x2b2430,
  });
  addCrownBand(world.crownParts, cx, cz, towerWidth + 0.7, towerDepth + 0.7, y0 + baseHeight + towerHeight + 0.55, 0xffc95c, 0.25);
  addBox(world.crownParts, 0.16, 22, 0.16, cx - towerWidth / 2 + 0.1, y0 + baseHeight + 14, cz - towerDepth / 2 + 0.1, 0x3fe0cf);
  addBox(world.crownParts, 0.16, 22, 0.16, cx + towerWidth / 2 - 0.1, y0 + baseHeight + 14, cz + towerDepth / 2 - 0.1, 0x3fe0cf);
  world.addStorefront(cx, cz, width, depth);

  const building = {
    cx, cz, x0: cx - width / 2, x1: cx + width / 2, z0: cz - depth / 2, z1: cz + depth / 2,
    baseY: y0, height: baseHeight + towerHeight, styleIndex: 1,
  };
  world.buildings.push(building);
  world.landmarks.hotel = building;
  world.colliders.push({
    kind: 'building',
    minX: building.x0, maxX: building.x1, minZ: building.z0, maxZ: building.z1,
    minY: 0, maxY: y0 + baseHeight + towerHeight + 0.6,
  });
  world.addRoofProps(cx, cz, towerWidth, towerDepth, y0 + baseHeight + towerHeight, rng);
}

export function buildCasaLuna(world, cx, cz) {
  const rng = world.rng;
  const width = 33;
  const depth = 32;
  const height = 23;
  const y0 = WORLD.sidewalkHeight;
  const style = world.facadeStyles[0];
  const mesh = makeBuildingMesh(width, height, depth, style);
  mesh.position.set(cx, y0 + height / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.root.add(mesh);
  world.roofParts.push({
    geometry: new THREE.BoxGeometry(width + 0.3, 0.45, depth + 0.3),
    matrix: matrixFor(cx, y0 + height + 0.22, cz),
    color: 0x2b2430,
  });
  // A shaded rooftop terrace under a little pergola.
  for (let i = 0; i < 5; i += 1) {
    addBox(world.roofParts, 0.12, 2.2, 0.12, cx - 8 + i * 4, y0 + height + 1.4, cz - 7, 0x3a2a2d);
  }
  addBox(world.roofParts, 18, 0.14, 5, cx, y0 + height + 2.5, cz - 7, 0xa4585c);
  addCrownBand(world.crownParts, cx, cz, width + 0.5, depth + 0.5, y0 + height + 0.5, 0xff8a72, 0.18);
  world.addStorefront(cx, cz, width, depth);
  const building = {
    cx, cz, x0: cx - width / 2, x1: cx + width / 2, z0: cz - depth / 2, z1: cz + depth / 2,
    baseY: y0, height, styleIndex: 0,
  };
  world.buildings.push(building);
  world.landmarks.casa = building;
  world.colliders.push({
    kind: 'building',
    minX: building.x0, maxX: building.x1, minZ: building.z0, maxZ: building.z1,
    minY: 0, maxY: y0 + height + 0.6,
  });
  world.addRoofProps(cx, cz, width, depth, y0 + height, rng);
}

export function buildMotorRow(world, cx, cz) {
  const rng = world.rng;
  const width = 35;
  const depth = 30;
  const height = 14;
  const y0 = WORLD.sidewalkHeight;
  const style = world.facadeStyles[6];
  const mesh = makeBuildingMesh(width, height, depth, style);
  mesh.position.set(cx, y0 + height / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.root.add(mesh);
  world.roofParts.push({
    geometry: new THREE.BoxGeometry(width + 0.3, 0.45, depth + 0.3),
    matrix: matrixFor(cx, y0 + height + 0.22, cz),
    color: 0x2b2430,
  });
  addCrownBand(world.crownParts, cx, cz, width + 0.5, depth + 0.5, y0 + height + 0.5, 0xff6f61, 0.18);
  world.addStorefront(cx, cz, width, depth);
  const building = {
    cx, cz, x0: cx - width / 2, x1: cx + width / 2, z0: cz - depth / 2, z1: cz + depth / 2,
    baseY: y0, height, styleIndex: 6,
  };
  world.buildings.push(building);
  world.landmarks.motor = building;
  world.colliders.push({
    kind: 'building',
    minX: building.x0, maxX: building.x1, minZ: building.z0, maxZ: building.z1,
    minY: 0, maxY: y0 + height + 0.6,
  });
  world.addRoofProps(cx, cz, width, depth, y0 + height, rng);
}

export function buildRadioBlock(world, cx, cz) {
  const rng = world.rng;
  const width = 23;
  const depth = 23;
  const height = 11;
  const y0 = WORLD.sidewalkHeight;
  const style = world.facadeStyles[5];
  const mesh = makeBuildingMesh(width, height, depth, style);
  mesh.position.set(cx, y0 + height / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.root.add(mesh);
  world.roofParts.push({
    geometry: new THREE.BoxGeometry(width + 0.3, 0.45, depth + 0.3),
    matrix: matrixFor(cx, y0 + height + 0.22, cz),
    color: 0x2b2430,
  });
  addCrownBand(world.crownParts, cx, cz, width + 0.5, depth + 0.5, y0 + height + 0.5, 0x3fe0cf, 0.18);
  world.addStorefront(cx, cz, width, depth);
  const building = {
    cx, cz, x0: cx - width / 2, x1: cx + width / 2, z0: cz - depth / 2, z1: cz + depth / 2,
    baseY: y0, height, styleIndex: 5,
  };
  world.buildings.push(building);
  world.landmarks.radio = building;
  world.colliders.push({
    kind: 'building',
    minX: building.x0, maxX: building.x1, minZ: building.z0, maxZ: building.z1,
    minY: 0, maxY: y0 + height + 0.6,
  });
  world.addRoofProps(cx, cz, width, depth, y0 + height, rng);

  // A lattice mast beside the station, with one red aircraft light at the top.
  const towerParts = [];
  const tx = cx + 12;
  const tz = cz + 10;
  const mastHeight = 58;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(towerParts, 0.18, mastHeight, 0.18, tx + sx * 1.5, y0 + mastHeight / 2, tz + sz * 1.5, 0x6a6774);
    }
  }
  for (let y = 5; y < mastHeight; y += 6) {
    addBox(towerParts, 3.2, 0.12, 0.12, tx, y0 + y, tz - 1.5, 0x777480);
    addBox(towerParts, 3.2, 0.12, 0.12, tx, y0 + y, tz + 1.5, 0x777480);
    addBox(towerParts, 0.12, 0.12, 3.2, tx - 1.5, y0 + y, tz, 0x777480);
    addBox(towerParts, 0.12, 0.12, 3.2, tx + 1.5, y0 + y, tz, 0x777480);
  }
  const mast = new THREE.Mesh(
    mergeGeometries(towerParts),
    material(0xffffff, { vertexColors: true, roughness: 0.6, metalness: 0.3 }),
  );
  mast.castShadow = true;
  world.root.add(mast);
  world.addBeacon(tx, y0 + mastHeight + 0.8, tz, 1.5);
  world.landmarks.mast = { x: tx, z: tz, height: mastHeight };
}

export function buildPlaza(world, cx, cz) {
  const rng = world.rng;
  const stone = canvasTexture(256, 256, (ctx, width, height) => {
    ctx.fillStyle = '#8d7774';
    ctx.fillRect(0, 0, width, height);
    const inner = ctx.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, width / 2);
    inner.addColorStop(0, 'rgba(255,225,190,0.24)');
    inner.addColorStop(0.55, 'rgba(90,65,70,0.08)');
    inner.addColorStop(1, 'rgba(30,20,32,0.35)');
    ctx.fillStyle = inner;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(48,37,44,0.45)';
    ctx.lineWidth = 2;
    for (let r = 28; r < width / 2; r += 28) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(width / 2 + Math.cos(angle) * 24, height / 2 + Math.sin(angle) * 24);
      ctx.lineTo(width / 2 + Math.cos(angle) * 128, height / 2 + Math.sin(angle) * 128);
      ctx.stroke();
    }
  });
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(15.5, 15.5, 0.08, 40),
    material(0xffffff, { map: stone, roughness: 0.88 }),
  );
  plaza.position.set(cx, WORLD.sidewalkHeight + 0.04, cz);
  plaza.receiveShadow = true;
  world.root.add(plaza);

  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.6, 0.95, 40),
    material(0x4e4049, { roughness: 0.8 }),
  );
  basin.position.set(cx, WORLD.sidewalkHeight + 0.5, cz);
  basin.castShadow = true;
  basin.receiveShadow = true;
  world.root.add(basin);

  world.fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(5.6, 5.6, 0.12, 40),
    material(0x2c7885, {
      roughness: 0.2,
      metalness: 0.12,
      emissive: 0x3fe0cf,
      emissiveIntensity: 0.45,
    }),
  );
  world.fountainWater.position.set(cx, WORLD.sidewalkHeight + 0.99, cz);
  world.root.add(world.fountainWater);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.9, 1.0, 12),
    material(0x6f5c60, { roughness: 0.85 }),
  );
  plinth.position.set(cx, WORLD.sidewalkHeight + 1.4, cz);
  plinth.castShadow = true;
  world.root.add(plinth);
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.55, 3.4, 8),
    material(0x8c7574, { roughness: 0.6, metalness: 0.2 }),
  );
  spire.position.set(cx, WORLD.sidewalkHeight + 3.4, cz);
  spire.castShadow = true;
  world.root.add(spire);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.9, 0.12, 8, 40),
    basicMaterial(0x3fe0cf),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(cx, WORLD.sidewalkHeight + 4.2, cz);
  world.root.add(ring);
  world.plazaRing = ring;
  const ringGlow = makeGlowSprite(0x3fe0cf, 11, 0.5);
  ringGlow.position.set(cx, WORLD.sidewalkHeight + 4.2, cz);
  world.root.add(ringGlow);

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const bx = cx + Math.cos(angle) * 12.5;
    const bz = cz + Math.sin(angle) * 12.5;
    addBox(world.roofParts, 1.8, 0.16, 0.6, bx, WORLD.sidewalkHeight + 0.55, bz, 0x5b454a, { ry: -angle });
    addBox(world.roofParts, 0.16, 0.45, 0.5, bx - Math.cos(angle) * 0.6, WORLD.sidewalkHeight + 0.3, bz - Math.sin(angle) * 0.6, 0x3b2e35, { ry: -angle });
    addBox(world.roofParts, 0.16, 0.45, 0.5, bx + Math.cos(angle) * 0.6, WORLD.sidewalkHeight + 0.3, bz + Math.sin(angle) * 0.6, 0x3b2e35, { ry: -angle });
    // Sit facing outward, away from the fountain.
    world.seats.push({
      x: bx,
      z: bz,
      y: WORLD.sidewalkHeight,
      yaw: Math.atan2(Math.cos(angle), Math.sin(angle)),
      kind: 'plaza',
      occupant: null,
    });
  }

  world.colliders.push({
    kind: 'prop',
    minX: cx - 6.4,
    maxX: cx + 6.4,
    minZ: cz - 6.4,
    maxZ: cz + 6.4,
    minY: 0,
    maxY: WORLD.sidewalkHeight + 0.95,
  });
  world.landmarks.plaza = { x: cx, z: cz };
  world.plazaPalmSpots = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.4;
    world.plazaPalmSpots.push({ x: cx + Math.cos(angle) * 11.2, z: cz + Math.sin(angle) * 11.2 });
  }
  world.plazaRng = rng;
}
