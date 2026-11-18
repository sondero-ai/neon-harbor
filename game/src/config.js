// Every tuning number, name and colour the game uses, in one place. World units are metres:
// the city is 1.4 km square, the sun sits low over the ocean to the east, and one simulation
// step is 1/60 second so the game runs the same on any display.

export const STEP = 1 / 60;
export const WORLD_SEED = 7;

/** The street grid: avenue centre lines on both axes, the road width and the block pavement. */
export const CITY = {
  lines: [-640, -520, -400, -280, -160, -40, 80, 200, 320, 440],
  roadWidth: 16,
  blockInset: 5,
  blockSize: 104,
  beachEdge: 452,
  waterEdge: 512,
  landSize: 1400,
  downtown: { x: -80, z: -60, radius: 330 },
  names: ['Palm Row', 'Coral Ave', 'Vega St', 'Sunset Blvd', 'Harbor Dr', 'Ember St', 'Marina Way', 'Drift Ave', 'Lumen St', 'Pier Rd'],
};

export const COLORS = {
  skyTop: '#1b2340',
  skyMid: '#6d3f6b',
  horizon: '#ff9a5a',
  sun: '#ffd9a0',
  fog: '#c98a74',
  asphalt: '#23222b',
  asphaltLight: '#2c2b35',
  sidewalk: '#4b4650',
  curb: '#605a63',
  sand: '#b08a63',
  water: '#1b4a5e',
  neon: ['#ff3d8b', '#28e0d0', '#ff7a2f', '#a06bff', '#ffe45c', '#4bd2ff'],
  car: ['#c8402f', '#2f6fc8', '#e8c33a', '#dcdce4', '#2b2a33', '#39a06b', '#8d4bc8', '#e07a2c'],
};

/** On-foot movement and combat. */
export const PLAYER = {
  walk: 4.4,
  run: 8.6,
  sprint: 12.2,
  jump: 7.2,
  gravity: 26,
  turn: 12,
  radius: 0.5,
  height: 1.85,
  maxHealth: 100,
  maxArmor: 100,
  respawnTime: 4,
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, rate: 0.5, range: 1.9, spread: 0, ammo: Infinity, clip: Infinity, reload: 0, auto: false, tracer: false },
  pistol: { name: 'Pistol', damage: 26, rate: 0.28, range: 90, spread: 0.008, ammo: 90, clip: 12, reload: 1.3, auto: false, tracer: true },
  smg: { name: 'SMG', damage: 14, rate: 0.085, range: 70, spread: 0.022, ammo: 240, clip: 30, reload: 1.9, auto: true, tracer: true },
};

/** Wanted heat added by a crime, and how long a hidden player must stay out of sight. */
export const CRIME = {
  gunshot: 0.34,
  pedestrian: 1.1,
  carjack: 1.6,
  police: 2.0,
  explosion: 2.4,
  vehicle: 0.5,
  coolDelay: 9,
  coolRate: 0.42,
};

/** The car classes, with the numbers the arcade physics reads. */
export const CARS = [
  { id: 'sedan', name: 'Kestrel 88', body: '#b8b6bf', accent: '#2a2a33', length: 4.5, width: 1.9, height: 1.42, top: 42, accel: 15, grip: 0.9, mass: 1.0, seats: 4 },
  { id: 'sports', name: 'Vanto GT', body: '#d9442f', accent: '#1b1b22', length: 4.4, width: 1.98, height: 1.12, top: 62, accel: 24, grip: 1.02, mass: 0.86, seats: 2 },
  { id: 'van', name: 'Mule 240', body: '#d8d2c2', accent: '#5a5348', length: 5.5, width: 2.2, height: 2.35, top: 33, accel: 9.5, grip: 0.76, mass: 1.5, seats: 3 },
  { id: 'taxi', name: 'Sunny Cab', body: '#f2c12f', accent: '#24242c', length: 4.6, width: 1.95, height: 1.5, top: 44, accel: 15.5, grip: 0.9, mass: 1.0, seats: 4 },
  { id: 'police', name: 'Cruiser', body: '#e8eaf0', accent: '#1a2740', length: 4.9, width: 2.0, height: 1.5, top: 52, accel: 19, grip: 0.98, mass: 1.15, seats: 4 },
  { id: 'muscle', name: 'Ranchero V8', body: '#2f6b4f', accent: '#141418', length: 4.9, width: 2.02, height: 1.3, top: 55, accel: 21, grip: 0.94, mass: 1.05, seats: 2 },
  { id: 'truck', name: 'Flatbed', body: '#8a6d4a', accent: '#3a322a', length: 6.2, width: 2.35, height: 2.1, top: 30, accel: 8, grip: 0.72, mass: 1.8, seats: 2 },
];

export const RADIO = [
  { name: 'WAVE 98.4 — NEON SYNTH', mood: 'synth' },
  { name: 'KPAL 102.7 — BEACH GOLD', mood: 'chill' },
  { name: 'HARBOR PIRATE RADIO', mood: 'dark' },
];

/** Districts named on the HUD and the minimap; each rectangle is in world x/z. */
export const DISTRICTS = [
  { name: 'Harbor Pier', x: 520, z: 0, r: 240 },
  { name: 'Vega Heights', x: -80, z: -60, r: 300 },
  { name: 'Palm Row', x: -420, z: 200, r: 260 },
  { name: 'Coral Docks', x: 220, z: 330, r: 260 },
  { name: 'Ember Yards', x: -380, z: -360, r: 240 },
  { name: 'Sunset Strip', x: 260, z: -240, r: 240 },
];
