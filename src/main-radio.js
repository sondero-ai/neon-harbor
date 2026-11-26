// Radio controls extracted from main.js: the tune toast, the tuning keys,
// the hold-Tab wheel, mute and the volume sliders. Every function takes the
// Game instance; the RadioPlayer state machine stays in radio.js.

import { RADIO } from './config.js';
import { SaveStore } from './save.js';

export function radioToast(game, state, { off = false } = {}) {
  if (game.hud.suppressToasts) return;
  if (off) {
    game.hud.toast = { title: 'Radio Off', sub: 'PRESS T TO TUNE IN', life: 2.0 };
    return;
  }
  const status = state.offAir ? 'OFF AIR' : state.fallback ? 'SYNTH' : 'ON AIR';
  game.hud.toast = {
    title: state.station,
    sub: `${state.trackNumber}/${state.trackCount} · ${state.track.toUpperCase()} — ${state.artist.toUpperCase()} · ${status}`,
    life: 2.6,
  };
}

export function toggleRadio(game) {
  game.audio.unlock();
  const wasEnabled = game.radio.enabled;
  const state = game.radio.toggle();
  game.audio.radioSwitch();
  game.radioToast(state, { off: wasEnabled });
}

export function cycleStation(game, direction) {
  game.audio.unlock();
  if (!game.radio.enabled) game.radio.setEnabled(true, { autoplay: false });
  const moved = game.radio.nextStation(direction);
  game.audio.radioSwitch();
  if (!moved) {
    if (!game.hud.suppressToasts) game.hud.toast = { title: 'All Stations Off Air', sub: 'NO PLAYABLE RADIO', life: 2.0 };
    return;
  }
  game.radioToast(game.radio.state);
}

export function cycleTrack(game, direction) {
  game.audio.unlock();
  if (!game.radio.enabled) game.radio.setEnabled(true, { autoplay: false });
  game.radio.nextTrack(direction);
  game.audio.radioSwitch();
  game.radioToast(game.radio.state);
}

export function updateRadioWheel(game, input) {
  const canOpen = game.mode === 'playing' && !game.down && !game.hud.ending;
  const held = canOpen && input.isDown('Tab');
  if (held && !game.radioWheel.open) game.openRadioWheel();
  else if (!held && game.radioWheel.open) game.closeRadioWheel();
  if (game.radioWheel.open) {
    const wheel = game.radioWheel;
    const stations = RADIO.stations;
    const stationCount = stations.length;
    if (input.wasPressed('ArrowLeft')) wheel.station = (wheel.station + stationCount - 1) % stationCount;
    if (input.wasPressed('ArrowRight')) wheel.station = (wheel.station + 1) % stationCount;
    wheel.track = Math.min(wheel.track, stations[wheel.station].tracks.length - 1);
    const trackCount = stations[wheel.station].tracks.length;
    if (input.wasPressed('ArrowUp')) wheel.track = (wheel.track + trackCount - 1) % trackCount;
    if (input.wasPressed('ArrowDown')) wheel.track = (wheel.track + 1) % trackCount;
    if (input.wasPressed('Enter', 'NumpadEnter')) {
      game.applyRadioWheel();
      input.consumePressed('Enter', 'NumpadEnter');
    }
  }
  // Movement axes read this flag, so the wheel can use the arrow keys without
  // walking Rae around the block.
  input.radioWheelOpen = game.radioWheel.open;
}

export function openRadioWheel(game) {
  game.audio.unlock();
  game.radioWheel.open = true;
  game.radioWheel.station = game.radio.stationIndex;
  game.radioWheel.track = game.radio.trackIndex;
  game.radioWheel.lock = game.input.locked;
  game.input.wheelLockRestore = game.radioWheel.lock;
  if (game.radioWheel.lock) game.input.releaseLock();
  game.input.radioWheelOpen = true;
  game.hud.setWheelInteractive(true);
  game.updateLookHint();
  game.audio.uiClick();
}

export function closeRadioWheel(game) {
  if (!game.radioWheel.open) return;
  game.radioWheel.open = false;
  game.radioWheel.lock = false;
  game.input.radioWheelOpen = false;
  game.input.wheelLockRestore = false;
  game.hud.setWheelInteractive(false);
  game.updateLookHint();
}

export function applyRadioWheel(game) {
  game.audio.unlock();
  const wheel = game.radioWheel;
  const state = game.radio.setStation(wheel.station, wheel.track);
  game.audio.radioSwitch();
  game.radioToast(state);
}

export function pickRadioWheel(game, hit) {
  if (!game.radioWheel.open || !hit) return;
  game.radioWheel.station = hit.station;
  game.radioWheel.track = hit.track;
  game.applyRadioWheel();
}

export function toggleMute(game) {
  game.audio.unlock();
  const muted = game.audio.toggleMute();
  game.settings.muted = muted;
  SaveStore.saveSettings(game.settings);
  game.syncAudioControls();
  if (!game.hud.suppressToasts) {
    const state = game.radio.state;
    game.hud.toast = {
      title: muted ? 'Audio Muted' : 'Audio On',
      sub: muted ? 'PRESS M TO RESTORE' : `${state.station} · ${state.track}`.toUpperCase(),
      life: 2.0,
    };
  }
}

export function setVolumeLevel(game, value, { toast = false } = {}) {
  game.audio.unlock();
  const volume = Math.max(0, Math.min(1, Number(value) || 0));
  // Setting a level also lifts an old mute, so the gesture is audible.
  game.audio.muted = false;
  game.audio.setVolume(volume);
  if (game.audio.master && game.audio.ctx) {
    game.audio.master.gain.setTargetAtTime(game.audio.volume, game.audio.ctx.currentTime, 0.03);
  }
  game.settings.volume = game.audio.volume;
  game.settings.muted = false;
  SaveStore.saveSettings(game.settings);
  game.syncAudioControls();
  if (toast && !game.hud.suppressToasts) {
    game.hud.toast = { title: `Volume ${Math.round(game.audio.volume * 100)}%`, sub: 'MINUS / EQUALS', life: 1.6 };
  }
}

export function changeVolume(game, delta) {
  game.setVolumeLevel(game.audio.volume + delta, { toast: true });
}
