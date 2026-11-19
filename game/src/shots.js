// Deterministic screenshot staging. A shot is not a separate little demo: it
// places the real player, camera, traffic and HUD in a fixed composition, runs
// a fixed number of simulation steps and stops. `?shot=start|street|drive|pier`
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
      cameraPitch: 0.16,
      cameraOrbit: -0.24,
    },
    chase: {
      wanted: 4,
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
      reward: 0,
    },
    health: 64,
    armor: 18,
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
