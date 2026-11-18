// Boot, the fixed-step loop and the screen state machine. The world, its people and the story are
// built once; each frame advances the simulation in exact 1/60 s steps and then paints the 3D view
// and the HUD. ?shot=start|street|chase|mission stages a deterministic scene for the screenshots.
import * as THREE from '../vendor/three.module.js';
import { CITY, CRIME, DISTRICTS, PLAYER, RADIO, STEP, WORLD_SEED } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createVehicleSystem } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createPlayer } from './player.js';
import { createMissions, CAST } from './missions.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { readSave, writeSave, clearSave, hasSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : WORLD_SEED;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 6500);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
document.getElementById('scene').replaceWith(renderer.domElement);
renderer.domElement.id = 'scene';
renderer.domElement.tabIndex = 0;

const random = createRandom(seed);
const world = createWorld(scene, random);
const effects = createEffects(scene, camera);
const audio = createAudio();
const vehicles = createVehicleSystem(scene, world, effects, audio);
const traffic = createTraffic(scene, world, vehicles, effects, audio, random);
const police = createPolice(scene, world, vehicles, effects, audio, random);
const player = createPlayer(scene, world, effects, audio);
const missions = createMissions({ player, world, vehicles, traffic, police, effects, audio, scene });
const hud = createHud(document.getElementById('hud'), world);

const input = createInput(renderer.domElement);

// Browsers start audio on a gesture; both a click and a keypress count.
window.addEventListener('pointerdown', () => audio.start(), { once: true });
window.addEventListener('keydown', () => audio.start(), { once: true });

const state = {
  mode: shotName ? 'play' : 'loading',
  time: 0,
  menuIndex: 0,
  quality: 'high',
  muted: false,
  toasts: [],
  objective: '',
  missionTitle: '',
  alert: null,
  respawn: 0,
  modeTimer: 0,
  loading: 0,
  radio: 0,
  district: 'Vega Heights',
  clock: 19 * 60 + 42,
  hasSave: hasSave(),
};

// ---- wiring --------------------------------------------------------------
player.callbacks.onCrime = (kind) => {
  const amounts = { gunshot: CRIME.gunshot, pedestrian: CRIME.pedestrian, carjack: CRIME.carjack, police: CRIME.police };
  police.addHeat(amounts[kind] ?? 0.2);
  if (kind === 'gunshot') traffic.onGunshot(player.pos);
};
player.callbacks.onCarjack = (car) => {
  traffic.onCarjack(car);
  toast('CARJACKED');
};
player.callbacks.targets = () => {
  const list = [...traffic.shootables(), ...police.shootables()];
  for (const car of vehicles.cars) {
    if (car.wrecked) continue;
    list.push({ x: car.pos.x, y: 0.95, z: car.pos.z, radius: 2.0, dead: false, kind: 'vehicle', ref: car, hurt: (amount) => vehicles.damage(car, amount) });
  }
  return list;
};
player.callbacks.onHit = (kind, target) => {
  if (kind === 'bullet' && (target.kind === 'pedestrian')) police.addHeat(0.35);
  if (kind === 'bullet' && (target.kind === 'police')) police.addHeat(0.25);
  effects.shake(0.08);
};
player.callbacks.onDeath = () => {
  state.mode = 'wasted';
  state.modeTimer = PLAYER.respawnTime;
  if (missions.active) missions.failMission('You were wasted.');
};
player.callbacks.onEnterCar = () => toast('ENGINE ON');
player.callbacks.onExitCar = () => toast('ON FOOT');
police.callbacks.onBusted = () => {
  if (state.mode !== 'play') return;
  state.mode = 'busted';
  state.modeTimer = 3.4;
  player.health = Math.max(12, player.health);
  player.cash = Math.max(0, player.cash - 250);
  police.clear();
  if (missions.active) missions.failMission('You were busted.');
  audio.ui();
};
police.callbacks.onStars = (stars) => {
  if (stars > 0) toast(`WANTED LEVEL ${stars}`);
};
missions.callbacks.onObjective = (objective) => { state.objective = objective; };
missions.callbacks.onToast = (text) => toast(text);
missions.callbacks.onSave = () => saveGame(true);
missions.callbacks.onComplete = () => {
  state.mode = 'epilogue';
  saveGame(true);
};

