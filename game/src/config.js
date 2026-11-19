// Shared numbers for Neon Harbor. One place for the city grid, player feel,
// camera framing and the colors the HUD and world agree on.

export const SEED = 20261119;

// Road centerlines. The same seven values run in both axes, giving six blocks
// between them and a 14 m road corridor at every line.
export const ROADS = [-135, -81, -27, 27, 81, 135, 189];
export const BLOCK_CENTERS = ROADS.slice(0, -1).map((value, index) => (value + ROADS[index + 1]) / 2);

export const WORLD = {
  roadWidth: 14,
  blockSize: 40,
  sidewalkHeight: 0.15,
  cityMin: -142,
  cityMax: 196,
  beachMinX: -248,
  beachMaxX: -142,
  shorelineX: -232,
  beachMinZ: -260,
  beachMaxZ: 260,
  /** Player movement limits, generous enough to include the pier. */
  bounds: { minX: -326, maxX: 200, minZ: -198, maxZ: 202 },
  pier: {
    z: 70,
    minX: -316,
    maxX: -172,
    halfWidth: 9,
    deckY: 1.58,
    rampMinX: -172,
    rampMaxX: -156,
    rampHalfWidth: 5.4,
  },
  sunDir: [-0.74, 0.31, 0.46],
};

export const PLAYER = {
  radius: 0.46,
  height: 1.78,
  walkSpeed: 4.15,
  runSpeed: 8.1,
  acceleration: 30,
  airAcceleration: 9,
  friction: 14,
  jumpSpeed: 7.4,
  gravity: 23,
  spawn: { x: -62, z: 27.5 },
  spawnFacing: -Math.PI / 2, // west, toward the water
  spawnCameraYaw: Math.PI / 2,
  health: 100,
  armor: 30,
  cash: 1250,
};

export const CAMERA = {
  fov: 61,
  near: 0.08,
  far: 1500,
  distance: 5.8,
  minDistance: 3.1,
  maxDistance: 9.2,
  heightOffset: 0.82,
  lookHeight: 1.42,
  pitch: 0.17,
  minPitch: -0.18,
  maxPitch: 1.02,
  sensitivity: 0.00225,
  damping: 11,
};

export const START_OBJECTIVE = {
  title: 'Find Pier 9',
  sub: 'Head west along Vega Strip, then south to the water.',
  marker: { x: -168, z: 70 },
  reward: 0,
};

export const RADIO = {
  station: 'Night Tide 88.3',
  track: 'Harbor Lights — Sable Youth',
};

export const HOURS = 18;
export const MINUTES = 42;

export const PALETTE = {
  ink: '#0a0712',
  plum: '#160f22',
  cream: '#f7e8d2',
  creamDim: '#cdb59c',
  coral: '#ff6f61',
  coralDeep: '#d63f4a',
  teal: '#3fe0cf',
  gold: '#ffc95c',
  fog: 0xe3a087,
  skyHorizon: 0xffb183,
  skyMid: 0x9a5d8d,
  skyTop: 0x241d4a,
  sun: 0xffb06b,
  asphalt: 0x1d1a24,
  concrete: 0x6b5a60,
  sand: 0xd6ae78,
  oceanDeep: 0x0d2c39,
  windowWarm: 0xffc26e,
  windowCool: 0x54e0d3,
  windowPink: 0xff7e9a,
};

export const QUALITY_PRESETS = {
  high: { shadows: true, pixelRatio: 2, shadowMap: 2048, glow: 1 },
  low: { shadows: false, pixelRatio: 1.25, shadowMap: 1024, glow: 0.72 },
};

export function roadHalf() {
  return WORLD.roadWidth / 2;
}

export function districtAt(x, z) {
  if (x < -144 && z > 20 && z < 130) return 'Pier 9';
  if (x < -144) return 'Casa Luna Beach';
  if (z < -90 && x < 20) return 'North Point';
  if (x > 120) return 'Motor Row';
  if (z > 110) return 'Sunset Row';
  if (Math.abs(x - 0) < 38 && Math.abs(z - 0) < 38) return 'Luna Plaza';
  if (Math.abs(z - 27) < 34 && x < 100) return 'Vega Strip';
  return 'Neon Harbor';
}
