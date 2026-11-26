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
import { makeRng } from './random.js';

const ROAD_HALF = WORLD.roadWidth / 2;
const BLOCK_HALF = WORLD.blockSize / 2;
const DECK = WORLD.pier;
const WATER_Y = -0.44;
const SUN_DIR = new THREE.Vector3(...WORLD.sunDir).normalize();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const CORE_SET = new Set(CORE_BLOCK_CENTERS);

// The extension blocks are generated after the original core, in a fixed
// order, so every core tower and sign keeps the exact geometry it had before
// the city grew. The two new districts are chosen by block centre.
function districtForBlock(cx, cz) {
  if (cx >= 216) return 'foundry';
  if (cz <= -162) return 'oldtown';
  return null;
}

const _origin = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _euler = new THREE.Euler();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();

function matrixFor(x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _euler.set(rx, ry, rz);
  _quaternion.setFromEuler(_euler);
  _scale.set(sx, sy, sz);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _quaternion, _scale);
}

function addPart(parts, geometry, x, y, z, color, options = {}) {
  parts.push({ geometry, matrix: matrixFor(x, y, z, options), color });
}

function addBox(parts, width, height, depth, x, y, z, color, options = {}) {
  addPart(parts, new THREE.BoxGeometry(width, height, depth), x, y, z, color, options);
}

function addCylinder(parts, radiusTop, radiusBottom, height, segments, x, y, z, color, options = {}) {
  addPart(parts, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), x, y, z, color, options);
}

// A neon crown is an edge band, never a solid lid: from the title camera the
// old solid box read as a giant coloured roof.
function addCrownBand(parts, cx, cz, width, depth, y, color, thickness = 0.22) {
  addBox(parts, width, thickness, 0.24, cx, y, cz - depth / 2, color);
  addBox(parts, width, thickness, 0.24, cx, y, cz + depth / 2, color);
  addBox(parts, 0.24, thickness, depth, cx - width / 2, y, cz, color);
  addBox(parts, 0.24, thickness, depth, cx + width / 2, y, cz, color);
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.85,
    metalness: options.metalness ?? 0.03,
    ...options,
  });
}

function basicMaterial(color, options = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    toneMapped: options.toneMapped ?? false,
    ...options,
  });
}

