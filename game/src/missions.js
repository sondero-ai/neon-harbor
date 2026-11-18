// The story: four courier jobs for Rae Solano, each built from small steps (go here, steal this,
// hold a tail, hold a camera, survive, escape) with markers, timers, dialogue portraits, cash and
// a retry that puts everything back the way it was. The chain runs itself: finishing a job starts
// the next call after a few seconds, and the last one ends on the epilogue card.
import * as THREE from '../vendor/three.module.js';
import { CRIME } from './config.js';

export const CAST = {
  rae: { name: 'Rae Solano', skin: '#c78e64', hair: '#191420', jacket: '#1f6f6a', accent: '#ff5f9e' },
  dejay: { name: 'Dejay Cruz', skin: '#8d5a3c', hair: '#12100f', jacket: '#c9a34a', accent: '#ffd08a' },
  vera: { name: 'Vera Solano', skin: '#e0b090', hair: '#5a3a22', jacket: '#4a2f4f', accent: '#a06bff' },
  mateo: { name: 'Mateo Solano', skin: '#b87a52', hair: '#33251e', jacket: '#5a5348', accent: '#4bd2ff' },
  rourke: { name: 'Insp. Rourke', skin: '#d9a273', hair: '#1a1a22', jacket: '#1d2a4a', accent: '#6f8fce' },
};

function buildMarker(scene) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 2.4, 22, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: '#5ef2d6', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.position.y = 11;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 28),
    new THREE.MeshBasicMaterial({ color: '#7dffe6', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.4, 4),
    new THREE.MeshBasicMaterial({ color: '#a9fff0', transparent: true, opacity: 0.8, toneMapped: false }),
  );
  arrow.position.y = 4.5;
  arrow.rotation.x = Math.PI;
  group.add(beam, ring, arrow);
  group.visible = false;
  scene.add(group);
  return { group, beam, ring, arrow, x: 0, z: 0 };
}

