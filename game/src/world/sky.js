// Sky dome, stars, sun and moon sprites, cloud billboards and the quality-
// dependent lights. Each function takes the World instance because the
// environment and the constructor own the objects it moves.

import * as THREE from '../../vendor/three.module.js';
import { QUALITY_PRESETS } from '../config.js';
import {
  canvasTexture,
  makeCloudTexture,
  makeGlowSprite,
  makeGlowTexture,
} from '../geo.js';
import { makeRng } from '../random.js';
import { SUN_DIR } from './shared.js';

// One baked sky per period. The night keeps the indigo-to-magenta gradient
// the first build was framed around; the other three add the dawn, day and
// dusk bands. Stars and the moon live as separate objects so the environment
// can fade them instead of repainting the canvas.
export function makeSkyTexture(world, state) {
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

export function makeMoonTexture(world) {
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

export function buildSky(world) {
  world.skyTextures = {
    night: makeSkyTexture(world, 'night'),
    dawn: makeSkyTexture(world, 'dawn'),
    day: makeSkyTexture(world, 'day'),
    dusk: makeSkyTexture(world, 'dusk'),
  };
  const skyGeometry = new THREE.SphereGeometry(1250, 48, 24);
  world.skyA = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({
    map: world.skyTextures.night,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  world.skyA.frustumCulled = false;
  world.skyA.renderOrder = -1000;
  world.skyRoot.add(world.skyA);
  world.skyB = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({
    map: world.skyTextures.night,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    opacity: 0,
    fog: false,
    toneMapped: false,
  }));
  world.skyB.frustumCulled = false;
  world.skyB.renderOrder = -999;
  world.skyB.visible = false;
  world.skyRoot.add(world.skyB);
  world.skyFromKey = 'night';
  world.skyToKey = 'night';

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
  world.stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
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
  world.stars.frustumCulled = false;
  world.stars.renderOrder = -998;
  world.skyRoot.add(world.stars);

  // Sun and moon are real sky objects now: the palette moves them, fades
  // them and tints them, and the same direction drives the directional light.
  const halo = makeGlowSprite(0x8fa8ff, 220, 0.0);
  halo.renderOrder = -900;
  halo.material.fog = false;
  halo.visible = false;
  world.skyRoot.add(halo);

  const core = makeGlowSprite(0xe8efff, 68, 0.0);
  core.renderOrder = -899;
  core.material.fog = false;
  core.visible = false;
  world.skyRoot.add(core);
  world.sunHalo = halo;
  world.sunCore = core;

  const moonHalo = makeGlowSprite(0x8fa8ff, 200, 0.0);
  moonHalo.renderOrder = -898;
  moonHalo.material.fog = false;
  moonHalo.visible = false;
  world.skyRoot.add(moonHalo);
  const moonCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeMoonTexture(world),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  moonCore.scale.set(58, 58, 1);
  moonCore.renderOrder = -897;
  moonCore.visible = false;
  world.skyRoot.add(moonCore);
  world.moonHalo = moonHalo;
  world.moonCore = moonCore;
}

export function setSky(world, fromKey, toKey, blend) {
  if (world.skyFromKey !== fromKey) {
    world.skyA.material.map = world.skyTextures[fromKey] ?? world.skyTextures.night;
    world.skyA.material.needsUpdate = true;
    world.skyFromKey = fromKey;
  }
  world.skyB.visible = toKey !== fromKey && blend > 0.001;
  if (world.skyToKey !== toKey) {
    world.skyB.material.map = world.skyTextures[toKey] ?? world.skyTextures.night;
    world.skyB.material.needsUpdate = true;
    world.skyToKey = toKey;
  }
  if (world.skyB.visible) world.skyB.material.opacity = blend;
}

export function applyEnvironment(world, palette) {
  world.hemi.color.setHex(palette.hemiSky);
  world.hemi.groundColor.setHex(palette.hemiGround);
  world.hemi.intensity = palette.hemiIntensity;
  world.ambient.color.setHex(palette.ambient);
  world.ambient.intensity = palette.ambientIntensity;
  world.sun.color.setHex(palette.sunColor);
  world.sun.intensity = palette.sunIntensity;
  world.fill.intensity = palette.fillIntensity;
  world.lightDir.set(palette.lightDir[0], palette.lightDir[1], palette.lightDir[2]).normalize();
  focusAt(world, world.focusX, world.focusZ);

  // Window light, neon and street lamps are emissive materials rather than
  // real lights; the palette scales their intensity so noon reads as day.
  world.neonLevel = 0.55 + 0.45 * palette.neon;
  for (const style of world.facadeStyles) {
    style.material.emissiveIntensity = style.baseEmissive * (0.18 + 0.82 * palette.window);
  }
  if (world.storefrontMaterial) {
    world.storefrontMaterial.emissiveIntensity = world.storefrontBaseEmissive * (0.18 + 0.82 * palette.window);
  }
  if (world.crownMaterial) world.crownMaterial.color.setScalar(0.42 + 0.58 * palette.neon);
  if (world.pierBulbMaterial) world.pierBulbMaterial.color.setScalar(0.42 + 0.58 * palette.neon);
  if (world.lampMaterial) {
    world.lampMaterial.color.setHex(0xffc37a).multiplyScalar(0.32 + 0.68 * palette.street);
  }
  const streetGlow = 0.38 * (0.1 + 0.9 * palette.street);
  for (const index of world.streetGlowIndices) world.glowField.setBrightness(index, streetGlow);
  const pierGlow = 0.4 * (0.15 + 0.85 * palette.street);
  for (const index of world.pierGlowIndices) world.glowField.setBrightness(index, pierGlow);
  if (world.streetPoolMaterial) world.streetPoolMaterial.opacity = 0.14 * palette.street;

  if (world.water) {
    world.water.material.color.setHex(palette.waterTint);
    world.water.material.emissive.setHex(palette.waterEmissive);
    world.water.material.emissiveIntensity = palette.waterEmissiveIntensity;
  }
  if (world.sparkles) world.sparkles.material.opacity = palette.sparkle;
  if (world.stars) world.stars.material.opacity = palette.stars;
  for (const cloud of world.clouds) {
    cloud.sprite.material.color.setHex(palette.cloud);
    cloud.sprite.material.opacity = cloud.baseOpacity * palette.cloudOpacity;
  }

  setSky(world, palette.skyFrom, palette.skyTo, palette.skyBlend);

  const sun = palette.sun;
  world.sunHalo.visible = sun > 0.01;
  world.sunCore.visible = sun > 0.01;
  if (sun > 0.01) {
    world.sunHalo.position.set(palette.lightDir[0], palette.lightDir[1], palette.lightDir[2]).multiplyScalar(1120);
    world.sunCore.position.set(palette.lightDir[0], palette.lightDir[1], palette.lightDir[2]).multiplyScalar(1118);
    world.sunHalo.material.opacity = 0.45 * sun;
    world.sunCore.material.opacity = 0.95 * sun;
  }
  const moon = palette.moon;
  world.moonHalo.visible = moon > 0.01;
  world.moonCore.visible = moon > 0.01;
  if (moon > 0.01) {
    world.moonHalo.position.set(palette.moonDir[0], palette.moonDir[1], palette.moonDir[2]).multiplyScalar(1120);
    world.moonCore.position.set(palette.moonDir[0], palette.moonDir[1], palette.moonDir[2]).multiplyScalar(1118);
    world.moonHalo.material.opacity = 0.32 * moon;
    world.moonCore.material.opacity = moon;
  }
}

export function buildLights(world) {
  const preset = QUALITY_PRESETS[world.quality] ?? QUALITY_PRESETS.high;
  world.lightDir = SUN_DIR.clone();
  world.focusX = 20;
  world.focusZ = 30;
  world.hemi = new THREE.HemisphereLight(0x7f8fd6, 0x171322, 1.38);
  world.scene.add(world.hemi);

  world.ambient = new THREE.AmbientLight(0x4a4266, 0.56);
  world.scene.add(world.ambient);

  world.sun = new THREE.DirectionalLight(0x9fb2ff, 0.65);
  world.sun.castShadow = preset.shadows;
  world.sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
  world.sun.shadow.camera.left = -76;
  world.sun.shadow.camera.right = 76;
  world.sun.shadow.camera.top = 76;
  world.sun.shadow.camera.bottom = -76;
  world.sun.shadow.camera.near = 12;
  world.sun.shadow.camera.far = 300;
  world.sun.shadow.bias = -0.00035;
  world.sun.shadow.normalBias = 0.055;
  world.scene.add(world.sun);
  world.scene.add(world.sun.target);

  world.fill = new THREE.DirectionalLight(0x6f83cf, 1.0);
  world.fill.position.set(130, 70, -110);
  world.scene.add(world.fill);

  focusAt(world, 20, 30);
}

export function focusAt(world, x, z) {
  world.focusX = x;
  world.focusZ = z;
  const direction = world.lightDir ?? SUN_DIR;
  world.sun.position.set(x + direction.x * 120, direction.y * 120 + 12, z + direction.z * 120);
  world.sun.target.position.set(x, 0, z);
  world.sun.target.updateMatrixWorld();
}

export function buildClouds(world) {
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
    world.root.add(sprite);
    world.clouds.push({ sprite, baseX: x, baseOpacity: opacity, phase: rng.range(0, 6.28), speed: rng.range(0.8, 1.8) });
  }
}
