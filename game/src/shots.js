// Deterministic screenshot staging. A shot is not a separate little demo: it
// places the real player, camera, traffic and HUD in a fixed composition, runs
// a fixed number of simulation steps and stops. `?shot=start|street|drive|chase|beach|mission|heist|pier`
// turns the page into one of these frozen frames; the seed is recorded but the
// harbor already builds from the one seed in config.js.

import { START_OBJECTIVE } from './config.js';

export const SHOTS = {
  start: {
    name: 'start',
    mode: 'title',
    time: 4.2,
    prewarm: 110,
    titleCamera: {
      position: [132, 64, 156],
      target: [-210, 2, 42],
      drift: [6.0, 1.4, 4.0],
      speed: 0.03,
    },
  },
  street: {
    name: 'street',
    mode: 'playing',
    time: 2.4,
    prewarm: 90,
    player: {
      x: -63,
      z: 27.3,
      facing: -Math.PI / 2,
      cameraYaw: Math.PI / 2,
      cameraPitch: 0.13,
      distance: 5.5,
    },
    objective: START_OBJECTIVE,
    toast: false,
  },
  drive: {
    name: 'drive',
    mode: 'playing',
    time: 2.2,
    prewarm: 0,
    drive: {
      type: 'muscle',
      color: 0x8c2f2f,
      x: -60,
      z: 30.2,
      yaw: Math.PI / 2,
      speed: 19,
      cameraPitch: 0.12,
    },
    objective: START_OBJECTIVE,
    toast: false,
  },
  chase: {
    name: 'chase',
    mode: 'playing',
    time: 2.65,
    prewarm: 26,
    drive: {
      type: 'muscle',
      color: 0x8c2f2f,
      x: -60,
      z: 30.2,
      yaw: Math.PI / 2,
      speed: 22,
      cameraPitch: 0.12,
      cameraOrbit: 0.05,
    },
    chase: {
      wanted: 4,
      air: { x: -94, z: 34, height: 24, targetX: -60, targetZ: 30 },
      units: [
        { x: -43, z: 21.3, yaw: -Math.PI / 2, speed: 9, shootTimer: 0.34 },
        { x: -37, z: 27.0, yaw: -Math.PI / 2, speed: 8, shootTimer: 0.52 },
        { x: -26, z: 27.0, yaw: 0, mode: 'block', shootTimer: 0.8 },
      ],
      officers: [
        { x: -31.5, z: 18.2, yaw: 0.4, shootTimer: 0.3 },
        { x: -28.5, z: 35.8, yaw: -0.4, shootTimer: 0.7 },
      ],
    },
    objective: {
      title: 'Break the Blockade',
      sub: 'Blast through the Harbor PD line, then lose the heat.',
      marker: { x: 0, z: 27 },
      tag: 'FREE ROAM · VEGA STRIP',
      stage: 'STAGE · BREAK THE POLICE LINE',
      reward: 0,
    },
    health: 64,
    armor: 18,
    toast: false,
  },
  beach: {
    name: 'beach',
    mode: 'playing',
    time: 3.4,
    prewarm: 80,
    daylight: true,
    drive: {
      type: 'sports',
      color: 0xd63f4a,
      x: -227.3,
      z: 97.1,
      yaw: 0.92,
      speed: 14,
      cameraPitch: 0.1,
    },
    camera: {
      position: [-198.5, 5.0, 126.5],
      target: [-214.5, 2.4, 104.2],
      fov: 58,
    },
    wanted: 4,
    air: {
      x: -247,
      z: 91,
      height: 22,
      targetX: -213.5,
      targetZ: 108,
    },
    hidePrompt: true,
    vehicleDamage: 24,
    weaponKey: 'shotgun',
    weapons: {
      smg: { owned: true, ammo: 24, reserve: 72 },
      shotgun: { owned: true, ammo: 6, reserve: 18 },
    },
    objective: {
      title: 'Air Unit Overhead',
      sub: 'Lose the searchlight and get the Vela off the sand.',
      marker: { x: -168, z: 70 },
      tag: 'FREE ROAM · CASA LUNA BEACH',
      stage: 'STAGE · OUTRUN THE AIR UNIT',
      reward: 0,
    },
    health: 86,
    armor: 42,
    toast: false,
  },
  mission: {
    name: 'mission',
    mode: 'playing',
    stage: 'mission',
    time: 2.9,
    prewarm: 70,
    player: {
      x: 0,
      z: 17.4,
      facing: Math.PI,
      cameraYaw: 0,
      cameraPitch: 0.13,
      distance: 5.7,
    },
    camera: {
      position: [-2.9, 3.2, 22.7],
      target: [0.4, 1.55, 8.9],
    },
    health: 68,
    armor: 24,
    toast: false,
  },
  heist: {
    name: 'heist',
    mode: 'playing',
    stage: 'heist',
    time: 3.2,
    prewarm: 60,
    player: {
      x: -228,
      z: 70,
      facing: -Math.PI / 2,
      cameraYaw: Math.PI / 2,
      cameraPitch: 0.12,
      distance: 5.5,
    },
    camera: {
      position: [-223.4, 3.45, 72.9],
      target: [-243.5, 2.0, 69.9],
    },
    health: 74,
    armor: 42,
    toast: false,
  },
  pier: {
    name: 'pier',
    mode: 'playing',
    time: 3.1,
    prewarm: 90,
    player: {
      x: -250,
      z: 70,
      facing: Math.PI / 2,
      cameraYaw: -Math.PI / 2,
      cameraPitch: 0.12,
      distance: 5.4,
    },
    objective: START_OBJECTIVE,
    toast: false,
  },
};

export function readShot(search = window.location.search) {
  const params = new URLSearchParams(search);
  const name = params.get('shot');
  if (!name || !SHOTS[name]) return null;
  return {
    ...SHOTS[name],
    seed: Number(params.get('seed')) || 1,
  };
}
