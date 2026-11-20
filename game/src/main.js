// Boot, the fixed-step loop, and the small state machine that owns the title,
// play, pause and controls screens. World, player, vehicles, traffic, HUD and
// save are separate modules; this file is the wiring between them and the
// moment-to-moment decisions: when the pointer is captured, when F/E hands the
// player to a car, when a pause writes the save, and how a deterministic
// screenshot becomes a frozen frame.

import * as THREE from '../vendor/three.module.js';
import {
  CAMERA,
  DAY,
  HOURS,
  MINUTES,
  PALETTE,
  PLAYER,
  QUALITY_PRESETS,
  RADIO,
  START_OBJECTIVE,
  districtAt,
  streetAt,
} from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Vehicles } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { SaveStore } from './save.js';
import { readShot } from './shots.js';
import { Effects } from './effects.js';
import { AudioSystem } from './audio.js';
import { Police } from './police.js';
import { Pickups } from './pickups.js';
import { Missions, MISSION_COUNT, missionName } from './missions.js';
import { Activities } from './activities.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;
const GAME_MINUTES_PER_SECOND = 1 / 45;

const DEFAULT_TITLE_VIEW = {
  position: [132, 64, 156],
  target: [-210, 2, 42],
  drift: [6.0, 1.4, 4.0],
  speed: 0.03,
};

function byId(id) {
  return document.getElementById(id);
}

