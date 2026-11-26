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
  // On the yellow line at the quiet west end of Vega Strip: traffic passes on
  // both sides and the parked Riptide is a short walk to the north curb.
  spawn: { x: -63, z: 27.3 },
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
  // The camera orbits the chest at heightOffset 0.82, so a pitch of about
  // -0.27 is the first angle that looks level; -0.18 never let the player aim
  // above the street. The ground clip in clipCamera settles the real limit.
  minPitch: -0.9,
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

// Three original stations. The sequencer in audio.js reads the same tempo and
// mood names, and the HUD shows whichever station the player has tuned.
export const RADIO = {
  stations: [
    {
      station: 'Night Tide 88.3',
      track: 'Sable Youth — Harbor Lights',
      style: 'synthwave',
      bpm: 96,
    },
    {
      station: 'KNRV 104.7',
      track: 'Chrome Weather — The Static',
      style: 'chiptune',
      bpm: 118,
    },
    {
      station: 'The Breakwater 97.1',
      track: 'Low Tide Riot — Pier Saints',
      style: 'surf',
      bpm: 132,
    },
  ],
};

// The two carried weapons. Damage is per pellet-free hitscan shot; fireRate is
// shots per second and the spread is in radians before movement penalties.
export const WEAPONS = {
  pistol: {
    name: 'Solano 9',
    short: 'PISTOL',
    damage: 34,
    fireRate: 4.4,
    mag: 12,
    reserve: 60,
    reload: 1.15,
    spread: 0.0055,
    movingSpread: 0.022,
    range: 88,
    tracer: 0xffd49a,
    kick: 0.011,
    auto: false,
  },
  smg: {
    name: 'Kestrel SMG',
    short: 'SMG',
    damage: 19,
    fireRate: 11.5,
    mag: 32,
    reserve: 96,
    reload: 1.65,
    spread: 0.016,
    movingSpread: 0.034,
    range: 72,
    tracer: 0xffbc84,
    kick: 0.006,
    auto: true,
  },
  // Melee: no spread, magazine, reserve or reload, and no tracer. The 2.1 m
  // reach is measured from Rae's chest along the camera's forward direction.
  knife: {
    name: 'Street Knife',
    short: 'CQC',
    melee: true,
    damage: 60,
    fireRate: 1.8,
    range: 2.1,
    spread: 0,
    movingSpread: 0,
    tracer: null,
    kick: 0,
    auto: false,
  },
};

export const POLICE = {
  /** Stars above which cruisers use their sidearms, dismount and set blocks. */
  shootFromStars: 3,
  officersFromStars: 3,
  roadblockFromStars: 4,
  cruiseSpeed: 0.94,
  maxCruisers: 4,
  maxOfficers: 4,
  sightRange: 62,
  lostSightSeconds: 4.2,
  searchSeconds: 7.5,
  decayStepSeconds: 3.4,
  bustSeconds: 2.4,
  /** Metres at which an officer can put the cuffs on. */
  bustRange: 4.0,
};

export const PICKUPS = [
  { kind: 'smg', x: -105.5, z: 21.2, label: 'Kestrel SMG' },
  { kind: 'pistol', x: -88, z: 36.4, label: 'Solano 9' },
  { kind: 'health', x: -52.5, z: 18.2, label: 'Medkit' },
  { kind: 'armor', x: 16, z: 36.4, label: 'Armor Vest' },
  { kind: 'smg', x: -170, z: 67.5, label: 'Kestrel SMG' },
  { kind: 'health', x: 64, z: 21.2, label: 'Medkit' },
  { kind: 'armor', x: -196, z: 118, label: 'Armor Vest' },
  { kind: 'pistol', x: 108, z: 36.4, label: 'Solano 9' },
];

// The story opens late on the fourth night: the Strip is still awake, the
// radio is on, and the Harbor PD air unit is already overhead.
export const DAY = 4;
export const HOURS = 23;
export const MINUTES = 41;

const STREET_NAMES_X = {
  189: 'EAST YARD',
  135: 'SUNSET ROW',
  81: 'MOTOR ROW',
  27: 'HARBOR AVE',
  [-27]: 'LOT 9',
  [-81]: 'CASA WAY',
  [-135]: 'WEST DOCKS',
};

const STREET_NAMES_Z = {
  189: 'EAST YARD',
  135: 'SUNSET ROW',
  81: 'PIER 9 APPROACH',
  27: 'VEGA BLVD',
  [-27]: 'LOT 9',
  [-81]: 'CASA LUNA DR',
  [-135]: 'NORTH POINT DR',
};

function nearestRoad(value) {
  let best = ROADS[0];
  let bestDistance = Infinity;
  for (const road of ROADS) {
    const distance = Math.abs(value - road);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = road;
    }
  }
  return best;
}

/** The named street under the player, used by the HUD and minimap. */
export function streetAt(x, z) {
  if (x < -144 && z > 20 && z < 130) return 'PIER 9 DECK';
  if (x < -144) return 'CASA LUNA DR';
  if (Math.abs(x) < 38 && Math.abs(z) < 38) return 'FOUNTAIN WALK';
  const roadZ = nearestRoad(z);
  const roadX = nearestRoad(x);
  const useZ = Math.abs(z - roadZ) <= Math.abs(x - roadX);
  return useZ ? STREET_NAMES_Z[roadZ] : STREET_NAMES_X[roadX];
}

export const PALETTE = {
  ink: '#0a0712',
  plum: '#160f22',
  cream: '#f7e8d2',
  creamDim: '#cdb59c',
  coral: '#ff6f61',
  coralDeep: '#d63f4a',
  teal: '#3fe0cf',
  gold: '#ffc95c',
  fog: 0x241a33,
  skyHorizon: 0xa8445f,
  skyMid: 0x482052,
  skyTop: 0x0a0a22,
  sun: 0x9fb2ff,
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