function segmentHit(origin, direction, maxDistance, box, radius) {
  let near = 0;
  let far = maxDistance;
  for (const axis of ['x', 'y', 'z']) {
    const min = axis === 'y'
      ? (box.minY ?? 0)
      : (axis === 'x' ? box.minX : box.minZ) - radius;
    const max = axis === 'y'
      ? (box.maxY ?? 30)
      : (axis === 'x' ? box.maxX : box.maxZ) + radius;
    const start = origin[axis];
    const delta = direction[axis];
    if (Math.abs(delta) < 1e-6) {
      if (start < min || start > max) return null;
      continue;
    }
    let first = (min - start) / delta;
    let second = (max - start) / delta;
    if (first > second) {
      const swap = first;
      first = second;
      second = swap;
    }
    if (first > near) near = first;
    if (second < far) far = second;
    if (near > far) return null;
  }
  return near > 0.02 ? near : 0.02;
}

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

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildRoadMarkings();
    this.buildBeach();
    this.buildOcean();
    this.buildCity();
    this.buildPlaza(0, 0);
    this.buildBeachProps();
    this.buildPier();
    this.buildLighthouse();
    this.buildBoats();
    this.buildVegetation();
    this.buildStreetlights();
    this.buildSigns();
    this.buildClouds();
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

  // ---------------------------------------------------------------- sky

  // One baked sky per period. The night keeps the indigo-to-magenta gradient
  // the first build was framed around; the other three add the dawn, day and
  // dusk bands. Stars and the moon live as separate objects so the environment
  // can fade them instead of repainting the canvas.
  makeSkyTexture(state) {
    const texture = canvasTexture(1024, 512, (ctx, width, height) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      const stops = {
        night: [
          [0, '#040410'], [0.16, '#090a20'], [0.32, '#15102e'], [0.45, '#261543'],
          [0.53, '#482052'], [0.575, '#7a2e5a'], [0.61, '#a8445f'], [0.66, '#5a2948'],
          [0.8, '#24152c'], [1, '#080612'],
        ],
        dawn: [
          [0, '#0d0d26'], [0.24, '#241c46'], [0.42, '#56306a'], [0.52, '#8f4666'],
          [0.58, '#d47a63'], [0.63, '#f2b878'], [0.69, '#7a4a5c'], [0.82, '#2a1c30'],
          [1, '#100b18'],
        ],
        day: [
          [0, '#265a9e'], [0.28, '#4781bc'], [0.48, '#7fb0d5'], [0.58, '#bcd9e9'],
          [0.65, '#dbe9ef'], [0.76, '#a9becb'], [0.9, '#7c93a1'], [1, '#5f7580'],
        ],
        dusk: [
          [0, '#05051a'], [0.2, '#161034'], [0.38, '#3d214c'], [0.5, '#762c4e'],
          [0.56, '#c0554f'], [0.62, '#f09a5e'], [0.68, '#5c2d42'], [0.82, '#1d1324'],
          [1, '#080610'],
        ],
      }[state];
      for (const [offset, color] of stops) gradient.addColorStop(offset, color);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // City light pollution or horizon haze, depending on the hour.
      const horizon = ctx.createRadialGradient(width * 0.42, height * 0.6, 10, width * 0.42, height * 0.6, width * 0.56);
      if (state === 'day') {
        horizon.addColorStop(0, 'rgba(255,248,228,0.2)');
        horizon.addColorStop(0.45, 'rgba(220,232,238,0.08)');
        horizon.addColorStop(1, 'rgba(180,205,215,0)');
      } else if (state === 'dawn') {
        horizon.addColorStop(0, 'rgba(255,176,120,0.3)');
        horizon.addColorStop(0.42, 'rgba(210,110,110,0.12)');
        horizon.addColorStop(1, 'rgba(90,30,80,0)');
      } else if (state === 'dusk') {
        horizon.addColorStop(0, 'rgba(255,132,96,0.3)');
        horizon.addColorStop(0.42, 'rgba(190,70,110,0.13)');
        horizon.addColorStop(1, 'rgba(70,18,70,0)');
      } else {
        horizon.addColorStop(0, 'rgba(255,86,132,0.22)');
        horizon.addColorStop(0.4, 'rgba(160,60,120,0.09)');
        horizon.addColorStop(1, 'rgba(80,20,80,0)');
      }
      ctx.fillStyle = horizon;
      ctx.fillRect(0, 0, width, height);

      const rng = makeRng(0x57a2 + state.length * 97);
      const cloudCount = state === 'day' ? 0 : state === 'night' ? 16 : 9;
      for (let i = 0; i < cloudCount; i += 1) {
        const x = rng.range(0, width);
        const y = rng.range(height * 0.24, height * 0.52);
        const rx = rng.range(30, 110);
        const ry = rng.range(2, 7);
        const tint = state === 'night' ? '96,62,120' : state === 'dawn' ? '210,132,110' : '200,110,104';
        ctx.fillStyle = `rgba(${tint},${rng.range(0.04, state === 'night' ? 0.12 : 0.1)})`;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rng.range(-0.1, 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }

  makeMoonTexture() {
    return canvasTexture(128, 128, (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const disc = ctx.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 34);
      disc.addColorStop(0, '#f4f7ff');
      disc.addColorStop(0.72, '#c9d6f5');
      disc.addColorStop(1, '#8c9dd4');
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(cx, cy, 33, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(110,130,180,0.22)';
      for (const [dx, dy, r] of [[-9, 5, 6], [7, -7, 4.5], [2, 11, 3.5], [12, 8, 3]]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  buildSky() {
    this.skyTextures = {
      night: this.makeSkyTexture('night'),
      dawn: this.makeSkyTexture('dawn'),
      day: this.makeSkyTexture('day'),
      dusk: this.makeSkyTexture('dusk'),
    };
    const skyGeometry = new THREE.SphereGeometry(1250, 48, 24);
    this.skyA = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({
      map: this.skyTextures.night,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }));
    this.skyA.frustumCulled = false;
    this.skyA.renderOrder = -1000;
    this.skyRoot.add(this.skyA);
    this.skyB = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({
      map: this.skyTextures.night,
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      opacity: 0,
      fog: false,
      toneMapped: false,
    }));
    this.skyB.frustumCulled = false;
    this.skyB.renderOrder = -999;
    this.skyB.visible = false;
    this.skyRoot.add(this.skyB);
    this.skyFromKey = 'night';
    this.skyToKey = 'night';

    // A real star field, so the environment can fade it from day to night
    // instead of baking stars into one texture.
    const starRng = makeRng(0x57a2);
    const positions = [];
    for (let i = 0; i < 900; i += 1) {
      const y = starRng.range(0.035, 1);
      const ring = Math.sqrt(1 - y * y);
      const angle = starRng.range(0, Math.PI * 2);
      positions.push(Math.cos(angle) * ring * 1210, y * 1210, Math.sin(angle) * ring * 1210);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      size: 1.9,
      map: makeGlowTexture(),
      color: 0xe8efff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: false,
      fog: false,
      toneMapped: false,
    }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -998;
    this.skyRoot.add(this.stars);

    // Sun and moon are real sky objects now: the palette moves them, fades
    // them and tints them, and the same direction drives the directional light.
    const halo = makeGlowSprite(0x8fa8ff, 220, 0.0);
    halo.renderOrder = -900;
    halo.material.fog = false;
    halo.visible = false;
    this.skyRoot.add(halo);

    const core = makeGlowSprite(0xe8efff, 68, 0.0);
    core.renderOrder = -899;
    core.material.fog = false;
    core.visible = false;
    this.skyRoot.add(core);
    this.sunHalo = halo;
    this.sunCore = core;

    const moonHalo = makeGlowSprite(0x8fa8ff, 200, 0.0);
    moonHalo.renderOrder = -898;
    moonHalo.material.fog = false;
    moonHalo.visible = false;
    this.skyRoot.add(moonHalo);
    const moonCore = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.makeMoonTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }));
    moonCore.scale.set(58, 58, 1);
    moonCore.renderOrder = -897;
    moonCore.visible = false;
    this.skyRoot.add(moonCore);
    this.moonHalo = moonHalo;
    this.moonCore = moonCore;
  }

  setSky(fromKey, toKey, blend) {
    if (this.skyFromKey !== fromKey) {
      this.skyA.material.map = this.skyTextures[fromKey] ?? this.skyTextures.night;
      this.skyA.material.needsUpdate = true;
      this.skyFromKey = fromKey;
    }
    this.skyB.visible = toKey !== fromKey && blend > 0.001;
    if (this.skyToKey !== toKey) {
      this.skyB.material.map = this.skyTextures[toKey] ?? this.skyTextures.night;
      this.skyB.material.needsUpdate = true;
      this.skyToKey = toKey;
    }
    if (this.skyB.visible) this.skyB.material.opacity = blend;
  }

  applyEnvironment(palette) {
    this.hemi.color.setHex(palette.hemiSky);
    this.hemi.groundColor.setHex(palette.hemiGround);
    this.hemi.intensity = palette.hemiIntensity;
    this.ambient.color.setHex(palette.ambient);
    this.ambient.intensity = palette.ambientIntensity;
    this.sun.color.setHex(palette.sunColor);
    this.sun.intensity = palette.sunIntensity;
    this.fill.intensity = palette.fillIntensity;
    this.lightDir.set(palette.lightDir[0], palette.lightDir[1], palette.lightDir[2]).normalize();
    this.focusAt(this.focusX, this.focusZ);

    // Window light, neon and street lamps are emissive materials rather than
    // real lights; the palette scales their intensity so noon reads as day.
    this.neonLevel = 0.55 + 0.45 * palette.neon;
    for (const style of this.facadeStyles) {
      style.material.emissiveIntensity = style.baseEmissive * (0.18 + 0.82 * palette.window);
    }
    if (this.storefrontMaterial) {
      this.storefrontMaterial.emissiveIntensity = this.storefrontBaseEmissive * (0.18 + 0.82 * palette.window);
    }
    if (this.crownMaterial) this.crownMaterial.color.setScalar(0.42 + 0.58 * palette.neon);
    if (this.pierBulbMaterial) this.pierBulbMaterial.color.setScalar(0.42 + 0.58 * palette.neon);
    if (this.lampMaterial) {
      this.lampMaterial.color.setHex(0xffc37a).multiplyScalar(0.32 + 0.68 * palette.street);
    }
    const streetGlow = 0.38 * (0.1 + 0.9 * palette.street);
    for (const index of this.streetGlowIndices) this.glowField.setBrightness(index, streetGlow);
    const pierGlow = 0.4 * (0.15 + 0.85 * palette.street);
    for (const index of this.pierGlowIndices) this.glowField.setBrightness(index, pierGlow);
    if (this.streetPoolMaterial) this.streetPoolMaterial.opacity = 0.14 * palette.street;

    if (this.water) {
      this.water.material.color.setHex(palette.waterTint);
      this.water.material.emissive.setHex(palette.waterEmissive);
      this.water.material.emissiveIntensity = palette.waterEmissiveIntensity;
    }
    if (this.sparkles) this.sparkles.material.opacity = palette.sparkle;
    if (this.stars) this.stars.material.opacity = palette.stars;
    for (const cloud of this.clouds) {
      cloud.sprite.material.color.setHex(palette.cloud);
      cloud.sprite.material.opacity = cloud.baseOpacity * palette.cloudOpacity;
    }

    this.setSky(palette.skyFrom, palette.skyTo, palette.skyBlend);

    const sun = palette.sun;
    this.sunHalo.visible = sun > 0.01;
    this.sunCore.visible = sun > 0.01;
    if (sun > 0.01) {
      this.sunHalo.position.set(palette.lightDir[0], palette.lightDir[1], palette.lightDir[2]).multiplyScalar(1120);
      this.sunCore.position.set(palette.lightDir[0], palette.lightDir[1], palette.lightDir[2]).multiplyScalar(1118);
      this.sunHalo.material.opacity = 0.45 * sun;
      this.sunCore.material.opacity = 0.95 * sun;
    }
    const moon = palette.moon;
    this.moonHalo.visible = moon > 0.01;
    this.moonCore.visible = moon > 0.01;
    if (moon > 0.01) {
      this.moonHalo.position.set(palette.moonDir[0], palette.moonDir[1], palette.moonDir[2]).multiplyScalar(1120);
      this.moonCore.position.set(palette.moonDir[0], palette.moonDir[1], palette.moonDir[2]).multiplyScalar(1118);
      this.moonHalo.material.opacity = 0.32 * moon;
      this.moonCore.material.opacity = moon;
    }
  }

  buildLights() {
    const preset = QUALITY_PRESETS[this.quality] ?? QUALITY_PRESETS.high;
    this.lightDir = SUN_DIR.clone();
    this.focusX = 20;
    this.focusZ = 30;
    this.hemi = new THREE.HemisphereLight(0x7f8fd6, 0x171322, 1.38);
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x4a4266, 0.56);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0x9fb2ff, 0.65);
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    this.sun.shadow.camera.left = -76;
    this.sun.shadow.camera.right = 76;
    this.sun.shadow.camera.top = 76;
    this.sun.shadow.camera.bottom = -76;
    this.sun.shadow.camera.near = 12;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.055;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x6f83cf, 1.0);
    this.fill.position.set(130, 70, -110);
    this.scene.add(this.fill);

    this.focusAt(20, 30);
  }

  focusAt(x, z) {
    this.focusX = x;
    this.focusZ = z;
    const direction = this.lightDir ?? SUN_DIR;
    this.sun.position.set(x + direction.x * 120, direction.y * 120 + 12, z + direction.z * 120);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
  }

  setQuality(quality) {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.high;
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  // ---------------------------------------------------------------- ground

  buildGround() {
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
    this.root.add(ground);

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

    this.sidewalkParts = [];
    for (const cx of BLOCK_CENTERS_X) {
      for (const cz of BLOCK_CENTERS_Z) {
        addBox(this.sidewalkParts, WORLD.blockSize, 0.15, WORLD.blockSize, cx, 0.075, cz, 0xffffff);
        addBox(this.sidewalkParts, WORLD.blockSize + 0.5, 0.18, 0.4, cx, 0.085, cz - BLOCK_HALF - 0.25, 0xcab7b1);
        addBox(this.sidewalkParts, WORLD.blockSize + 0.5, 0.18, 0.4, cx, 0.085, cz + BLOCK_HALF + 0.25, 0xcab7b1);
        addBox(this.sidewalkParts, 0.4, 0.18, WORLD.blockSize, cx - BLOCK_HALF - 0.25, 0.085, cz, 0xcab7b1);
        addBox(this.sidewalkParts, 0.4, 0.18, WORLD.blockSize, cx + BLOCK_HALF + 0.25, 0.085, cz, 0xcab7b1);
      }
    }
    const sidewalkGeometry = mergeGeometries(this.sidewalkParts);
    const sidewalkMesh = new THREE.Mesh(
      sidewalkGeometry,
      material(0xffffff, { map: pavement, vertexColors: true, roughness: 0.9, metalness: 0.01 }),
    );
    sidewalkMesh.receiveShadow = true;
    sidewalkMesh.castShadow = true;
    this.root.add(sidewalkMesh);
  }

  buildRoadMarkings() {
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
    this.root.add(yellowMesh, whiteMesh);
  }

  beachHeight(x, z = 0) {
    const t = clamp((WORLD.cityMinX - x) / (WORLD.cityMinX - WORLD.shorelineX), 0, 1);
    return -0.45 * t + Math.sin((z + x * 0.6) * 0.09) * 0.018 * t;
  }

  buildBeach() {
    const sandTexture = canvasTexture(128, 128, (ctx, width, height) => {
      ctx.fillStyle = '#c9a071';
      ctx.fillRect(0, 0, width, height);
      const rng = makeRng(0x5a4d);
      for (let i = 0; i < 1600; i += 1) {
        const value = rng.range(150, 232);
        ctx.fillStyle = `rgba(${value},${value - 20},${value - 50},${rng.range(0.08, 0.36)})`;
        ctx.fillRect(rng.range(0, width), rng.range(0, height), rng.range(0.5, 1.6), rng.range(0.5, 1.6));
      }
    }, { repeat: [16, 52] });

    const geometry = new THREE.PlaneGeometry(WORLD.beachMaxX - WORLD.beachMinX, WORLD.beachMaxZ - WORLD.beachMinZ, 22, 78);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate((WORLD.beachMinX + WORLD.beachMaxX) / 2, 0, (WORLD.beachMinZ + WORLD.beachMaxZ) / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      position.setY(i, this.beachHeight(position.getX(i), position.getZ(i)));
    }
    geometry.computeVertexNormals();
    const beach = new THREE.Mesh(
      geometry,
      material(0xffffff, { map: sandTexture, roughness: 0.96, metalness: 0 }),
    );
    beach.receiveShadow = true;
    this.root.add(beach);

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
      new THREE.PlaneGeometry(7, WORLD.beachMaxZ - WORLD.beachMinZ),
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
    foam.position.set(WORLD.shorelineX + 1.4, WATER_Y + 0.015, (WORLD.beachMinZ + WORLD.beachMaxZ) / 2);
    this.root.add(foam);
    this.foam = foam;
    this.foamTexture = foamTexture;
  }

  buildOcean() {
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
    this.root.add(water);
    this.water = water;
    this.waterTexture = waterTexture;

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
    this.sparkles = new THREE.Points(sparkleGeometry, sparkleMaterial);
    this.sparkles.renderOrder = 2;
    this.root.add(this.sparkles);
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

    // Crates, benches, barrels and a small bait shack.
    const propParts = [];
    const propRng = makeRng(0xc4a7);
    for (let i = 0; i < 12; i += 1) {
      const x = propRng.range(DECK.minX + 8, DECK.maxX - 12);
      const side = propRng.chance(0.5) ? -1 : 1;
      const z = DECK.z + side * propRng.range(3.4, DECK.halfWidth - 2.2);
      const size = propRng.range(0.8, 1.5);
      addBox(propParts, size, size, size, x, DECK.deckY + size / 2, z, propRng.pick([0x8a5f3d, 0x70482f, 0x9b6a42]), { ry: propRng.range(0, 1) });
      if (propRng.chance(0.35)) {
        addBox(propParts, size * 0.8, size * 0.8, size * 0.8, x + 0.2, DECK.deckY + size * 1.35, z - 0.1, 0x6f4a35, { ry: propRng.range(0, 1) });
      }
    }
    for (let i = 0; i < 5; i += 1) {
      const x = DECK.minX + 18 + i * 24;
      const z = DECK.z - DECK.halfWidth + 2.1;
      addBox(propParts, 2.2, 0.16, 0.62, x, DECK.deckY + 0.55, z, 0x603f2f);
      addBox(propParts, 0.14, 0.5, 0.5, x - 0.8, DECK.deckY + 0.27, z, 0x3f2b22);
      addBox(propParts, 0.14, 0.5, 0.5, x + 0.8, DECK.deckY + 0.27, z, 0x3f2b22);
    }
    for (let i = 0; i < 4; i += 1) {
      const x = DECK.minX + 34 + i * 27;
      const z = DECK.z + DECK.halfWidth - 2.1;
      addCylinder(propParts, 0.42, 0.48, 1.1, 9, x, DECK.deckY + 0.55, z, 0x76513b);
    }
    const shackX = -188;
    const shackZ = DECK.z - 4;
    addBox(propParts, 6.2, 2.6, 4.2, shackX, DECK.deckY + 1.3, shackZ, 0x6d4b37);
    addBox(propParts, 6.8, 0.25, 4.8, shackX, DECK.deckY + 2.72, shackZ, 0x3d2c26);
    addBox(propParts, 2.8, 1.05, 0.06, shackX + 0.6, DECK.deckY + 1.6, shackZ + 2.12, 0xffb45f);
    addBox(propParts, 0.06, 1.05, 2.2, shackX - 3.1, DECK.deckY + 1.6, shackZ, 0xffc47a);
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

  // ---------------------------------------------------------------- clouds

  buildClouds() {
    const cloudTexture = makeCloudTexture();
    const rng = makeRng(0xc10d);
    const positions = [
      [-540, 130, -420, 280, 90],
      [-760, 168, 180, 340, 105],
      [-420, 104, 540, 240, 74],
      [120, 148, -620, 300, 96],
      [470, 120, 240, 260, 84],
      [-980, 196, -60, 390, 120],
      [260, 184, 620, 320, 100],
    ];
    for (const [x, y, z, sx, sy] of positions) {
      const opacity = rng.range(0.14, 0.28);
      const material = new THREE.SpriteMaterial({
        map: cloudTexture,
        color: 0xffd6bd,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        blending: THREE.NormalBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(x, y, z);
      sprite.scale.set(sx, sy, 1);
      this.root.add(sprite);
      this.clouds.push({ sprite, baseX: x, baseOpacity: opacity, phase: rng.range(0, 6.28), speed: rng.range(0.8, 1.8) });
    }
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
    for (const cx of BLOCK_CENTERS_X) {
      if (Math.abs(x - cx) > BLOCK_HALF) continue;
      for (const cz of BLOCK_CENTERS_Z) {
        if (Math.abs(z - cz) <= BLOCK_HALF) return true;
      }
    }
    return false;
  }

  onPierDeck(x, z) {
    return x >= DECK.minX - 0.2
      && x <= DECK.maxX + 0.2
      && Math.abs(z - DECK.z) <= DECK.halfWidth + 0.15;
  }

  onRamp(x, z) {
    return x > DECK.maxX - 0.2
      && x < DECK.rampMaxX + 0.2
      && Math.abs(z - DECK.z) <= DECK.rampHalfWidth + 0.15;
  }

  groundHeightAt(x, z) {
    if (this.onPierDeck(x, z)) return DECK.deckY;
    if (this.onRamp(x, z)) {
      const t = clamp((DECK.rampMaxX - x) / (DECK.rampMaxX - DECK.rampMinX), 0, 1);
      return lerp(this.beachHeight(x, z), DECK.deckY, t);
    }
    if (x < WORLD.cityMinX) return this.beachHeight(x, z);
    if (this.onBlock(x, z)) return WORLD.sidewalkHeight;
    return 0;
  }

  collides(x, z, radius = 0.45) {
    const bounds = WORLD.bounds;
    if (x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius) {
      return true;
    }
    if (x < WORLD.shorelineX + 0.2 && !this.onPierDeck(x, z) && !this.onRamp(x, z)) return true;
    for (const box of this.colliders) {
      if (x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius) {
        return true;
      }
    }
    return false;
  }

  /**
   * Pushes a circle out of every building/prop collider it overlaps. The
   * shortest axis wins, and three passes settle the corners where two boxes
   * touch. Pedestrians use this before every step so nobody walks through a
   * wall; a moved result is also the collision test for the step.
   */
  resolveCircle(x, z, radius = 0.4) {
    const bounds = WORLD.bounds;
    let px = clamp(x, bounds.minX + radius, bounds.maxX - radius);
    let pz = clamp(z, bounds.minZ + radius, bounds.maxZ - radius);
    for (let pass = 0; pass < 3; pass += 1) {
      let moved = false;
      for (const box of this.colliders) {
        if (px <= box.minX - radius || px >= box.maxX + radius) continue;
        if (pz <= box.minZ - radius || pz >= box.maxZ + radius) continue;
        const left = px - (box.minX - radius);
        const right = (box.maxX + radius) - px;
        const bottom = pz - (box.minZ - radius);
        const top = (box.maxZ + radius) - pz;
        const least = Math.min(left, right, bottom, top);
        if (least === left) px = box.minX - radius;
        else if (least === right) px = box.maxX + radius;
        else if (least === bottom) pz = box.minZ - radius;
        else pz = box.maxZ + radius;
        moved = true;
      }
      if (!moved) break;
    }
    return { x: px, z: pz };
  }

  /**
   * Nearest building/prop slab hit along a ray, for hitscan, muzzle checks and
   * line-of-sight. Ground is treated as a flat plane at road level; the beach
   * and pier sit close enough that a missed low shot still lands in the dust.
   */
  raycast(origin, direction, maxDistance = 120) {
    let best = null;
    const invX = direction.x !== 0 ? 1 / direction.x : 1e9;
    const invY = direction.y !== 0 ? 1 / direction.y : 1e9;
    const invZ = direction.z !== 0 ? 1 / direction.z : 1e9;
    for (const box of this.colliders) {
      let tMin = 0;
      let tMax = maxDistance;
      let axis = 0;
      let sign = -1;
      let hit = true;
      for (let i = 0; i < 3; i += 1) {
        const originValue = i === 0 ? origin.x : i === 1 ? origin.y : origin.z;
        const inverse = i === 0 ? invX : i === 1 ? invY : invZ;
        const min = i === 0 ? box.minX : i === 1 ? box.minY : box.minZ;
        const max = i === 0 ? box.maxX : i === 1 ? box.maxY : box.maxZ;
        if (Math.abs(inverse) > 1e8) {
          if (originValue < min || originValue > max) { hit = false; break; }
          continue;
        }
        let t1 = (min - originValue) * inverse;
        let t2 = (max - originValue) * inverse;
        let nearSign = -1;
        if (t1 > t2) {
          const swap = t1;
          t1 = t2;
          t2 = swap;
          nearSign = 1;
        }
        if (t1 > tMin) {
          tMin = t1;
          axis = i;
          sign = nearSign;
        }
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) { hit = false; break; }
      }
      if (!hit || tMin <= 0.02 || tMin > maxDistance) continue;
      if (!best || tMin < best.distance) {
        best = {
          distance: tMin,
          point: new THREE.Vector3(origin.x + direction.x * tMin, origin.y + direction.y * tMin, origin.z + direction.z * tMin),
          normal: new THREE.Vector3(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0),
          kind: box.kind ?? 'building',
        };
      }
    }
    if (direction.y < -0.005 && origin.y > 0.02) {
      const groundT = (origin.y - 0.02) / -direction.y;
      if (groundT > 0.02 && groundT < maxDistance && (!best || groundT < best.distance)) {
        best = {
          distance: groundT,
          point: new THREE.Vector3(origin.x + direction.x * groundT, 0.02, origin.z + direction.z * groundT),
          normal: new THREE.Vector3(0, 1, 0),
          kind: 'ground',
        };
      }
    }
    return best;
  }

  lineBlocked(fromX, fromY, fromZ, toX, toY, toZ, padding = 0.8) {
    _origin.set(fromX, fromY, fromZ);
    _direction.set(toX - fromX, toY - fromY, toZ - fromZ);
    const length = _direction.length();
    if (length < 0.001) return false;
    _direction.divideScalar(length);
    const hit = this.raycast(_origin, _direction, length - padding);
    return Boolean(hit);
  }

  clipCamera(from, to, radius, out) {
    out.copy(to);
    _origin.copy(from);
    _direction.copy(to).sub(from);
    const length = _direction.length();
    if (length < 1e-4) return out;
    _direction.divideScalar(length);
    let nearest = length;
    for (const box of this.colliders) {
      const hit = segmentHit(from, _direction, length, box, radius);
      if (hit !== null && hit < nearest) nearest = hit;
    }
    if (nearest < length) {
      out.copy(from).addScaledVector(_direction, Math.max(0.18, nearest - 0.05));
    }
    const floor = this.groundHeightAt(out.x, out.z) + 0.28;
    if (out.y < floor) out.y = floor;
    return out;
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