function formatCash(value) {
  return `$ ${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
}

function setHidden(element, hidden) {
  if (element) element.hidden = hidden;
}

class Game {
  constructor() {
    this.canvas = byId('scene');
    this.ui = {
      title: byId('screen-title'),
      pause: byId('screen-pause'),
      controls: byId('screen-controls'),
      hud: byId('hud'),
      lookHint: byId('look-hint'),
      continueNote: byId('continue-note'),
      qualityNote: byId('quality-note'),
      pauseCash: byId('pause-cash'),
      pauseDistrict: byId('pause-district'),
      pauseClock: byId('pause-clock'),
      pauseMission: byId('pause-mission'),
      pauseQualityNote: byId('pause-quality-note'),
      lookButton: byId('btn-continue'),
    };

    this.settings = SaveStore.loadSettings();
    this.quality = this.settings.quality === 'low' ? 'low' : 'high';
    this.mode = 'title';
    this.controlsReturn = 'title';
    this.shot = null;
    this.shotLocked = false;
    this.simTime = 0;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.clockMinutes = HOURS * 60 + MINUTES;
    this.day = DAY;
    this.objective = START_OBJECTIVE;
    this.titleView = DEFAULT_TITLE_VIEW;
    this.lastHudState = null;
    this.radioEnabled = true;
    this.radioIndex = 0;
    this.down = null;
    this.audio = new AudioSystem();
    this.settings.volume = Number.isFinite(this.settings.volume) ? this.settings.volume : 0.72;
    this.audio.setVolume(this.settings.volume);
    this.audio.muted = Boolean(this.settings.muted);
    if (this.audio.master) this.audio.master.gain.value = this.audio.muted ? 0 : this.audio.volume;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.setClearColor(0x080612, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, CAMERA.near, CAMERA.far);
    this.world = new World(this.scene, { quality: this.quality });
    this.world.setObjectiveMarker(START_OBJECTIVE.marker.x, START_OBJECTIVE.marker.z);
    this.effects = new Effects(this.scene, { quality: this.quality });
    this.vehicles = new Vehicles(this.scene, this.world);
    this.player = new Player(this.scene, this.world, this.vehicles);
    this.player.effects = this.effects;
    this.player.audio = this.audio;
    this.traffic = new Traffic(this.scene, this.world, this.vehicles, this.player);
    this.police = new Police(this.scene, this.world, this.vehicles, this.player, this.traffic, this.effects, this.audio, {
      onDown: (type) => this.beginDown(type),
    });
    this.player.police = this.police;
    this.pickups = new Pickups(this.scene, this.world, this.effects, {
      audio: this.audio,
      onPickup: (message) => {
        if (!this.hud.suppressToasts) this.hud.toast = { title: message, sub: 'COLLECTED', life: 2.2 };
      },
    });
    this.input = new Input(this.canvas);
    this.input.allowLock = false;
    this.hud = new Hud(this.ui.hud, this.world);
    this.missions = new Missions(this.scene, this.world, this.vehicles, this.police, this.player, this.effects, this.audio, {
      camera: this.camera,
      onToast: (toast) => {
        if (!this.hud.suppressToasts) this.hud.toast = toast;
      },
      onReward: (amount, label) => {
        this.hud.reward = { amount, label, life: 3.4 };
      },
      onComplete: () => this.saveProgress(),
      onStoryComplete: () => {
        this.hud.ending = { life: 8.5 };
      },
      onFail: () => {
        this.hud.reward = null;
      },
    });
    this.player.missions = this.missions;
    this.activities = new Activities(this.scene, this.world, this.vehicles, this.player, this.police, this.effects, this.audio, {
      onToast: (toast) => {
        if (!this.hud.suppressToasts) this.hud.toast = toast;
      },
      onReward: (amount, label) => {
        this.hud.reward = { amount, label, life: 3.2 };
      },
      onSave: () => this.saveProgress(),
      missionActive: () => Boolean(this.missions.active),
    });
    this.objective = this.missions.objective;
    this.audio.setRadio(this.radioEnabled, this.radioIndex);

    this.bindScreens();
    this.bindWindow();
    this.applyQualityVisuals(false);
    this.refreshQualityLabel();
    this.resize();
    this.player.group.visible = false;
    this.hud.setVisible(false);
    this.enterTitle();

    const shot = readShot();
    if (shot) {
      document.body.classList.add('shot');
      this.applyShot(shot);
    }

    this.frame = this.frame.bind(this);
    this.lastFrame = performance.now() / 1000;
    window.requestAnimationFrame(this.frame);
    window.__neonReady = true;
  }

  // ---------------------------------------------------------------- setup

  bindScreens() {
    const click = (id, action) => {
      const element = byId(id);
      if (!element) return;
      element.addEventListener('click', (event) => {
        event.currentTarget.blur();
        event.preventDefault();
        this.audio.unlock();
        this.audio.uiClick();
        action();
      });
    };

    click('btn-new', () => this.startNewGame());
    click('btn-continue', () => this.startContinue());
    click('btn-controls', () => this.showControls('title'));
    click('btn-quality', () => this.toggleQuality());
    click('btn-resume', () => this.resume());
    click('btn-pause-controls', () => this.showControls('paused'));
    click('btn-pause-quality', () => this.toggleQuality());
    click('btn-save-title', () => this.saveAndReturn());
    click('btn-controls-back', () => this.backFromControls());
  }

  bindWindow() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => {
      if (this.mode === 'playing' && !this.shot) this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing' && !this.shot) this.pause();
    });
    document.addEventListener('pointerlockchange', () => this.updateLookHint());
    window.addEventListener('beforeunload', () => {
      if (this.mode === 'playing' && !this.shot) this.saveProgress();
    });
  }

  applyQualityVisuals(resize = true) {
    const preset = QUALITY_PRESETS[this.quality] ?? QUALITY_PRESETS.high;
    const ratio = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = preset.shadows;
    if (this.world) this.world.setQuality(this.quality);
    if (this.effects) this.effects.setQuality(this.quality);
    if (resize) this.resize();
  }

  refreshQualityLabel() {
    const text = this.quality === 'high' ? 'High' : 'Low';
    if (this.ui.qualityNote) this.ui.qualityNote.textContent = text;
    if (this.ui.pauseQualityNote) this.ui.pauseQualityNote.textContent = text;
  }

  saveProgress() {
    const state = this.player.saveState;
    state.mission = this.missions.index;
    state.storyDone = this.missions.storyDone;
    SaveStore.write(state);
    this.updateContinueButton();
    return state;
  }

  resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);
    if (this.hud?.visible && this.lastHudState) this.hud.update(0, this.lastHudState);
  }

  // ---------------------------------------------------------------- screens

  menuFocused() {
    const active = document.activeElement;
    if (!active || active === document.body || active === this.canvas) return false;
    return ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
  }

  updateContinueButton() {
    const save = SaveStore.load();
    const button = byId('btn-continue');
    if (!button) return;
    button.disabled = !save;
    if (this.ui.continueNote) {
      this.ui.continueNote.textContent = save
        ? `${formatCash(save.cash)} · ${save.storyDone ? 'Story complete' : `M${Math.min(save.mission + 1, MISSION_COUNT)} · ${missionName(save.mission)}`}`
        : 'No save yet';
    }
  }

  updatePauseStats() {
    if (this.ui.pauseCash) this.ui.pauseCash.textContent = formatCash(this.player.cash);
    if (this.ui.pauseDistrict) this.ui.pauseDistrict.textContent = districtAt(this.player.position.x, this.player.position.z);
    if (this.ui.pauseClock) this.ui.pauseClock.textContent = this.clockString();
    if (this.ui.pauseMission) {
      this.ui.pauseMission.textContent = this.missions.storyDone
        ? 'Story complete'
        : `${this.missions.index + 1}/${MISSION_COUNT} · ${missionName(this.missions.index)}`;
    }
  }

  updateLookHint() {
    if (!this.ui.lookHint) return;
    this.ui.lookHint.hidden = !(this.mode === 'playing' && !this.input.locked && !this.shotLocked && !this.down && !this.hud?.ending);
  }

  enterTitle() {
    this.mode = 'title';
    setHidden(this.ui.title, false);
    setHidden(this.ui.pause, true);
    setHidden(this.ui.controls, true);
    this.player.group.visible = false;
    this.player.inputBlocked = true;
    this.player.gun.visible = false;
    this.hud.setVisible(false);
    this.input.allowLock = false;
    this.input.releaseLock();
    this.input.consumeMouse();
    this.audio.setEngine({ on: false, rpm: 0, load: 0, speed: 0 });
    this.audio.setSiren(0, 0);
    this.updateLookHint();
    this.updateContinueButton();
    this.world.focusAt(this.titleView.target[0], this.titleView.target[2]);
    this.setTitleCamera();
  }

  enterPlaying({ lock = true, toast = false } = {}) {
    this.mode = 'playing';
    setHidden(this.ui.title, true);
    setHidden(this.ui.pause, true);
    setHidden(this.ui.controls, true);
    this.player.group.visible = true;
    this.player.inputBlocked = false;
    this.hud.setVisible(true);
    if (toast) {
      this.hud.lastDistrict = '';
      this.hud.toast = null;
    }
    this.audio.setRadio(this.radioEnabled, this.radioIndex);
    this.input.allowLock = lock;
    this.input.consumeMouse();
    this.world.focusAt(this.player.position.x, this.player.position.z);
    this.updateLookHint();
    if (lock) this.input.requestLock();
  }

  startNewGame() {
    this.hud.suppressToasts = false;
    this.hud.reward = null;
    this.hud.ending = null;
    this.missions.reset({ index: 0, storyDone: false });
    this.activities.reset();
    this.objective = this.missions.objective;
    this.down = null;
    this.player.driving = null;
    this.player.group.visible = true;
    this.player.dead = false;
    this.player.inputBlocked = false;
    this.player.aiming = false;
    this.player.humanoid.group.rotation.z = 0;
    this.player.health = PLAYER.health;
    this.player.armor = PLAYER.armor;
    this.player.cash = PLAYER.cash;
    this.player.wanted = 0;
    this.player.mission = 0;
    this.player.playSeconds = 0;
    this.player.weaponKey = 'pistol';
    this.player.weapons.pistol = { owned: true, ammo: 12, reserve: 60 };
    this.player.weapons.smg = { owned: false, ammo: 0, reserve: 0 };
    this.player.syncGunModel();
    this.player.gun.visible = false;
    this.police.resetAfterDown();
    this.pickups.reset();
    this.clockMinutes = HOURS * 60 + MINUTES;
    this.player.teleport(PLAYER.spawn.x, PLAYER.spawn.z, PLAYER.spawnFacing, PLAYER.spawnCameraYaw);
    this.player.cameraPitch = CAMERA.pitch;
    this.player.cameraDistance = CAMERA.distance;
    this.resetCityLife();
    this.player.updateCamera(this.camera, 0, true);
    this.enterPlaying({ toast: true });
    this.saveProgress();
  }

  startContinue() {
    const save = SaveStore.load();
    if (!save) return;
    this.hud.suppressToasts = false;
    this.hud.reward = null;
    this.hud.ending = null;
    this.down = null;
    this.player.inputBlocked = false;
    this.player.dead = false;
    this.player.humanoid.group.rotation.z = 0;
    this.police.resetAfterDown();
    this.pickups.reset();
    this.player.loadFromSave(save);
    this.missions.reset({ index: save.mission, storyDone: save.storyDone });
    this.activities.reset();
    this.objective = this.missions.objective;
    this.clockMinutes = HOURS * 60 + MINUTES + save.playSeconds * GAME_MINUTES_PER_SECOND;
    this.resetCityLife();
    if (save.wanted > 0) this.police.setWanted(save.wanted, { silent: true });
    this.player.updateCamera(this.camera, 0, true);
    this.enterPlaying({ toast: true });
  }

  resetCityLife({ spawnBeach = true } = {}) {
    this.police.clearUnits();
    this.police.clearOfficers();
    this.vehicles.clear();
    this.traffic.reset({ spawnBeach });
    this.spawnOpeningCars();
    this.traffic.seedAmbient(this.player, { spawnBeach });
  }

  spawnOpeningCars() {
    const muscle = this.vehicles.spawn('muscle', {
      x: -67.5,
      z: 21.2,
      yaw: -Math.PI / 2,
      color: 0x8c2f2f,
    });
    muscle.setDriver(null);
    const sedan = this.vehicles.spawn('sedan', {
      x: -47,
      z: 32.7,
      yaw: Math.PI / 2,
      color: 0xd9c9ad,
    });
    sedan.setDriver(null);
    const cruiser = this.vehicles.spawn('police', {
      x: 142,
      z: 32.7,
      yaw: Math.PI / 2,
      color: 0x1d2029,
    });
    cruiser.setDriver(null);
  }

  radioState() {
    const station = RADIO.stations[this.radioIndex] ?? RADIO.stations[0];
    return { station: station.station, track: station.track, enabled: this.radioEnabled, index: this.radioIndex };
  }

  toggleRadio() {
    this.radioEnabled = !this.radioEnabled;
    this.audio.unlock();
    this.audio.setRadio(this.radioEnabled, this.radioIndex);
    this.audio.radioSwitch();
    if (!this.hud.suppressToasts) {
      const station = this.radioState();
      this.hud.toast = this.radioEnabled
        ? { title: station.station, sub: station.track.toUpperCase(), life: 2.6 }
        : { title: 'Radio Off', sub: 'PRESS T TO TUNE IN', life: 2.0 };
    }
  }

  cycleStation(direction) {
    this.radioIndex = (this.radioIndex + direction + RADIO.stations.length) % RADIO.stations.length;
    this.radioEnabled = true;
    this.audio.unlock();
    this.audio.setRadio(true, this.radioIndex);
    this.audio.radioSwitch();
    const station = this.radioState();
    if (!this.hud.suppressToasts) {
      this.hud.toast = { title: station.station, sub: station.track.toUpperCase(), life: 2.6 };
    }
  }

  toggleMute() {
    this.audio.unlock();
    const muted = this.audio.toggleMute();
    this.settings.muted = muted;
    SaveStore.saveSettings(this.settings);
    if (!this.hud.suppressToasts) {
      this.hud.toast = { title: muted ? 'Audio Muted' : 'Audio On', sub: muted ? 'PRESS M TO RESTORE' : 'NIGHT TIDE MIX', life: 2.0 };
    }
  }

  changeVolume(delta) {
    this.audio.unlock();
    this.audio.setVolume(this.audio.volume + delta);
    this.settings.volume = this.audio.volume;
    this.settings.muted = false;
    this.audio.muted = false;
    SaveStore.saveSettings(this.settings);
    if (!this.hud.suppressToasts) {
      this.hud.toast = { title: `Volume ${Math.round(this.audio.volume * 100)}%`, sub: 'MINUS / EQUALS', life: 1.6 };
    }
  }

  announceVehicle(enteredCar, exitedCar) {
    if (this.hud.suppressToasts) return;
    if (enteredCar) {
      this.hud.toast = {
        title: enteredCar.name,
        sub: `${enteredCar.className} · ENGINE ON · F / E TO EXIT`,
        life: 3.0,
      };
    } else if (exitedCar) {
      this.hud.toast = {
        title: 'Back on Foot',
        sub: `${exitedCar.name} · PARKED`,
        life: 2.2,
      };
    }
  }

  beginDown(type) {
    if (this.down) return;
    this.missions.handleDown(type);
    this.activities.handleDown(type);
    const duration = type === 'busted' ? 3.1 : 3.3;
    this.down = { type, timer: duration, duration };
    this.player.inputBlocked = true;
    this.player.aiming = false;
    this.player.humanoid.aiming = false;
    this.player.gun.visible = false;
    if (this.player.driving) {
      this.player.driving.controls.throttle = 0;
      this.player.driving.controls.brake = 1;
      this.player.driving.controls.handbrake = true;
    }
    if (type === 'wasted') this.player.humanoid.group.rotation.z = 1.25;
    this.audio.setEngine({ on: false, rpm: 0, load: 0, speed: 0 });
    this.effects.hurt(1);
    this.effects.shake(0.7);
    this.hud.toast = null;
  }

  finishDown() {
    const type = this.down?.type ?? 'wasted';
    const rate = type === 'busted' ? 0.15 : 0.1;
    const loss = Math.round(this.player.cash * rate);
    this.player.cash = Math.max(0, this.player.cash - loss);
    if (this.player.driving) {
      const car = this.player.driving;
      this.player.driving = null;
      car.driver = null;
      car.setDriver(null);
      car.controls.brake = 1;
      car.controls.handbrake = true;
      this.player.group.visible = true;
    }
    this.police.resetAfterDown();
    this.down = null;
    this.player.wanted = 0;
    this.player.revive(PLAYER.spawn.x, PLAYER.spawn.z, PLAYER.spawnFacing, PLAYER.spawnCameraYaw);
    this.player.health = 100;
    this.player.armor = type === 'busted' ? 30 : 0;
    this.player.cameraPitch = CAMERA.pitch;
    this.player.cameraDistance = CAMERA.distance;
    this.player.inputBlocked = false;
    this.player.updateCamera(this.camera, 0, true);
    this.objective = this.missions.objective;
    this.hud.suppressToasts = false;
    this.hud.toast = {
      title: type === 'busted' ? 'Out on Bail' : 'Back on the Street',
      sub: `$ ${loss} LOST · HARBOR PD STOOD DOWN`,
      life: 3.4,
    };
    this.world.focusAt(this.player.position.x, this.player.position.z);
    this.saveProgress();
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.audio.setEngine({ on: false, rpm: 0, load: 0, speed: 0 });
    this.audio.setSiren(0, 0);
    this.input.allowLock = false;
    this.input.releaseLock();
    this.input.consumeMouse();
    this.updatePauseStats();
    this.saveProgress();
    setHidden(this.ui.pause, false);
    this.updateLookHint();
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    setHidden(this.ui.pause, true);
    this.audio.setRadio(this.radioEnabled, this.radioIndex);
    this.input.allowLock = true;
    this.input.consumeMouse();
    this.input.requestLock();
    this.updateLookHint();
  }

  showControls(from) {
    this.controlsReturn = from;
    this.mode = 'controls';
    setHidden(this.ui.title, true);
    setHidden(this.ui.pause, true);
    setHidden(this.ui.controls, false);
    this.input.allowLock = false;
    this.input.releaseLock();
    this.updateLookHint();
  }

  backFromControls() {
    setHidden(this.ui.controls, true);
    if (this.controlsReturn === 'paused') {
      this.mode = 'paused';
      setHidden(this.ui.pause, false);
    } else {
      this.mode = 'title';
      setHidden(this.ui.title, false);
    }
    this.updateLookHint();
  }

  saveAndReturn() {
    this.saveProgress();
    this.enterTitle();
  }

  toggleQuality() {
    this.quality = this.quality === 'high' ? 'low' : 'high';
    this.settings.quality = this.quality;
    SaveStore.saveSettings(this.settings);
    this.applyQualityVisuals(true);
    this.refreshQualityLabel();
  }

  clockString() {
    const total = Math.min(1439, Math.max(0, Math.floor(this.clockMinutes))) % 1440;
    const hours = String(Math.floor(total / 60)).padStart(2, '0');
    const minutes = String(total % 60).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Respect is a readout of the run, not a second progression system: cash
  // earned and story chapters cleared move it up the Strip's ladder.
  respectState() {
    const value = Math.min(250, Math.floor(this.player.cash / 20) + this.missions.index * 30);
    const tiers = [
      [200, 'HARBOR LEGEND'],
      [140, 'SOLANO CREW'],
      [85, 'HARBOR HEAVY'],
      [45, 'STRIP RUNNER'],
      [0, 'NEW BLOOD'],
    ];
    const rank = tiers.find(([floor]) => value >= floor)?.[1] ?? 'NEW BLOOD';
    return { rank, value, max: 250 };
  }

  crewState() {
    const driving = this.player.driving;
    const wanted = this.police.wanted;
    const active = Boolean(this.missions.active);
    const failed = Boolean(this.missions.failure);
    return [
      {
        name: 'MIRA SOL',
        role: 'DRIVER',
        status: failed ? 'STANDING BY' : active ? (driving ? 'ON COMMS' : 'EN ROUTE') : 'READY',
      },
      {
        name: 'ODIN',
        role: 'MECHANIC',
        status: driving && driving.condition < 0.82 ? 'EN ROUTE' : 'IN THE BAY',
      },
      {
        name: 'KIKI',
        role: 'LOOKOUT',
        status: wanted > 0 ? (this.police.status === 'search' ? 'BLACKOUT' : 'EYES ON') : 'ON THE CORNER',
      },
    ];
  }

  hudState() {
    const player = this.player;
    const driving = player.driving;
    const blips = [];
    for (const vehicle of this.vehicles.list) {
      const dx = vehicle.position.x - player.position.x;
      const dz = vehicle.position.z - player.position.z;
      if (dx * dx + dz * dz > 9600) continue;
      blips.push({
        x: vehicle.position.x,
        z: vehicle.position.z,
        yaw: vehicle.yaw,
        kind: vehicle.type,
        parked: !vehicle.driver,
        player: vehicle === driving,
      });
    }
    let vehiclePrompt = null;
    if (driving) {
      vehiclePrompt = { action: 'exit', name: driving.name };
    } else if (player.nearVehicle) {
      vehiclePrompt = {
        action: 'enter',
        name: player.nearVehicle.name,
        distance: player.nearVehicle.distanceToBox(player.position.x, player.position.z) + 0.4,
      };
    }
    const police = this.police.hudState;
    return {
      player,
      objective: this.objective,
      radio: this.radioState(),
      clock: this.clockString(),
      day: this.day,
      district: districtAt(player.position.x, player.position.z),
      street: streetAt(player.position.x, player.position.z),
      missionCard: this.shot?.missionCard ?? this.missions.hudCard,
      missionActive: Boolean(this.missions.active),
      missionFailed: Boolean(this.missions.failure),
      respect: this.respectState(),
      crew: this.crewState(),
      vehicle: driving
        ? {
            name: driving.name,
            className: driving.className,
            tune: driving.tune,
            speedKmh: driving.speedKmh,
            gear: driving.gear,
            engineRpm: driving.engineRpm,
            condition: driving.condition,
          }
        : null,
      vehicles: blips,
      density: this.traffic.density,
      vehiclePrompt,
      police,
      weapons: this.player.combatState,
      down: this.down,
      subtitle: this.missions.subtitle,
      challenge: this.activities.challenge,
      fail: this.missions.failure,
      missionEnemies: this.missions.enemies.filter((enemy) => !enemy.dead && !enemy.removed).map((enemy) => ({ x: enemy.x, z: enemy.z })),
      effects: {
        hurt: this.effects.hurtLevel,
        lowHealth: player.health < 32,
        flash: player.damageFlash,
      },
      pickup: this.pickups.hint,
    };
  }

  // ---------------------------------------------------------------- title camera

  setTitleCamera() {
    this.updateTitleCamera();
  }

  updateTitleCamera() {
    const view = this.titleView;
    const [x, y, z] = view.position;
    const [dx, dy, dz] = view.drift;
    const t = this.simTime * view.speed;
    this.camera.position.set(
      x + Math.sin(t) * dx,
      y + Math.sin(t * 0.73 + 1.2) * dy,
      z + Math.cos(t * 0.86) * dz,
    );
    this.camera.lookAt(view.target[0], view.target[1], view.target[2]);
  }

  // ---------------------------------------------------------------- deterministic shots

  applyShot(shot) {
    this.shot = shot;
    // A capture should look the same on a machine that last played on low.
    if (this.quality !== 'high') {
      this.quality = 'high';
      this.applyQualityVisuals(true);
      this.refreshQualityLabel();
    }
    this.simTime = shot.time ?? 0;
    this.clockMinutes = HOURS * 60 + MINUTES;
    this.hud.suppressToasts = true;
    this.hud.toast = null;
    const steps = Math.max(0, shot.prewarm ?? 0);

    if (shot.mode === 'title') {
      this.titleView = shot.titleCamera ?? DEFAULT_TITLE_VIEW;
      this.enterTitle();
      // A screenshot must not change with whatever save the machine happens to
      // hold, so the title capture always shows the fresh-slot menu.
      const continueButton = byId('btn-continue');
      if (continueButton) continueButton.disabled = true;
      if (this.ui.continueNote) this.ui.continueNote.textContent = 'No save yet';
      for (let i = 0; i < steps; i += 1) this.tick(STEP);
    } else {
      this.down = null;
      this.police.resetAfterDown();
      this.pickups.reset();
      this.missions.prepareShot();
      this.activities.suspended = true;
      this.hud.reward = null;
      this.hud.ending = null;
      this.enterPlaying({ lock: false, toast: shot.toast === true });
      this.objective = shot.objective ?? START_OBJECTIVE;
      if (this.objective.marker) {
        this.world.setObjectiveMarker(this.objective.marker.x, this.objective.marker.z);
      }
      this.player.health = PLAYER.health;
      this.player.armor = PLAYER.armor;
      this.player.cash = PLAYER.cash;
      this.player.wanted = 0;
      this.player.mission = 0;
      this.player.playSeconds = 0;
      this.player.dead = false;
      this.player.inputBlocked = false;
      this.player.humanoid.group.rotation.z = 0;
      this.player.gun.visible = false;
      if (shot.drive) {
        this.police.clearUnits();
        this.vehicles.clear();
        this.traffic.reset({ spawnBeach: false });
        this.stageDriveShot(shot.drive);
        if (shot.chase) this.police.stageChase(shot.chase, this.player.driving);
        this.player.updateCamera(this.camera, 0, true);
        for (let i = 0; i < steps; i += 1) this.tick(STEP);
        if (Number.isFinite(shot.health)) this.player.health = shot.health;
        if (Number.isFinite(shot.armor)) this.player.armor = shot.armor;
        this.player.damageFlash = 0;
        if (shot.chase) this.stageChaseDrama();
        this.hud.lastHealth = this.player.health;
        this.hud.lastArmor = this.player.armor;
        this.hud.healthFlash = 0;
        this.hud.armorFlash = 0;
      } else {
        const pose = shot.player;
        this.player.teleport(pose.x, pose.z, pose.facing, pose.cameraYaw);
        this.player.cameraPitch = pose.cameraPitch;
        this.player.cameraDistance = pose.distance;
        this.resetCityLife({ spawnBeach: shot.stage !== 'heist' });
        if (shot.police) this.police.stageChase(shot.police, this.player);
        this.player.updateCamera(this.camera, 0, true);
        for (let i = 0; i < steps; i += 1) this.tick(STEP);
      }
      if (shot.stage) this.applyStageShot(shot);
      // These final poses are applied after the simulation steps so the
      // screenshot is deterministic: the helicopter, dialogue and bodywork
      // stay exactly where the shot asked for them.
      if (shot.air) this.police.stageAir(shot.air);
      if (shot.dialogue) this.missions.subtitle = { ...shot.dialogue, life: 999 };
      if (Number.isFinite(shot.health)) this.player.health = shot.health;
      if (Number.isFinite(shot.armor)) this.player.armor = shot.armor;
      this.hud.lastHealth = this.player.health;
      this.hud.lastArmor = this.player.armor;
      this.hud.healthFlash = 0;
      this.hud.armorFlash = 0;
      if (shot.weapons === 'smg') {
        this.player.weapons.smg.owned = true;
        this.player.weapons.smg.ammo = 32;
        this.player.weapons.smg.reserve = 96;
        this.player.weaponKey = 'smg';
        this.player.syncGunModel();
      }
      if (Number.isFinite(shot.condition) && this.player.driving) {
        this.player.driving.condition = shot.condition;
      }
      if (shot.armed) this.poseArmedPlayer(shot);
      if (shot.drama) this.stageChaseDrama();
    }

    this.shotLocked = true;
    this.lastHudState = this.hudState();
    if (this.hud.visible) this.hud.update(0, this.lastHudState);
    this.updateLookHint();
    this.renderer.render(this.scene, this.camera);
  }

  applyStageShot(shot) {
    this.missions.stageShot(shot.stage);
    this.objective = this.missions.objective;
    this.world.setObjectiveMarker(this.objective.marker.x, this.objective.marker.z);
    if (this.world.objectiveMarker) this.world.objectiveMarker.group.visible = false;
    if (Number.isFinite(shot.health)) this.player.health = shot.health;
    if (Number.isFinite(shot.armor)) this.player.armor = shot.armor;
    this.player.aiming = false;
    this.player.humanoid.aiming = true;
    this.player.gun.visible = true;
    this.player.facing = shot.player?.facing ?? this.player.cameraYaw - Math.PI;
    this.player.humanoid.setFacing(this.player.facing);
    for (let i = 0; i < 20; i += 1) this.player.humanoid.update(1 / 60, 0, false);
    this.player.humanoid.aiming = false;
    if (shot.camera) {
      const [x, y, z] = shot.camera.position;
      this.camera.position.set(x, y, z);
      this.camera.fov = CAMERA.fov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(shot.camera.target[0], shot.camera.target[1], shot.camera.target[2]);
    } else {
      this.player.updateCamera(this.camera, 0, true);
    }
    this.effects.update(0.45, this.camera);
    this.missions.stageShotDrama(shot.stage);
    this.player.aiming = true;
    this.player.damageFlash = 0.34;
    this.hud.lastHealth = this.player.health;
    this.hud.lastArmor = this.player.armor;
    this.hud.healthFlash = 0;
    this.hud.armorFlash = 0;
  }

  poseArmedPlayer(shot) {
    const facing = shot.player?.facing ?? this.player.facing;
    this.player.aiming = true;
    this.player.humanoid.aiming = true;
    this.player.gun.visible = true;
    this.player.facing = facing;
    this.player.humanoid.setFacing(facing);
    for (let i = 0; i < 20; i += 1) this.player.humanoid.update(1 / 60, 0, false);
    this.player.humanoid.aiming = false;
    this.player.aiming = false;
    this.player.gun.visible = true;
    this.player.damageFlash = 0.34;
    this.hud.lastHealth = this.player.health;
    this.hud.lastArmor = this.player.armor;
    this.hud.healthFlash = 0;
    this.hud.armorFlash = 0;
  }

  stageChaseDrama() {
    let best = null;
    let bestFacing = -Infinity;
    for (const unit of this.police.units) {
      if (!unit.car || unit.car.removed) continue;
      const car = unit.car;
      const dx = this.player.position.x - car.position.x;
      const dz = this.player.position.z - car.position.z;
      const length = Math.hypot(dx, dz) || 1;
      const facing = (Math.sin(car.yaw) * dx + Math.cos(car.yaw) * dz) / length;
      if (facing > bestFacing) {
        bestFacing = facing;
        best = car;
      }
    }
    if (!best) return;
    const forwardX = Math.sin(best.yaw);
    const forwardZ = Math.cos(best.yaw);
    const muzzle = new THREE.Vector3(
      best.position.x + forwardX * (best.halfLength + 0.35),
      best.position.y + 1.08,
      best.position.z + forwardZ * (best.halfLength + 0.35),
    );
    this.effects.smokePuff(best.position.x + forwardX * 1.4, best.position.y + 0.9, best.position.z + forwardZ * 1.4, {
      scale: 2.2,
      life: 2.2,
      color: 0x5c5156,
      rise: 1.2,
    });
    this.effects.update(0.42, null);
    this.effects.tracer(muzzle, new THREE.Vector3(this.player.position.x, this.player.position.y + 0.9, this.player.position.z), 0xffd08a);
    this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd79a);
    this.player.damageFlash = 0.55;
  }

  stageDriveShot(drive) {
    const car = this.vehicles.spawn(drive.type ?? 'muscle', {
      x: drive.x,
      z: drive.z,
      yaw: drive.yaw,
      color: drive.color,
    });
    this.player.enterVehicle(car);
    const speed = drive.speed ?? 18;
    car.velocity.set(Math.sin(drive.yaw) * speed, 0, Math.cos(drive.yaw) * speed);
    car.controls.throttle = 0;
    car.controls.brake = 0;
    car.controls.steer = 0;
    car.controls.handbrake = false;
    this.player.drivePitch = drive.cameraPitch ?? 0.13;
    this.player.driveOrbitYaw = drive.cameraOrbit ?? 0;
    this.player.driveLookHold = 0;
    this.player.syncFromVehicle();
    this.effects.registerVehicle(car);
    this.traffic.stageDrive(car);
    this.world.focusAt(car.position.x, car.position.z);
    this.player.updateView(this.camera, 0, true);
  }

  // ---------------------------------------------------------------- loop

  tick(dt) {
    const input = this.input;
    this.simTime += dt;

    if (this.mode === 'playing') {
      if (this.down) {
        this.down.timer -= dt;
        this.player.update(dt, input);
        this.traffic.update(dt, this.simTime);
        this.police.update(dt, this.simTime);
        this.player.wanted = this.police.wanted;
        this.vehicles.update(dt, this.simTime);
        this.player.syncFromVehicle();
        this.player.updateView(this.camera, dt);
        this.effects.update(dt, this.camera);
        this.audio.setEngine({ on: false, rpm: 0, load: 0, speed: 0 });
        this.world.focusAt(this.player.position.x, this.player.position.z);
        if (this.down.timer <= 0) this.finishDown();
        this.lastHudState = this.hudState();
        this.hud.update(dt, this.lastHudState);
        this.updateLookHint();
      } else {
        const wasDriving = this.player.driving;
        this.player.handleVehicleInput(input);
        if (wasDriving !== this.player.driving && this.player.driving) {
          this.effects.registerVehicle(this.player.driving);
        }
        if (wasDriving !== this.player.driving) {
          this.announceVehicle(this.player.driving, wasDriving);
        }
        if (input.wasPressed('KeyT')) this.toggleRadio();
        if (input.wasPressed('BracketLeft')) this.cycleStation(-1);
        if (input.wasPressed('BracketRight')) this.cycleStation(1);
        if (input.wasPressed('KeyM')) this.toggleMute();
        if (input.wasPressed('Minus')) this.changeVolume(-0.08);
        if (input.wasPressed('Equal')) this.changeVolume(0.08);
        this.player.update(dt, input);
        this.traffic.update(dt, this.simTime);
        this.police.update(dt, this.simTime);
        this.player.wanted = this.police.wanted;
        this.vehicles.update(dt, this.simTime);
        this.player.syncFromVehicle();
        this.player.updateView(this.camera, dt);
        this.player.updateCombat(dt, input, this.camera);
        this.missions.update(dt, input);
        this.activities.update(dt);
        if (!this.shot) this.objective = this.missions.objective;
        this.pickups.update(dt, this.player);
        this.effects.update(dt, this.camera);
        const car = this.player.driving;
        this.audio.setEngine(car
          ? { ...car.engineState, speed: car.speed }
          : { on: false, rpm: 0, load: 0, speed: 0 });
        this.clockMinutes += dt * GAME_MINUTES_PER_SECOND;
        this.world.focusAt(this.player.position.x, this.player.position.z);
        const notice = this.police.consumeNotice();
        if (notice && !this.hud.suppressToasts) this.hud.toast = notice;
        if (input.wasPressed('Escape', 'KeyP')) this.pause();
        else {
          this.lastHudState = this.hudState();
          this.hud.update(dt, this.lastHudState);
          this.updateLookHint();
        }
      }
    } else if (this.mode === 'title') {
      this.updateTitleCamera();
      this.world.focusAt(this.titleView.target[0], this.titleView.target[2]);
      if (input.wasPressed('Enter', 'NumpadEnter') && !this.menuFocused()) this.startNewGame();
    } else if (this.mode === 'paused') {
      if (input.wasPressed('Escape', 'KeyP')) this.resume();
      else if (input.wasPressed('Enter', 'NumpadEnter') && !this.menuFocused()) this.resume();
    } else if (this.mode === 'controls') {
      if (input.wasPressed('Escape', 'KeyP')) this.backFromControls();
      else if (input.wasPressed('Enter', 'NumpadEnter') && !this.menuFocused()) this.backFromControls();
    }

    this.world.update(dt, this.simTime, this.camera);
    input.endFrame();
  }

  frame(nowMs) {
    window.requestAnimationFrame(this.frame);
    if (this.shotLocked) {
      if (this.hud.visible && this.lastHudState) this.hud.update(0, this.lastHudState);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const now = nowMs / 1000;
    let dt = now - this.lastFrame;
    this.lastFrame = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.1);
    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      this.tick(STEP);
      this.accumulator -= STEP;
      steps += 1;
    }
    if (steps === MAX_STEPS) this.accumulator = 0;

    this.renderer.render(this.scene, this.camera);
  }
}

function showBootError(error) {
  const box = byId('boot-error');
  const text = byId('boot-error-text');
  if (box && text) {
    box.hidden = false;
    text.textContent = error?.stack || error?.message || String(error);
  }
  document.title = 'Neon Harbor — error';
}

try {
  const game = new Game();
  window.__neon = {
    get mode() {
      return game.mode;
    },
    get shot() {
      return game.shot?.name ?? null;
    },
    get player() {
      return {
        x: game.player.position.x,
        y: game.player.position.y,
        z: game.player.position.z,
        facing: game.player.facing,
        speed: game.player.speed,
        driving: game.player.driving ? game.player.driving.name : null,
        speedKmh: game.player.driving ? game.player.driving.speedKmh : game.player.speedKmh,
        nearVehicle: game.player.nearVehicle ? game.player.nearVehicle.name : null,
      };
    },
    get traffic() {
      const density = game.traffic.density;
      return { cars: density.cars, walkers: density.walkers, totalVehicles: game.vehicles.count };
    },
    get police() {
      const hud = game.police.hudState;
      return {
        wanted: game.police.wanted,
        status: game.police.status,
        units: hud.units.length,
        officers: hud.officers.length,
        unitList: hud.units.map((unit) => ({ x: Math.round(unit.x * 10) / 10, z: Math.round(unit.z * 10) / 10, mode: unit.mode })),
        officerList: hud.officers.map((officer) => ({ x: Math.round(officer.x * 10) / 10, z: Math.round(officer.z * 10) / 10 })),
      };
    },
    get down() {
      return game.down ? { type: game.down.type, timer: Math.round(game.down.timer * 100) / 100 } : null;
    },
    get combat() {
      return {
        health: game.player.health,
        armor: game.player.armor,
        weapon: game.player.weaponKey,
        ammo: game.player.weaponAmmo.ammo,
        reserve: game.player.weaponAmmo.reserve,
      };
    },
    get audio() {
      return {
        ready: game.audio.ready,
        state: game.audio.ctx?.state ?? null,
        radio: { ...game.audio.radio },
        siren: Math.round(game.audio.sirenLevel * 100) / 100,
        volume: Math.round(game.audio.volume * 100) / 100,
        muted: game.audio.muted,
      };
    },
    get draws() {
      return game.renderer.info.render.calls;
    },
    get story() {
      const objective = game.missions.objective;
      return {
        index: game.missions.index,
        storyDone: game.missions.storyDone,
        active: game.missions.active
          ? {
              index: game.missions.active.index,
              phase: game.missions.active.phase,
              kills: game.missions.active.kills,
              needed: game.missions.active.needed,
              timer: Math.round(game.missions.active.timer * 10) / 10,
            }
          : null,
        failure: game.missions.failure,
        subtitle: game.missions.subtitle,
        objective,
        enemies: game.missions.enemies.filter((enemy) => !enemy.dead && !enemy.removed).length,
        cash: game.player.cash,
      };
    },
    get activities() {
      return {
        heat: game.activities.heat,
        theft: game.activities.theft
          ? { phase: game.activities.theft.phase, timer: game.activities.theft.timer, spot: game.activities.theft.spot.name }
          : null,
        challenge: game.activities.challenge,
      };
    },
    get missionSystem() {
      return game.missions;
    },
    get activitySystem() {
      return game.activities;
    },
    get scene() {
      return game.scene;
    },
    get camera() {
      return game.camera;
    },
    clearMissionEnemies() {
      for (const enemy of [...game.missions.enemies]) {
        if (!enemy.dead && !enemy.removed) {
          game.missions.killEnemy(enemy, { x: enemy.x, y: enemy.y + 1.2, z: enemy.z });
        }
      }
    },
    startMission(index) {
      game.missions.begin(Number(index) || 0);
      game.objective = game.missions.objective;
    },
    retryMission() {
      game.missions.retry();
      game.objective = game.missions.objective;
    },
    failMission(reason = 'debug failure') {
      game.missions.fail(reason);
      game.objective = game.missions.objective;
    },
    newGame() {
      game.startNewGame();
    },
    continueGame() {
      game.startContinue();
    },
    pauseGame() {
      game.pause();
    },
    resumeGame() {
      game.resume();
    },
    saveGame() {
      return game.saveProgress();
    },
    returnToTitle() {
      game.saveAndReturn();
    },
    setHealth(health, armor = game.player.armor) {
      game.player.health = Math.max(1, Number(health) || 1);
      game.player.armor = Math.max(0, Number(armor) || 0);
    },
    advance(seconds = 1) {
      const steps = Math.min(1800, Math.max(1, Math.round((Number(seconds) || 0) * 60)));
      for (let i = 0; i < steps; i += 1) game.tick(1 / 60);
      game.renderer.render(game.scene, game.camera);
      return { steps, simTime: game.simTime, mode: game.mode };
    },
    setWanted(stars) {
      game.police.setWanted(stars, { silent: true });
    },
    clearWanted() {
      game.police.clearWanted({ quiet: true });
    },
    damagePlayer(amount) {
      game.police.damagePlayer(amount, game.player.position.x + 3, game.player.position.z);
    },
    teleport(x, z) {
      game.player.teleport(x, z);
      game.player.updateCamera(game.camera, 0, true);
    },
  };
} catch (error) {
  showBootError(error);
  console.error(error);
}
