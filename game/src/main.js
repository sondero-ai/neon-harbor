// Boot, the fixed-step loop, and the small state machine that owns the title,
// play, pause and controls screens. World, player, vehicles, traffic, HUD and
// save are separate modules; this file is the wiring between them and the
// moment-to-moment decisions: when the pointer is captured, when F/E hands the
// player to a car, when a pause writes the save, and how a deterministic
// screenshot becomes a frozen frame. The screens, radio controls, HUD reads
// and shot staging live in main-menu.js, main-radio.js, main-hud-state.js and
// main-shots.js.

import * as THREE from '../vendor/three.module.js';
import {
  CAMERA,
  DAY,
  NEW_GAME_CLOCK,
  PALETTE,
  PLAYER,
  RADIO,
  START_OBJECTIVE,
  radioStationIndex,
} from './config.js';
import { CLOCK_MINUTES_PER_SECOND, Environment, parseTimeParam } from './environment.js';
import { TrafficSignals } from './traffic-signals.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Vehicles } from './vehicle-fleet.js';
import { Interactions } from './interactions.js';
import { Traffic } from './traffic.js';
import { MallLife } from './mall-life.js';
import { ParkingLot } from './parking.js';
import { MallRobbery } from './robbery.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { SaveStore } from './save.js';
import { SHOTS, readShot } from './shots.js';
import { Effects } from './effects.js';
import { AudioSystem } from './audio.js';
import { RadioPlayer } from './radio.js';
import { Police } from './police.js';
import { Pickups } from './pickups.js';
import { Missions } from './missions.js';
import { Activities } from './activities.js';
import { LOW_FUEL } from './fuel.js';
import { crewState, hudState, respectState } from './main-hud-state.js';
import {
  applyQualityVisuals,
  backFromControls,
  bindScreens,
  bindVolumeSliders,
  bindWindow,
  enterTitle,
  menuFocused,
  pause,
  refreshQualityLabel,
  resize,
  resume,
  saveAndReturn,
  setTitleCamera,
  showControls,
  syncAudioControls,
  toggleQuality,
  updateContinueButton,
  updateLookHint,
  updatePauseStats,
  updateTitleCamera,
} from './main-menu.js';
import {
  applyRadioWheel,
  changeVolume,
  closeRadioWheel,
  cycleStation,
  cycleTrack,
  openRadioWheel,
  pickRadioWheel,
  radioToast,
  setVolumeLevel,
  toggleMute,
  toggleRadio,
  updateRadioWheel,
} from './main-radio.js';
import { DEFAULT_TITLE_VIEW, STEP, byId, setHidden } from './main-shared.js';
import {
  applyShot,
  applyStageShot,
  poseArmedPlayer,
  stageChaseDrama,
  stageDriveShot,
} from './main-shots.js';

