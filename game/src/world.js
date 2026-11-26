// The harbor itself: a procedural neon coastal city built from one seed. The
// file lays out roads, sidewalks, towers, storefronts, signs, palms, lamps, the
// beach, the pier, the lighthouse and the water, then answers the three
// questions the rest of the game asks of a world: how high is the ground here,
// can something stand here, and where can the camera sit without entering a
// wall. Mesh factories live in geo.js; this file makes the city decisions.

import * as THREE from '../vendor/three.module.js';
import {
  BLOCK_CENTERS_X,
  BLOCK_CENTERS_Z,
  CORE_BLOCK_CENTERS,
  PALETTE,
  QUALITY_PRESETS,
  ROADS_X,
  ROADS_Z,
  SEED,
  WORLD,
} from './config.js';
import {
  canvasTexture,
  makeBillboardTexture,
  makeBuildingMesh,
  makeCloudTexture,
  makeFacadeStyles,
  makeGlowSprite,
  makeGlowTexture,
  makeLampGeometry,
  makePalmGeometry,
  makePalmMaterial,
  makeSignTexture,
  makeStreetlightGeometry,
  mergeGeometries,
} from './geo.js';
import { GlowField } from './glow-field.js';
import { buildMall } from './mall.js';
import { buildGasStation } from './gas-station.js';
import { makeRng } from './random.js';
import {
  addBox,
  addCrownBand,
  addCylinder,
  addPart,
  basicMaterial,
  material,
  matrixFor,
} from './world-kit.js';

import {
  BLOCK_HALF,
  CORE_SET,
  DECK,
  ROAD_HALF,
  SUN_DIR,
  UP,
  WATER_Y,
  clamp,
  districtForBlock,
  lerp,
} from './world/shared.js';
import {
  beachHeight,
  clipCamera,
  collides,
  groundHeightAt,
  lineBlocked,
  onBlock,
  onPierDeck,
  onRamp,
  raycast,
  resolveCircle,
  vehicleBlocked,
} from './world/query.js';
import {
  applyEnvironment,
  buildClouds,
  buildLights,
  buildSky,
  focusAt,
  setSky,
} from './world/sky.js';
import { buildBeach, buildGround, buildOcean, buildRoadMarkings } from './world/ground.js';

export class World {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.scene.fog = new THREE.Fog(PALETTE.fog, 72, 680);
    this.root = new THREE.Group();
    this.root.name = 'harbor';
    scene.add(this.root);
    this.skyRoot = new THREE.Group();
    this.skyRoot.name = 'sky';
    scene.add(this.skyRoot);

    this.colliders = [];
    // Sittable anchors shared by the plaza, the beach, the pier and (later)
    // the mall. Each seat is { x, z, y, yaw, kind, occupant }; occupant is
    // 'player' or a crowd pedestrian, and a free seat has occupant null.
    this.seats = [];
    this.mall = null;
    this.buildings = [];
    this.neonSigns = [];
    this.beacons = [];
    this.clouds = [];
    this.boats = [];
    this.landmarks = {};
    this.rng = makeRng(SEED ^ 0x4a17);
    this.blocks = BLOCK_CENTERS_X.length * BLOCK_CENTERS_Z.length;
    this.glowField = new GlowField(scene);
    this.streetGlowIndices = [];
    this.pierGlowIndices = [];

