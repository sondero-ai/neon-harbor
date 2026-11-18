// The save slot: position, cash, health, armour, weapons, mission progress, wanted level, clock
// and radio station, written to localStorage after every mission and when the game pauses.
const KEY = 'neon-harbor.save.v1';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...data, v: 1, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage may be disabled; nothing to clear.
  }
}

export function hasSave() {
  return readSave() !== null;
}
