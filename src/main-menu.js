// The title, pause and controls screens extracted from main.js: DOM
// bindings, quality, resize, the menu key guard, the title camera and the
// audio-panel sync. Every function takes the Game instance; the mode
// transitions (enterPlaying/startNewGame/startContinue) stay on Game.

import { QUALITY_PRESETS, districtAt } from './config.js';
import { MISSION_COUNT, missionName } from './missions.js';
import { SaveStore } from './save.js';
import { byId, formatCash, setHidden } from './main-shared.js';

export function bindScreens(game) {
  const click = (id, action) => {
    const element = byId(id);
    if (!element) return;
    element.addEventListener('click', (event) => {
      event.currentTarget.blur();
      event.preventDefault();
      game.audio.unlock();
      game.audio.uiClick();
      action();
    });
  };

  click('btn-new', () => game.startNewGame());
  click('btn-continue', () => game.startContinue());
  click('btn-controls', () => game.showControls('title'));
  click('btn-quality', () => game.toggleQuality());
  click('btn-resume', () => game.resume());
  click('btn-pause-controls', () => game.showControls('paused'));
  click('btn-pause-quality', () => game.toggleQuality());
  click('btn-save-title', () => game.saveAndReturn());
  click('btn-controls-back', () => game.backFromControls());
  click('title-mute', () => game.toggleMute());
  click('pause-mute', () => game.toggleMute());
  game.bindVolumeSliders();
}

export function bindVolumeSliders(game) {
  for (const element of [game.ui.titleVolume, game.ui.pauseVolume]) {
    if (!element) continue;
    element.addEventListener('input', () => game.setVolumeLevel(Number(element.value) / 100));
    element.addEventListener('pointerdown', () => game.audio.unlock());
  }
  game.syncAudioControls();
}

export function syncAudioControls(game) {
  const percent = Math.round((game.audio?.volume ?? 0.72) * 100);
  const muted = Boolean(game.audio?.muted);
  const panels = [
    [game.ui.titleVolume, game.ui.titleVolumeValue, game.ui.titleMute],
    [game.ui.pauseVolume, game.ui.pauseVolumeValue, game.ui.pauseMute],
  ];
  for (const [slider, label, button] of panels) {
    if (slider) slider.value = String(percent);
    if (label) label.textContent = `${percent}%`;
    if (button) {
      button.textContent = muted ? 'Muted' : 'Mute';
      button.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }
  }
}

export function bindWindow(game) {
  window.addEventListener('resize', () => game.resize());
  window.addEventListener('blur', () => {
    if (game.mode === 'playing' && !game.shot) game.pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing' && !game.shot) game.pause();
  });
  document.addEventListener('pointerlockchange', () => game.updateLookHint());
  window.addEventListener('beforeunload', () => {
    if (game.mode === 'playing' && !game.shot) game.saveProgress();
  });
}

export function applyQualityVisuals(game, resize = true) {
  const preset = QUALITY_PRESETS[game.quality] ?? QUALITY_PRESETS.high;
  const ratio = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
  game.renderer.setPixelRatio(ratio);
  game.renderer.shadowMap.enabled = preset.shadows;
  if (game.world) game.world.setQuality(game.quality);
  if (game.effects) game.effects.setQuality(game.quality);
  if (resize) game.resize();
}

export function refreshQualityLabel(game) {
  const text = game.quality === 'high' ? 'High' : 'Low';
  if (game.ui.qualityNote) game.ui.qualityNote.textContent = text;
  if (game.ui.pauseQualityNote) game.ui.pauseQualityNote.textContent = text;
}

export function resize(game) {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  game.camera.aspect = width / height;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(width, height, true);
  if (game.hud?.visible && game.lastHudState) game.hud.update(0, game.lastHudState);
}

export function menuFocused(game) {
  const active = document.activeElement;
  if (!active || active === document.body || active === game.canvas) return false;
  return ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
}

export function updateContinueButton(game) {
  const save = SaveStore.load();
  const button = byId('btn-continue');
  if (!button) return;
  button.disabled = !save;
  if (game.ui.continueNote) {
    game.ui.continueNote.textContent = save
      ? `${formatCash(save.cash)} · ${save.storyDone ? 'Story complete' : `M${Math.min(save.mission + 1, MISSION_COUNT)} · ${missionName(save.mission)}`}`
      : 'No save yet';
  }
}

