// The city: a 1.4 km coastal grid of neon blocks, built from merged geometry and instanced props
// so the whole world draws in a few dozen calls. Buildings carry canvas-painted window grids and
// an emissive map for lit windows; the beach, pier, lighthouse, palms, signals and billboards are
// all procedural. The module also owns what other systems ask of the world: collision, surfaces,
// line of sight, lanes for traffic, pickups and the sunken-sunset sky.
import * as THREE from '../vendor/three.module.js';
import { CITY, COLORS } from './config.js';
import {
  MeshBuilder, makeCanvas, canvasTexture, makeFacadeTextures, makeSignTexture,
  makeBillboardTexture, makeGlowTexture, makeNoiseTexture,
} from './geo.js';
import { range, pick } from './random.js';

export const LANDMARKS = {
  spawn: { x: -34, z: 92, heading: Math.PI * 0.15 },
  garage: { x: -168, z: -20, heading: 0 },
  hospital: { x: -424, z: 204, heading: 1.2 },
  handoff: { x: 200, z: 196, heading: 2.4 },
  ambush: { x: -264, z: 332, heading: 0.4 },
  rival: { x: -430, z: 196, heading: 0 },
  pierGate: { x: 470, z: 8, heading: 0 },
  pierEnd: { x: 648, z: 0, heading: 0 },
  boat: { x: 700, z: 6, heading: 0 },
  beach: { x: 470, z: -80, heading: 0 },
  marina: { x: 500, z: 300, heading: 0 },
};

const SUN_DIRECTION = new THREE.Vector3(0.86, 0.16, 0.34).normalize();
const FOG_COLOR = new THREE.Color(COLORS.fog);

/** The four sky colours, shared by the dome shader and the HUD's haze. */
export const SKY = { top: COLORS.skyTop, mid: COLORS.skyMid, horizon: COLORS.horizon };

function makeSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(COLORS.skyTop) },
      midColor: { value: new THREE.Color(COLORS.skyMid) },
      horizonColor: { value: new THREE.Color(COLORS.horizon) },
      sunColor: { value: new THREE.Color(COLORS.sun) },
      sunDir: { value: SUN_DIRECTION.clone() },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, horizonColor, sunColor, sunDir;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float h = clamp(dir.y, -0.4, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.2, h));
        col = mix(col, topColor, smoothstep(0.14, 0.7, h));
        float sun = max(dot(dir, sunDir), 0.0);
        col += sunColor * pow(sun, 6.0) * 0.5;
        col += sunColor * pow(sun, 70.0) * 0.75;
        col += sunColor * pow(sun, 800.0) * 2.2;
        col = mix(col, horizonColor, smoothstep(0.12, -0.1, h) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.uniformsNeedUpdate = true;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4200, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

function makeWater() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sunDir: { value: SUN_DIRECTION.clone() },
      sunColor: { value: new THREE.Color(COLORS.sun) },
      deep: { value: new THREE.Color('#0d2230') },
      shallow: { value: new THREE.Color('#2f6a72') },
      fogColor: { value: FOG_COLOR.clone() },
      fogDensity: { value: 0.00085 },
    },
    vertexShader: `
      uniform float time;
      varying vec3 vWorld;
      varying float vWave;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float w = sin(world.x * 0.09 + time * 1.3) * 0.18 + sin(world.z * 0.06 - time * 0.9) * 0.14;
        world.y += w;
        vWave = w;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float time;
      uniform vec3 sunDir, sunColor, deep, shallow, fogColor;
      uniform float fogDensity;
      varying vec3 vWorld;
      varying float vWave;
      void main() {
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 normal = normalize(vec3(sin(vWorld.x * 0.4 + time) * 0.12, 1.0, cos(vWorld.z * 0.35 - time * 1.2) * 0.12));
        vec3 reflectDir = reflect(-view, normal);
        float spec = pow(max(dot(reflectDir, sunDir), 0.0), 60.0);
        float fresnel = pow(1.0 - max(dot(view, normal), 0.0), 3.0);
        vec3 col = mix(deep, shallow, 0.35 + vWave * 2.0);
        col = mix(col, vec3(0.92, 0.52, 0.4), fresnel * 0.55);
        col += sunColor * spec * 2.4;
        float glint = smoothstep(0.5, 1.0, sin(vWorld.z * 0.9 + time * 2.0) * cos(vWorld.x * 0.22 - time)) * 0.09;
        col += sunColor * glint;
        float dist = length(cameraPosition - vWorld);
        float fog = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
        col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new THREE.PlaneGeometry(7000, 7000, 60, 60);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(1600, -0.35, 0);
  return mesh;
}

/** A palm: a tapered trunk and eight bent fronds, merged so one InstancedMesh draws every tree. */
function makePalmGeometry(random) {
  const builder = new MeshBuilder();
  const segments = 6;
  const height = range(random, 6.5, 10.5);
  builder.cylinder(0, height / 2, 0, 0.26, 0.15, height, segments, '#4a3a2c');
  const crown = height - 0.2;
  for (let f = 0; f < 8; f += 1) {
    const angle = (f / 8) * Math.PI * 2 + random() * 0.3;
    const reach = range(random, 2.2, 3.4);
    const droop = range(random, 1.0, 2.2);
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const px = -dz, pz = dx;
    const width = 0.55;
    const mid = [dx * reach * 0.55 + px * width, crown + 0.7, dz * reach * 0.55 + pz * width];
    const mid2 = [dx * reach * 0.55 - px * width, crown + 0.7, dz * reach * 0.55 - pz * width];
    const tip = [dx * reach, crown + 0.7 - droop, dz * reach];
    builder.quad([0 - px * 0.12, crown, 0 - pz * 0.12], mid, tip, [0 + px * 0.12, crown, 0 + pz * 0.12], '#2f6b3f');
    builder.quad([0 + px * 0.12, crown, 0 + pz * 0.12], tip, mid2, [0 - px * 0.12, crown, 0 - pz * 0.12], '#24583a');
  }
  return builder.build();
}

export function createWorld(scene, random) {
  const group = new THREE.Group();
  group.name = 'NeonHarborCity';
  scene.add(group);

  const glowTexture = makeGlowTexture();
  const noise = makeNoiseTexture(11);
  noise.repeat.set(1, 1);
  const colliders = [];
  const parkingSpots = [];
  const benches = [];
  const signs = [];
  const pickups = [];
  const boats = [];
  const propAnchors = [];
  const laneWidth = 3.6;
  const roadHalf = CITY.roadWidth / 2;
  const lines = CITY.lines;

  // ---- light and air -------------------------------------------------------
  scene.fog = new THREE.FogExp2(COLORS.fog, 0.00085);
  scene.background = new THREE.Color(COLORS.skyMid);
  const sky = makeSky();
  scene.add(sky);
  const hemisphere = new THREE.HemisphereLight(0xffc39a, 0x241c33, 1.55);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffb27a, 2.6);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(400);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6f8dff, 0.55);
  fill.position.set(-260, 160, -300);
  scene.add(fill);

  const water = makeWater();
  group.add(water);

  // ---- ground, beach, surf -------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshStandardMaterial({ color: '#2a2530', roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-460, -0.06, 0);
  group.add(ground);

  const sandMaterial = new THREE.MeshStandardMaterial({ color: '#c39a6a', roughness: 1, map: noise });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(64, 1400), sandMaterial);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.beachEdge + 30, 0.02, 0);
  group.add(sand);

  const surf = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 1400),
    new THREE.MeshBasicMaterial({ color: '#a9d9d4', transparent: true, opacity: 0.35, depthWrite: false }),
  );
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(CITY.waterEdge + 6, 0.1, 0);
  group.add(surf);

  // ---- paints and materials ------------------------------------------------
  const towerTextures = makeFacadeTextures(random, 'tower');
  const blockTextures = makeFacadeTextures(random, 'block');
  const facadeMaterial = (textures) => new THREE.MeshStandardMaterial({
    map: textures.map, emissiveMap: textures.emissiveMap, emissive: 0xffa060,
    emissiveIntensity: 1.35, vertexColors: true, roughness: 0.68, metalness: 0.18,
  });
  const towerMaterial = facadeMaterial(towerTextures);
  const blockMaterial = facadeMaterial(blockTextures);
  const flatMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.04, map: noise });
  const paintMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const asphaltMaterial = new THREE.MeshStandardMaterial({ color: '#2a2833', roughness: 0.96, metalness: 0.05, map: noise });

  // ---- the street grid -----------------------------------------------------
  const roadBuilder = new MeshBuilder();
  const paintBuilder = new MeshBuilder();
  const walkBuilder = new MeshBuilder();
  const curbBuilder = new MeshBuilder();
  const blockBounds = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = 0; j < lines.length; j += 1) {
      const x0 = lines[i] + roadHalf, x1 = lines[j] + roadHalf;
      if (i === j) continue;
    }
  }
  // Roads: one long strip per avenue, plus a slightly darker crown down the middle.
  for (const line of lines) {
    roadBuilder.box(line, 0.01, 0, CITY.roadWidth, 0.04, 1400, '#2c2a35', 8);
    roadBuilder.box(0, 0.01, line, 1400, 0.04, CITY.roadWidth, '#2c2a35', 8);
  }
  for (let i = 0; i < lines.length - 1; i += 1) {
    const a = lines[i], b = lines[i + 1];
    const centre = (a + b) / 2;
    const span = b - a - CITY.roadWidth;
    for (const line of lines) {
      // Dashed centre line, dashes 5 m on 9 m off, skipping the junction boxes.
      for (let d = 0; d < span - 6; d += 14) {
        const z = a + roadHalf + 6 + d;
        if (z + 5 > b - roadHalf - 2) break;
        paintBuilder.ground(line, 0.045, z, 0.22, 4.6, '#c9c2aa');
        paintBuilder.ground(z, 0.045, line, 4.6, 0.22, '#c9c2aa');
      }
      // Solid edge lines just inside the kerb.
      paintBuilder.ground(line - roadHalf + 0.9, 0.045, centre, 0.16, span, '#8f8875');
      paintBuilder.ground(line + roadHalf - 0.9, 0.045, centre, 0.16, span, '#8f8875');
      paintBuilder.ground(centre, 0.045, line - roadHalf + 0.9, span, 0.16, '#8f8875');
      paintBuilder.ground(centre, 0.045, line + roadHalf - 0.9, span, 0.16, '#8f8875');
    }
  }
  // Crosswalks at every junction approach.
  for (const x of lines) {
    for (const z of lines) {
      for (let s = 0; s < 4; s += 1) {
        for (let k = -3; k <= 3; k += 1) {
          const offset = k * 1.9;
          if (s === 0) paintBuilder.ground(x + offset, 0.05, z + roadHalf + 1.7, 0.9, 2.6, '#ddd6c2');
          if (s === 1) paintBuilder.ground(x + offset, 0.05, z - roadHalf - 1.7, 0.9, 2.6, '#ddd6c2');
          if (s === 2) paintBuilder.ground(x + roadHalf + 1.7, 0.05, z + offset, 2.6, 0.9, '#ddd6c2');
          if (s === 3) paintBuilder.ground(x - roadHalf - 1.7, 0.05, z + offset, 2.6, 0.9, '#ddd6c2');
        }
      }
    }
  }

  // ---- blocks, buildings, plazas ------------------------------------------
  const towerBuilder = new MeshBuilder();
  const blockBuilder = new MeshBuilder();
  const roofBuilder = new MeshBuilder();
  const grassBuilder = new MeshBuilder();
  const parkingBuilder = new MeshBuilder();
  const signTextures = [
    makeSignTexture('NEON HARBOR', '#ff3d8b', { sub: 'LAST EXIT BEFORE THE SEA' }),
    makeSignTexture('SUNSET MOTEL', '#28e0d0', { sub: 'VACANCY · COLD POOL' }),
    makeSignTexture('TIKI BAR', '#ffb02f', { sub: 'OPEN ALL NIGHT' }),
    makeSignTexture('VOLT ARCADE', '#a06bff', { sub: '25¢ PLAYS' }),
    makeSignTexture('SOLANO IMPORTS', '#4bd2ff', { sub: 'FREIGHT · REPAIR' }),
    makeSignTexture('HOTEL AZUL', '#ffe45c', { sub: 'ROOMS BY THE HOUR' }),
    makeSignTexture('PIER 9', '#ff7a2f', { sub: 'FISH & LIQUOR' }),
    makeSignTexture('CASA LUNA', '#ff5f9e', { sub: 'TACOS · 24H' }),
    makeSignTexture('REDLINE', '#ff3c3c', { sub: 'GARAGE & DETAIL' }),
    makeSignTexture('NOCTURNE', '#8affc1', { sub: 'CLUB · NO COVER' }),
    makeSignTexture('LOW TIDE', '#5bb8ff', { sub: 'SURF · BAIT · BEER' }),
    makeSignTexture('DRIFT', '#ffd25e', { sub: 'PAWN & LOAN' }),
  ];
  const billboardTextures = [
    makeBillboardTexture(random, 'NEON HARBOR', 'THE CITY THAT NEVER DRIES'),
    makeBillboardTexture(random, 'VANTO', 'DRIVE THE STORM'),
    makeBillboardTexture(random, 'AZUL', 'STAY ANOTHER NIGHT'),
    makeBillboardTexture(random, 'WAVE 98.4', 'ALL SYNTH ALL NIGHT'),
  ];

  function addSign(text, color, x, y, z, rotY, w, h, force = false) {
    if (!force && signs.length >= 26) return;
    const material = new THREE.MeshBasicMaterial({ map: text, transparent: true, toneMapped: false });
    const geometry = new THREE.PlaneGeometry(w, h);
    // Two faces, each reading the right way round: the back is not a mirror.
    for (const flip of [0, Math.PI]) {
      const mesh = new THREE.Mesh(geometry, material);
      const angle = rotY + flip;
      mesh.position.set(x + Math.sin(angle) * 0.05, y, z + Math.cos(angle) * 0.05);
      mesh.rotation.y = angle;
      group.add(mesh);
      if (flip === 0) signs.push({ mesh, flicker: random() < 0.28, phase: random() * 10, base: 1 });
    }
    propAnchors.push({ kind: 'sign', x, z });
  }

  function addBuilding(px, pz, width, depth, height, downtown, isBlock) {
    const base = isBlock ? blockBuilder : towerBuilder;
    const tint = pick(random, downtown ? ['#b9c4d6', '#9fb0c8', '#c8bfae', '#a9a2b8', '#d0c3b0'] : ['#c9b6a4', '#b6a898', '#d3c7b6', '#a89a90', '#c2b9ae']);
    const rise = 0.3;
    base.facade(px, rise + height / 2, pz, width, height, depth, tint, downtown ? 7.2 : 6.4, random() * 8);
    // Roof slab, parapet and the mechanical clutter on top.
    const top = rise + height;
    roofBuilder.box(px, top + 0.25, pz, width + 0.4, 0.5, depth + 0.4, '#3a3440');
    roofBuilder.box(px, top + 0.7, pz, width - 1.6, 0.9, depth - 1.6, '#2f2a36');
    for (let k = 0; k < 2 + Math.floor(random() * 3); k += 1) {
      const w = range(random, 2, Math.min(7, width * 0.4));
      const d = range(random, 2, Math.min(7, depth * 0.4));
      roofBuilder.box(px + range(random, -width / 2 + w, width / 2 - w), top + 1.4, pz + range(random, -depth / 2 + d, depth / 2 - d), w, 1.6, d, '#4a4350');
    }
    if (height > 40 && random() < 0.7) {
      const mast = range(random, 8, 20);
      roofBuilder.box(px + range(random, -width / 3, width / 3), top + mast / 2, pz + range(random, -depth / 3, depth / 3), 0.35, mast, 0.35, '#241f2b');
    }
    colliders.push({ x: px, z: pz, w: width, d: depth, h: height, top: top });
    // Storefront awnings and neon on the street-facing side.
    const side = Math.floor(random() * 4);
    const nx = side === 0 ? 1 : side === 1 ? -1 : 0;
    const nz = side === 2 ? 1 : side === 3 ? -1 : 0;
    const signW = Math.min(width, depth) * 0.72;
    const signY = rise + Math.min(height * 0.5, range(random, 4.5, 13));
    const signX = px + nx * (nx === 0 ? 0 : width / 2 + 0.25) + (nx === 0 ? range(random, -width / 3, width / 3) : 0);
    const signZ = pz + nz * (nz === 0 ? 0 : depth / 2 + 0.25) + (nz === 0 ? range(random, -depth / 3, depth / 3) : 0);
    const rotY = nx === 1 ? Math.PI / 2 : nx === -1 ? -Math.PI / 2 : nz === 1 ? 0 : Math.PI;
    if (random() < (downtown ? 0.62 : 0.34) && height > 7) {
      addSign(pick(random, signTextures), COLORS.neon[0], signX, signY, signZ, rotY, signW, signW * 0.26);
    }
    // Awning over the door.
    if (random() < 0.5) {
      const awningColor = pick(random, ['#8c2f3f', '#2f6f70', '#7a5a2f', '#4a3f78']);
      blockBuilder.box(signX, rise + 3.1, signZ, nx === 0 ? signW * 0.6 : 1.4, 0.25, nz === 0 ? signW * 0.6 : 1.4, awningColor);
    }
  }

  for (let i = 0; i < lines.length - 1; i += 1) {
    for (let j = 0; j < lines.length - 1; j += 1) {
      const x0 = lines[i] + roadHalf, x1 = lines[i + 1] - roadHalf;
      const z0 = lines[j] + roadHalf, z1 = lines[j + 1] - roadHalf;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const size = x1 - x0;
      blockBounds.push({ x: cx, z: cz, size });
      // Pavement platform with a darker kerb ring.
      curbBuilder.box(cx, 0.12, cz, size + 4, 0.24, size + 4, '#5b5560', 4);
      walkBuilder.box(cx, 0.15, cz, size, 0.3, size, '#56505b', 3);
      const downtown = Math.hypot(cx - CITY.downtown.x, cz - CITY.downtown.z) < CITY.downtown.radius;
      const roll = random();
      if (roll < 0.07) {
        // Pocket park: grass, a fountain, benches and trees.
        grassBuilder.box(cx, 0.34, cz, size - 14, 0.14, size - 14, '#33553a', 6);
        grassBuilder.box(cx, 0.36, cz, 7, 0.5, 7, '#4a4550');
        grassBuilder.box(cx, 0.75, cz, 5.4, 0.5, 5.4, '#2e6f78');
        benches.push({ x: cx + 14, z: cz, rot: 0 }, { x: cx - 14, z: cz, rot: Math.PI });
        for (let t = 0; t < 6; t += 1) {
          propAnchors.push({ kind: 'palm', x: cx + range(random, -size / 2 + 10, size / 2 - 10), z: cz + range(random, -size / 2 + 10, size / 2 - 10) });
        }
        propAnchors.push({ kind: 'bench', x: cx + 14, z: cz, rot: 0 }, { kind: 'bench', x: cx - 14, z: cz, rot: Math.PI });
      } else if (roll < 0.14) {
        // Parking lot with painted bays and a billboard.
        parkingBuilder.box(cx, 0.3, cz, size - 12, 0.1, size - 12, '#2a2832');
        for (let b = 0; b < 8; b += 1) {
          const bx = cx - size / 2 + 18 + b * 9;
          parkingBuilder.ground(bx, 0.36, cz, 0.18, 12, '#cfc7ae');
        }
        parkingSpots.push({ x: cx - 10, z: cz - size / 2 + 12, rot: 0 }, { x: cx + 10, z: cz - size / 2 + 12, rot: 0 });
        addBillboard(cx, cz + size / 2 - 12, 0);
      } else {
        const plots = [];
        const layout = random();
        if (layout < 0.24) plots.push({ x: cx, z: cz, w: size - 10, d: size - 10 });
        else if (layout < 0.58) {
          const splitX = random() < 0.5;
          plots.push({ x: cx, z: cz - size / 4, w: size - 10, d: size / 2 - 8 });
          plots.push({ x: cx, z: cz + size / 4, w: size - 10, d: size / 2 - 8 });
          if (splitX) plots.forEach((p) => { const t = p.w; p.w = p.d; p.d = t; });
        } else {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) plots.push({ x: cx + sx * size / 4, z: cz + sz * size / 4, w: size / 2 - 8, d: size / 2 - 8 });
        }
        for (const plot of plots) {
          if (random() < 0.12) continue;
          const w = plot.w * range(random, 0.58, 0.95);
          const d = plot.d * range(random, 0.58, 0.95);
          const px = plot.x + range(random, -1, 1) * (plot.w - w) * 0.4;
          const pz = plot.z + range(random, -1, 1) * (plot.d - d) * 0.4;
          const nearBeach = px > 260;
          let height;
          if (downtown) height = range(random, 34, 132) * (0.55 + 0.45 * (1 - Math.min(1, Math.hypot(px - CITY.downtown.x, pz - CITY.downtown.z) / CITY.downtown.radius)));
          else if (nearBeach) height = range(random, 8, 26);
          else height = range(random, 12, 42);
          addBuilding(px, pz, w, d, Math.max(7, height), downtown && height > 32, height < 26);
        }
      }
    }
  }

  function addBillboard(x, z, rotY) {
    const material = new THREE.MeshBasicMaterial({ map: pick(random, billboardTextures), toneMapped: false });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), material);
    board.position.set(x, 9, z);
    board.rotation.y = rotY;
    group.add(board);
    const back = new THREE.Mesh(new THREE.BoxGeometry(14.6, 7.6, 0.4), new THREE.MeshStandardMaterial({ color: '#241f2b', roughness: 0.8 }));
    back.position.set(x, 9, z);
    back.rotation.y = rotY;
    back.translateZ(-0.25);
    group.add(back);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: '#332e3a', roughness: 0.7, metalness: 0.5 });
    for (const dx of [-4.8, 4.8]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), poleMaterial);
      pole.position.set(x + Math.cos(rotY) * dx, 4.5, z - Math.sin(rotY) * dx);
      group.add(pole);
    }
  }

  // A hero billboard on the strip, facing the long avenue.
  addBillboard(146, 116, Math.PI);

  // Hand-picked neon down the opening street. Wall signs face the road; the blade signs face
  // up the avenue so the first view has colour down both sides of the canyon.
  addSign(signTextures[0], COLORS.neon[0], -33.2, 10, 96, 0, 14, 3.6, true);
  addSign(signTextures[3], COLORS.neon[3], -51.6, 14, 132, Math.PI, 11, 2.8, true);
  addSign(signTextures[1], COLORS.neon[1], -33.2, 7.5, 138, 0, 12, 3.1, true);
  addSign(signTextures[7], COLORS.neon[2], -51.6, 9, 164, Math.PI, 10, 2.6, true);
  addSign(signTextures[5], COLORS.neon[4], -33.2, 16, 172, 0, 9, 2.4, true);
  addSign(signTextures[10], COLORS.neon[1], -51.6, 6, 88, Math.PI, 8, 2.1, true);
  // Storefront neon strips at eye level along both canyon walls.
  const neonStrip = new MeshBuilder();
  for (const [x, z, color] of [[-33.0, 102, '#ff3d8b'], [-33.0, 128, '#28e0d0'], [-51.8, 112, '#ff7a2f'], [-51.8, 150, '#a06bff']]) {
    neonStrip.box(x, 3.4, z, 0.16, 0.16, 24, color, 1);
    neonStrip.box(x, 3.1, z, 0.3, 0.06, 22, color, 1);
  }
  group.add(new THREE.Mesh(neonStrip.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));

  // ---- city meshes ---------------------------------------------------------
  const towerMesh = new THREE.Mesh(towerBuilder.build(), towerMaterial);
  const blockMesh = new THREE.Mesh(blockBuilder.build(), blockMaterial);
  const flatRanges = [
    [roofBuilder, flatMaterial], [walkBuilder, flatMaterial], [curbBuilder, flatMaterial],
    [grassBuilder, flatMaterial], [parkingBuilder, flatMaterial],
  ];
  group.add(towerMesh, blockMesh);
  for (const [builder, material] of flatRanges) {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  const asphaltMesh = new THREE.Mesh(roadBuilder.build(), asphaltMaterial);
  group.add(asphaltMesh);
  const paintMesh = new THREE.Mesh(paintBuilder.build(), paintMaterial);
  group.add(paintMesh);
  colliders.push(...blockBounds.map((b) => ({ x: b.x, z: b.z, w: 0, d: 0, h: 0, top: 0.3 })));

  // ---- instanced street furniture -----------------------------------------
  const dummy = new THREE.Object3D();
  const instanced = (geometry, material, list, apply) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
    list.forEach((item, index) => {
      apply(item, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  };

  const metalMaterial = new THREE.MeshStandardMaterial({ color: '#2c2a33', roughness: 0.6, metalness: 0.6 });
  const lampMaterial = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false });
  const poleBuilder = new MeshBuilder();
  poleBuilder.box(0, 3.9, 0, 0.22, 7.8, 0.22, '#6b6470');
  poleBuilder.box(1.1, 7.7, 0, 2.3, 0.18, 0.18, '#6b6470');
  const poleGeometry = poleBuilder.build();
  const lampGeometry = new THREE.BoxGeometry(0.9, 0.22, 0.46);
  const lightSpots = [];
  const palmSpots = [];
  const benchSpots = [];
  const dumpsterSpots = [];
  for (const block of blockBounds) {
    const half = block.size / 2 - 3.2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = block.x + sx * half, z = block.z + sz * half;
        lightSpots.push({ x, z, rot: Math.atan2(-sx, -sz) });
        if (random() < 0.55) palmSpots.push({ x: x - sx * 3, z: z - sz * 3, rot: random() * 6.28, scale: range(random, 0.75, 1.2) });
      }
    }
    if (random() < 0.5) dumpsterSpots.push({ x: block.x + range(random, -half, half), z: block.z + range(random, -half, half), rot: random() * 6.28 });
  }
  for (const bench of benches) benchSpots.push(bench);
  for (const anchor of propAnchors) {
    if (anchor.kind === 'palm') palmSpots.push({ x: anchor.x, z: anchor.z, rot: random() * 6.28, scale: range(random, 0.8, 1.15) });
    if (anchor.kind === 'bench') benchSpots.push({ x: anchor.x, z: anchor.z, rot: anchor.rot });
  }
  // Beach palms.
  for (let k = 0; k < 22; k += 1) palmSpots.push({ x: range(random, CITY.beachEdge + 4, CITY.beachEdge + 52), z: range(random, -660, 660), rot: random() * 6.28, scale: range(random, 0.7, 1.1) });

  instanced(poleGeometry, metalMaterial, lightSpots, (spot, d) => {
    d.position.set(spot.x, 0.3, spot.z);
    d.rotation.set(0, spot.rot, 0);
    d.scale.set(1, 1, 1);
  });
  instanced(lampGeometry, lampMaterial, lightSpots, (spot, d) => {
    d.position.set(spot.x + Math.cos(spot.rot) * 1.9, 7.75, spot.z - Math.sin(spot.rot) * 1.9);
    d.rotation.set(0, spot.rot, 0);
    d.scale.set(1, 1, 1);
  });
  const palmGeometry = makePalmGeometry(random);
  const palmMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  instanced(palmGeometry, palmMaterial, palmSpots, (spot, d) => {
    d.position.set(spot.x, 0.25, spot.z);
    d.rotation.set(0, spot.rot, 0);
    d.scale.setScalar(spot.scale);
  });
  const benchBuilder = new MeshBuilder();
  benchBuilder.box(0, 0.5, 0, 2.2, 0.12, 0.6, '#6a4b34');
  benchBuilder.box(0, 0.9, -0.28, 2.2, 0.55, 0.1, '#6a4b34');
  benchBuilder.box(-0.9, 0.25, 0, 0.12, 0.5, 0.55, '#33302f');
  benchBuilder.box(0.9, 0.25, 0, 0.12, 0.5, 0.55, '#33302f');
  instanced(benchBuilder.build(), flatMaterial, benchSpots, (spot, d) => {
    d.position.set(spot.x, 0.3, spot.z);
    d.rotation.set(0, spot.rot, 0);
    d.scale.setScalar(1);
  });
  const dumpsterBuilder = new MeshBuilder();
  dumpsterBuilder.box(0, 0.75, 0, 2.4, 1.5, 1.3, '#36594a');
  dumpsterBuilder.box(0, 1.56, -0.05, 2.5, 0.14, 1.4, '#28453a');
  instanced(dumpsterBuilder.build(), flatMaterial, dumpsterSpots, (spot, d) => {
    d.position.set(spot.x, 0.3, spot.z);
    d.rotation.set(0, spot.rot, 0);
    d.scale.setScalar(1);
  });

  // ---- traffic signals -----------------------------------------------------
  const signalSpots = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = 0; j < lines.length; j += 1) {
      const x = lines[i], z = lines[j];
      if (x > 430) continue;
      signalSpots.push({ x: x + roadHalf + 1.6, z: z + roadHalf + 1.6, rot: Math.PI });
      signalSpots.push({ x: x - roadHalf - 1.6, z: z - roadHalf - 1.6, rot: 0 });
    }
  }
  const signalPole = new MeshBuilder();
  signalPole.box(0, 2.7, 0, 0.16, 5.4, 0.16, '#3a3640');
  signalPole.box(0, 5.3, 0.34, 0.16, 0.16, 1.0, '#3a3640');
  signalPole.box(0, 4.85, 0.82, 0.46, 1.15, 0.34, '#1d1b22');
  instanced(signalPole.build(), metalMaterial, signalSpots, (spot, d) => {
    d.position.set(spot.x, 0.3, spot.z);
    d.rotation.set(0, spot.rot, 0);
    d.scale.setScalar(1);
  });
  const lampGroups = {};
  for (const axis of ['ns', 'ew']) {
    for (const colour of ['red', 'yellow', 'green']) {
      const lamp = new THREE.MeshBasicMaterial({ color: colour === 'red' ? '#ff3b30' : colour === 'yellow' ? '#ffcc33' : '#3dff88', toneMapped: false });
      lampGroups[`${axis}-${colour}`] = instanced(new THREE.BoxGeometry(0.3, 0.3, 0.18), lamp, signalSpots, (spot, d) => {
        const local = colour === 'red' ? 0 : colour === 'yellow' ? 0.36 : -0.36;
        d.position.set(spot.x + Math.sin(spot.rot) * 0.66, 5.2 + local, spot.z + Math.cos(spot.rot) * 0.66);
        d.rotation.set(0, spot.rot, 0);
        d.scale.setScalar(1);
      });
      lampGroups[`${axis}-${colour}`].visible = false;
    }
  }
  const signalCycle = { time: 0, ns: 'green', ew: 'red' };

  // ---- the pier, lighthouse and boats -------------------------------------
  const pierBuilder = new MeshBuilder();
  const pierZ = 0;
  pierBuilder.box((CITY.waterEdge + 700) / 2, 0.8, pierZ, 720 - CITY.waterEdge, 0.5, 18, '#6b5137', 4);
  for (let x = CITY.waterEdge; x < 706; x += 6) {
    pierBuilder.box(x, 0.66, pierZ - 8.4, 0.4, 0.9, 0.4, '#3c2f22');
    pierBuilder.box(x, 0.66, pierZ + 8.4, 0.4, 0.9, 0.4, '#3c2f22');
  }
  for (let x = CITY.waterEdge + 4; x < 700; x += 24) {
    pierBuilder.box(x, 2.4, pierZ - 8.6, 0.3, 2.6, 0.3, '#51432f');
    pierBuilder.box(x, 2.4, pierZ + 8.6, 0.3, 2.6, 0.3, '#51432f');
    pierBuilder.box(x, 3.6, pierZ - 8.6, 0.24, 0.2, 0.24, '#ffcf8a');
    pierBuilder.box(x, 3.6, pierZ + 8.6, 0.24, 0.2, 0.24, '#ffcf8a');
  }
  // Pier pavilion and crates where the last mission ends.
  // A wider head on the pier for the pavilion and the crates.
  pierBuilder.box(678, 0.8, 22, 34, 0.5, 38, '#6b5137', 4);
  pierBuilder.box(676, 3.4, 26, 26, 5.2, 16, '#4f4352', 4);
  pierBuilder.box(676, 6.2, 26, 28, 0.5, 18, '#2e2836');
  for (let c = 0; c < 9; c += 1) {
    pierBuilder.box(628 + (c % 3) * 2.2, 1.75, -6 + Math.floor(c / 3) * 2.2, 1.8, 1.5, 1.8, '#5a4a34');
  }
  // Fight cover closer to the pier gate.
  pierBuilder.box(643, 1.6, 13, 2.2, 1.7, 2.2, '#5f4c35');
  pierBuilder.box(641, 3.1, 13, 1.8, 1.3, 1.8, '#4e3f2b');
  pierBuilder.box(645, 1.5, 4, 1.8, 1.4, 2.4, '#5f4c35');
  pierBuilder.box(652, 1.55, -3, 2.0, 1.5, 2.0, '#5a4a34');
  group.add(new THREE.Mesh(pierBuilder.build(), flatMaterial));
  addSign(makeSignTexture('PIER 9', '#ff7a2f', { sub: 'FISH & LIQUOR' }), COLORS.neon[2], 676, 8.4, 17.6, 0, 16, 4.2);

  // Lighthouse standing off the point.
  const lighthouse = new THREE.Group();
  lighthouse.position.set(720, 0, 96);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#3a3440', roughness: 0.95 });
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(17, 22, 4, 9), rockMaterial);
  rock.position.y = 1.2;
  lighthouse.add(rock);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 5.2, 22, 12), new THREE.MeshStandardMaterial({ color: '#e6dfd2', roughness: 0.8 }));
  tower.position.y = 14;
  lighthouse.add(tower);
  for (const y of [9, 17, 23]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(4.1 - (y - 9) * 0.09, 4.3 - (y - 9) * 0.09, 2.4, 12), new THREE.MeshStandardMaterial({ color: '#b8303a', roughness: 0.7 }));
    band.position.y = y;
    lighthouse.add(band);
  }
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 3.2, 10), new THREE.MeshBasicMaterial({ color: '#ffe9b0', toneMapped: false }));
  lantern.position.y = 27.5;
  lighthouse.add(lantern);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.6, 10), new THREE.MeshStandardMaterial({ color: '#b8303a', roughness: 0.7 }));
  cap.position.y = 30.2;
  lighthouse.add(cap);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(9, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffeab0', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(45, 27.5, 0);
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 0;
  beamPivot.add(beam);
  lighthouse.add(beamPivot);
  group.add(lighthouse);

  // A few hulls bobbing offshore, and the escape boat at the pier.
  function makeBoat(x, z, rot, scale = 1, hullColor = '#d9d2c4') {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.5, 2.6), new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.5, metalness: 0.2 }));
    hull.position.y = 0.35;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 2), new THREE.MeshStandardMaterial({ color: '#2f3b4a', roughness: 0.4, metalness: 0.3 }));
    cabin.position.set(-1.2, 1.7, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.22, 2.7), new THREE.MeshStandardMaterial({ color: '#a83a34', roughness: 0.6 }));
    stripe.position.y = 0.9;
    boat.add(hull, cabin, stripe);
    boat.position.set(x, 0, z);
    boat.rotation.y = rot;
    boat.scale.setScalar(scale);
    group.add(boat);
    boats.push({ group: boat, baseY: 0, phase: random() * 6.28 });
    return boat;
  }
  makeBoat(620, -90, 0.3, 1.2, '#e2dbcd');
  makeBoat(760, 240, 1.2, 1.0, '#cfd6de');
  makeBoat(585, 190, -0.6, 1.1, '#d8c7a8');
  makeBoat(710, 6, 0, 1.35, '#efe7d8'); // the escape boat, tied off the pier head
  const escapeBoat = boats[boats.length - 1];

  // ---- pickups -------------------------------------------------------------
  const crossGeometry = new THREE.BoxGeometry(0.7, 0.24, 0.24);
  const crossVertical = new THREE.BoxGeometry(0.24, 0.7, 0.24);
  const healthMaterial = new THREE.MeshBasicMaterial({ color: '#4dff9a', toneMapped: false });
  const armorMaterial = new THREE.MeshBasicMaterial({ color: '#5bb8ff', toneMapped: false });
  function addPickup(type, x, z) {
    const holder = new THREE.Group();
    const material = type === 'health' ? healthMaterial : armorMaterial;
    const a = new THREE.Mesh(crossGeometry, material);
    const b = new THREE.Mesh(type === 'health' ? crossVertical : new THREE.BoxGeometry(0.6, 0.6, 0.12), material);
    holder.add(a, b);
    holder.position.set(x, 1.2, z);
    group.add(holder);
    pickups.push({ group: holder, type, active: true, timer: 0, phase: random() * 6.28, x, z });
  }
  addPickup('health', LANDMARKS.hospital.x + 6, LANDMARKS.hospital.z + 6);
  addPickup('armor', LANDMARKS.garage.x - 8, LANDMARKS.garage.z + 10);
  addPickup('health', 200, 212);
  addPickup('armor', -264, 344);
  addPickup('health', 640, 14);
  addPickup('armor', 470, -70);
  addPickup('health', 30, -150);
  addPickup('armor', -300, -40);

  // ---- surfaces, collision and sight --------------------------------------
  const pierBounds = { x0: CITY.waterEdge, x1: 706, z0: -9, z1: 9 };

  function surfaceHeight(x, z) {
    if (x > pierBounds.x0 - 2 && x < pierBounds.x1 && Math.abs(z - pierZ) < 9) return 1.05;
    if (x > 660 && x < 696 && z > 2 && z < 42) return 1.05;
    if (x > CITY.beachEdge) return 0.02;
    for (const block of blockBounds) {
      if (Math.abs(x - block.x) < block.size / 2 && Math.abs(z - block.z) < block.size / 2) return 0.3;
    }
    return 0;
  }

  function isOnBlock(x, z) {
    for (const block of blockBounds) {
      if (Math.abs(x - block.x) < block.size / 2 && Math.abs(z - block.z) < block.size / 2) return true;
    }
    return false;
  }

  /** Push a circle out of building footprints; returns the corrected position. */
  function resolveCollision(position, radius) {
    for (const c of colliders) {
      if (c.h <= 0) continue;
      const halfW = c.w / 2 + radius, halfD = c.d / 2 + radius;
      const dx = position.x - c.x, dz = position.z - c.z;
      if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
        const overlapX = halfW - Math.abs(dx), overlapZ = halfD - Math.abs(dz);
        if (overlapX < overlapZ) position.x += Math.sign(dx || 1) * overlapX;
        else position.z += Math.sign(dz || 1) * overlapZ;
      }
    }
    return position;
  }

  /** True when a building blocks the segment a->b (2D, ignoring height). */
  function lineBlocked(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (const c of colliders) {
      if (c.h <= 0) continue;
      const hw = c.w / 2, hd = c.d / 2;
      let tmin = 0, tmax = 1;
      let ok = true;
      for (const [p, d, min, max] of [[ax, dx, c.x - hw, c.x + hw], [az, dz, c.z - hd, c.z + hd]]) {
        if (Math.abs(d) < 1e-6) {
          if (p < min || p > max) { ok = false; break; }
        } else {
          let t1 = (min - p) / d, t2 = (max - p) / d;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok) return true;
    }
    return false;
  }

  /** The nearest point on a road centre line to (x,z), plus the lane heading. */
  function nearestRoad(x, z) {
    let best = null;
    for (const line of lines) {
      for (const axis of ['x', 'z']) {
        const px = axis === 'x' ? line : x;
        const pz = axis === 'x' ? z : line;
        const distance = axis === 'x' ? Math.abs(x - line) : Math.abs(z - line);
        if (best === null || distance < best.distance) best = { x: px, z: pz, axis, line, distance };
      }
    }
    return best;
  }

  /** A point on a random road lane, used to place traffic and police out of sight. */
  function randomRoadPoint(randomFn, awayFrom, minDistance = 80) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const line = pick(randomFn, lines.slice(0, 9));
      const along = range(randomFn, -660, 660);
      const axis = randomFn() < 0.5 ? 'x' : 'z';
      const x = axis === 'x' ? line : along;
      const z = axis === 'x' ? along : line;
      if (x > 430) continue;
      if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < minDistance) continue;
      return { x, z, axis };
    }
    return { x: 0, z: 0, axis: 'x' };
  }

  // ---- update --------------------------------------------------------------
  function update(dt, elapsed) {
    water.material.uniforms.time.value = elapsed;
    signalCycle.time += dt;
    const cycle = signalCycle.time % 28;
    signalCycle.ns = cycle < 12 ? 'green' : cycle < 14 ? 'yellow' : 'red';
    signalCycle.ew = cycle < 14 ? 'red' : cycle < 26 ? 'green' : 'yellow';
    for (const axis of ['ns', 'ew']) {
      for (const colour of ['red', 'yellow', 'green']) {
        lampGroups[`${axis}-${colour}`].visible = signalCycle[axis] === colour;
      }
    }
    beamPivot.rotation.y = elapsed * 0.35;
    signFlicker(elapsed);
    for (const boat of boats) {
      boat.group.position.y = boat.baseY + Math.sin(elapsed * 0.9 + boat.phase) * 0.22;
      boat.group.rotation.z = Math.sin(elapsed * 0.7 + boat.phase) * 0.03;
    }
    for (const pickup of pickups) {
      pickup.group.rotation.y = elapsed * 1.4 + pickup.phase;
      pickup.group.position.y = 1.05 + Math.sin(elapsed * 2 + pickup.phase) * 0.18;
      if (!pickup.active) {
        pickup.timer -= dt;
        if (pickup.timer <= 0) {
          pickup.active = true;
          pickup.group.visible = true;
        }
      }
    }
    escapeBoat.phase += 0;
  }

  function signFlicker(elapsed) {
    for (const sign of signs) {
      if (!sign.flicker) continue;
      const pulse = Math.sin(elapsed * 11 + sign.phase) * Math.sin(elapsed * 3.3 + sign.phase * 2);
      sign.mesh.material.opacity = pulse > 0.72 ? 0.35 : 1;
    }
  }

  function collectPickup(pickup) {
    pickup.active = false;
    pickup.group.visible = false;
    pickup.timer = 45;
  }

  return {
    group, colliders, blockBounds, parkingSpots, pickups, signs, boats, escapeBoat,
    landmarks: LANDMARKS, surfaceHeight, isOnBlock, resolveCollision, lineBlocked,
    nearestRoad, randomRoadPoint, update, collectPickup, signalState: () => signalCycle,
    sunDirection: SUN_DIRECTION.clone(), sunLight: sun, sky, water,
  };
}
