// localStorage persistence for the single save slot, the carried weapons and
// the audio/quality settings. Every read is guarded and every value is
// sanity-checked: a corrupt save should read as "no save", never take the game
// down.

import { CAMERA, DAY, DAY_MINUTES, HOURS, MINUTES, PLAYER } from './config.js';

const SAVE_KEY = 'neon-harbor.save.v1';
const SETTINGS_KEY = 'neon-harbor.settings.v1';
const LEGACY_CLOCK = HOURS * 60 + MINUTES;

const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const SaveStore = {
  load() {
    const store = storage();
    if (!store) return null;
    try {
      const parsed = JSON.parse(store.getItem(SAVE_KEY) || 'null');
      if (!parsed || parsed.version !== 1 || !parsed.position) return null;
      const position = parsed.position;
      const save = {
        version: 1,
        cash: Math.max(0, finite(parsed.cash, PLAYER.cash)),
        health: clamp(finite(parsed.health, PLAYER.health), 0, 100),
        armor: clamp(finite(parsed.armor, PLAYER.armor), 0, 100),
        wanted: clamp(Math.round(finite(parsed.wanted, 0)), 0, 5),
        mission: clamp(Math.round(finite(parsed.mission, 0)), 0, 99),
        storyDone: parsed.storyDone === true,
        playSeconds: Math.max(0, finite(parsed.playSeconds, 0)),
        // Old saves carry no clock; they resume at the legacy 23:41 night so
        // Continue keeps the scene the player last saw.
        clockMinutes: ((finite(parsed.clockMinutes, LEGACY_CLOCK) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES,
        day: clamp(Math.round(finite(parsed.day, DAY)), 1, 99),
        weaponKey: parsed.weaponKey === 'smg' || parsed.weaponKey === 'knife' ? parsed.weaponKey : 'pistol',
        weapons: parsed.weapons && typeof parsed.weapons === 'object' ? parsed.weapons : null,
        savedAt: finite(parsed.savedAt, 0),
        cameraYaw: finite(parsed.cameraYaw, PLAYER.spawnCameraYaw),
        cameraPitch: clamp(finite(parsed.cameraPitch, 0.17), CAMERA.minPitch, CAMERA.maxPitch),
        position: {
          x: clamp(finite(position.x, PLAYER.spawn.x), -320, 355),
          y: clamp(finite(position.y, 0), -2, 80),
          z: clamp(finite(position.z, PLAYER.spawn.z), -247, 247),
        },
      };
      if (!Number.isFinite(save.position.x) || !Number.isFinite(save.position.z)) return null;
      return save;
    } catch {
      return null;
    }
  },

  has() {
    return this.load() !== null;
  },

  write(progress) {
    const store = storage();
    if (!store) return false;
    try {
      store.setItem(
        SAVE_KEY,
        JSON.stringify({
          version: 1,
          cash: progress.cash,
          health: progress.health,
          armor: progress.armor,
          wanted: progress.wanted ?? 0,
          mission: progress.mission ?? 0,
          storyDone: progress.storyDone === true,
          playSeconds: progress.playSeconds ?? 0,
          clockMinutes: progress.clockMinutes ?? LEGACY_CLOCK,
          day: progress.day ?? DAY,
          weaponKey: progress.weaponKey ?? 'pistol',
          weapons: progress.weapons ?? null,
          cameraYaw: progress.cameraYaw,
          cameraPitch: progress.cameraPitch,
          position: { x: progress.position.x, y: progress.position.y, z: progress.position.z },
          savedAt: Date.now(),
        }),
      );
      return true;
    } catch {
      return false;
    }
  },

  clear() {
    const store = storage();
    if (!store) return;
    try {
      store.removeItem(SAVE_KEY);
    } catch {
      /* storage can be unavailable; the game still runs */
    }
  },

  summary() {
    const save = this.load();
    if (!save) return null;
    return {
      cash: save.cash,
      mission: save.mission,
      storyDone: save.storyDone,
      savedAt: save.savedAt,
      playSeconds: save.playSeconds,
    };
  },

  loadSettings() {
    const store = storage();
    const defaults = { quality: 'high', volume: 0.72, muted: false };
    if (!store) return defaults;
    try {
      const parsed = JSON.parse(store.getItem(SETTINGS_KEY) || 'null');
      return {
        quality: parsed?.quality === 'low' ? 'low' : 'high',
        volume: clamp(finite(parsed?.volume, 0.72), 0, 1),
        muted: parsed?.muted === true,
      };
    } catch {
      return defaults;
    }
  },

  saveSettings(settings) {
    const store = storage();
    if (!store) return;
    try {
      store.setItem(SETTINGS_KEY, JSON.stringify({
        quality: settings.quality === 'low' ? 'low' : 'high',
        volume: clamp(finite(settings.volume, 0.72), 0, 1),
        muted: settings.muted === true,
      }));
    } catch {
      /* settings are a nicety; ignore storage errors */
    }
  },
};