export function createMissions(ctx) {
  const { player, world, vehicles, traffic, police, effects, audio, scene } = ctx;
  const marker = buildMarker(scene);
  const state = {
    index: -1, step: 0, stepTimer: 0, timer: 0, followTimer: 0, loseTimer: 0, photoTimer: 0,
    active: false, failed: null, objective: '', dialogue: null, steps: [], actors: [],
    kills: 0, completeTimer: 0, waitTimer: 0, epilogue: false, notified: 0,
  };
  const callbacks = { onSave: null, onToast: null, onObjective: null, onComplete: null };
  const land = world.landmarks;

  function toast(text) {
    if (callbacks.onToast) callbacks.onToast(text);
  }

  function setObjective(text) {
    if (!text || text === state.objective) return;
    state.objective = text;
    if (callbacks.onObjective) callbacks.onObjective(text);
  }

  function setMarker(x, z, visible = true) {
    marker.x = x;
    marker.z = z;
    marker.group.position.set(x, world.surfaceHeight(x, z), z);
    marker.group.visible = visible;
  }

  function say(lines) {
    state.dialogue = { lines, index: 0, timer: 0 };
    audio.ui();
  }

  function advanceDialogue() {
    if (!state.dialogue) return;
    state.dialogue.index += 1;
    state.dialogue.timer = 0;
    audio.ui();
    if (state.dialogue.index >= state.dialogue.lines.length) state.dialogue = null;
  }

  function cleanupActors() {
    for (const actor of state.actors) {
      if (actor.car) vehicles.removeCar(actor.car);
      if (actor.group) scene.remove(actor.group);
    }
    state.actors.length = 0;
  }

  function spawnRival(x, z, heading, type = 'muscle') {
    const car = vehicles.spawnCar(type, x, z, heading, { driver: 'ai' });
    car.speed = 0;
    car.ai = { route: [], at: 0, speed: 7.5, stopped: false };
    state.actors.push({ car });
    return car;
  }

  function followRoute(car, dt) {
    if (!car || car.wrecked || car.ai.stopped) return;
    const route = car.ai.route;
    if (!route || route.length === 0) return;
    const target = route[Math.min(car.ai.at, route.length - 1)];
    const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 7) {
      car.ai.at += 1;
      if (car.ai.at >= route.length) car.ai.stopped = true;
      return;
    }
    const wanted = Math.atan2(dx, dz);
    let delta = Math.atan2(Math.sin(wanted - car.heading), Math.cos(wanted - car.heading));
    car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, delta));
    car.throttle = 1;
    car.steer = 0;
    if (car.speed > car.ai.speed) car.throttle = 0;
    car.group.position.set(car.pos.x, world.surfaceHeight(car.pos.x, car.pos.z), car.pos.z);
    car.group.rotation.y = car.heading;
  }

  /** Step factories keep each mission readable: who, what, where, and how it ends. */
  function gotoStep(text, point, radius, onArrive, timeLimit = 0) {
    return {
      text, point, radius, timeLimit,
      enter() { setMarker(point.x, point.z, true); setObjective(text); },
      update(dt, api) {
        const distance = Math.hypot(player.pos.x - point.x, player.pos.z - point.z);
        if (distance < radius) {
          api.next();
          if (onArrive) onArrive(api);
        }
      },
    };
  }

  function carStep(text, car, radius, done, timeLimit = 0) {
    return {
      text, car, radius, timeLimit,
      enter() { setObjective(text); },
      update(dt, api) {
        if (car.wrecked) { api.fail('The car is wrecked.'); return; }
        setMarker(car.pos.x, car.pos.z, true);
        const distance = Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z);
        if (done({ distance, car })) api.next();
      },
    };
  }

  function timerStep(text, seconds, done, failText = 'You ran out of time.') {
    return {
      text, timeLimit: seconds,
      enter() { setObjective(text); },
      update(dt, api) { if (done()) api.next(); },
      onTimeout(api) { api.fail(failText); },
    };
  }

  const MISSIONS = [
    {
      title: 'MOTOR POOL',
      intro: [
        { who: CAST.dejay, text: "Rae. Dejay. There's a Vanto GT parked on Vega, keys still in it. Bring it to Solano Imports and my buyer never sees your face." },
        { who: CAST.rae, text: "And if the owner sees it?" },
        { who: CAST.dejay, text: "Then drive faster than you talk. Go." },
      ],
      build(api) {
        const car = vehicles.spawnCar('sports', -40, 152, Math.PI, { occupied: false });
        car.color = '#d9442f';
        state.actors.push({ car });
        return [
          carStep('Steal the Vanto GT parked on Vega Street', car, 4.5, ({ distance }) => distance < 4.5 && player.car === car),
          {
            text: 'Deliver the car to Solano Imports',
            enter() { setObjective('Deliver the car to Solano Imports'); setMarker(land.garage.x, land.garage.z, true); },
            update(dt, api) {
              setMarker(land.garage.x, land.garage.z, true);
              if (player.car && Math.hypot(player.car.pos.x - land.garage.x, player.car.pos.z - land.garage.z) < 11) api.next();
            },
          },
        ];
      },
      outro: [
        { who: CAST.mateo, text: 'Clean. No plate, no paint, no problem. Four hundred now, the rest when the buyer stops sweating.' },
        { who: CAST.rae, text: 'Vera said there was another job.' },
        { who: CAST.mateo, text: 'There is. A man named Rourke is buying information off our dock crews. Follow him. Take pictures, not risks.' },
      ],
      reward: 600,
    },
    {
      title: 'PAPER TRAIL',
      intro: [
        { who: CAST.vera, text: "Rourke's courier is leaving the strip now. Stay behind him, close enough to see, far enough to live." },
        { who: CAST.rae, text: "And when he hands it off?" },
        { who: CAST.vera, text: "Then you get the picture. Not the gun. Not yet." },
      ],
      build(api) {
        const rival = spawnRival(80, 214, Math.PI / 2);
        rival.ai.route = [{ x: 80, z: 200 }, { x: 200, z: 200 }, { x: 200, z: 196 }];
        rival.pos.set(80, 0, 200);
        return [
          {
            text: 'Pick up the courier on Sunset Strip',
            enter() { setObjective('Pick up the courier on Sunset Strip'); setMarker(rival.pos.x, rival.pos.z, true); },
            update(dt, api) {
              followRoute(rival, dt);
              setMarker(rival.pos.x, rival.pos.z, true);
              const distance = Math.hypot(player.pos.x - rival.pos.x, player.pos.z - rival.pos.z);
              if (distance < 34) {
                api.next({ rival });
              }
            },
          },
          {
            text: 'Tail the courier — keep your distance',
            enter() { state.followTimer = 0; state.loseTimer = 0; setObjective('Tail the courier — keep your distance'); },
            update(dt, api) {
              followRoute(rival, dt);
              setMarker(rival.pos.x, rival.pos.z, true);
              const distance = Math.hypot(player.pos.x - rival.pos.x, player.pos.z - rival.pos.z);
              if (distance < 60) {
                state.followTimer += dt;
                state.loseTimer = Math.max(0, state.loseTimer - dt);
                setObjective(`Tail the courier — ${Math.max(0, 14 - Math.floor(state.followTimer))}s on him`);
              } else {
                state.loseTimer += dt;
                if (state.loseTimer > 5) api.fail('You lost the courier.');
              }
              if (distance < 9) {
                api.fail('He spotted you — too close.');
                return;
              }
              if (state.followTimer > 14) api.next({ rival });
            },
          },
          {
            text: 'Photograph the handoff at the marina',
            enter() {
              state.photoTimer = 0;
              setObjective('Photograph the handoff — aim with the right mouse button');
              setMarker(200, 196, true);
            },
            update(dt, api) {
              setMarker(200, 196, true);
              followRoute(rival, dt);
              const distance = Math.hypot(player.pos.x - 200, player.pos.z - 196);
              const toTarget = Math.atan2(200 - player.pos.x, 196 - player.pos.z);
              const looking = player.aiming && Math.cos(player.orbitYaw - toTarget) > 0.86;
              if (distance < 30 && looking) {
                state.photoTimer += dt;
                setObjective(`Hold the shot — ${Math.max(0, 2.2 - state.photoTimer).toFixed(1)}s`);
                if (state.photoTimer > 2.2) {
                  effects.muzzle(new THREE.Vector3(player.pos.x, player.pos.y + 1.4, player.pos.z), '#ffffff');
                  audio.ui();
                  toast('PHOTOGRAPH TAKEN — the buyer is Rourke’s aide');
                  api.next();
                }
              } else if (distance > 34) {
                setObjective('Get within 30 m of the handoff and aim');
              }
            },
          },
          {
            text: 'Lose the courier and get back to the garage',
            enter() { setObjective('Get back to Solano Imports'); setMarker(land.garage.x, land.garage.z, true); },
            update(dt, api) {
              setMarker(land.garage.x, land.garage.z, true);
              if (Math.hypot(player.pos.x - land.garage.x, player.pos.z - land.garage.z) < 12) api.next();
            },
          },
        ];
      },
      outro: [
        { who: CAST.mateo, text: 'Rourke. I knew it. He has been selling our berths to the coast guard one folder at a time.' },
        { who: CAST.rae, text: 'So we give the folder to someone else.' },
        { who: CAST.vera, text: 'You do not. You go to Ember Yards. Rourke heard his name tonight and he is sending everyone.' },
      ],
      reward: 900,
    },
    {
      title: 'EMBER YARDS',
      intro: [
        { who: CAST.vera, text: 'They are already at the yard. Cruisers, maybe more. Do not let them take you alive, Rae.' },
        { who: CAST.rae, text: 'Wasn’t planning on it.' },
      ],
      build(api) {
        return [
          {
            text: 'Reach the yard before Rourke locks it down',
            enter() { setObjective('Reach Ember Yards'); setMarker(land.ambush.x, land.ambush.z, true); },
            update(dt, api) {
              setMarker(land.ambush.x, land.ambush.z, true);
              if (Math.hypot(player.pos.x - land.ambush.x, player.pos.z - land.ambush.z) < 14) api.next();
            },
          },
          {
            text: 'Survive the ambush',
            timeLimit: 95,
            enter() {
              setObjective('Survive the ambush — put them down');
              setMarker(land.ambush.x, land.ambush.z, false);
              police.addHeat(3.2, 'AMBUSH — POLICE ON SCENE');
              state.kills = 0;
              state.surviveTimer = 45;
              for (let i = 0; i < 3; i += 1) {
                const angle = (i / 3) * Math.PI * 2;
                police.spawnOfficer(land.ambush.x + Math.cos(angle) * 16, land.ambush.z + Math.sin(angle) * 16);
              }
              state.waitTimer = 3;
            },
            update(dt, api) {
              state.waitTimer -= dt;
              const hostiles = police.officers.filter((officer) => !officer.dead).length + police.cruisers.filter((car) => !car.wrecked).length;
              state.surviveTimer = (state.surviveTimer ?? 45) - dt;
              setObjective(`Survive the ambush — ${Math.max(0, Math.ceil(state.surviveTimer))}s · ${hostiles} hostiles`);
              if (state.surviveTimer <= 0) api.next();
            },
            onTimeout(api) { api.fail('The ambush closed in.'); },
          },
          {
            text: 'Get clear of the yard',
            enter() { setObjective('Get clear of the yard'); setMarker(land.hospital.x, land.hospital.z, true); },
            update(dt, api) {
              setMarker(land.hospital.x, land.hospital.z, true);
              if (Math.hypot(player.pos.x - land.hospital.x, player.pos.z - land.hospital.z) < 20) api.next();
            },
          },
        ];
      },
      outro: [
        { who: CAST.rae, text: 'Yard is quiet. Rourke wasn’t there. He’s running for the water.' },
        { who: CAST.mateo, text: 'Pier 9. The boat is fuelled. Get to it before he does, and the ledger goes in the sea with him.' },
      ],
      reward: 1400,
    },
    {
      title: 'LAST CALL',
      intro: [
        { who: CAST.dejay, text: 'Rourke is at the pier with a cruiser escort. The boat is at the end, engine warm. Do not stop moving.' },
        { who: CAST.rae, text: 'If I do stop?' },
        { who: CAST.dejay, text: 'Then I inherit your jacket. Go.' },
      ],
      build(api) {
        return [
          {
            text: 'Race to Pier 9',
            enter() { setObjective('Race to Pier 9'); setMarker(land.pierGate.x, land.pierGate.z, true); },
            update(dt, api) {
              setMarker(land.pierGate.x, land.pierGate.z, true);
              if (Math.hypot(player.pos.x - land.pierGate.x, player.pos.z - land.pierGate.z) < 16) api.next();
            },
          },
          {
            text: 'Fight through to the boat',
            timeLimit: 110,
            enter() {
              setObjective('Fight through to the boat');
              setMarker(land.boat.x, land.boat.z, true);
              police.addHeat(3.6, 'ROURKE IS RUNNING');
              state.waitTimer = 2;
            },
            update(dt, api) {
              setMarker(land.boat.x, land.boat.z, true);
              state.waitTimer -= dt;
              const distance = Math.hypot(player.pos.x - land.boat.x, player.pos.z - land.boat.z);
              if (distance < 9) {
                if (player.car) {
                  setObjective('Leave the car — step onto the boat');
                } else {
                  api.next();
                }
              } else {
                setObjective(`Fight through to the boat — ${Math.round(distance)} m`);
              }
            },
            onTimeout(api) { api.fail('Rourke got to the water first.'); },
          },
        ];
      },
      outro: [
        { who: CAST.mateo, text: 'Ledger is in the bilge and Rourke is swimming. The harbor is ours, kid.' },
        { who: CAST.rae, text: 'The harbor was always ours. You just stopped noticing.' },
      ],
      reward: 2500,
    },
  ];

  let api = null;

  function startStep() {
    state.stepTimer = 0;
    const step = state.steps[state.step];
    if (!step) return;
    state.timer = step.timeLimit ?? 0;
    if (step.enter) step.enter();
    else setObjective(step.text);
  }

  function nextStep(payload) {
    state.step += 1;
    if (state.step >= state.steps.length) {
      completeMission();
      return;
    }
    startStep();
    if (payload?.rival) state.rival = payload.rival;
  }

  function begin(index) {
    if (index < 0 || index >= MISSIONS.length) return;
    cleanupActors();
    marker.group.visible = false;
    state.index = index;
    state.step = 0;
    state.active = true;
    state.failed = null;
    state.epilogue = false;
    state.completeTimer = 0;
    state.kills = 0;
    player.wanted = 0;
    const mission = MISSIONS[index];
    api = {
      next: nextStep,
      fail: failMission,
      take: (action) => false,
      player, vehicles, traffic, police, effects, audio, world,
    };
    state.steps = mission.build(api);
    say(mission.intro);
    setObjective(mission.title);
    player.orbitYaw = player.heading;
    audio.resume();
    startStep();
    if (callbacks.onObjective) callbacks.onObjective(mission.title);
  }

  function failMission(reason) {
    if (!state.active || state.failed) return;
    state.failed = { reason, timer: 0 };
    audio.missionSting(false);
    toast(reason);
  }

  function completeMission() {
    const mission = MISSIONS[state.index];
    setMarker(0, 0, false);
    state.active = false;
    player.wanted = 0;
    police.clear();
    player.addCash(mission.reward);
    state.completeTimer = 0;
    audio.missionSting(true);
    toast(`${mission.title} COMPLETE  +$${mission.reward}`);
    if (callbacks.onSave) callbacks.onSave();
    say(mission.outro);
    if (state.index >= MISSIONS.length - 1) {
      state.epilogue = true;
      if (callbacks.onComplete) callbacks.onComplete();
    } else {
      state.waitTimer = 6;
    }
  }

  function retry() {
    if (state.index < 0) return;
    const index = state.index;
    state.failed = null;
    cleanupActors();
    police.clear();
    player.health = player.maxHealth;
    player.armor = 0;
    player.pos.set(land.spawn.x, world.surfaceHeight(land.spawn.x, land.spawn.z), land.spawn.z);
    if (player.car) player.exitCar(true);
    begin(index);
  }

  function takeEnter() {
    // Used by the last step to board the boat; also consumed by dialogue.
    return true;
  }

  function update(dt, input) {
    marker.group.visible = state.active && marker.group.visible;
    if (state.active) {
      marker.beam.material.opacity = 0.11 + Math.sin(state.stepTimer * 3) * 0.05;
      marker.ring.scale.setScalar(1 + Math.sin(state.stepTimer * 4) * 0.06);
      marker.arrow.position.y = 4.5 + Math.sin(state.stepTimer * 2) * 0.4;
    }
    if (state.dialogue) {
      state.dialogue.timer += dt;
      const line = state.dialogue.lines[state.dialogue.index];
      const length = line ? line.text.length : 0;
      if (state.dialogue.timer > 3 + length * 0.045) advanceDialogue();
      if (input && (input.take('confirm') || input.take('enter'))) advanceDialogue();
    }
    if (state.failed) {
      state.failed.timer += dt;
      if (input && input.take('confirm')) retry();
      return;
    }
    if (!state.active) {
      if (state.index >= 0 && state.index < MISSIONS.length - 1 && state.waitTimer > 0 && !state.dialogue) {
        state.waitTimer -= dt;
        if (state.waitTimer <= 0) begin(state.index + 1);
      }
      return;
    }
    state.stepTimer += dt;
    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) {
        const step = state.steps[state.step];
        if (step.onTimeout) step.onTimeout(api);
        else failMission('You ran out of time.');
        return;
      }
    }
    const step = state.steps[state.step];
    if (!step) return;
    step.update(dt, api);
  }

  function getProgress() {
    return { mission: state.index, step: state.step, active: state.active };
  }

  return {
    state, MISSIONS, begin, retry, update, advanceDialogue, failMission, getProgress,
    setMarker, callbacks, say,
    get marker() { return marker; },
    get dialogue() { return state.dialogue; },
    get objective() { return state.objective; },
    get active() { return state.active; },
    get epilogue() { return state.epilogue; },
    takeEnter,
  };
}
