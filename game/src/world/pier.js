// The pier deck, its ramp and rails, the lighthouse and the boats in the
// harbor. Each function takes the World instance and adds to world.root.

import * as THREE from '../../vendor/three.module.js';
import { canvasTexture, makeGlowSprite, mergeGeometries } from '../geo.js';
import { makeRng } from '../random.js';
import {
  addBox,
  addCylinder,
  addPart,
  basicMaterial,
  material,
} from '../world-kit.js';
import { DECK, WATER_Y, clamp, lerp } from './shared.js';

export function buildPier(world) {
  const woodTexture = canvasTexture(256, 256, (ctx, width, height) => {
    ctx.fillStyle = '#6b4634';
    ctx.fillRect(0, 0, width, height);
    const rng = makeRng(0x0d0d);
    for (let y = 0; y < height; y += 21) {
      ctx.fillStyle = y % 42 === 0 ? '#754d38' : '#644131';
      ctx.fillRect(0, y, width, 19);
      ctx.fillStyle = 'rgba(25,14,14,0.52)';
      ctx.fillRect(0, y + 19, width, 2);
      for (let x = 0; x < width; x += 64) {
        ctx.fillRect(x + ((y * 13) % 64), y, 2, 19);
      }
    }
    for (let i = 0; i < 450; i += 1) {
      ctx.fillStyle = `rgba(${rng.range(40, 115)},${rng.range(24, 70)},${rng.range(18, 50)},${rng.range(0.06, 0.25)})`;
      ctx.fillRect(rng.range(0, width), rng.range(0, height), rng.range(1, 8), 1);
    }
  }, { repeat: [20, 3] });
  woodTexture.wrapS = THREE.RepeatWrapping;
  woodTexture.wrapT = THREE.RepeatWrapping;

  const deckLength = DECK.maxX - DECK.minX;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(deckLength, 0.36, DECK.halfWidth * 2),
    material(0xffffff, { map: woodTexture, roughness: 0.86, metalness: 0.01 }),
  );
  deck.position.set((DECK.minX + DECK.maxX) / 2, DECK.deckY - 0.18, DECK.z);
  deck.castShadow = true;
  deck.receiveShadow = true;
  world.root.add(deck);

  const startY = world.beachHeight(DECK.rampMaxX, DECK.z);
  const rise = DECK.deckY - startY;
  const run = DECK.rampMaxX - DECK.rampMinX;
  const rampAngle = Math.atan2(rise, run);
  const rampLength = Math.hypot(run, rise);
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(rampLength, 0.3, DECK.rampHalfWidth * 2),
    material(0xffffff, { map: woodTexture, roughness: 0.86, metalness: 0.01 }),
  );
  ramp.position.set((DECK.rampMinX + DECK.rampMaxX) / 2, (startY + DECK.deckY) / 2 - 0.15, DECK.z);
  ramp.rotation.z = -rampAngle;
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  world.root.add(ramp);

  // Piles and cross beams below the deck.
  const pileParts = [];
  for (let x = DECK.minX + 7; x < DECK.maxX - 3; x += 13) {
    for (const side of [-1, 1]) {
      addCylinder(pileParts, 0.28, 0.38, 2.6, 7, x, 0.15, DECK.z + side * (DECK.halfWidth - 1.1), 0x4a3328);
    }
    addBox(pileParts, 0.28, 0.28, DECK.halfWidth * 2 - 1.4, x, DECK.deckY - 0.55, DECK.z, 0x503729);
  }
  const piles = new THREE.Mesh(
    mergeGeometries(pileParts),
    material(0xffffff, { vertexColors: true, roughness: 0.9 }),
  );
  piles.receiveShadow = true;
  world.root.add(piles);

  // Railings, their posts, and a line of warm bulbs along both sides.
  const railParts = [];
  const bulbParts = [];
  const railColor = 0x3b3238;
  for (const side of [-1, 1]) {
    const z = DECK.z + side * (DECK.halfWidth - 0.4);
    for (let x = DECK.minX + 2; x < DECK.maxX - 1; x += 4) {
      addBox(railParts, 0.12, 1.15, 0.12, x, DECK.deckY + 0.57, z, railColor);
      if ((Math.round((x - DECK.minX) / 4) % 2) === 0) {
        addPart(bulbParts, new THREE.SphereGeometry(0.1, 6, 5), x, DECK.deckY + 1.18, z, 0xffc47a);
      }
    }
    addBox(railParts, deckLength - 3, 0.1, 0.1, (DECK.minX + DECK.maxX) / 2, DECK.deckY + 1.13, z, railColor);
    addBox(railParts, deckLength - 3, 0.08, 0.08, (DECK.minX + DECK.maxX) / 2, DECK.deckY + 0.62, z, railColor);
    // Ramp rails.
    for (const rampSide of [-1, 1]) {
      const rz = DECK.z + rampSide * (DECK.rampHalfWidth - 0.35);
      addBox(railParts, rampLength, 0.09, 0.09, (DECK.rampMinX + DECK.rampMaxX) / 2, (startY + DECK.deckY) / 2 + 1.0, rz, railColor, { rz: -rampAngle });
      for (let x = DECK.rampMinX + 0.6; x < DECK.rampMaxX; x += 4) {
        const t = clamp((DECK.rampMaxX - x) / run, 0, 1);
        addBox(railParts, 0.11, 1.1, 0.11, x, lerp(startY, DECK.deckY, t) + 0.55, rz, railColor);
      }
    }
  }
  const rails = new THREE.Mesh(
    mergeGeometries(railParts),
    material(0xffffff, { vertexColors: true, roughness: 0.6, metalness: 0.25 }),
  );
  rails.castShadow = true;
  world.root.add(rails);
  const pierBulbMaterial = basicMaterial(0xffffff, { vertexColors: true });
  world.pierBulbMaterial = pierBulbMaterial;
  const bulbs = new THREE.Mesh(
    mergeGeometries(bulbParts),
    pierBulbMaterial,
  );
  world.root.add(bulbs);
  world.pierBulbParts = bulbParts;

  for (let x = DECK.minX + 10; x < DECK.maxX - 8; x += 20) {
    for (const side of [-1, 1]) {
      const glowIndex = world.glowField.add({
        x,
        y: DECK.deckY + 1.35,
        z: DECK.z + side * (DECK.halfWidth - 0.4),
        scaleX: 2.8,
        color: 0xffb46a,
        brightness: 0.4,
      });
      world.pierGlowIndices.push(glowIndex);
    }
  }

  // The pier is pedestrian-only, so every prop, bench, barrel, crate and
  // railing gets a real collider. Pedestrians, officers and mission enemies
  // all resolve against the same list, and Vehicle.collidesAt refuses the
  // whole deck through World.vehicleBlocked.
  const pierCollider = (cx, cz, width, depth, height = 1.2) => {
    world.colliders.push({
      kind: 'prop',
      minX: cx - width / 2,
      maxX: cx + width / 2,
      minZ: cz - depth / 2,
      maxZ: cz + depth / 2,
      minY: 0,
      maxY: DECK.deckY + height,
    });
  };

  // Crates, benches, barrels and a small bait shack.
  const propParts = [];
  const propRng = makeRng(0xc4a7);
  world.pierCrates = [];
  for (let i = 0; i < 12; i += 1) {
    const x = propRng.range(DECK.minX + 8, DECK.maxX - 12);
    const side = propRng.chance(0.5) ? -1 : 1;
    const z = DECK.z + side * propRng.range(3.4, DECK.halfWidth - 2.2);
    const size = propRng.range(0.8, 1.5);
    addBox(propParts, size, size, size, x, DECK.deckY + size / 2, z, propRng.pick([0x8a5f3d, 0x70482f, 0x9b6a42]), { ry: propRng.range(0, 1) });
    if (propRng.chance(0.35)) {
      addBox(propParts, size * 0.8, size * 0.8, size * 0.8, x + 0.2, DECK.deckY + size * 1.35, z - 0.1, 0x6f4a35, { ry: propRng.range(0, 1) });
    }
    world.pierCrates.push({ x, z, size });
    pierCollider(x, z, size, size, size + 0.4);
  }
  for (let i = 0; i < 5; i += 1) {
    const x = DECK.minX + 18 + i * 24;
    const z = DECK.z - DECK.halfWidth + 2.1;
    addBox(propParts, 2.2, 0.16, 0.62, x, DECK.deckY + 0.55, z, 0x603f2f);
    addBox(propParts, 0.14, 0.5, 0.5, x - 0.8, DECK.deckY + 0.27, z, 0x3f2b22);
    addBox(propParts, 0.14, 0.5, 0.5, x + 0.8, DECK.deckY + 0.27, z, 0x3f2b22);
    pierCollider(x, z, 2.2, 0.62, 0.8);
    // The anchor sits on the deck in front of the bench, clear of its
    // collider, facing out across the planks.
    world.seats.push({ x, z: z + 0.9, y: DECK.deckY, yaw: 0, kind: 'pier', occupant: null });
  }
  for (let i = 0; i < 4; i += 1) {
    const x = DECK.minX + 34 + i * 27;
    const z = DECK.z + DECK.halfWidth - 2.1;
    addCylinder(propParts, 0.42, 0.48, 1.1, 9, x, DECK.deckY + 0.55, z, 0x76513b);
    pierCollider(x, z, 0.9, 0.9, 1.1);
  }
  const shackX = -188;
  const shackZ = DECK.z - 4;
  addBox(propParts, 6.2, 2.6, 4.2, shackX, DECK.deckY + 1.3, shackZ, 0x6d4b37);
  addBox(propParts, 6.8, 0.25, 4.8, shackX, DECK.deckY + 2.72, shackZ, 0x3d2c26);
  addBox(propParts, 2.8, 1.05, 0.06, shackX + 0.6, DECK.deckY + 1.6, shackZ + 2.12, 0xffb45f);
  addBox(propParts, 0.06, 1.05, 2.2, shackX - 3.1, DECK.deckY + 1.6, shackZ, 0xffc47a);
  pierCollider(shackX, shackZ, 6.2, 4.2, 2.6);

  // Thin railing strips: the visual rail is already there; these keep the
  // player and the crowd on the planks instead of walking through the posts.
  const deckRailMinX = DECK.minX + 2;
  const deckRailMaxX = DECK.maxX - 1;
  for (const side of [-1, 1]) {
    pierCollider((deckRailMinX + deckRailMaxX) / 2, DECK.z + side * (DECK.halfWidth - 0.4), deckRailMaxX - deckRailMinX, 0.24, 1.2);
    pierCollider((DECK.rampMinX + DECK.rampMaxX) / 2, DECK.z + side * (DECK.rampHalfWidth - 0.35), DECK.rampMaxX - DECK.rampMinX, 0.22, 1.2);
  }

  const pierProps = new THREE.Mesh(
    mergeGeometries(propParts),
    material(0xffffff, { vertexColors: true, roughness: 0.85 }),
  );
  pierProps.castShadow = true;
  pierProps.receiveShadow = true;
  world.root.add(pierProps);
}