    buildSky(this);
    buildLights(this);
    buildGround(this);
    buildRoadMarkings(this);
    buildBeach(this);
    buildOcean(this);
    this.buildCity();
    this.buildPlaza(0, 0);
    this.buildBeachProps();
    this.buildPier();
    this.buildLighthouse();
    this.buildBoats();
    this.buildVegetation();
    this.buildStreetlights();
    this.buildSigns();
    buildClouds(this);
    this.finishMergedMeshes();
    this.glowField.build();
  }

  setObjectiveMarker(x, z) {
    if (!this.objectiveMarker) {
      const group = new THREE.Group();
      group.name = 'objective-marker';
      const diamondMaterial = new THREE.MeshBasicMaterial({
        color: 0xff7a68,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), diamondMaterial);
      diamond.scale.set(0.74, 1.28, 0.74);
      diamond.position.y = 3.4;
      group.add(diamond);
      const inner = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38, 0),
        new THREE.MeshBasicMaterial({ color: 0xfff1cf, toneMapped: false }),
      );
      inner.scale.set(0.7, 1.2, 0.7);
      inner.position.y = 3.4;
      group.add(inner);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6f61,
        transparent: true,
        opacity: 0.62,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 8, 32), ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      group.add(ring);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 1.35, 15, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xff7a68,
          transparent: true,
          opacity: 0.07,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
          fog: false,
        }),
      );
      beam.position.y = 8.2;
      group.add(beam);
      const glow = makeGlowSprite(0xff8a70, 7.5, 0.48);
      glow.position.y = 3.4;
      group.add(glow);
      this.root.add(group);
      this.objectiveMarker = { group, diamond, inner, ring, glow };
    }
    const ground = this.groundHeightAt(x, z);
    this.objectiveMarker.group.position.set(x, ground, z);
  }

  setQuality(quality) {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.high;
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  // ---------------------------------------------------------------- city

  buildCity() {
    this.facadeStyles = makeFacadeStyles();
    for (const style of this.facadeStyles) {
      // The environment scales window light against this base every frame.
      style.baseEmissive = style.material.emissiveIntensity;
    }
    this.roofParts = [];
    this.crownParts = [];
    this.storefrontParts = [];
    this.extensionParts = [];

    this.storefrontTexture = canvasTexture(1024, 256, (ctx, width, height) => {
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
    this.storefrontTexture.wrapS = THREE.RepeatWrapping;
    this.storefrontTexture.wrapT = THREE.ClampToEdgeWrapping;

    // The core first, in its original order, so the old landmarks and shots
    // keep the exact geometry they were built with.
    for (const cx of CORE_BLOCK_CENTERS) {
      for (const cz of CORE_BLOCK_CENTERS) {
        if (cx === 0 && cz === 0) continue;
        if (cx === 54 && cz === 54) {
          this.buildHotel(cx, cz);
          continue;
        }
        if (cx === -108 && cz === 54) {
          this.buildCasaLuna(cx, cz);
          continue;
        }
        if (cx === 162 && cz === 0) {
          this.buildMotorRow(cx, cz);
          continue;
        }
        if (cx === 54 && cz === 0) {
          // The enterable Solano Mall replaces the generic block; its parking
          // lot is built by parking.js once the scene is alive.
          this.mall = buildMall(this);
          continue;
        }
        if (cx === -108 && cz === 0) {
          // The Solano Fuel station replaces the generic block; its service lane
          // faces the x = -81 road.
          this.gasStation = buildGasStation(this);
          continue;
        }
        if (cx === -54 && cz === -108) {
          this.buildRadioBlock(cx, cz);
          continue;
        }
        this.buildBlock(cx, cz);
      }
    }

    // Then the 45-block extension: Old Town to the north, Foundry to the east,
    // and new neighbourhoods along the rest of the ring.
    for (const cx of BLOCK_CENTERS_X) {
      for (const cz of BLOCK_CENTERS_Z) {
        if (CORE_SET.has(cx) && CORE_SET.has(cz)) continue;
        if (cx === 0 && cz === -216) {
          this.buildMarketSquare(cx, cz);
          continue;
        }
        this.buildBlock(cx, cz, { district: districtForBlock(cx, cz), mergeBuildings: true });
      }
    }

    // The extension's tower shells share one draw call per facade style; the
    // street-level dressing still merges into the city's global batches.
    if (this.extensionParts.length > 0) {
      const byStyle = new Map();
      for (const part of this.extensionParts) {
        if (!byStyle.has(part.styleIndex)) byStyle.set(part.styleIndex, []);
        byStyle.get(part.styleIndex).push(part);
      }
      for (const [styleIndex, parts] of byStyle) {
        const mesh = new THREE.Mesh(
          mergeGeometries(parts),
          this.facadeStyles[styleIndex % this.facadeStyles.length].material,
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.root.add(mesh);
      }
    }
  }

  styleFor(cx, cz, rng, district = null) {
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

  buildBlock(cx, cz, { district = null, mergeBuildings = false } = {}) {
    const rng = this.rng;
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
    const styleA = this.styleFor(cx, cz, rng, district);
    const styleB = this.styleFor(cx, cz, rng, district);
    const options = { district, mergeBuildings };

    if (split) {
      // Foundry warehouses split front-to-back so two wide, shallow sheds
      // face the street; the other districts keep the existing coin toss.
      const alongX = district === 'foundry' ? false : rng.chance(0.5);
      const gap = 1.8;
      if (alongX) {
        const width = (WORLD.blockSize - 8 - gap) / 2;
        const depth = rng.range(29, 32);
        this.buildTower(
          cx - 4 - width / 2 - gap / 2,
          cz,
          width,
          depth,
          Math.max(7, height * rng.range(0.42, 0.68)),
          styleA,
          rng,
          options,
        );
        this.buildTower(
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
        this.buildTower(
          cx,
          cz - 4 - depth / 2 - gap / 2,
          width,
          depth,
          Math.max(7, height * rng.range(0.42, 0.68)),
          styleA,
          rng,
          options,
        );
        this.buildTower(
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
      this.buildTower(cx, cz, width, depth, height, styleA, rng, options);
    }
  }

  buildTower(cx, cz, width, depth, height, styleIndex, rng, options = {}) {
    const { district = null, mergeBuildings = false } = options;
    const x0 = cx - width / 2;
    const x1 = cx + width / 2;
    const z0 = cz - depth / 2;
    const z1 = cz + depth / 2;
    const y0 = WORLD.sidewalkHeight;
    const h = clamp(height, 7, 80);
    const style = this.facadeStyles[styleIndex % this.facadeStyles.length];

    const mesh = makeBuildingMesh(width, h, depth, style);
    if (mergeBuildings) {
      this.extensionParts.push({
        styleIndex: styleIndex % this.facadeStyles.length,
        geometry: mesh.geometry,
        matrix: matrixFor(cx, y0 + h / 2, cz),
      });
    } else {
      mesh.position.set(cx, y0 + h / 2, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    this.roofParts.push({
      geometry: new THREE.BoxGeometry(width + 0.3, 0.42, depth + 0.3),
      matrix: matrixFor(cx, y0 + h + 0.2, cz),
      color: 0x2b2430,
    });
    this.addStorefront(cx, cz, width, depth);
    if (district === 'oldtown') this.addAwnings(cx, cz, width, depth, rng);

    const building = { cx, cz, x0, x1, z0, z1, baseY: y0, height: h, styleIndex };
    this.buildings.push(building);
    const collider = {
      kind: 'building',
      minX: x0,
      maxX: x1,
      minZ: z0,
      maxZ: z1,
      minY: 0,
      maxY: y0 + h + 0.5,
    };
    this.colliders.push(collider);

    if (h > 29) {
      const neon = rng.pick([0x3fe0cf, 0xff6f61, 0xffc95c]);
      addCrownBand(this.crownParts, cx, cz, width + 0.55, depth + 0.55, y0 + h + 0.52, neon);
      if (rng.chance(0.55)) {
        addBox(this.crownParts, 0.14, h * rng.range(0.32, 0.6), 0.14, x0 + 0.1, y0 + h * 0.72, z0 + 0.1, neon);
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
        this.extensionParts.push({
          styleIndex: styleIndex % this.facadeStyles.length,
          geometry: upper.geometry,
          matrix: matrixFor(ux, topY + upperHeight / 2, uz),
        });
      } else {
        upper.position.set(ux, topY + upperHeight / 2, uz);
        upper.castShadow = true;
        upper.receiveShadow = true;
        this.root.add(upper);
      }
      this.roofParts.push({
        geometry: new THREE.BoxGeometry(upperWidth + 0.25, 0.38, upperDepth + 0.25),
        matrix: matrixFor(ux, topY + upperHeight + 0.18, uz),
        color: 0x2b2430,
      });
      if (h + upperHeight > 31) {
        const neon = rng.pick([0x3fe0cf, 0xff8f7d, 0xffc95c]);
        addCrownBand(this.crownParts, ux, uz, upperWidth + 0.45, upperDepth + 0.45, topY + upperHeight + 0.48, neon, 0.2);
      }
      collider.maxY = topY + upperHeight + 0.6;
      building.height = h + upperHeight;
      topY += upperHeight;
      topW = upperWidth;
      topD = upperDepth;
      if (district === null) this.addRoofProps(ux, uz, upperWidth, upperDepth, topY, rng);
    } else if (district === null) {
      this.addRoofProps(cx, cz, width, depth, topY, rng);
    }
    if (district === 'oldtown') this.addOldTownRoof(cx, cz, width, depth, topY, rng);
    if (district === 'foundry') this.addFoundryYard(cx, cz, width, depth, topY, rng);

    if (topW > 8 && topD > 8 && building.height > 50 && rng.chance(0.22)) {
      const mastHeight = rng.range(8, 17);
      addCylinder(this.roofParts, 0.08, 0.13, mastHeight, 5, cx + topW * 0.18, topY + mastHeight / 2, cz + topD * 0.18, 0x5b5764);
      this.addBeacon(cx + topW * 0.18, topY + mastHeight + 0.2, cz + topD * 0.18, 0.9);
    }
  }

  addStorefront(cx, cz, width, depth) {
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
      this.storefrontParts.push({
        geometry,
        matrix: matrixFor(face.x, y, face.z, { ry: face.ry }),
      });
    }
  }

  // Old Town's street wall wears canvas awnings: one striped box per storefront
  // bay, angled over the pavement, merged into the city's roof batch.
  addAwnings(cx, cz, width, depth, rng) {
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
          this.roofParts,
          segment - 0.12,
          0.09,
          1.55,
          px,
          y,
          pz,
          colors[(i + Math.round(face.ry * 2)) % colors.length],
          { ry: face.ry, rx: -0.2 },
        );
        addBox(this.roofParts, 0.08, 0.62, 0.08, px + nx * 0.62, y - 0.42, pz + nz * 0.62, 0x3a2f2c);
      }
    }
  }

  addOldTownRoof(cx, cz, width, depth, topY, rng) {
    const chimneys = rng.int(1, 2);
    for (let i = 0; i < chimneys; i += 1) {
      const x = cx + rng.range(-width * 0.3, width * 0.3);
      const z = cz + rng.range(-depth * 0.3, depth * 0.3);
      const height = rng.range(1.8, 3.4);
      addBox(this.roofParts, 0.9, height, 0.9, x, topY + height / 2, z, 0x6d4238);
      addBox(this.roofParts, 1.05, 0.18, 1.05, x, topY + height, z, 0x3b2c2a);
    }
    if (rng.chance(0.4)) {
      addBox(this.roofParts, width * 0.34, 0.12, depth * 0.34, cx, topY + 0.1, cz, 0x5a4038);
    }
  }

  // The Foundry: a brick stack with a band and a red aircraft light, plus a
  // pair of steel rails running along the block's yard.
  addFoundryYard(cx, cz, width, depth, topY, rng) {
    if (rng.chance(0.62)) {
      const sx = cx + (rng.chance(0.5) ? -1 : 1) * (width * 0.32);
      const sz = cz + (rng.chance(0.5) ? -1 : 1) * (depth * 0.32);
      const stackHeight = rng.range(16, 26);
      addCylinder(this.roofParts, 0.85, 1.25, stackHeight, 10, sx, topY + stackHeight / 2, sz, 0x5a4038);
      addCylinder(this.roofParts, 1.0, 1.0, 0.5, 10, sx, topY + stackHeight - 2.2, sz, 0x8b6a52);
      addCylinder(this.roofParts, 0.9, 0.9, 0.35, 10, sx, topY + stackHeight - 4.4, sz, 0x8b6a52);
      this.addBeacon(sx, topY + stackHeight + 0.2, sz, 1.1);
    }
    const railColor = 0x6b6772;
    for (const side of [-1, 1]) {
      addBox(this.roofParts, 0.12, 0.08, depth + 6, cx + side * 1.2, WORLD.sidewalkHeight + 0.05, cz, railColor);
    }
    for (let z = -depth / 2; z <= depth / 2; z += 2.4) {
      addBox(this.roofParts, 2.9, 0.06, 0.28, cx, WORLD.sidewalkHeight + 0.03, cz + z, 0x3d3230);
    }
  }

  // A block-sized market square in Old Town: paving, eight striped stalls, a
  // central bandstand and a pylon sign. No tower, so the district has an open
  // public room instead of another street wall.
  buildMarketSquare(cx, cz) {
    const rng = this.rng;
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
    this.root.add(paving);

    const canopyColors = [0xc25a52, 0xe0c58f, 0x3f7a70, 0xd9935a];
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + 0.3;
      const x = cx + Math.cos(angle) * 11.6;
      const z = cz + Math.sin(angle) * 11.6;
      const ry = -angle;
      addBox(this.roofParts, 2.8, 0.12, 1.9, x, WORLD.sidewalkHeight + 2.45, z, canopyColors[i % canopyColors.length], { ry });
      addBox(this.roofParts, 2.5, 0.8, 0.45, x, WORLD.sidewalkHeight + 0.55, z, 0x6f4c36, { ry });
      for (const side of [-1, 1]) {
        const px = x + Math.cos(angle + Math.PI / 2) * side * 1.15;
        const pz = z + Math.sin(angle + Math.PI / 2) * side * 1.15;
        addBox(this.roofParts, 0.1, 2.35, 0.1, px, WORLD.sidewalkHeight + 1.2, pz, 0x4a382c);
      }
      this.colliders.push({
        kind: 'prop',
        minX: x - 1.5, maxX: x + 1.5,
        minZ: z - 1.1, maxZ: z + 1.1,
        minY: 0, maxY: WORLD.sidewalkHeight + 2.5,
      });
    }

    addCylinder(this.roofParts, 2.6, 2.9, 0.6, 16, cx, WORLD.sidewalkHeight + 0.3, cz, 0x8b7161);
    addCylinder(this.roofParts, 0.35, 0.5, 3.1, 8, cx, WORLD.sidewalkHeight + 2.1, cz, 0x5c4a42);
    addBox(this.roofParts, 2.2, 0.18, 2.2, cx, WORLD.sidewalkHeight + 3.7, cz, 0x40342f);
    this.colliders.push({
      kind: 'prop',
      minX: cx - 2.7, maxX: cx + 2.7,
      minZ: cz - 2.7, maxZ: cz + 2.7,
      minY: 0, maxY: WORLD.sidewalkHeight + 1.2,
    });
    this.landmarks.market = { x: cx, z: cz };
    this.buildPylonSign({
      x: cx, z: cz + 23.4, baseY: WORLD.sidewalkHeight, height: 4.6,
      title: 'OLD TOWN MARKET', sub: 'STALLS OPEN BEFORE DAWN', color: '#ffc95c', accent: '#ff6f61',
      width: 9.0,
    });
    // Warm string lights over the square, at stall height.
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(angle) * 8.2;
      const z = cz + Math.sin(angle) * 8.2;
      addPart(this.roofParts, new THREE.SphereGeometry(0.09, 5, 4), x, WORLD.sidewalkHeight + 3.4, z, 0xffc47a);
    }
    this.marketRng = rng;
  }

  addRoofProps(cx, cz, width, depth, topY, rng) {
    const margin = Math.min(width, depth) * 0.22;
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i += 1) {
      const w = rng.range(1.0, 2.4);
      const d = rng.range(1.0, 2.2);
      const h = rng.range(0.7, 1.5);
      const x = cx + rng.range(-width / 2 + margin, width / 2 - margin);
      const z = cz + rng.range(-depth / 2 + margin, depth / 2 - margin);
      addBox(this.roofParts, w, h, d, x, topY + h / 2 + 0.1, z, rng.pick([0x7d7b86, 0x676670, 0x8b8178]));
      if (rng.chance(0.5)) {
        addBox(this.roofParts, w * 0.45, 0.35, d * 0.45, x, topY + h + 0.3, z, 0x55535e);
      }
    }
    if (width > 13 && depth > 13 && rng.chance(0.28)) {
      const tx = cx + rng.range(-width * 0.18, width * 0.18);
      const tz = cz + rng.range(-depth * 0.18, depth * 0.18);
      const legHeight = rng.range(1.8, 2.8);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox(this.roofParts, 0.16, legHeight, 0.16, tx + sx * 1.35, topY + legHeight / 2, tz + sz * 1.35, 0x4a3b34);
        }
      }
      addCylinder(this.roofParts, 1.9, 1.9, 3.2, 10, tx, topY + legHeight + 1.6, tz, 0x7c4e3a);
      addCylinder(this.roofParts, 0.15, 2.05, 1.0, 10, tx, topY + legHeight + 3.7, tz, 0x53352a);
    }
    if (rng.chance(0.18)) {
      const mx = cx + rng.range(-width * 0.25, width * 0.25);
      const mz = cz + rng.range(-depth * 0.25, depth * 0.25);
      const mast = rng.range(4, 9);
      addCylinder(this.roofParts, 0.05, 0.09, mast, 5, mx, topY + mast / 2, mz, 0x625e6b);
      this.addBeacon(mx, topY + mast + 0.15, mz, 0.7);
    }
  }

  addBeacon(x, y, z, scale = 1) {
    const glowIndex = this.glowField.add({
      x, y, z,
      scaleX: 6 * scale,
      scaleY: 6 * scale,
      color: 0xff5446,
      brightness: 0.85,
    });
    this.beacons.push({
      glowIndex,
      phase: this.rng.range(0, 6.28),
      speed: this.rng.range(1.1, 2.1),
    });
  }

  buildHotel(cx, cz) {
    const rng = this.rng;
    const width = 31;
    const depth = 31;
    const baseHeight = 32;
    const towerWidth = 21;
    const towerDepth = 21;
    const towerHeight = 34;
    const y0 = WORLD.sidewalkHeight;
    const baseStyle = this.facadeStyles[2];
    const towerStyle = this.facadeStyles[4];

    const base = makeBuildingMesh(width, baseHeight, depth, baseStyle);
    base.position.set(cx, y0 + baseHeight / 2, cz);
    base.castShadow = true;
    base.receiveShadow = true;
    this.root.add(base);
    this.roofParts.push({
      geometry: new THREE.BoxGeometry(width + 0.3, 0.45, depth + 0.3),
      matrix: matrixFor(cx, y0 + baseHeight + 0.22, cz),
      color: 0x2b2430,
    });
    const tower = makeBuildingMesh(towerWidth, towerHeight, towerDepth, towerStyle);
    tower.position.set(cx, y0 + baseHeight + towerHeight / 2, cz);
    tower.castShadow = true;
    tower.receiveShadow = true;
    this.root.add(tower);
    this.roofParts.push({
      geometry: new THREE.BoxGeometry(towerWidth + 0.3, 0.45, towerDepth + 0.3),
      matrix: matrixFor(cx, y0 + baseHeight + towerHeight + 0.22, cz),
      color: 0x2b2430,
    });
    addCrownBand(this.crownParts, cx, cz, towerWidth + 0.7, towerDepth + 0.7, y0 + baseHeight + towerHeight + 0.55, 0xffc95c, 0.25);
    addBox(this.crownParts, 0.16, 22, 0.16, cx - towerWidth / 2 + 0.1, y0 + baseHeight + 14, cz - towerDepth / 2 + 0.1, 0x3fe0cf);
    addBox(this.crownParts, 0.16, 22, 0.16, cx + towerWidth / 2 - 0.1, y0 + baseHeight + 14, cz + towerDepth / 2 - 0.1, 0x3fe0cf);
    this.addStorefront(cx, cz, width, depth);

    const building = {
      cx, cz, x0: cx - width / 2, x1: cx + width / 2, z0: cz - depth / 2, z1: cz + depth / 2,
      baseY: y0, height: baseHeight + towerHeight, styleIndex: 1,
    };
    this.buildings.push(building);
    this.landmarks.hotel = building;
    this.colliders.push({
      kind: 'building',
      minX: building.x0, maxX: building.x1, minZ: building.z0, maxZ: building.z1,
      minY: 0, maxY: y0 + baseHeight + towerHeight + 0.6,
    });
    this.addRoofProps(cx, cz, towerWidth, towerDepth, y0 + baseHeight + towerHeight, rng);
  }

  buildCasaLuna(cx, cz) {
    const rng = this.rng;
    const width = 33;
    const depth = 32;
    const height = 23;
    const y0 = WORLD.sidewalkHeight;
    const style = this.facadeStyles[0];
    const mesh = makeBuildingMesh(width, height, depth, style);
    mesh.position.set(cx, y0 + height / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.roofParts.push({
      geometry: new THREE.BoxGeometry(width + 0.3, 0.45, depth + 0.3),
      matrix: matrixFor(cx, y0 + height + 0.22, cz),
      color: 0x2b2430,
    });
    // A shaded rooftop terrace under a little pergola.
    for (let i = 0; i < 5; i += 1) {
      addBox(this.roofParts, 0.12, 2.2, 0.12, cx - 8 + i * 4, y0 + height + 1.4, cz - 7, 0x3a2a2d);
    }
    addBox(this.roofParts, 18, 0.14, 5, cx, y0 + height + 2.5, cz - 7, 0xa4585c);
    addCrownBand(this.crownParts, cx, cz, width + 0.5, depth + 0.5, y0 + height + 0.5, 0xff8a72, 0.18);
    this.addStorefront(cx, cz, width, depth);
    const building = {
      cx, cz, x0: cx - width / 2, x1: cx + width / 2, z0: cz - depth / 2, z1: cz + depth / 2,
      baseY: y0, height, styleIndex: 0,
    };
    this.buildings.push(building);
    this.landmarks.casa = building;
    this.colliders.push({
      kind: 'building',
      minX: building.x0, maxX: building.x1, minZ: building.z0, maxZ: building.z1,
      minY: 0, maxY: y0 + height + 0.6,
    });
    this.addRoofProps(cx, cz, width, depth, y0 + height, rng);
  }

  buildMotorRow(cx, cz) {
    const rng = this.rng;
    const width = 35;
    const depth = 30;
    const height = 14;
    const y0 = WORLD.sidewalkHeight;
    const style = this.facadeStyles[6];
    const mesh = makeBuildingMesh(width, height, depth, style);
    mesh.position.set(cx, y0 + height / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.roofParts.push({
      geometry: new THREE.BoxGeometry(width + 0.3, 0.45, depth + 0.3),
      matrix: matrixFor(cx, y0 + height + 0.22, cz),
      color: 0x2b2430,
    });
    addCrownBand(this.crownParts, cx, cz, width + 0.5, depth + 0.5, y0 + height + 0.5, 0xff6f61, 0.18);
    this.addStorefront(cx, cz, width, depth);
    const building = {
      cx, cz, x0: cx - width / 2, x1: cx + width / 2, z0: cz - depth / 2, z1: cz + depth / 2,
      baseY: y0, height, styleIndex: 6,
    };
    this.buildings.push(building);
    this.landmarks.motor = building;
    this.colliders.push({
      kind: 'building',
      minX: building.x0, maxX: building.x1, minZ: building.z0, maxZ: building.z1,
      minY: 0, maxY: y0 + height + 0.6,
    });
    this.addRoofProps(cx, cz, width, depth, y0 + height, rng);
  }

  buildRadioBlock(cx, cz) {
    const rng = this.rng;
    const width = 23;
    const depth = 23;
    const height = 11;
    const y0 = WORLD.sidewalkHeight;
    const style = this.facadeStyles[5];
    const mesh = makeBuildingMesh(width, height, depth, style);
    mesh.position.set(cx, y0 + height / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.roofParts.push({
      geometry: new THREE.BoxGeometry(width + 0.3, 0.45, depth + 0.3),
      matrix: matrixFor(cx, y0 + height + 0.22, cz),
      color: 0x2b2430,
    });
    addCrownBand(this.crownParts, cx, cz, width + 0.5, depth + 0.5, y0 + height + 0.5, 0x3fe0cf, 0.18);
    this.addStorefront(cx, cz, width, depth);
    const building = {
      cx, cz, x0: cx - width / 2, x1: cx + width / 2, z0: cz - depth / 2, z1: cz + depth / 2,
      baseY: y0, height, styleIndex: 5,
    };
    this.buildings.push(building);
    this.landmarks.radio = building;
    this.colliders.push({
      kind: 'building',
      minX: building.x0, maxX: building.x1, minZ: building.z0, maxZ: building.z1,
      minY: 0, maxY: y0 + height + 0.6,
    });
    this.addRoofProps(cx, cz, width, depth, y0 + height, rng);

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
    this.root.add(mast);
    this.addBeacon(tx, y0 + mastHeight + 0.8, tz, 1.5);
    this.landmarks.mast = { x: tx, z: tz, height: mastHeight };
  }

  // ---------------------------------------------------------------- plaza

  buildPlaza(cx, cz) {
    const rng = this.rng;
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
    this.root.add(plaza);

    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(6.2, 6.6, 0.95, 40),
      material(0x4e4049, { roughness: 0.8 }),
    );
    basin.position.set(cx, WORLD.sidewalkHeight + 0.5, cz);
    basin.castShadow = true;
    basin.receiveShadow = true;
    this.root.add(basin);

    this.fountainWater = new THREE.Mesh(
      new THREE.CylinderGeometry(5.6, 5.6, 0.12, 40),
      material(0x2c7885, {
        roughness: 0.2,
        metalness: 0.12,
        emissive: 0x3fe0cf,
        emissiveIntensity: 0.45,
      }),
    );
    this.fountainWater.position.set(cx, WORLD.sidewalkHeight + 0.99, cz);
    this.root.add(this.fountainWater);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.9, 1.0, 12),
      material(0x6f5c60, { roughness: 0.85 }),
    );
    plinth.position.set(cx, WORLD.sidewalkHeight + 1.4, cz);
    plinth.castShadow = true;
    this.root.add(plinth);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.55, 3.4, 8),
      material(0x8c7574, { roughness: 0.6, metalness: 0.2 }),
    );
    spire.position.set(cx, WORLD.sidewalkHeight + 3.4, cz);
    spire.castShadow = true;
    this.root.add(spire);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.9, 0.12, 8, 40),
      basicMaterial(0x3fe0cf),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, WORLD.sidewalkHeight + 4.2, cz);
    this.root.add(ring);
    this.plazaRing = ring;
    const ringGlow = makeGlowSprite(0x3fe0cf, 11, 0.5);
    ringGlow.position.set(cx, WORLD.sidewalkHeight + 4.2, cz);
    this.root.add(ringGlow);

    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const bx = cx + Math.cos(angle) * 12.5;
      const bz = cz + Math.sin(angle) * 12.5;
      addBox(this.roofParts, 1.8, 0.16, 0.6, bx, WORLD.sidewalkHeight + 0.55, bz, 0x5b454a, { ry: -angle });
      addBox(this.roofParts, 0.16, 0.45, 0.5, bx - Math.cos(angle) * 0.6, WORLD.sidewalkHeight + 0.3, bz - Math.sin(angle) * 0.6, 0x3b2e35, { ry: -angle });
      addBox(this.roofParts, 0.16, 0.45, 0.5, bx + Math.cos(angle) * 0.6, WORLD.sidewalkHeight + 0.3, bz + Math.sin(angle) * 0.6, 0x3b2e35, { ry: -angle });
      // Sit facing outward, away from the fountain.
      this.seats.push({
        x: bx,
        z: bz,
        y: WORLD.sidewalkHeight,
        yaw: Math.atan2(Math.cos(angle), Math.sin(angle)),
        kind: 'plaza',
        occupant: null,
      });
    }

    this.colliders.push({
      kind: 'prop',
      minX: cx - 6.4,
      maxX: cx + 6.4,
      minZ: cz - 6.4,
      maxZ: cz + 6.4,
      minY: 0,
      maxY: WORLD.sidewalkHeight + 0.95,
    });
    this.landmarks.plaza = { x: cx, z: cz };
    this.plazaPalmSpots = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + 0.4;
      this.plazaPalmSpots.push({ x: cx + Math.cos(angle) * 11.2, z: cz + Math.sin(angle) * 11.2 });
    }
    this.plazaRng = rng;
  }

  // ---------------------------------------------------------------- beach dressing

  buildBeachProps() {
    const parts = [];
    const rng = makeRng(0xbeac);
    const umbrellaColors = [0xff6f61, 0x3fe0cf, 0xffc95c, 0xff8fa0, 0x56c9a4];
    for (let i = 0; i < 8; i += 1) {
      const x = rng.range(-220, -160);
      const z = rng.range(-175, 175);
      if (Math.abs(z - DECK.z) < 18) continue;
      const y = this.beachHeight(x, z);
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
      this.seats.push({ x: lx, z: lz, y, yaw: -Math.PI / 2, kind: 'beach', occupant: null });
    }

    // Lifeguard tower, looking north along the beach.
    const lx = -208;
    const lz = -42;
    const ly = this.beachHeight(lx, lz);
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
        this.beachHeight(x, z) + size * 0.24,
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
    this.root.add(mesh);
  }

  // ---------------------------------------------------------------- pier

  buildPier() {
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
    this.root.add(deck);

    const startY = this.beachHeight(DECK.rampMaxX, DECK.z);
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
    this.root.add(ramp);

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
    this.root.add(piles);

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
    this.root.add(rails);
    const pierBulbMaterial = basicMaterial(0xffffff, { vertexColors: true });
    this.pierBulbMaterial = pierBulbMaterial;
    const bulbs = new THREE.Mesh(
      mergeGeometries(bulbParts),
      pierBulbMaterial,
    );
    this.root.add(bulbs);
    this.pierBulbParts = bulbParts;

    for (let x = DECK.minX + 10; x < DECK.maxX - 8; x += 20) {
      for (const side of [-1, 1]) {
        const glowIndex = this.glowField.add({
          x,
          y: DECK.deckY + 1.35,
          z: DECK.z + side * (DECK.halfWidth - 0.4),
          scaleX: 2.8,
          color: 0xffb46a,
          brightness: 0.4,
        });
        this.pierGlowIndices.push(glowIndex);
      }
    }

    // The pier is pedestrian-only, so every prop, bench, barrel, crate and
    // railing gets a real collider. Pedestrians, officers and mission enemies
    // all resolve against the same list, and Vehicle.collidesAt refuses the
    // whole deck through World.vehicleBlocked.
    const pierCollider = (cx, cz, width, depth, height = 1.2) => {
      this.colliders.push({
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
    this.pierCrates = [];
    for (let i = 0; i < 12; i += 1) {
      const x = propRng.range(DECK.minX + 8, DECK.maxX - 12);
      const side = propRng.chance(0.5) ? -1 : 1;
      const z = DECK.z + side * propRng.range(3.4, DECK.halfWidth - 2.2);
      const size = propRng.range(0.8, 1.5);
      addBox(propParts, size, size, size, x, DECK.deckY + size / 2, z, propRng.pick([0x8a5f3d, 0x70482f, 0x9b6a42]), { ry: propRng.range(0, 1) });
      if (propRng.chance(0.35)) {
        addBox(propParts, size * 0.8, size * 0.8, size * 0.8, x + 0.2, DECK.deckY + size * 1.35, z - 0.1, 0x6f4a35, { ry: propRng.range(0, 1) });
      }
      this.pierCrates.push({ x, z, size });
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
      this.seats.push({ x, z: z + 0.9, y: DECK.deckY, yaw: 0, kind: 'pier', occupant: null });
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
    this.root.add(pierProps);
  }

  buildLighthouse() {
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
    this.root.add(tower);

    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.65, 2.1, 12),
      basicMaterial(0xffd58a, { transparent: true, opacity: 0.9 }),
    );
    lantern.position.set(x, y + 1.75, z);
    this.root.add(lantern);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.1, 1.35, 14),
      material(0xb2484f, { roughness: 0.7 }),
    );
    roof.position.set(x, y + 3.45, z);
    roof.castShadow = true;
    this.root.add(roof);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      basicMaterial(0xffdf9f),
    );
    cap.position.set(x, y + 4.2, z);
    this.root.add(cap);

    this.glowField.add({
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
    this.beam = new THREE.Group();
    this.beam.position.set(x, y + 1.8, z);
    for (const direction of [1, -1]) {
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 4.2, 44, 12, 1, true),
        beamMaterial,
      );
      cone.rotation.z = direction * Math.PI / 2;
      cone.position.x = direction * 22;
      this.beam.add(cone);
    }
    this.root.add(this.beam);

    const light = new THREE.PointLight(0xffc27a, 24, 65, 2);
    light.position.set(x, y + 1.8, z);
    this.root.add(light);

    this.colliders.push({
      kind: 'prop',
      minX: x - 4.8,
      maxX: x + 4.8,
      minZ: z - 4.8,
      maxZ: z + 4.8,
      minY: 0,
      maxY: y + 4.2,
    });
    this.landmarks.lighthouse = { x, z, top: y + 4.2 };
    this.addBeacon(x, y + 4.3, z, 1.2);
  }

  buildBoats() {
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
      this.root.add(group);
      this.boats.push({ group, baseY: WATER_Y, phase: this.rng.range(0, 6.28), speed: this.rng.range(0.5, 0.9) });
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
    this.root.add(buoy);
    this.addBeacon(-252, WATER_Y + 1.3, 24, 0.8);
  }

  // ---------------------------------------------------------------- plants and lamps

  buildVegetation() {
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
      addPalm(x, z, this.beachHeight(x, z), 1.05);
    }
    for (let i = 0; i < 10; i += 1) {
      const z = -170 + i * 38;
      if (Math.abs(z - DECK.z) < 14) continue;
      addPalm(-146, z, this.beachHeight(-146, z), 0.95);
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
    for (const spot of this.plazaPalmSpots ?? []) {
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
      this.root.add(mesh);
    }
  }

  buildStreetlights() {
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
    this.lampMaterial = lampMaterial;
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
    this.root.add(lights, lamps);

    entries.forEach((entry, index) => {
      if (index % 5 !== 0) return;
      const offsetX = Math.sin(entry.ry + Math.PI / 2) * 0;
      const glowIndex = this.glowField.add({
        x: entry.x + Math.cos(entry.ry) * 1.56,
        y: entry.y + 5.94,
        z: entry.z - Math.sin(entry.ry) * 1.56 + offsetX,
        scaleX: 3.0,
        color: 0xffb668,
        brightness: 0.38,
      });
      this.streetGlowIndices.push(glowIndex);
    });
    this.streetlightCount = entries.length;
    this.buildStreetPools(entries);
  }

  // Warm pools under the lamps and a few coloured spills under the strip's
  // blade signs. One instanced additive quad, so the road gets light without
  // adding per-frame draw calls.
  buildStreetPools(entries) {
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
    this.streetPoolMaterial = poolMaterial;
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
    this.root.add(mesh);
  }

  // ---------------------------------------------------------------- signage

  buildSigns() {
    const find = (x, z, minHeight = 0) => {
      let best = null;
      let bestScore = Infinity;
      for (const building of this.buildings) {
        const score = Math.abs(building.cx - x) + Math.abs(building.cz - z) + (building.height < minHeight ? 100 : 0);
        if (score < bestScore) {
          best = building;
          bestScore = score;
        }
      }
      return best;
    };

    const casa = this.landmarks.casa ?? find(-108, 54);
    if (casa) {
      this.addWallSign({
        x: casa.x0 - 0.16, y: 13.2, z: casa.cz, ry: -Math.PI / 2,
        width: 4.3, height: 11.2,
        texture: makeSignTexture({
          title: 'CASA LUNA', sub: 'HOTEL · BEACH', color: '#ff8a72',
          bg: '#170d1c', vertical: true, accent: '#3fe0cf',
        }),
        color: 0xff7e6c, glow: 1.15, flicker: 0.12,
      });
    }

    const hotel = this.landmarks.hotel;
    if (hotel) {
      this.addWallSign({
        x: hotel.x0 - 0.2, y: 52, z: hotel.cz - 3.5, ry: -Math.PI / 2,
        width: 5.0, height: 14.0,
        texture: makeSignTexture({
          title: 'SUNSET', sub: 'HOTEL', color: '#ffb45f',
          bg: '#140d18', vertical: true, accent: '#ff6f61',
        }),
        color: 0xffb45f, glow: 1.25, flicker: 0.06,
      });
      this.addWallSign({
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
      this.addWallSign({
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
      this.addWallSign({
        x: solanoBuilding.x0 - 0.16, y: 17, z: solanoBuilding.cz, ry: -Math.PI / 2,
        width: 10.5, height: 3.4,
        texture: makeSignTexture({
          title: 'SOLANO', sub: 'IMPORTS · PIER 9', color: '#ffc95c',
          bg: '#130e18', accent: '#3fe0cf',
        }),
        color: 0xffc95c, glow: 0.75, flicker: 0.05,
      });
    }

    const motor = this.landmarks.motor;
    if (motor) {
      this.addWallSign({
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
      this.addWallSign({
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
      this.addWallSign({
        x: oldTownSign.x0 - 0.16, y: 8.4, z: oldTownSign.cz, ry: -Math.PI / 2,
        width: 7.6, height: 3.2,
        texture: makeSignTexture({
          title: 'OLD TOWN', sub: 'MARKET ROW', color: '#ffc95c',
          bg: '#170d1c', vertical: true, accent: '#3fe0cf',
        }),
        color: 0xffc95c, glow: 0.85, flicker: 0.1,
      });
    }

    const radio = this.landmarks.radio;
    if (radio) {
      this.addWallSign({
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
      const sign = this.makeBladeSignTexture(bladeTitles[index], bladeColors[index % bladeColors.length]);
      this.addBladeSign(x, 7.4, 35.3, sign, index % 2 === 0 ? 0x3fe0cf : 0xffc95c, 1);
    });
    const southX = [-108, -54, 54, 108];
    southX.forEach((x, index) => {
      const sign = this.makeBladeSignTexture(bladeTitles[index + 4], bladeColors[(index + 2) % bladeColors.length]);
      this.addBladeSign(x, 7.0, 18.7, sign, index % 2 === 0 ? 0xff8a72 : 0xffc95c, -1);
    });

    this.buildStreetArch({
      x: -112, z: 27, span: 19, baseY: 0.15, height: 7.7,
      title: 'VEGA STRIP', sub: 'TEN BLOCKS OF LIGHT', color: '#ff6f61', accent: '#3fe0cf',
      glow: 0xff6f61,
    });
    this.buildStreetArch({
      x: -150, z: DECK.z, span: 16, baseY: this.beachHeight(-150, DECK.z), height: 5.5,
      title: 'PIER 9', sub: 'END OF THE LINE', color: '#3fe0cf', accent: '#ffc95c',
      glow: 0x3fe0cf,
    });

    this.buildPylonSign({
      x: 0, z: -19.3, baseY: 0.15, height: 4.4,
      title: 'LUNA PLAZA', sub: 'MEET UNDER THE RING', color: '#ffc95c', accent: '#ff6f61',
      width: 8.0,
    });

    // Two roof boards, one facing the sea and one facing the strip.
    const nightTide = find(-54, 54);
    if (nightTide) {
      this.addBillboard({
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
      this.addBillboard({
        x: harborBoard.cx, y: harborBoard.baseY + harborBoard.height + 5.2, z: harborBoard.z1 + 1.2,
        width: 16, height: 8, ry: 0,
        texture: makeBillboardTexture({
          title: 'NEON HARBOR', sub: 'LAST EXIT BEFORE THE SEA', accent: '#ff6f61', second: '#3fe0cf',
        }),
        color: 0xff6f61,
      });
    }
  }

  makeBladeSignTexture(title, color) {
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

  addWallSign({ x, y, z, ry, width, height, texture, color, glow = 1, flicker = 0 }) {
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.root.add(mesh);
    const nx = Math.sin(ry);
    const nz = Math.cos(ry);
    const glowIndex = this.glowField.add({
      x: x + nx * 0.75,
      y,
      z: z + nz * 0.75,
      scaleX: width * 1.6,
      scaleY: height * 1.4,
      color,
      brightness: 0.26 * glow,
    });
    this.neonSigns.push({
      material: mat,
      glowIndex,
      phase: this.rng.range(0, Math.PI * 2),
      flicker,
      baseGlow: 0.26 * glow,
    });
    return mesh;
  }

  addBladeSign(x, y, z, texture, color, side) {
    const geometry = new THREE.PlaneGeometry(2.7, 6.3);
    const eastMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: true });
    const westMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: true });
    const east = new THREE.Mesh(geometry, eastMaterial);
    east.position.set(x + 0.035, y, z);
    east.rotation.y = Math.PI / 2;
    const west = new THREE.Mesh(geometry, westMaterial);
    west.position.set(x - 0.035, y, z);
    west.rotation.y = -Math.PI / 2;
    this.root.add(east, west);
    // Bracket back to the building that owns this stretch of sidewalk.
    const wallZ = side > 0 ? 38.1 : 15.9;
    const bracketZ = (z + wallZ) / 2;
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, Math.abs(wallZ - z)),
      material(0x322a33, { roughness: 0.65, metalness: 0.3 }),
    );
    bracket.position.set(x, y + 3.0, bracketZ);
    this.root.add(bracket);
    const glowIndex = this.glowField.add({
      x, y, z,
      scaleX: 5.4,
      scaleY: 8.4,
      color,
      brightness: 0.34,
    });
    for (const [material, sign] of [[eastMaterial, east], [westMaterial, west]]) {
      this.neonSigns.push({
        material,
        glowIndex,
        phase: this.rng.range(0, Math.PI * 2),
        flicker: 0.18,
        baseGlow: 0.34,
      });
    }
  }

  buildStreetArch({ x, z, span, baseY, height, title, sub, color, accent, glow }) {
    const pylonMaterial = material(0x29232d, { roughness: 0.55, metalness: 0.35 });
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.7, height, 0.7), pylonMaterial);
      pylon.position.set(x, baseY + height / 2, z + side * span / 2);
      pylon.castShadow = true;
      pylon.receiveShadow = true;
      this.root.add(pylon);
      this.colliders.push({
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
    this.root.add(beam);

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
      this.root.add(mesh);
      this.neonSigns.push({
        material: mat,
        phase: this.rng.range(0, 6.28),
        flicker: 0.08,
        baseGlow: 0,
      });
    }
    this.glowField.add({
      x,
      y: signY,
      z,
      scaleX: span * 1.2,
      scaleY: 7.5,
      color: glow,
      brightness: 0.32,
    });
  }

  buildPylonSign({ x, z, baseY, height, title, sub, color, accent, width }) {
    const postMaterial = material(0x2d2730, { roughness: 0.6, metalness: 0.3 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, height, 0.18), postMaterial);
      post.position.set(x + side * width * 0.33, baseY + height / 2, z);
      post.castShadow = true;
      this.root.add(post);
    }
    const texture = makeSignTexture({ title, sub, color, bg: '#120b18', accent });
    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 2.6), mat);
    mesh.position.set(x, baseY + height - 0.4, z + 0.1);
    this.root.add(mesh);
    const glowIndex = this.glowField.add({
      x,
      y: baseY + height - 0.4,
      z: z + 0.4,
      scaleX: width * 1.2,
      scaleY: 5,
      color,
      brightness: 0.28,
    });
    this.neonSigns.push({
      material: mat,
      glowIndex,
      phase: this.rng.range(0, 6.28),
      flicker: 0.1,
      baseGlow: 0.28,
    });
  }

  addBillboard({ x, y, z, width, height, ry, texture, color }) {
    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide, fog: true });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    board.position.set(x, y, z);
    board.rotation.y = ry;
    this.root.add(board);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.5, height + 0.5, 0.22),
      material(0x211b25, { roughness: 0.6, metalness: 0.25 }),
    );
    frame.position.set(x - Math.sin(ry) * 0.18, y, z - Math.cos(ry) * 0.18);
    frame.rotation.y = ry;
    frame.castShadow = true;
    this.root.add(frame);
    const postHeight = Math.max(2.5, height * 0.4);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, postHeight, 0.18),
        material(0x2a232b, { roughness: 0.6 }),
      );
      const along = side * width * 0.3;
      post.position.set(x + Math.cos(ry) * along, y - height / 2 - postHeight / 2, z - Math.sin(ry) * along);
      post.castShadow = true;
      this.root.add(post);
    }
    const glowIndex = this.glowField.add({
      x: x + Math.sin(ry) * 0.9,
      y,
      z: z + Math.cos(ry) * 0.9,
      scaleX: width * 1.4,
      scaleY: height * 1.5,
      color,
      brightness: 0.18,
    });
    this.neonSigns.push({
      material: mat,
      glowIndex,
      phase: this.rng.range(0, 6.28),
      flicker: 0.03,
      baseGlow: 0.18,
    });
  }

  // ---------------------------------------------------------------- merged leftovers

  finishMergedMeshes() {
    if (this.roofParts.length > 0) {
      const roofMesh = new THREE.Mesh(
        mergeGeometries(this.roofParts),
        material(0xffffff, { vertexColors: true, roughness: 0.9, metalness: 0.02 }),
      );
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      this.root.add(roofMesh);
    }
    if (this.crownParts.length > 0) {
      const crownMaterial = basicMaterial(0xffffff, { vertexColors: true });
      this.crownMaterial = crownMaterial;
      const crownMesh = new THREE.Mesh(
        mergeGeometries(this.crownParts),
        crownMaterial,
      );
      this.root.add(crownMesh);
    }
    if (this.storefrontParts.length > 0) {
      const storefrontMaterial = material(0xffffff, {
        map: this.storefrontTexture,
        emissiveMap: this.storefrontTexture,
        emissive: 0xffffff,
        emissiveIntensity: 0.65,
        roughness: 0.66,
        metalness: 0.03,
        side: THREE.FrontSide,
      });
      this.storefrontMaterial = storefrontMaterial;
      this.storefrontBaseEmissive = 0.65;
      const storefrontMesh = new THREE.Mesh(
        mergeGeometries(this.storefrontParts),
        storefrontMaterial,
      );
      storefrontMesh.receiveShadow = true;
      this.root.add(storefrontMesh);
    }
  }

  // ---------------------------------------------------------------- queries

  onBlock(x, z) {
    return onBlock(this, x, z);
  }

  onPierDeck(x, z) {
    return onPierDeck(this, x, z);
  }

  onRamp(x, z) {
    return onRamp(this, x, z);
  }

  vehicleBlocked(x, z, isPlayer = false) {
    return vehicleBlocked(this, x, z, isPlayer);
  }

  groundHeightAt(x, z) {
    return groundHeightAt(this, x, z);
  }

  beachHeight(x, z = 0) {
    return beachHeight(this, x, z);
  }

  collides(x, z, radius = 0.45) {
    return collides(this, x, z, radius);
  }

  resolveCircle(x, z, radius = 0.4) {
    return resolveCircle(this, x, z, radius);
  }

  raycast(origin, direction, maxDistance = 120) {
    return raycast(this, origin, direction, maxDistance);
  }

  lineBlocked(fromX, fromY, fromZ, toX, toY, toZ, padding = 0.8) {
    return lineBlocked(this, fromX, fromY, fromZ, toX, toY, toZ, padding);
  }

  clipCamera(from, to, radius, out) {
    return clipCamera(this, from, to, radius, out);
  }

  focusAt(x, z) {
    return focusAt(this, x, z);
  }

  applyEnvironment(palette) {
    return applyEnvironment(this, palette);
  }

  setSky(fromKey, toKey, blend) {
    return setSky(this, fromKey, toKey, blend);
  }

  // ---------------------------------------------------------------- animation

  update(dt, elapsed, camera) {
    if (camera) this.skyRoot.position.copy(camera.position);
    if (this.waterTexture) {
      this.waterTexture.offset.x = (elapsed * 0.011) % 1;
      this.waterTexture.offset.y = (elapsed * 0.0055) % 1;
    }
    if (this.foamTexture) this.foamTexture.offset.y = (elapsed * 0.02) % 1;
    if (this.foam) this.foam.material.opacity = 0.26 + Math.sin(elapsed * 0.9) * 0.06;
    if (this.fountainWater) this.fountainWater.material.emissiveIntensity = 0.32 + Math.sin(elapsed * 2.1) * 0.13;
    if (this.plazaRing) this.plazaRing.rotation.z = elapsed * 0.18;
    if (this.beam) this.beam.rotation.y = elapsed * 0.62;
    if (this.sparkles) this.sparkles.material.opacity = 0.44 + Math.sin(elapsed * 1.4) * 0.14;

    for (const sign of this.neonSigns) {
      if (sign.flicker <= 0) continue;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * (2.4 + sign.flicker * 8) + sign.phase);
      const drop = sign.flicker > 0.28 && Math.sin(elapsed * 0.45 + sign.phase) > 0.985 ? 0.35 : 1;
      const brightness = 0.84 + pulse * 0.16 * (1 - sign.flicker) + drop * 0.15;
      const level = this.neonLevel ?? 1;
      sign.material.color.setScalar(brightness * level);
      if (sign.glowIndex !== undefined) {
        this.glowField.setBrightness(
          sign.glowIndex,
          sign.baseGlow * (0.72 + pulse * 0.28) * drop * (0.3 + 0.7 * level),
        );
      }
    }
    for (const beacon of this.beacons) {
      const pulse = Math.max(0, Math.sin(elapsed * beacon.speed + beacon.phase));
      this.glowField.setBrightness(beacon.glowIndex, 0.12 + pulse * 0.78);
    }
    for (const cloud of this.clouds) {
      cloud.sprite.position.x = cloud.baseX + Math.sin(elapsed * 0.018 * cloud.speed + cloud.phase) * 18;
    }
    for (const boat of this.boats) {
      boat.group.position.y = boat.baseY + Math.sin(elapsed * boat.speed + boat.phase) * 0.08;
      boat.group.rotation.z = Math.sin(elapsed * boat.speed * 0.8 + boat.phase) * 0.018;
    }
    if (this.objectiveMarker) {
      const marker = this.objectiveMarker;
      const bob = Math.sin(elapsed * 2.1) * 0.2;
      marker.diamond.position.y = 3.4 + bob;
      marker.inner.position.y = 3.4 + bob;
      marker.diamond.rotation.y = elapsed * 1.15;
      marker.inner.rotation.y = -elapsed * 1.6;
      marker.ring.rotation.z = elapsed * 0.55;
      marker.ring.material.opacity = 0.4 + Math.sin(elapsed * 2.1) * 0.2;
      marker.glow.material.opacity = 0.34 + Math.sin(elapsed * 2.1 + 1.1) * 0.14;
    }
    this.glowField.update(camera);
  }
}