function toast(text) {
  state.toasts.push({ text, time: 4 });
  if (state.toasts.length > 6) state.toasts.shift();
}

function saveGame(silent = false) {
  const ok = writeSave({
    x: player.pos.x, z: player.pos.z, heading: player.heading,
    cash: player.cash, health: player.health, armor: player.armor,
    mission: Math.max(0, missions.state.index), wanted: police.stars,
    weapon: player.weapon, radio: state.radio,
    pistolClip: player.weapons.pistol.clip, pistolReserve: player.weapons.pistol.reserve,
    smgClip: player.weapons.smg.clip, smgReserve: player.weapons.smg.reserve,
  });
  state.hasSave = ok;
  if (!silent) toast('GAME SAVED');
}

function loadGame() {
  const data = readSave();
  if (!data) { newGame(); return; }
  traffic.reset();
  traffic.spawnCrowd();
  police.clear();
  player.pos.set(data.x ?? world.landmarks.spawn.x, 0, data.z ?? world.landmarks.spawn.z);
  player.pos.y = world.surfaceHeight(player.pos.x, player.pos.z);
  player.heading = data.heading ?? 0;
  player.orbitYaw = player.heading;
  player.cash = data.cash ?? 420;
  player.health = Math.min(player.maxHealth, data.health ?? PLAYER.maxHealth);
  player.armor = data.armor ?? 0;
  player.weapons.pistol.clip = data.pistolClip ?? 12;
  player.weapons.pistol.reserve = data.pistolReserve ?? 90;
  player.weapons.smg.clip = data.smgClip ?? 30;
  player.weapons.smg.reserve = data.smgReserve ?? 240;
  player.selectWeapon(data.weapon ?? 'pistol');
  state.radio = data.radio ?? 0;
  state.mode = 'play';
  missions.begin(Math.min(3, data.mission ?? 0));
  toast('WELCOME BACK, RAE');
  input.setLockAllowed(true);
  input.lock();
}

function newGame() {
  clearSave();
  state.hasSave = false;
  traffic.reset();
  traffic.spawnCrowd();
  police.clear();
  player.health = player.maxHealth;
  player.armor = 0;
  player.cash = 420;
  player.wanted = 0;
  player.pos.set(world.landmarks.spawn.x, world.surfaceHeight(world.landmarks.spawn.x, world.landmarks.spawn.z), world.landmarks.spawn.z);
  player.heading = world.landmarks.spawn.heading;
  player.orbitYaw = player.heading;
  player.weapons.pistol.clip = 12;
  player.weapons.pistol.reserve = 90;
  player.weapons.smg.clip = 30;
  player.weapons.smg.reserve = 240;
  player.selectWeapon('pistol');
  state.mode = 'play';
  state.toasts = [];
  missions.begin(0);
  toast('MOTOR POOL — TALK TO DEJAY');
  input.setLockAllowed(true);
  input.lock();
}

function menuItems() {
  if (state.mode === 'title') {
    return [
      { label: 'NEW GAME' },
      { label: 'CONTINUE', disabled: !state.hasSave },
      { label: 'QUALITY', value: state.quality.toUpperCase() },
      { label: 'CONTROLS' },
    ];
  }
  return [
    { label: 'RESUME' },
    { label: 'QUALITY', value: state.quality.toUpperCase() },
    { label: 'CONTROLS' },
    { label: 'SAVE GAME' },
    { label: 'QUIT TO TITLE' },
  ];
}

function selectMenu() {
  const items = menuItems();
  const item = items[Math.max(0, Math.min(items.length - 1, state.menuIndex))];
  if (!item || item.disabled) { audio.ui(); return; }
  if (item.label === 'NEW GAME') { newGame(); return; }
  if (item.label === 'CONTINUE') { loadGame(); return; }
  if (item.label === 'QUALITY') {
    state.quality = state.quality === 'high' ? 'low' : 'high';
    renderer.setPixelRatio(state.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);
    toast(`QUALITY: ${state.quality.toUpperCase()}`);
    audio.ui();
    return;
  }
  if (item.label === 'CONTROLS') { state.mode = 'controls'; return; }
  if (item.label === 'RESUME') { state.mode = 'play'; input.setLockAllowed(true); input.lock(); saveGame(true); return; }
  if (item.label === 'SAVE GAME') { saveGame(); return; }
  if (item.label === 'QUIT TO TITLE') {
    saveGame(true);
    state.mode = 'title';
    state.menuIndex = 0;
    input.setLockAllowed(false);
    document.exitPointerLock?.();
    return;
  }
}