export function buildLighthouse(world) {
  const x = -304;
  const z = DECK.z;
  const baseY = DECK.deckY;
  const parts = [];
  addCylinder(parts, 4.5, 4.6, 0.9, 20, x, baseY + 0.45, z, 0x7a655c);
  addCylinder(parts, 3.3, 3.8, 0.35, 20, x, baseY + 1.05, z, 0x584a48);
  const bands = 6;
  let y = baseY + 1.2;
  for (let i = 0; i < bands; i += 1) {
    const radiusTop = 2.05 - (i + 1) * 0.08;
    const radiusBottom = 2.13 - i * 0.08;
    const height = 2.2;
    addCylinder(parts, radiusTop, radiusBottom, height, 16, x, y + height / 2, z, i % 2 === 0 ? 0xf1dfc2 : 0xd9545a);
    y += height;
  }
  addCylinder(parts, 2.45, 2.1, 0.3, 20, x, y + 0.15, z, 0x342d35);
  addCylinder(parts, 1.65, 1.65, 0.5, 16, x, y + 0.55, z, 0x4a3a3a);
  const tower = new THREE.Mesh(
    mergeGeometries(parts),
    material(0xffffff, { vertexColors: true, roughness: 0.72, metalness: 0.03 }),
  );
  tower.castShadow = true;
  tower.receiveShadow = true;
  world.root.add(tower);

  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(1.65, 1.65, 2.1, 12),
    basicMaterial(0xffd58a, { transparent: true, opacity: 0.9 }),
  );
  lantern.position.set(x, y + 1.75, z);
  world.root.add(lantern);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.1, 1.35, 14),
    material(0xb2484f, { roughness: 0.7 }),
  );
  roof.position.set(x, y + 3.45, z);
  roof.castShadow = true;
  world.root.add(roof);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    basicMaterial(0xffdf9f),
  );
  cap.position.set(x, y + 4.2, z);
  world.root.add(cap);

  world.glowField.add({
    x,
    y: y + 1.8,
    z,
    scaleX: 24,
    color: 0xffd27d,
    brightness: 0.9,
  });

  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdd9d,
    transparent: true,
    opacity: 0.115,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  world.beam = new THREE.Group();
  world.beam.position.set(x, y + 1.8, z);
  for (const direction of [1, -1]) {
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 4.2, 44, 12, 1, true),
      beamMaterial,
    );
    cone.rotation.z = direction * Math.PI / 2;
    cone.position.x = direction * 22;
    world.beam.add(cone);
  }
  world.root.add(world.beam);

  const light = new THREE.PointLight(0xffc27a, 24, 65, 2);
  light.position.set(x, y + 1.8, z);
  world.root.add(light);

  world.colliders.push({
    kind: 'prop',
    minX: x - 4.8,
    maxX: x + 4.8,
    minZ: z - 4.8,
    maxZ: z + 4.8,
    minY: 0,
    maxY: y + 4.2,
  });
  world.landmarks.lighthouse = { x, z, top: y + 4.2 };
  world.addBeacon(x, y + 4.3, z, 1.2);
}

