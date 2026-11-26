// Ground plane, sidewalk slabs, road paint, the beach and the ocean. Each
// function takes the World instance and adds its meshes to world.root in the
// constructor's original order.

import * as THREE from '../../vendor/three.module.js';
import {
  BLOCK_CENTERS_X,
  BLOCK_CENTERS_Z,
  ROADS_X,
  ROADS_Z,
  WORLD,
} from '../config.js';
import { canvasTexture, makeGlowTexture, mergeGeometries } from '../geo.js';
import { makeRng } from '../random.js';
import { addBox, material, matrixFor } from '../world-kit.js';
import { BLOCK_HALF, ROAD_HALF, WATER_Y } from './shared.js';

export function buildGround(world) {
  const asphalt = canvasTexture(128, 128, (ctx, width, height) => {
    ctx.fillStyle = '#35303d';
    ctx.fillRect(0, 0, width, height);
    const rng = makeRng(0xa55f);
    for (let i = 0; i < 1100; i += 1) {
      const shade = rng.range(24, 92);
      ctx.fillStyle = `rgba(${shade + 8},${shade + 2},${shade + 12},${rng.range(0.08, 0.35)})`;
      ctx.fillRect(rng.range(0, width), rng.range(0, height), rng.range(0.5, 2), rng.range(0.5, 2));
    }
    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = 'rgba(7,6,10,0.4)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      let x = rng.range(0, width);
      let y = rng.range(0, height);
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j += 1) {
        x += rng.range(-14, 14);
        y += rng.range(4, 18);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, { repeat: [30, 30] });

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.cityMaxX - WORLD.cityMinX, WORLD.cityMaxZ - WORLD.cityMinZ),
    material(0xffffff, { map: asphalt, roughness: 0.94, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(
    (WORLD.cityMinX + WORLD.cityMaxX) / 2,
    0,
    (WORLD.cityMinZ + WORLD.cityMaxZ) / 2,
  );
  ground.receiveShadow = true;
  world.root.add(ground);

  const pavement = canvasTexture(128, 128, (ctx, width, height) => {
    ctx.fillStyle = '#716168';
    ctx.fillRect(0, 0, width, height);
    const rng = makeRng(0x51de);
    for (let i = 0; i < 500; i += 1) {
      const shade = rng.range(72, 135);
      ctx.fillStyle = `rgba(${shade},${shade - 8},${shade + 2},${rng.range(0.06, 0.22)})`;
      ctx.fillRect(rng.range(0, width), rng.range(0, height), rng.range(0.5, 2), rng.range(0.5, 2));
    }
    ctx.strokeStyle = 'rgba(45,36,42,0.5)';
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
  }, { repeat: [1, 1] });

  world.sidewalkParts = [];
  for (const cx of BLOCK_CENTERS_X) {
    for (const cz of BLOCK_CENTERS_Z) {
      addBox(world.sidewalkParts, WORLD.blockSize, 0.15, WORLD.blockSize, cx, 0.075, cz, 0xffffff);
      addBox(world.sidewalkParts, WORLD.blockSize + 0.5, 0.18, 0.4, cx, 0.085, cz - BLOCK_HALF - 0.25, 0xcab7b1);
      addBox(world.sidewalkParts, WORLD.blockSize + 0.5, 0.18, 0.4, cx, 0.085, cz + BLOCK_HALF + 0.25, 0xcab7b1);
      addBox(world.sidewalkParts, 0.4, 0.18, WORLD.blockSize, cx - BLOCK_HALF - 0.25, 0.085, cz, 0xcab7b1);
      addBox(world.sidewalkParts, 0.4, 0.18, WORLD.blockSize, cx + BLOCK_HALF + 0.25, 0.085, cz, 0xcab7b1);
    }
  }
  const sidewalkGeometry = mergeGeometries(world.sidewalkParts);
  const sidewalkMesh = new THREE.Mesh(
    sidewalkGeometry,
    material(0xffffff, { map: pavement, vertexColors: true, roughness: 0.9, metalness: 0.01 }),
  );
  sidewalkMesh.receiveShadow = true;
  sidewalkMesh.castShadow = true;
  world.root.add(sidewalkMesh);
}

export function buildRoadMarkings(world) {
  const yellow = [];
  const white = [];
  const paintHeight = 0.018;
  const addMark = (list, width, depth, x, z) => {
    list.push({
      geometry: new THREE.BoxGeometry(width, 0.03, depth),
      matrix: matrixFor(x, paintHeight, z),
    });
  };

  // Solid paint runs between intersections, with the crosswalks left clear.
  // Each axis keeps its own spans so the wider grid paints the full asphalt.
  const paintSpans = (roads, min, max) => {
    const spans = [];
    for (let i = 0; i < roads.length - 1; i += 1) {
      const start = roads[i] + ROAD_HALF + 2.4;
      const end = roads[i + 1] - ROAD_HALF - 2.4;
      if (end - start > 2) spans.push([start, end]);
    }
    spans.unshift([min + 1.0, roads[0] - ROAD_HALF - 2.4]);
    spans.push([roads[roads.length - 1] + ROAD_HALF + 2.4, max - 1.0]);
    return spans;
  };
  const spansX = paintSpans(ROADS_X, WORLD.cityMinX, WORLD.cityMaxX);
  const spansZ = paintSpans(ROADS_Z, WORLD.cityMinZ, WORLD.cityMaxZ);

  // A line at x runs the length of the city in z, and vice versa.
  for (const line of ROADS_X) {
    for (const [start, end] of spansZ) {
      if (end - start < 2) continue;
      const length = end - start;
      const middle = (start + end) / 2;
      addMark(yellow, 0.16, length, line - 0.2, middle);
      addMark(yellow, 0.16, length, line + 0.2, middle);
      addMark(white, 0.13, length, line - ROAD_HALF + 0.72, middle);
      addMark(white, 0.13, length, line + ROAD_HALF - 0.72, middle);
    }
  }
  for (const line of ROADS_Z) {
    for (const [start, end] of spansX) {
      if (end - start < 2) continue;
      const length = end - start;
      const middle = (start + end) / 2;
      addMark(yellow, length, 0.16, middle, line - 0.2);
      addMark(yellow, length, 0.16, middle, line + 0.2);
      addMark(white, length, 0.13, middle, line - ROAD_HALF + 0.72);
      addMark(white, length, 0.13, middle, line + ROAD_HALF - 0.72);
    }
  }

  // Zebra crossings on all four approaches to every intersection.
  const stripeWidth = 0.58;
  const stripeGap = 0.65;
  const stripeSpan = 2.35;
  for (const rx of ROADS_X) {
    for (const rz of ROADS_Z) {
      for (const north of [-1, 1]) {
        const z = rz + north * (ROAD_HALF + stripeSpan / 2 + 1.0);
        for (let i = 0; i < 8; i += 1) {
          const x = rx - 3.55 + i * (stripeWidth + stripeGap);
          addMark(white, stripeWidth, stripeSpan, x, z);
        }
      }
      for (const west of [-1, 1]) {
        const x = rx + west * (ROAD_HALF + stripeSpan / 2 + 1.0);
        for (let i = 0; i < 8; i += 1) {
          const z = rz - 3.55 + i * (stripeWidth + stripeGap);
          addMark(white, stripeSpan, stripeWidth, x, z);
        }
      }
    }
  }

  const yellowMesh = new THREE.Mesh(
    mergeGeometries(yellow),
    material(0xd9b25e, { roughness: 0.72, metalness: 0.04, emissive: 0x2a1e09, emissiveIntensity: 0.4 }),
  );
  const whiteMesh = new THREE.Mesh(
    mergeGeometries(white),
    material(0xd8cfbd, { roughness: 0.76, metalness: 0.02, emissive: 0x1a1710, emissiveIntensity: 0.32 }),
  );
  yellowMesh.receiveShadow = true;
  whiteMesh.receiveShadow = true;
  world.root.add(yellowMesh, whiteMesh);
}

export function buildBeach(world) {
  const sandTexture = canvasTexture(128, 128, (ctx, width, height) => {
    ctx.fillStyle = '#c9a071';
    ctx.fillRect(0, 0, width, height);
    const rng = makeRng(0x5a4d);
    for (let i = 0; i < 1600; i += 1) {
      const value = rng.range(150, 232);
      ctx.fillStyle = `rgba(${value},${value - 20},${value - 50},${rng.range(0.08, 0.36)})`;
      ctx.fillRect(rng.range(0, width), rng.range(0, height), rng.range(0.5, 1.6), rng.range(0.5, 1.6));
    }
  }, { repeat: [14, 52] });

  // The visible sand stops at the shoreline: west of it is water, and every
  // sand metre east of it must be walkable. The 0.45 m fall is one smooth
  // slope with a ripple no deeper than 1 cm.
  const sandMinX = WORLD.shorelineX;
  const sandMaxX = WORLD.beachMaxX;
  const depth = WORLD.beachMaxZ - WORLD.beachMinZ;
  const geometry = new THREE.PlaneGeometry(sandMaxX - sandMinX, depth, 45, 128);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((sandMinX + sandMaxX) / 2, 0, (WORLD.beachMinZ + WORLD.beachMaxZ) / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, world.beachHeight(position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const beach = new THREE.Mesh(
    geometry,
    material(0xffffff, { map: sandTexture, roughness: 0.96, metalness: 0 }),
  );
  beach.receiveShadow = true;
  world.root.add(beach);
  world.beach = beach;

  // A darker wet-sand strip from the waterline a few metres inland. Its
  // alpha fades east so the transition reads as a tide line, not a bar.
  const wetTexture = canvasTexture(64, 8, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(91,65,45,0.62)');
    gradient.addColorStop(0.45, 'rgba(108,80,57,0.34)');
    gradient.addColorStop(1, 'rgba(124,96,69,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
  const wetWidth = 9;
  const wetGeometry = new THREE.PlaneGeometry(wetWidth, depth, 12, 128);
  wetGeometry.rotateX(-Math.PI / 2);
  wetGeometry.translate(WORLD.shorelineX + wetWidth / 2, 0, (WORLD.beachMinZ + WORLD.beachMaxZ) / 2);
  const wetPosition = wetGeometry.attributes.position;
  for (let i = 0; i < wetPosition.count; i += 1) {
    wetPosition.setY(i, world.beachHeight(wetPosition.getX(i), wetPosition.getZ(i)) + 0.008);
  }
  wetGeometry.computeVertexNormals();
  const wet = new THREE.Mesh(
    wetGeometry,
    new THREE.MeshStandardMaterial({
      map: wetTexture,
      transparent: true,
      roughness: 0.94,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  wet.receiveShadow = true;
  world.root.add(wet);
  world.beachWet = wet;

  const foamTexture = canvasTexture(256, 64, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    const rng = makeRng(0xf0a1);
    for (let i = 0; i < 40; i += 1) {
      const y = rng.range(4, height - 4);
      const x = rng.range(0, width);
      const length = rng.range(20, 90);
      ctx.strokeStyle = `rgba(255,244,224,${rng.range(0.08, 0.4)})`;
      ctx.lineWidth = rng.range(0.6, 2.2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + length * 0.3, y - 2, x + length * 0.7, y + 2, x + length, y);
      ctx.stroke();
    }
  }, { repeat: [1, 22] });
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, depth),
    new THREE.MeshBasicMaterial({
      map: foamTexture,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      toneMapped: false,
      color: 0xfff2dc,
    }),
  );
  foam.rotation.x = -Math.PI / 2;
  // The foam sits on the water edge itself, half over the last sand metre.
  foam.position.set(WORLD.shorelineX - 0.2, WATER_Y + 0.015, (WORLD.beachMinZ + WORLD.beachMaxZ) / 2);
  world.root.add(foam);
  world.foam = foam;
  world.foamTexture = foamTexture;
}

export function buildOcean(world) {
  const waterTexture = canvasTexture(256, 256, (ctx, width, height) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#2f6e7b');
    gradient.addColorStop(0.5, '#255966');
    gradient.addColorStop(1, '#1c4554');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const rng = makeRng(0x0cea);
    for (let i = 0; i < 240; i += 1) {
      const y = rng.range(0, height);
      const x = rng.range(-20, width);
      const length = rng.range(10, 90);
      const alpha = rng.range(0.03, 0.18);
      ctx.strokeStyle = i % 5 === 0
        ? `rgba(255,208,153,${alpha})`
        : `rgba(166,238,232,${alpha})`;
      ctx.lineWidth = rng.range(0.5, 1.7);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + length * 0.5, y - rng.range(0.5, 3), x + length, y);
      ctx.stroke();
    }
  }, { repeat: [90, 90] });
  waterTexture.wrapS = THREE.RepeatWrapping;
  waterTexture.wrapT = THREE.RepeatWrapping;

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(3200, 3200),
    material(0xffffff, {
      map: waterTexture,
      roughness: 0.36,
      metalness: 0.14,
      emissive: 0x09232b,
      emissiveIntensity: 0.32,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD.shorelineX - 1600, WATER_Y, 0);
  water.receiveShadow = true;
  world.root.add(water);
  world.water = water;
  world.waterTexture = waterTexture;

  // A single points cloud gives the water its sun glitter in one draw call.
  const sparklePositions = [];
  const sparkleRng = makeRng(0x5a17);
  for (let i = 0; i < 340; i += 1) {
    const x = sparkleRng.range(WORLD.shorelineX - 900, WORLD.shorelineX - 6);
    const z = sparkleRng.range(-500, 500);
    sparklePositions.push(x, WATER_Y + 0.035, z);
  }
  const sparkleGeometry = new THREE.BufferGeometry();
  sparkleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sparklePositions, 3));
  const sparkleMaterial = new THREE.PointsMaterial({
    size: 1.7,
    map: makeGlowTexture(),
    color: 0xffd49a,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false,
  });
  world.sparkles = new THREE.Points(sparkleGeometry, sparkleMaterial);
  world.sparkles.renderOrder = 2;
  world.root.add(world.sparkles);
}