function updateMenu(dt) {
  if (input.take('menuUp')) { state.menuIndex = (state.menuIndex + menuItems().length - 1) % menuItems().length; audio.ui(); }
  if (input.take('menuDown')) { state.menuIndex = (state.menuIndex + 1) % menuItems().length; audio.ui(); }
  if (input.take('confirm') || input.take('enter')) selectMenu();
  if (state.mode === 'title' && input.take('pause')) { audio.ui(); }
}

// ---- simulation ----------------------------------------------------------
function stepWorld(dt) {
  state.time += dt;
  state.clock += dt * 0.25;
  state.district = DISTRICTS.reduce((best, district) => {
    const distance = Math.hypot(player.pos.x - district.x, player.pos.z - district.z);
    return distance < best.distance ? { district, distance } : best;
  }, { district: DISTRICTS[0], distance: Infinity }).district.name;
  const minutes = Math.floor(state.clock) % 1440;
  state.clockText = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  world.update(dt, state.time);
  if (state.mode === 'title' || state.mode === 'loading') {
    traffic.update(dt, player);
    vehicles.update(dt);
    effects.update(dt);
    return;
  }
  if (state.mode === 'play' || state.mode === 'failed') {
    if (!missions.state.failed || state.mode !== 'failed') {
      player.update(dt, input, vehicles, camera);
    }
    vehicles.update(dt);
    traffic.update(dt, player);
    police.update(dt, player);
    missions.update(dt, input);
    effects.update(dt);
    audio.update(dt, player);
    // Pickups.
    for (const pickup of world.pickups) {
      if (!pickup.active) continue;
      if (Math.hypot(player.pos.x - pickup.x, player.pos.z - pickup.z) < 2.2) {
        world.collectPickup(pickup);
        if (pickup.type === 'health') { player.heal(35); toast('HEALTH +35'); }
        else { player.addArmor(30); toast('ARMOR +30'); }
        audio.pickup();
      }
    }
    // Police alerts feed the HUD band.
    if (police.state.alerts.length > 0) {
      state.alert = { text: police.state.alerts[police.state.alerts.length - 1].text, time: police.state.alerts[police.state.alerts.length - 1].time };
    } else state.alert = null;
    if (missions.state.failed && state.mode === 'play') {
      state.mode = 'failed';
      input.setLockAllowed(false);
      document.exitPointerLock?.();
    }
    if (state.mode === 'failed' && !missions.state.failed) {
      state.mode = 'play';
      input.setLockAllowed(true);
      input.lock();
    }
    if (state.mode === 'play' && player.dead) {
      state.mode = 'wasted';
      state.modeTimer = PLAYER.respawnTime;
    }
  } else if (state.mode === 'wasted' || state.mode === 'busted') {
    player.update(dt, { held: {}, take: () => false, readMouse: () => ({ dx: 0, dy: 0, wheel: 0 }) }, vehicles, camera);
    vehicles.update(dt);
    traffic.update(dt, player);
    effects.update(dt);
    state.modeTimer -= dt;
    if (state.mode === 'busted' && state.modeTimer <= 0) {
      player.pos.set(world.landmarks.hospital.x, 0.3, world.landmarks.hospital.z);
      player.heading = world.landmarks.hospital.heading;
      player.orbitYaw = player.heading;
      player.health = Math.max(30, player.health);
      state.mode = 'play';
      input.setLockAllowed(true);
      input.lock();
    } else if (state.mode === 'wasted' && !player.dead) {
      state.mode = 'play';
      input.setLockAllowed(true);
      input.lock();
    }
  } else if (state.mode === 'epilogue' || state.mode === 'paused' || state.mode === 'controls') {
    effects.update(dt);
  }
  for (const item of state.toasts) item.time -= dt;
  state.toasts = state.toasts.filter((item) => item.time > 0);
}

