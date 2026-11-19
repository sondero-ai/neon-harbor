// Boot, the fixed-step loop, and the small state machine that owns the title,
// play, pause and controls screens. World, player, HUD and save are separate
// modules; this file is the wiring between them and the moment-to-moment
// decisions: when the pointer is captured, when a pause writes the save, and
// how a deterministic screenshot becomes a frozen frame.

import * as THREE from '../vendor/three.module.js';
import {
  CAMERA,
  HOURS,
  MINUTES,
  PALETTE,
  PLAYER,
  QUALITY_PRESETS,
  RADIO,
  START_OBJECTIVE,
  districtAt,
} from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { SaveStore } from './save.js';
import { readShot } from './shots.js';

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

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
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
    this.objective = START_OBJECTIVE;
    this.titleView = DEFAULT_TITLE_VIEW;
    this.lastHudState = null;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.17;
    this.renderer.setClearColor(0x1a1228, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, CAMERA.near, CAMERA.far);
    this.world = new World(this.scene, { quality: this.quality });
    this.world.setObjectiveMarker(START_OBJECTIVE.marker.x, START_OBJECTIVE.marker.z);
    this.player = new Player(this.scene, this.world);
    this.input = new Input(this.canvas);
    this.input.allowLock = false;
    this.hud = new Hud(this.ui.hud, this.world);

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
        action();
      });
    };

    click('btn-new', () => this.startNewGame());
    click('btn-continue', () => this.startContinue());
    click('btn-controls', () => this.showControls('title'));
    click('btn-quality', () => this.toggleQuality());
    click('btn-resume', () => this.resume());
    click('btn-pause-controls', () => this.showControls('paused'));
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
      if (this.mode === 'playing' && !this.shot) SaveStore.write(this.player.saveState);
    });
  }

  applyQualityVisuals(resize = true) {
    const preset = QUALITY_PRESETS[this.quality] ?? QUALITY_PRESETS.high;
    const ratio = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = preset.shadows;
    if (this.world) this.world.setQuality(this.quality);
    if (resize) this.resize();
  }

  refreshQualityLabel() {
    if (this.ui.qualityNote) this.ui.qualityNote.textContent = this.quality === 'high' ? 'High' : 'Low';
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
        ? `${formatCash(save.cash)} · ${formatDuration(save.playSeconds)}`
        : 'No save yet';
    }
  }

  updatePauseStats() {
    if (this.ui.pauseCash) this.ui.pauseCash.textContent = formatCash(this.player.cash);
    if (this.ui.pauseDistrict) this.ui.pauseDistrict.textContent = districtAt(this.player.position.x, this.player.position.z);
    if (this.ui.pauseClock) this.ui.pauseClock.textContent = this.clockString();
  }

  updateLookHint() {
    if (!this.ui.lookHint) return;
    this.ui.lookHint.hidden = !(this.mode === 'playing' && !this.input.locked && !this.shotLocked);
  }

  enterTitle() {
    this.mode = 'title';
    setHidden(this.ui.title, false);
    setHidden(this.ui.pause, true);
    setHidden(this.ui.controls, true);
    this.player.group.visible = false;
    this.hud.setVisible(false);
    this.input.allowLock = false;
    this.input.releaseLock();
    this.input.consumeMouse();
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
    this.hud.setVisible(true);
    if (toast) {
      this.hud.lastDistrict = '';
      this.hud.toast = null;
    }
    this.input.allowLock = lock;
    this.input.consumeMouse();
    this.world.focusAt(this.player.position.x, this.player.position.z);
    this.updateLookHint();
    if (lock) this.input.requestLock();
  }

  startNewGame() {
    this.hud.suppressToasts = false;
    this.objective = START_OBJECTIVE;
    this.player.health = PLAYER.health;
    this.player.armor = PLAYER.armor;
    this.player.cash = PLAYER.cash;
    this.player.wanted = 0;
    this.player.mission = 0;
    this.player.playSeconds = 0;
    this.clockMinutes = HOURS * 60 + MINUTES;
    this.player.teleport(PLAYER.spawn.x, PLAYER.spawn.z, PLAYER.spawnFacing, PLAYER.spawnCameraYaw);
    this.player.cameraPitch = CAMERA.pitch;
    this.player.cameraDistance = CAMERA.distance;
    this.player.updateCamera(this.camera, 0, true);
    this.enterPlaying({ toast: true });
    SaveStore.write(this.player.saveState);
    this.updateContinueButton();
  }

  startContinue() {
    const save = SaveStore.load();
    if (!save) return;
    this.hud.suppressToasts = false;
    this.player.loadFromSave(save);
    this.objective = START_OBJECTIVE;
    this.clockMinutes = HOURS * 60 + MINUTES + save.playSeconds * GAME_MINUTES_PER_SECOND;
    this.enterPlaying({ toast: true });
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.allowLock = false;
    this.input.releaseLock();
    this.input.consumeMouse();
    this.updatePauseStats();
    SaveStore.write(this.player.saveState);
    setHidden(this.ui.pause, false);
    this.updateLookHint();
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    setHidden(this.ui.pause, true);
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
    SaveStore.write(this.player.saveState);
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

  hudState() {
    return {
      player: this.player,
      objective: this.objective,
      radio: RADIO,
      clock: this.clockString(),
      district: districtAt(this.player.position.x, this.player.position.z),
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
    this.simTime = shot.time ?? 0;
    this.clockMinutes = HOURS * 60 + MINUTES;
    this.hud.suppressToasts = true;
    this.hud.toast = null;
    const steps = Math.max(0, shot.prewarm ?? 0);

    if (shot.mode === 'title') {
      this.titleView = shot.titleCamera ?? DEFAULT_TITLE_VIEW;
      this.enterTitle();
      for (let i = 0; i < steps; i += 1) this.tick(STEP);
    } else {
      this.enterPlaying({ lock: false, toast: shot.toast === true });
      this.objective = shot.objective ?? START_OBJECTIVE;
      this.player.health = PLAYER.health;
      this.player.armor = PLAYER.armor;
      this.player.cash = PLAYER.cash;
      this.player.wanted = 0;
      this.player.mission = 0;
      this.player.playSeconds = 0;
      const pose = shot.player;
      this.player.teleport(pose.x, pose.z, pose.facing, pose.cameraYaw);
      this.player.cameraPitch = pose.cameraPitch;
      this.player.cameraDistance = pose.distance;
      this.player.updateCamera(this.camera, 0, true);
      for (let i = 0; i < steps; i += 1) this.tick(STEP);
    }

    this.shotLocked = true;
    this.lastHudState = this.hudState();
    if (this.hud.visible) this.hud.update(0, this.lastHudState);
    this.updateLookHint();
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- loop

  tick(dt) {
    const input = this.input;
    this.simTime += dt;

    if (this.mode === 'playing') {
      this.player.update(dt, input);
      this.clockMinutes += dt * GAME_MINUTES_PER_SECOND;
      this.world.focusAt(this.player.position.x, this.player.position.z);
      if (input.wasPressed('Escape', 'KeyP')) this.pause();
      else {
        this.lastHudState = this.hudState();
        this.hud.update(dt, this.lastHudState);
        this.updateLookHint();
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
      };
    },
    get draws() {
      return game.renderer.info.render.calls;
    },
  };
} catch (error) {
  showBootError(error);
  console.error(error);
}