export function updatePauseStats(game) {
  if (game.ui.pauseCash) game.ui.pauseCash.textContent = formatCash(game.player.cash);
  if (game.ui.pauseDistrict) game.ui.pauseDistrict.textContent = districtAt(game.player.position.x, game.player.position.z);
  if (game.ui.pauseClock) game.ui.pauseClock.textContent = game.environment.clock;
  if (game.ui.pauseMission) {
    game.ui.pauseMission.textContent = game.missions.storyDone
      ? 'Story complete'
      : `${game.missions.index + 1}/${MISSION_COUNT} · ${missionName(game.missions.index)}`;
  }
}

export function updateLookHint(game) {
  if (!game.ui.lookHint) return;
  game.ui.lookHint.hidden = !(
    game.mode === 'playing'
    && !game.input.locked
    && !game.shotLocked
    && !game.down
    && !game.hud?.ending
    && !game.radioWheel.open
  );
}

export function enterTitle(game) {
  game.mode = 'title';
  setHidden(game.ui.title, false);
  setHidden(game.ui.pause, true);
  setHidden(game.ui.controls, true);
  game.player.group.visible = false;
  game.player.inputBlocked = true;
  game.player.gun.visible = false;
  game.hud.setVisible(false);
  game.input.captureTab = false;
  game.closeRadioWheel();
  game.input.allowLock = false;
  game.input.releaseLock();
  game.input.consumeMouse();
  game.audio.setEngine({ on: false, rpm: 0, load: 0, speed: 0 });
  game.audio.setSiren(0, 0);
  game.updateLookHint();
  game.updateContinueButton();
  game.syncAudioControls();
  game.world.focusAt(game.titleView.target[0], game.titleView.target[2]);
  game.setTitleCamera();
}

export function pause(game) {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  game.input.captureTab = false;
  game.closeRadioWheel();
  game.audio.setEngine({ on: false, rpm: 0, load: 0, speed: 0 });
  game.audio.setSiren(0, 0);
  game.input.allowLock = false;
  game.input.releaseLock();
  game.input.consumeMouse();
  game.updatePauseStats();
  game.syncAudioControls();
  game.saveProgress();
  setHidden(game.ui.pause, false);
  game.updateLookHint();
}

export function resume(game) {
  if (game.mode !== 'paused') return;
  game.mode = 'playing';
  setHidden(game.ui.pause, true);
  game.input.captureTab = true;
  game.radio.tick();
  game.input.allowLock = true;
  game.input.consumeMouse();
  game.input.requestLock();
  game.updateLookHint();
}

export function showControls(game, from) {
  game.controlsReturn = from;
  game.mode = 'controls';
  setHidden(game.ui.title, true);
  setHidden(game.ui.pause, true);
  setHidden(game.ui.controls, false);
  game.input.captureTab = false;
  game.closeRadioWheel();
  game.input.allowLock = false;
  game.input.releaseLock();
  game.updateLookHint();
}

export function backFromControls(game) {
  setHidden(game.ui.controls, true);
  if (game.controlsReturn === 'paused') {
    game.mode = 'paused';
    setHidden(game.ui.pause, false);
  } else {
    game.mode = 'title';
    setHidden(game.ui.title, false);
  }
  game.updateLookHint();
}

export function saveAndReturn(game) {
  game.saveProgress();
  game.enterTitle();
}

export function toggleQuality(game) {
  game.quality = game.quality === 'high' ? 'low' : 'high';
  game.settings.quality = game.quality;
  SaveStore.saveSettings(game.settings);
  game.applyQualityVisuals(true);
  game.refreshQualityLabel();
}

export function setTitleCamera(game) {
  game.updateTitleCamera();
}

export function updateTitleCamera(game) {
  const view = game.titleView;
  const [x, y, z] = view.position;
  const [dx, dy, dz] = view.drift;
  const t = game.simTime * view.speed;
  game.camera.position.set(
    x + Math.sin(t) * dx,
    y + Math.sin(t * 0.73 + 1.2) * dy,
    z + Math.cos(t * 0.86) * dz,
  );
  game.camera.lookAt(view.target[0], view.target[1], view.target[2]);
}