function handleGlobalKeys() {
  if (input.take('mute')) {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
    toast(state.muted ? 'AUDIO MUTED' : 'AUDIO ON');
  }
  if (input.take('pause')) {
    if (state.mode === 'play') {
      state.mode = 'paused';
      state.menuIndex = 0;
      saveGame(true);
      input.setLockAllowed(false);
      document.exitPointerLock?.();
    } else if (state.mode === 'paused') {
      state.mode = 'play';
      input.setLockAllowed(true);
      input.lock();
    } else if (state.mode === 'controls') {
      state.mode = state.menuReturn ?? 'title';
    }
  }
  if (state.mode === 'controls') state.menuReturn = state.menuReturn ?? 'title';
  if (state.mode === 'epilogue' && input.take('confirm')) {
    state.mode = 'title';
    state.menuIndex = 0;
    input.setLockAllowed(false);
    document.exitPointerLock?.();
  }
  if (input.take('radio')) state.radio = (state.radio + 1) % RADIO.length;
}

// ---- title camera --------------------------------------------------------
function updateTitleCamera(dt) {
  const angle = 2.2 + Math.sin(state.time * 0.035) * 0.5;
  const radius = 250;
  const targetX = 40, targetZ = -40;
  camera.position.set(targetX + Math.cos(angle) * radius, 62 + Math.sin(state.time * 0.1) * 4, targetZ + Math.sin(angle) * radius);
  camera.lookAt(targetX - 20, 24, targetZ);
  camera.fov = 55;
  camera.updateProjectionMatrix();
}

function hudState() {
  return {
    mode: state.mode,
    time: state.time,
    menu: menuItems(),
    menuIndex: state.menuIndex,
    quality: state.quality,
    muted: state.muted,
    hasSave: state.hasSave,
    player,
    wanted: police.stars,
    cars: vehicles.cars,
    mission: {
      active: missions.active,
      title: missions.MISSIONS[Math.max(0, missions.state.index)]?.title ?? '',
      objective: state.objective,
      timeLeft: missions.state.timer,
      failed: missions.state.failed,
    },
    missionMarker: { x: missions.marker.x, z: missions.marker.z, visible: missions.marker.group.visible },
    dialogue: missions.dialogue,
    alert: state.alert,
    prompt: player.prompt,
    radioName: RADIO[state.radio].name,
    toasts: state.toasts,
    loading: state.loading,
    respawn: player.deadTimer,
    clockText: state.clockText,
    district: state.district,
  };
}

// ---- frame loop ----------------------------------------------------------
let last = performance.now();
let accumulator = 0;

function render() {
  renderer.render(scene, camera);
  try {
    lastHudState = hudState();
    hud.draw(lastHudState);
  } catch (error) {
    console.error('HUD', error);
    throw error;
  }
}
let lastHudState = null;

function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min(0.25, (now - last) / 1000);
  last = now;
  accumulator += delta;
  while (accumulator >= STEP) {
    accumulator -= STEP;
    if (state.mode === 'loading') {
      state.loading = Math.min(1, state.loading + STEP / 1.4);
      if (state.loading >= 1) enterTitle();
    } else {
      stepWorld(STEP);
      handleGlobalKeys();
      if (state.mode === 'title' || state.mode === 'paused' || state.mode === 'controls') updateMenu(STEP);
    }
    input.clear();
  }
  if (state.mode === 'title') updateTitleCamera(delta);
  if (state.mode === 'epilogue' && state.modeTimer <= 0) state.modeTimer = 0;
  render();
}

function enterTitle() {
  state.mode = 'title';
  state.menuIndex = 0;
  input.setLockAllowed(false);
  traffic.reset();
  traffic.spawnCrowd();
  updateTitleCamera(0);
  render();
}

window.addEventListener('resize', () => {
  if (shotName) {
    hud.setSize(1280, 480);
    if (lastHudState) hud.draw(lastHudState);
    return;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  hud.resize();
});

// ---- shots ---------------------------------------------------------------
if (shotName) {
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 480);
  camera.aspect = 1280 / 480;
  camera.updateProjectionMatrix();
  hud.setSize(1280, 480);
  state.mode = 'play';
  stageShot(shotName, {
    scene, camera, renderer, world, player, vehicles, traffic, police, missions, effects, hud, state, input, toast,
    THREE,
  });
  render();
  window.__shotReady = true;
  // The headless viewport settles after the first frame; keep the 2D HUD painted on the final size.
  setInterval(() => { if (lastHudState) hud.draw(lastHudState); }, 250);
} else {
  // Start on the title backdrop while the loader ticks.
  enterTitle();
  state.mode = 'loading';
  state.loading = 0;
  requestAnimationFrame(frame);
}