const MAX_STEPS = 5;

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
      titleVolume: byId('title-volume'),
      titleVolumeValue: byId('title-volume-value'),
      titleMute: byId('title-mute'),
      pauseVolume: byId('pause-volume'),
      pauseVolumeValue: byId('pause-volume-value'),
      pauseMute: byId('pause-mute'),
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
    this.timeOverride = parseTimeParam();
    this.environment = new Environment({ clockMinutes: NEW_GAME_CLOCK, day: DAY });
    this.objective = START_OBJECTIVE;
    this.titleView = DEFAULT_TITLE_VIEW;
    this.lastHudState = null;
    this.down = null;
    this.audio = new AudioSystem();
    this.settings.volume = Number.isFinite(this.settings.volume) ? this.settings.volume : 0.72;
    this.audio.setVolume(this.settings.volume);
    this.audio.muted = Boolean(this.settings.muted);
    if (this.audio.master) this.audio.master.gain.value = this.audio.muted ? 0 : this.audio.volume;
    this.radio = new RadioPlayer(this.audio);
    this.audio.onRunning = () => this.radio.tick();
    // The hold-Tab wheel selection; the station/track it shows before Enter or
    // a click is only a cursor, never the live tune.
    this.radioWheel = { open: false, station: this.radio.stationIndex, track: this.radio.trackIndex, lock: false };

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
    this.signals = new TrafficSignals(this.scene);
    this.effects = new Effects(this.scene, { quality: this.quality });
    this.vehicles = new Vehicles(this.scene, this.world);
    this.player = new Player(this.scene, this.world, this.vehicles);
    this.player.effects = this.effects;
    this.player.audio = this.audio;
    this.interactions = new Interactions({
      player: this.player,
      world: this.world,
      vehicles: this.vehicles,
    });
    this.traffic = new Traffic(this.scene, this.world, this.vehicles, this.player);
    this.player.traffic = this.traffic;
    this.mallLife = new MallLife(this.traffic, this.world.mall, this.environment);
    this.traffic.mallLife = this.mallLife;
    this.police = new Police(this.scene, this.world, this.vehicles, this.player, this.traffic, this.effects, this.audio, {
      onDown: (type) => this.beginDown(type),
    });
    this.player.police = this.police;
    this.traffic.police = this.police;
    this.parking = new ParkingLot(this.world, this.vehicles, this.traffic, this.player, this.world.mall);
    this.parking.onToast = (toast) => {
      if (!this.hud.suppressToasts) this.hud.toast = toast;
    };
    this.interactions.parking = this.parking;
    this.gasStation = this.world.gasStation;
    if (this.gasStation) {
      this.gasStation.onToast = (toast) => {
        if (!this.hud.suppressToasts) this.hud.toast = toast;
      };
      this.gasStation.traffic = this.traffic;
      this.gasStation.vehicles = this.vehicles;
    }
    this.interactions.gasStation = this.gasStation;
    this.traffic.gasStation = this.gasStation;
    this.pickups = new Pickups(this.scene, this.world, this.effects, {
      audio: this.audio,
      onPickup: (message) => {
        if (!this.hud.suppressToasts) this.hud.toast = { title: message, sub: 'COLLECTED', life: 2.2 };
      },
    });
    this.robbery = new MallRobbery({
      mall: this.world.mall,
      player: this.player,
      police: this.police,
      traffic: this.traffic,
      pickups: this.pickups,
      audio: this.audio,
      onToast: (toast) => {
        if (!this.hud.suppressToasts) this.hud.toast = toast;
      },
    });
    this.interactions.robbery = this.robbery;
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
    const lootFrom = (x, z, opts = {}) => this.pickups.spawnDeathLoot(x, z, {
      ...opts,
      smgOwned: this.player.weapons.smg.owned,
    });
    this.traffic.onPedDeath = (ped, { witnesses = 0 } = {}) => {
      lootFrom(ped.x, ped.z);
      this.police.reportCivilianDeath(ped.x, ped.z, { witnesses });
    };
    this.traffic.onArmedHostile = () => {
      if (this.hud.suppressToasts) return;
      this.hud.toast = { title: 'Armed Witness', sub: 'RETURN FIRE', life: 3.0 };
    };
    this.police.onHumanDeath = lootFrom;
    this.missions.onHumanDeath = lootFrom;
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
    this.hud.onWheelPick = (hit) => this.pickRadioWheel(hit);
    this.environment.apply(this.environmentTargets(), { force: true });

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
    } else if (this.timeOverride !== null) {
      this.environment.setClock(this.timeOverride);
      this.environment.apply(this.environmentTargets(), { force: true });
    }

    this.frame = this.frame.bind(this);
    this.lastFrame = performance.now() / 1000;
    window.requestAnimationFrame(this.frame);
    window.__neonReady = true;
  }

  // ---------------------------------------------------------------- modules
  // The extracted modules take the Game instance; these thin wrappers keep the
  // class surface and every call site exactly as they were.

  // HUD reads (main-hud-state.js)
  respectState() { return respectState(this); }
  crewState() { return crewState(this); }
  hudState() { return hudState(this); }

  // Screens, quality and audio panels (main-menu.js)
  bindScreens() { return bindScreens(this); }
  bindVolumeSliders() { return bindVolumeSliders(this); }
  syncAudioControls() { return syncAudioControls(this); }
  bindWindow() { return bindWindow(this); }
  applyQualityVisuals(resize = true) { return applyQualityVisuals(this, resize); }
  refreshQualityLabel() { return refreshQualityLabel(this); }
  resize() { return resize(this); }
  menuFocused() { return menuFocused(this); }
  updateContinueButton() { return updateContinueButton(this); }
  updatePauseStats() { return updatePauseStats(this); }
  updateLookHint() { return updateLookHint(this); }
  enterTitle() { return enterTitle(this); }
  pause() { return pause(this); }
  resume() { return resume(this); }
  showControls(from) { return showControls(this, from); }
  backFromControls() { return backFromControls(this); }
  saveAndReturn() { return saveAndReturn(this); }
  toggleQuality() { return toggleQuality(this); }
  setTitleCamera() { return setTitleCamera(this); }
  updateTitleCamera() { return updateTitleCamera(this); }

  // Radio controls and the hold-Tab wheel (main-radio.js)
  radioToast(state, options) { return radioToast(this, state, options); }
  toggleRadio() { return toggleRadio(this); }
  cycleStation(direction) { return cycleStation(this, direction); }
  cycleTrack(direction) { return cycleTrack(this, direction); }
  updateRadioWheel(input) { return updateRadioWheel(this, input); }
  openRadioWheel() { return openRadioWheel(this); }
  closeRadioWheel() { return closeRadioWheel(this); }
  applyRadioWheel() { return applyRadioWheel(this); }
  pickRadioWheel(hit) { return pickRadioWheel(this, hit); }
  toggleMute() { return toggleMute(this); }
  setVolumeLevel(value, options) { return setVolumeLevel(this, value, options); }
  changeVolume(delta) { return changeVolume(this, delta); }

  // Deterministic shot staging (main-shots.js)
  applyShot(shot) { return applyShot(this, shot); }
  applyStageShot(shot) { return applyStageShot(this, shot); }
  poseArmedPlayer(shot) { return poseArmedPlayer(this, shot); }
  stageChaseDrama() { return stageChaseDrama(this); }
  stageDriveShot(drive) { return stageDriveShot(this, drive); }

  // ---------------------------------------------------------------- setup

  environmentTargets() {
    return {
      scene: this.scene,
      renderer: this.renderer,
      world: this.world,
      effects: this.effects,
      vehicles: this.vehicles,
      signals: this.signals,
    };
  }

  saveProgress() {
    const state = this.player.saveState;
    state.mission = this.missions.index;
    state.storyDone = this.missions.storyDone;
    state.clockMinutes = this.environment.minutes;
    state.day = this.environment.day;
    state.radioStation = this.radio.station.id;
    state.radioTrack = this.radio.trackIndex;
    state.radioEnabled = this.radio.enabled;
    SaveStore.write(state);
    this.updateContinueButton();
    return state;
  }

  // ---------------------------------------------------------------- screens

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
    this.input.captureTab = true;
    this.input.radioWheelOpen = false;
    this.input.allowLock = lock;
    this.input.consumeMouse();
    this.world.focusAt(this.player.position.x, this.player.position.z);
    // A frozen ?shot= page stays silent: no autoplay attempt, no file loads.
    if (!this.shot) this.radio.start();
    this.radio.tick();
    this.updateLookHint();
    if (lock) this.input.requestLock();
  }

  startNewGame() {
    // Leaving the title (or a QA new game from a shot page) ends capture mode,
    // so the clock and simulation run normally from here.
    this.shot = null;
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
    this.player.weapons.knife = { owned: true };
    this.player.meleeSwing = 0;
    this.player.syncGunModel();
    this.player.gun.visible = false;
    this.police.resetAfterDown();
    this.pickups.reset();
    this.environment.setClock(NEW_GAME_CLOCK);
    this.environment.setDay(DAY);
    this.environment.apply(this.environmentTargets(), { force: true });
    this.player.teleport(PLAYER.spawn.x, PLAYER.spawn.z, PLAYER.spawnFacing, PLAYER.spawnCameraYaw);
    this.player.cameraPitch = CAMERA.pitch;
    this.player.cameraDistance = CAMERA.distance;
    this.resetCityLife();
    this.player.updateCamera(this.camera, 0, true);
    this.radio.setStation(radioStationIndex(RADIO.defaultStation), RADIO.defaultTrack ?? 0, { autoplay: false });
    this.radio.setEnabled(true, { autoplay: false });
    this.enterPlaying({ toast: true });
    this.saveProgress();
  }

  startContinue() {
    const save = SaveStore.load();
    if (!save) return;
    this.shot = null;
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
    this.environment.setClock(save.clockMinutes);
    this.environment.setDay(save.day);
    this.environment.apply(this.environmentTargets(), { force: true });
    this.resetCityLife();
    if (save.wanted > 0) this.police.setWanted(save.wanted, { silent: true });
    this.player.updateCamera(this.camera, 0, true);
    this.radio.setStation(radioStationIndex(save.radioStation), save.radioTrack, { autoplay: false });
    this.radio.setEnabled(save.radioEnabled, { autoplay: false });
    this.enterPlaying({ toast: true });
  }

  resetCityLife({ spawnBeach = true } = {}) {
    this.police.clearUnits();
    this.police.clearOfficers();
    this.vehicles.clear();
    this.traffic.reset({ spawnBeach });
    this.spawnOpeningCars();
    this.traffic.seedAmbient(this.player, { spawnBeach });
    this.mallLife?.reset();
    this.robbery?.reset();
    this.parking?.reset(this.environment.minutes);
    this.gasStation?.reset();
    this.lowFuelWarned = false;
  }

  spawnOpeningCars() {
    const muscle = this.vehicles.spawn('muscle', {
      x: -67.5,
      z: 21.2,
      yaw: -Math.PI / 2,
      color: 0x8c2f2f,
      fuel: 0.62,
    });
    muscle.setDriver(null);
    const sedan = this.vehicles.spawn('sedan', {
      x: -47,
      z: 32.7,
      yaw: Math.PI / 2,
      color: 0xd9c9ad,
      fuel: 0.88,
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

  announceVehicle(enteredCar, exitedCar, carjacked = false) {
    if (this.hud.suppressToasts) return;
    if (enteredCar) {
      if (carjacked) {
        this.hud.toast = { title: 'CARJACKED', sub: 'DRIVER BAILED', life: 2.6 };
        return;
      }
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
    this.closeRadioWheel();
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
        const consumedE = this.interactions.update(dt, input);
        this.player.handleVehicleInput(input, { allowE: !consumedE });
        let carjacked = false;
        if (wasDriving !== this.player.driving && this.player.driving) {
          this.effects.registerVehicle(this.player.driving);
          carjacked = Boolean(this.player.carjacked);
          this.player.carjacked = false;
        }
        if (wasDriving !== this.player.driving) {
          this.announceVehicle(this.player.driving, wasDriving, carjacked);
        }
        this.updateRadioWheel(input);
        this.radio.tick();
        if (input.wasPressed('KeyT')) this.toggleRadio();
        if (input.wasPressed('BracketLeft')) this.cycleStation(-1);
        if (input.wasPressed('BracketRight')) this.cycleStation(1);
        if (input.wasPressed('Comma')) this.cycleTrack(-1);
        if (input.wasPressed('Period')) this.cycleTrack(1);
        if (input.wasPressed('KeyM')) this.toggleMute();
        if (input.wasPressed('Minus')) this.changeVolume(-0.08);
        if (input.wasPressed('Equal')) this.changeVolume(0.08);
        this.player.update(dt, input);
        const tank = this.player.driving;
        if (!tank) this.lowFuelWarned = false;
        else if (tank.fuel > 0.35) this.lowFuelWarned = false;
        else if (tank.fuel < LOW_FUEL && !this.lowFuelWarned) {
          this.lowFuelWarned = true;
          if (!this.hud.suppressToasts) this.hud.toast = { title: 'LOW FUEL', sub: 'FIND A SOLANO FUEL STATION', life: 3 };
        }
        this.mallLife.update(dt, this.environment.minutes);
        this.traffic.update(dt, this.simTime);
        this.parking.update(dt, this.environment.minutes);
        this.robbery.update(dt);
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
        // A capture freezes the clock at the shot's pinned time so the same
        // composition renders at the same minute on every machine.
        if (!this.shot) this.environment.advance(dt);
        this.environment.apply(this.environmentTargets());
        this.world.mall?.update(dt, this.player);
        this.world.focusAt(this.player.position.x, this.player.position.z);
        this.signals.update(this.simTime);
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
    // The staged shot table, read-only, so the E2E suite can validate a frozen
    // composition (cruiser placement, crowd targets) without a screenshot.
    get shots() {
      return SHOTS;
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
        knockdown: Math.round(game.player.knockdown * 1000) / 1000,
        vehicleHitCooldown: Math.round(game.player.vehicleHitCooldown * 1000) / 1000,
        lastVehicleHit: game.player.lastVehicleHit,
      };
    },
    get traffic() {
      const density = game.traffic.density;
      return { cars: density.cars, walkers: density.walkers, totalVehicles: game.vehicles.count };
    },
    get pedestrians() {
      const peds = game.traffic.peds.filter((ped) => ped.active);
      return {
        active: peds.length,
        alive: peds.filter((ped) => !ped.dead).length,
        dead: peds.filter((ped) => ped.dead).length,
        fleeing: peds.filter((ped) => ped.fleeTimer > 0).length,
        near: peds
          .map((ped) => ({ ped, d: Math.hypot(ped.x - game.player.position.x, ped.z - game.player.position.z) }))
          .filter(({ d }) => d < 40)
          .sort((a, b) => a.d - b.d)
          .slice(0, 10)
          .map(({ ped }) => ({ x: Math.round(ped.x * 10) / 10, z: Math.round(ped.z * 10) / 10, health: ped.health, dead: ped.dead })),
      };
    },
    get view() {
      return { cameraYaw: game.player.cameraYaw, cameraPitch: game.player.cameraPitch };
    },
    get loot() {
      const items = game.pickups.items.filter((item) => item.oneShot && !item.collected && !item.removed);
      return {
        count: items.length,
        items: items.map((item) => ({ kind: item.kind, amount: item.amount, x: item.x, z: item.z })),
      };
    },
    debug: {
      traffic: game.traffic,
      player: game.player,
      camera: game.camera,
      pickups: game.pickups,
      interactions: game.interactions,
      parking: game.parking,
      gasStation: game.gasStation,
      mallLife: game.mallLife,
      robbery: game.robbery,
      police: game.police,
      missions: game.missions,
      world: game.world,
      environment: game.environment,
      renderer: game.renderer,
      vehicles: game.vehicles,
      effects: game.effects,
      signals: game.signals,
      audio: game.audio,
      hud: game.hud,
      radio: { player: game.radio, stations: RADIO.stations },
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
      const state = game.player.combatState;
      return {
        health: game.player.health,
        armor: game.player.armor,
        cash: game.player.cash,
        weapon: game.player.weaponKey,
        ammo: state.ammo,
        reserve: state.reserve,
        melee: state.melee,
      };
    },
    get radio() {
      const state = game.radio.state;
      return {
        ...state,
        wheel: {
          open: game.radioWheel.open,
          station: game.radioWheel.station,
          track: game.radioWheel.track,
        },
      };
    },
    get hudRadio() {
      return game.lastHudState?.radio ?? game.hudState().radio;
    },
    get state() {
      return game.lastHudState;
    },
    get audio() {
      return {
        ready: game.audio.ready,
        state: game.audio.ctx?.state ?? null,
        fallback: game.audio.fallbackStyle,
        fallbackActive: game.audio.fallbackActive,
        siren: Math.round(game.audio.sirenLevel * 100) / 100,
        volume: Math.round(game.audio.volume * 100) / 100,
        muted: game.audio.muted,
      };
    },
    get draws() {
      return game.renderer.info.render.calls;
    },
    get time() {
      const palette = game.environment.palette;
      return {
        clock: game.environment.clock,
        day: game.environment.day,
        state: game.environment.state,
        period: game.environment.period,
        minutes: Math.round(game.environment.minutes * 1000) / 1000,
        rate: CLOCK_MINUTES_PER_SECOND,
        palette: {
          state: palette.state,
          skyFrom: palette.skyFrom,
          skyTo: palette.skyTo,
          skyBlend: Math.round(palette.skyBlend * 1000) / 1000,
          fog: palette.fog,
          sunIntensity: palette.sunIntensity,
          hemiIntensity: palette.hemiIntensity,
          window: palette.window,
          neon: palette.neon,
          street: palette.street,
          carLights: palette.carLights,
          stars: palette.stars,
          exposure: palette.exposure,
          sun: palette.sun,
          moon: palette.moon,
        },
      };
    },
    get signals() {
      return {
        intersections: game.signals.intersections,
        state: game.signals.state,
        at: (x, z) => game.signals.at(Number(x), Number(z)),
        lamps: (axis) => game.signals.lamps(axis === 'z' ? 'z' : 'x'),
        stateAt: (elapsed) => game.signals.stateAt(Number(elapsed) || 0),
        setTime: (elapsed) => {
          game.signals.update(Number(elapsed) || 0, true);
          return game.signals.state;
        },
      };
    },
    get city() {
      return {
        blocks: game.world.blocks,
        buildings: game.world.buildings.length,
        streetlights: game.world.streetlightCount,
        beacons: game.world.beacons.length,
      };
    },
    get mall() {
      const mall = game.world.mall;
      if (!mall) return null;
      return {
        label: mall.label,
        bounds: mall.bounds,
        seats: mall.seats.length,
        freeSeats: mall.seats.filter((seat) => !seat.occupant).length,
        doors: mall.doors.map((door) => door.name),
        register: mall.register,
        shoppers: game.mallLife ? game.mallLife.activeShoppers.length : 0,
        seated: mall.seats.filter((seat) => seat.occupant && seat.occupant !== 'player').length,
      };
    },
    get robbery() {
      const robbery = game.robbery;
      return {
        robbed: robbery.robbed,
        guards: robbery.liveGuards.length,
        cash: robbery.drop?.amount ?? 0,
        wanted: game.police.wanted,
      };
    },
    get parking() {
      const lot = game.parking;
      if (!lot) return null;
      return {
        slots: lot.slots.length,
        occupied: lot.occupied,
        stolen: lot.slots.filter((slot) => slot.stolen).length,
        valet: lot.valet ? { type: lot.valet.type, color: lot.valet.color } : null,
        zone: lot.valetZone,
        podium: lot.podium,
      };
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
    // A tight render loop with a one-pixel read-back, so the caller measures a
    // real GPU frame rather than requestAnimationFrame pacing in a headless
    // window. Used by the performance checks; never called by gameplay.
    measureFrames(count = 60) {
      const frames = Math.max(1, Math.min(600, Math.round(Number(count) || 60)));
      const gl = game.renderer.getContext();
      const pixel = new Uint8Array(4);
      const samples = [];
      for (let i = 0; i < frames; i += 1) {
        const start = performance.now();
        game.renderer.render(game.scene, game.camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        samples.push(performance.now() - start);
      }
      return { frames, samples, draws: game.renderer.info.render.calls };
    },
    // Draw calls split into the main pass and the shadow-map pass. The
    // performance budget in the plan counts the main pass; both numbers are
    // reported so a comparison can never mix the two.
    renderStats() {
      const renderer = game.renderer;
      const shadows = renderer.shadowMap.enabled;
      renderer.render(game.scene, game.camera);
      const total = renderer.info.render.calls;
      renderer.shadowMap.enabled = false;
      renderer.render(game.scene, game.camera);
      const main = renderer.info.render.calls;
      renderer.shadowMap.enabled = shadows;
      renderer.render(game.scene, game.camera);
      return { total, main, shadow: Math.max(0, total - main), triangles: renderer.info.render.triangles };
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
