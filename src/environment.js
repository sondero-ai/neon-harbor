// The city clock and the atmosphere it drives. One 24-hour minute counter is
// the only state: four named periods (dawn, day, dusk, night) supply a palette,
// and a sixty-minute smoothstep around each boundary blends two palettes. The
// world, HUD, sky, lights and car lamp materials read the resulting values;
// nothing else stores a second time of day.

import * as THREE from '../vendor/three.module.js';
import {
  CLOCK_MINUTES_PER_SECOND,
  DAY,
  DAY_MINUTES,
  HOURS,
  MINUTES,
  NEW_GAME_CLOCK,
  WORLD,
} from './config.js';

export { CLOCK_MINUTES_PER_SECOND, NEW_GAME_CLOCK };

/** The deterministic night every ?shot= capture pins unless ?time= overrides. */
export const SHOT_CLOCK = HOURS * 60 + MINUTES;

/** Minutes on either side of a boundary that receive a smoothstep blend. */
export const BLEND_HALF_MINUTES = 30;

const wrap = (minutes) => ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Every palette entry is a number: colours are hex, intensities and amounts
// are plain scalars, and lightDir/moonDir are unit directions. Keeping them
// flat means the boundary blend is one loop over the same key list.
const COLOR_KEYS = [
  'fog', 'hemiSky', 'hemiGround', 'ambient', 'sunColor',
  'waterTint', 'waterEmissive', 'cloud',
];
const SCALAR_KEYS = [
  'fogNear', 'fogFar', 'hemiIntensity', 'ambientIntensity', 'sunIntensity',
  'fillIntensity', 'sun', 'moon', 'window', 'neon', 'street', 'carLights',
  'waterEmissiveIntensity', 'sparkle', 'stars', 'cloudOpacity', 'exposure',
];

const PALETTES = {
  night: {
    sky: 'night',
    fog: 0x241a33, fogNear: 72, fogFar: 680,
    hemiSky: 0x7f8fd6, hemiGround: 0x171322, hemiIntensity: 1.38,
    ambient: 0x4a4266, ambientIntensity: 0.56,
    sunColor: 0x9fb2ff, sunIntensity: 0.65, fillIntensity: 1.0,
    lightDir: WORLD.sunDir,
    moonDir: [-0.86, 0.38, -0.34],
    sun: 0, moon: 1,
    window: 1, neon: 1, street: 1, carLights: 1,
    waterTint: 0xffffff, waterEmissive: 0x09232b, waterEmissiveIntensity: 0.32, sparkle: 0.5,
    stars: 0.9, cloud: 0xffd6bd, cloudOpacity: 1,
    exposure: 1.32,
  },
  dawn: {
    sky: 'dawn',
    fog: 0x6a4a5e, fogNear: 82, fogFar: 740,
    hemiSky: 0xc98aa0, hemiGround: 0x2a1e2e, hemiIntensity: 1.35,
    ambient: 0x7a5a6e, ambientIntensity: 0.5,
    sunColor: 0xffa070, sunIntensity: 1.1, fillIntensity: 0.85,
    lightDir: [0.62, 0.22, 0.45],
    moonDir: [-0.86, 0.34, -0.3],
    sun: 0.75, moon: 0.35,
    window: 0.55, neon: 0.62, street: 0.45, carLights: 0.55,
    waterTint: 0xd8b8b4, waterEmissive: 0x24323a, waterEmissiveIntensity: 0.22, sparkle: 0.35,
    stars: 0.22, cloud: 0xffc8a8, cloudOpacity: 0.9,
    exposure: 1.18,
  },
  day: {
    sky: 'day',
    fog: 0x9db8c9, fogNear: 120, fogFar: 980,
    hemiSky: 0xbfd8ff, hemiGround: 0x6d6a58, hemiIntensity: 2.0,
    ambient: 0xffffff, ambientIntensity: 0.32,
    sunColor: 0xfff2d6, sunIntensity: 2.3, fillIntensity: 0.7,
    lightDir: [0.45, 0.82, 0.2],
    moonDir: [-0.86, 0.34, -0.3],
    sun: 1, moon: 0,
    window: 0.18, neon: 0.4, street: 0, carLights: 0,
    waterTint: 0xd2e7ea, waterEmissive: 0x123038, waterEmissiveIntensity: 0.06, sparkle: 0.1,
    stars: 0, cloud: 0xffffff, cloudOpacity: 0.95,
    exposure: 1.08,
  },
  dusk: {
    sky: 'dusk',
    fog: 0x5c3048, fogNear: 78, fogFar: 720,
    hemiSky: 0xb57a9a, hemiGround: 0x2a1828, hemiIntensity: 1.35,
    ambient: 0x8a5a6a, ambientIntensity: 0.5,
    sunColor: 0xff9160, sunIntensity: 1.15, fillIntensity: 0.9,
    lightDir: [-0.7, 0.24, 0.5],
    moonDir: [-0.86, 0.36, -0.32],
    sun: 0.5, moon: 0.55,
    window: 0.62, neon: 0.72, street: 0.5, carLights: 0.6,
    waterTint: 0xd8a0a2, waterEmissive: 0x1e2c34, waterEmissiveIntensity: 0.2, sparkle: 0.32,
    stars: 0.28, cloud: 0xffb090, cloudOpacity: 0.9,
    exposure: 1.24,
  },
};