export function buildBoats(world) {
  const makeBoat = (x, z, rotation, scale, sail) => {
    const group = new THREE.Group();
    group.position.set(x, WATER_Y, z);
    group.rotation.y = rotation;
    group.scale.setScalar(scale);
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(9, 1.15, 3.2),
      material(0x58423c, { roughness: 0.75 }),
    );
    hull.position.y = 0.15;
    hull.castShadow = true;
    group.add(hull);
    const bow = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 3.2, 4),
      material(0x58423c, { roughness: 0.75 }),
    );
    bow.rotation.z = -Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(5.1, 0.15, 0);
    bow.scale.set(1, 1, 0.5);
    group.add(bow);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 1.7, 2.3),
      material(0xc9b59a, { roughness: 0.8 }),
    );
    cabin.position.set(-0.7, 1.5, 0);
    cabin.castShadow = true;
    group.add(cabin);
    const window = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.65),
      basicMaterial(0xffb45f),
    );
    window.position.set(-0.7, 1.62, 1.17);
    group.add(window);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 7.2, 6),
      material(0x3b3132, { roughness: 0.7 }),
    );
    mast.position.set(1.3, 4.1, 0);
    group.add(mast);
    if (sail) {
      const sailGeometry = new THREE.BufferGeometry();
      sailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0.8, 0,
        0, 6.7, 0,
        3.4, 1.0, 0,
      ], 3));
      sailGeometry.computeVertexNormals();
      const sailMesh = new THREE.Mesh(
        sailGeometry,
        new THREE.MeshStandardMaterial({
          color: 0xeadfc8,
          roughness: 0.9,
          side: THREE.DoubleSide,
        }),
      );
      sailMesh.position.set(1.35, 0, 0);
      group.add(sailMesh);
    }
    const light = makeGlowSprite(0xffc47a, 4.2, 0.7);
    light.position.set(1.3, 7.9, 0);
    group.add(light);
    world.root.add(group);
    world.boats.push({ group, baseY: WATER_Y, phase: world.rng.range(0, 6.28), speed: world.rng.range(0.5, 0.9) });
  };
  makeBoat(-282, 44, 0.34, 0.9, true);
  makeBoat(-360, 158, -0.5, 0.75, false);
  makeBoat(-446, -64, 0.9, 0.6, true);

  // Channel buoy with a small red lamp.
  const buoy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.9, 1.2, 10),
    material(0xc25a52, { roughness: 0.7 }),
  );
  buoy.position.set(-252, WATER_Y + 0.4, 24);
  world.root.add(buoy);
  world.addBeacon(-252, WATER_Y + 1.3, 24, 0.8);
}