// The four boundary crossings, in order. Each blend is centred on the named
// minute and reaches 30 minutes to either side.
const BOUNDARIES = [
  { at: 5 * 60, from: 'night', to: 'dawn' },
  { at: 7 * 60, from: 'dawn', to: 'day' },
  { at: 17 * 60, from: 'day', to: 'dusk' },
  { at: 19 * 60, from: 'dusk', to: 'night' },
];

export function periodAt(minutes) {
  const m = wrap(minutes);
  if (m >= 5 * 60 && m < 7 * 60) return 'dawn';
  if (m >= 7 * 60 && m < 17 * 60) return 'day';
  if (m >= 17 * 60 && m < 19 * 60) return 'dusk';
  return 'night';
}

function mixHex(a, b, t) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}

function mixDir(a, b, t) {
  const out = new THREE.Vector3(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
  if (out.lengthSq() < 1e-6) return [...a];
  out.normalize();
  return [out.x, out.y, out.z];
}

function blendPalette(a, b, t) {
  const out = { skyFrom: a.sky, skyTo: b.sky, skyBlend: t };
  for (const key of SCALAR_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  for (const key of COLOR_KEYS) out[key] = mixHex(a[key], b[key], t);
  out.lightDir = mixDir(a.lightDir, b.lightDir, t);
  out.moonDir = mixDir(a.moonDir, b.moonDir, t);
  return out;
}

function fullPalette(state) {
  const source = PALETTES[state];
  const out = { skyFrom: source.sky, skyTo: source.sky, skyBlend: 0 };
  for (const key of SCALAR_KEYS) out[key] = source[key];
  for (const key of COLOR_KEYS) out[key] = source[key];
  out.lightDir = [...source.lightDir];
  out.moonDir = [...source.moonDir];
  return out;
}

/** Reads ?time=HH:MM from a query string; returns minutes or null. */
export function parseTimeParam(search = window.location.search) {
  const value = new URLSearchParams(search).get('time');
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function clockString(minutes) {
  // The clock accrues 0.00833 min per tick; rounding keeps a full 30 s of real
  // time reading as fifteen minutes instead of 14:59.99.
  const total = Math.round(wrap(minutes)) % DAY_MINUTES;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export class Environment {
  constructor({ clockMinutes = NEW_GAME_CLOCK, day = DAY } = {}) {
    this.minutes = wrap(clockMinutes);
    this.day = day;
    this._signature = null;
    this._palette = fullPalette(periodAt(this.minutes));
  }

  get clock() {
    return clockString(this.minutes);
  }

  get period() {
    return periodAt(this.minutes);
  }

  get state() {
    return this.period;
  }

  get palette() {
    return this.currentPalette();
  }

  advance(dt) {
    const before = this.minutes;
    this.minutes = wrap(this.minutes + Math.max(0, dt) * CLOCK_MINUTES_PER_SECOND);
    if (this.minutes < before) this.day += 1;
    this._signature = null;
  }

  setClock(minutes) {
    this.minutes = wrap(Number(minutes) || 0);
    this._signature = null;
  }

  setDay(day) {
    this.day = Math.max(1, Math.round(Number(day) || DAY));
  }

  currentPalette() {
    const m = this.minutes;
    let found = null;
    for (const boundary of BOUNDARIES) {
      let delta = m - boundary.at;
      if (delta > DAY_MINUTES / 2) delta -= DAY_MINUTES;
      if (delta < -DAY_MINUTES / 2) delta += DAY_MINUTES;
      if (Math.abs(delta) <= BLEND_HALF_MINUTES) {
        const t = smooth(clamp01((delta + BLEND_HALF_MINUTES) / (BLEND_HALF_MINUTES * 2)));
        found = { from: boundary.from, to: boundary.to, t };
        break;
      }
    }
    const palette = found
      ? blendPalette(PALETTES[found.from], PALETTES[found.to], found.t)
      : fullPalette(periodAt(m));
    palette.state = periodAt(m);
    palette.minutes = m;
    palette.day = this.day;
    return palette;
  }

  /**
   * Writes the palette into the scene. Material writes are skipped when the
   * blended signature has not changed, so a still clock costs nothing and a
   * moving one updates about four times a second rather than every frame.
   */
  apply({ scene, renderer, world, effects, vehicles, signals } = {}, { force = false } = {}) {
    const palette = this.currentPalette();
    const signature = [
      palette.state, palette.skyFrom, palette.skyTo,
      Math.round(palette.skyBlend * 1000),
      Math.round(palette.sunIntensity * 100),
      Math.round(palette.hemiIntensity * 100),
      Math.round(palette.window * 100),
      Math.round(palette.neon * 100),
      Math.round(palette.street * 100),
      Math.round(palette.carLights * 100),
      Math.round(palette.stars * 100),
      Math.round(palette.exposure * 100),
    ].join('|');
    if (!force && signature === this._signature) return palette;
    this._signature = signature;

    if (scene && scene.fog) {
      scene.fog.color.setHex(palette.fog);
      scene.fog.near = palette.fogNear;
      scene.fog.far = palette.fogFar;
    }
    if (renderer) renderer.toneMappingExposure = palette.exposure;
    if (world) world.applyEnvironment(palette);
    if (effects) effects.applyEnvironment(palette);
    if (vehicles) vehicles.applyEnvironment(palette);
    if (signals) signals.applyEnvironment(palette);
    return palette;
  }
}
