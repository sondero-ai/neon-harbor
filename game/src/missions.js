// The Solano story: five missions, their markers, dialogue, enemies and the
// fail/retry loop. Everything here is built from the city's own systems — the
// player's hitscan asks missions.js for enemy hits, police handle the heat and
// the wasted/busted flow, vehicles.js supplies the stolen car, effects.js the
// muzzle flash and fire, and hud.js draws the subtitle, objective and progress.

import * as THREE from '../vendor/three.module.js';
import { makeGlowSprite } from './geo.js';
import {
  addBox, buildThugMaterials, distance2, makeFlameTexture, Thug,
} from './missions-actor.js';
import {
  MOTOR_SHOP, PIER_HEIST_CRATES, PIER_HEIST_SPAWNS, SAFEHOUSE, STORY,
} from './missions-data.js';
import {
  poseAim as poseAimModule,
  prepareShot as prepareShotModule,
  stageHeistShot as stageHeistShotModule,
  stageMissionShot as stageMissionShotModule,
  stageShot as stageShotModule,
  stageShotDrama as stageShotDramaModule,
} from './missions-shots.js';

const CORAL = 0xff6f61;
const GOLD = 0xffc95c;
const TEAL = 0x3fe0cf;

const TRIGGER_RADIUS = 3.3;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pad2 = (value) => String(value).padStart(2, '0');

function raySphere(origin, direction, cx, cy, cz, radius) {
  const ox = origin.x - cx;
  const oy = origin.y - cy;
  const oz = origin.z - cz;
  const half = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = half * half - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = -half - root;
  const far = -half + root;
  if (near > 0.05) return near;
  if (far > 0.05) return far;
  return null;
}


export const MISSION_COUNT = STORY.length;

export function missionName(index) {
  return STORY[clamp(Math.round(index), 0, STORY.length - 1)]?.title ?? 'The Solano Story';
}

export function missionLabel(index, storyDone = false) {
  if (storyDone || index >= STORY.length) return 'Story complete';
  return `Mission ${index + 1}/${STORY.length} · ${STORY[index].title}`;
}

export class Missions {
  constructor(scene, world, vehicles, police, player, effects, audio, options = {}) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.police = police;
    this.player = player;
    this.effects = effects;
    this.audio = audio;
    this.camera = options.camera ?? null;
    this.onToast = options.onToast ?? (() => {});
    this.onReward = options.onReward ?? (() => {});
    this.onComplete = options.onComplete ?? (() => {});
    this.onStoryComplete = options.onStoryComplete ?? (() => {});
    this.onFail = options.onFail ?? (() => {});
    this.onHumanDeath = null;

    this.index = 0;
    this.storyDone = false;
    this.active = null;
    this.failure = null;
    this.subtitle = null;
    this.subtitleGap = 0;
    this.queue = [];
    this.enemies = [];
    this.missionCars = [];
    this.props = new THREE.Group();
    this.props.name = 'mission-props';
    scene.add(this.props);
    this.fireSpots = [];
    this.time = 0;
    this.staged = false;
    this.suspended = false;
    this.startCooldown = 0;
    this.retryGrace = 0;
    this.materials = buildThugMaterials();
    this.flameTexture = makeFlameTexture();
    // Read-only staging data for the E2E suite: every point must stay clear of
    // the pier's solid props.
    this.pierHeist = { crates: PIER_HEIST_CRATES, spawns: PIER_HEIST_SPAWNS };
    this.objective = null;
    this.setIdleObjective();
  }

  // ---------------------------------------------------------------- progress

  reset(progress = {}) {
    this.clearMissionEntities();
    this.clearProps();
    this.clearFire();
    this.active = null;
    this.failure = null;
    this.subtitle = null;
    this.subtitleGap = 0;
    this.queue.length = 0;
    this.staged = false;
    this.suspended = false;
    this.startCooldown = 0;
    this.retryGrace = 0;
    this.index = clamp(Math.round(Number(progress.index) || 0), 0, STORY.length);
    this.storyDone = progress.storyDone === true || this.index >= STORY.length;
    if (this.storyDone) this.index = STORY.length;
    this.player.mission = this.index;
    this.setIdleObjective();
  }

  prepareShot() {
    prepareShotModule(this);
  }

  setIdleObjective() {
    if (this.storyDone) {
      this.objective = {
        title: 'The Harbor Is Yours',
        sub: 'Free roam · cash stashes · hot cars · heat runs · safehouse saves',
        marker: { x: SAFEHOUSE.x, z: SAFEHOUSE.z },
        tag: 'STORY COMPLETE · FREE ROAM',
      };
    } else {
      const def = STORY[this.index] ?? STORY[STORY.length - 1];
      this.objective = {
        title: def.idleTitle,
        sub: def.idleSub,
        marker: { x: def.start.x, z: def.start.z },
        tag: `STORY · MISSION ${pad2(this.index + 1)} OF ${pad2(STORY.length)}`,
      };
    }
    this.world.setObjectiveMarker(this.objective.marker.x, this.objective.marker.z);
  }

  // Presentation metadata for the top-left mission card. This reads the live
  // mission phase, objective and kill count; it never drives mission logic.
  get hudCard() {
    const active = this.active;
    const def = active?.def ?? STORY[Math.min(this.index, STORY.length - 1)];
    const chapter = Math.min((active?.index ?? this.index) + 1, STORY.length);
    let stage = 1;
    let next = 'Walk into the coral marker to start';
    if (this.failure) {
      next = 'Walk back into the marker or press Enter';
    } else if (active) {
      if (active.index === 0) {
        stage = active.phase === 0 ? 1 : 2;
        next = active.phase === 0 ? 'Reach the Vela at the Sunset Hotel' : 'Deliver it to Motor Row';
      } else if (active.index === 1) {
        stage = active.phase === 0 ? 2 : 3;
        next = active.phase === 0 ? 'Break line of sight' : 'Reach the safehouse';
      } else if (active.index === 2) {
        stage = active.phase === 0 ? 1 : 2;
        next = active.phase === 0 ? 'Casa Luna, behind the bar' : 'Tomas at Luna Plaza';
      } else if (active.index === 3) {
        const ratio = active.kills / Math.max(1, active.needed);
        stage = Math.min(3, 1 + Math.floor(ratio * 3));
        next = 'Put Tomas down';
      } else if (active.index === 4) {
        if (active.phase === 1) {
          stage = 3;
          next = 'Get off the pier';
        } else {
          const ratio = active.kills / Math.max(1, active.needed);
          stage = Math.min(2, 1 + Math.floor(ratio * 2));
          next = 'Push to Aurelio';
        }
      }
    } else if (this.storyDone) {
      stage = 4;
      next = 'Free roam is open · cash, cars, heat';
    }
    return {
      chapter: `CH.${chapter}`,
      operation: (def.operation ?? 'THE SOLANO STORY').toUpperCase(),
      title: (def.title ?? 'The Solano Story').toUpperCase(),
      objective: (this.objective?.title ?? def.idleTitle).toUpperCase(),
      objectiveSub: this.objective?.sub ?? def.idleSub,
      stage,
      stages: 4,
      next: next.toUpperCase(),
      story: `SOLANO STORY · ${String(chapter).padStart(2, '0')}/05`,
      failed: Boolean(this.failure),
      complete: this.storyDone,
    };
  }

  setObjective({ title, sub, marker, progress = null, timer = null }) {
    const def = this.active?.def;
    this.objective = {
      title,
      sub,
      marker: marker ?? { x: this.player.position.x, z: this.player.position.z },
      tag: def ? `MISSION ${pad2(def.index + 1)} · ${def.title.toUpperCase()}` : this.objective?.tag,
      progress,
      timer,
    };
    this.world.setObjectiveMarker(this.objective.marker.x, this.objective.marker.z);
    if (this.active) {
      this.active.marker = this.objective.marker;
      this.active.markerKey = `${this.objective.marker.x.toFixed(1)},${this.objective.marker.z.toFixed(1)}`;
    }
  }

  updateMarkerPosition(x, z) {
    if (!this.objective) return;
    const marker = this.objective.marker;
    if (!marker) return;
    if (Math.abs(marker.x - x) < 0.15 && Math.abs(marker.z - z) < 0.15) return;
    marker.x = x;
    marker.z = z;
    this.world.setObjectiveMarker(x, z);
  }

  // ---------------------------------------------------------------- dialogue

  say(speaker, text, duration = null) {
    const length = duration ?? clamp(1.9 + text.length * 0.043, 2.4, 6.2);
    this.queue.push({ speaker, text, duration: length });
  }

  sayLines(lines) {
    for (const [speaker, text] of lines ?? []) this.say(speaker, text);
  }

  updateSubtitle(dt) {
    if (this.subtitle) {
      this.subtitle.life -= dt;
      if (this.subtitle.life <= 0) {
        this.subtitle = null;
        this.subtitleGap = 0.24;
      }
      return;
    }
    if (this.subtitleGap > 0) {
      this.subtitleGap -= dt;
      return;
    }
    const next = this.queue.shift();
    if (next) this.subtitle = { ...next, life: next.duration };
  }

  // ---------------------------------------------------------------- start / fail / retry

  update(dt, input) {
    this.time += dt;
    this.startCooldown = Math.max(0, this.startCooldown - dt);
    this.retryGrace = Math.max(0, this.retryGrace - dt);
    this.updateSubtitle(dt);
    this.updateFire(dt);
    if (this.suspended) return;

    if (!this.active) {
      if (this.failure) {
        if (!this.player.dead && input?.wasPressed('Enter', 'NumpadEnter', 'Numpad5')) {
          this.retry();
          return;
        }
        if (!this.player.dead && !this.player.driving && this.retryGrace <= 0) {
          const target = this.failure.start;
          if (distance2(this.player.position.x, this.player.position.z, target.x, target.z) < TRIGGER_RADIUS) {
            this.retry();
          }
        }
        return;
      }
      if (this.storyDone || this.startCooldown > 0 || this.player.dead || this.player.driving) return;
      const def = STORY[this.index];
      if (!def) return;
      if (distance2(this.player.position.x, this.player.position.z, def.start.x, def.start.z) < TRIGGER_RADIUS) {
        this.begin(this.index);
      }
      return;
    }

    if (this.player.dead) {
      this.fail('You went down before the job was done.');
      return;
    }
    this.updateMission(dt);
  }

  begin(index) {
    const def = STORY[index];
    if (!def) return;
    this.clearMissionEntities();
    this.clearProps();
    this.clearFire();
    this.failure = null;
    this.subtitle = null;
    this.subtitleGap = 0;
    this.queue.length = 0;
    this.police.clearWanted({ quiet: true });
    this.active = {
      index,
      def: { ...def, index },
      phase: 0,
      timer: 0,
      kills: 0,
      needed: 0,
      marker: null,
      clearTimer: null,
      car: null,
      carRing: null,
      caseProp: null,
      caseGlow: null,
      caseCarry: null,
      pickup: false,
      heatCleared: false,
    };
    this.player.mission = index;
    this.startCooldown = 0;
    this.audio.missionStart();
    this.onToast({ title: def.title, sub: 'MISSION STARTED', life: 3.2 });
    this.sayLines(def.intro);

    if (index === 0) this.setupRiptide();
    else if (index === 1) this.setupHeat();
    else if (index === 2) this.setupDelivery();
    else if (index === 3) this.setupBetrayal();
    else if (index === 4) this.setupPier();
  }

  setupRiptide() {
    const car = this.vehicles.spawn('sports', {
      x: 54,
      z: 71.8,
      yaw: Math.PI / 2,
      color: 0xff6f61,
    });
    car.setDriver(null);
    car.controls.brake = 1;
    this.missionCars.push(car);
    this.active.car = car;
    this.active.carRing = this.attachRing(car, GOLD, 2.9);
    this.setObjective({
      title: 'Steal the Vela GT',
      sub: 'Sunset Hotel forecourt. The keys are already in it.',
      marker: { x: car.position.x, z: car.position.z },
    });
  }

  setupHeat() {
    this.police.setWanted(3, { silent: true });
    this.audio.setSiren(0.2, 0);
    this.onToast({ title: 'Harbor PD Alert', sub: 'WANTED LEVEL 3 · LOSE THE TAIL', life: 3.8 });
    this.setObjective({
      title: 'Lose the Harbor PD',
      sub: 'Break line of sight. The stars have to go out.',
      marker: { x: SAFEHOUSE.x, z: SAFEHOUSE.z },
      progress: { label: 'WANTED', value: 3, max: 5 },
    });
  }

  setupDelivery() {
    this.active.timer = 108;
    const ring = new THREE.Group();
    ring.position.set(-90, this.world.groundHeightAt(-90, 54), 54);
    ring.add(this.makeGroundRing(GOLD, 1.15));
    const glow = makeGlowSprite(GOLD, 4.2, 0.5);
    glow.position.y = 0.9;
    ring.add(glow);
    const briefcase = new THREE.Group();
    addBox(briefcase, 0.62, 0.42, 0.22, this.materials.case, 0, 0, 0);
    briefcase.add(addBoxPanels(this.materials));
    addBox(briefcase, 0.68, 0.055, 0.26, this.materials.caseTrim, 0, 0.22, 0);
    briefcase.position.y = 0.92;
    ring.add(briefcase);
    this.props.add(ring);
    this.active.caseProp = ring;
    this.active.caseGlow = glow;
    this.active.caseSpin = briefcase;
    this.setObjective({
      title: 'Pick up the ledger',
      sub: 'Casa Luna, behind the bar. On foot. Do not open it.',
      marker: { x: -90, z: 54 },
      timer: this.active.timer,
    });
  }

  setupBetrayal() {
    this.player.health = Math.max(this.player.health, 100);
    this.player.armor = Math.max(this.player.armor, 55);
    this.player.grantWeapon('smg', 96);
    this.player.weapons.smg.reserve = Math.max(this.player.weapons.smg.reserve, 64);
    this.player.selectWeapon('smg');
    this.addCrate(-6.4, 11.6, 1.2);
    this.addCrate(6.8, 11.2, 1.15);
    this.addCrate(-7.8, 7.4, 0.9);
    this.addCrate(8.2, 6.6, 1.0);
    const spawns = [
      { x: 0, z: 10.1, health: 205, boss: true, name: 'Tomas', damage: 11, speed: 2.2 },
      { x: -5.4, z: 9.7, health: 105 },
      { x: 5.5, z: 9.4, health: 105 },
      { x: -2.9, z: 12.7, health: 105 },
      { x: 3.6, z: 13.1, health: 105 },
    ];
    for (const spec of spawns) this.enemies.push(new Thug(this.scene, this.world, this.materials, spec, this.enemies.length));
    this.active.needed = this.enemies.length;
    this.setObjective({
      title: 'Survive the Ambush',
      sub: 'Tomas and his crew have the fountain covered. Put them down.',
      marker: { x: 0, z: 10.1 },
      progress: { label: 'CREW', value: 0, max: this.active.needed },
    });
  }

  setupPier() {
    this.player.health = Math.max(this.player.health, 100);
    this.player.armor = Math.max(this.player.armor, 75);
    this.player.grantWeapon('smg', 160);
    this.player.weapons.smg.reserve = Math.max(this.player.weapons.smg.reserve, 96);
    this.player.selectWeapon('smg');
    for (const [x, z, scale] of PIER_HEIST_CRATES) this.addCrate(x, z, scale);
    for (const spec of PIER_HEIST_SPAWNS) this.enemies.push(new Thug(this.scene, this.world, this.materials, spec, this.enemies.length));
    this.active.needed = this.enemies.length;
    this.setObjective({
      title: 'Clear Pier 9',
      sub: 'Aurelio has the whole deck. Work west. Do not stop moving.',
      marker: { x: -254, z: 70 },
      progress: { label: 'ENFORCERS', value: 0, max: this.active.needed },
    });
  }

  updateMission(dt) {
    const active = this.active;
    const player = this.player;

    for (const enemy of [...this.enemies]) {
      if (enemy.removed) continue;
      enemy.update(dt, player, this);
    }

    if (active.index === 0) {
      const car = active.car;
      if (!car || car.removed) {
        this.fail('The Vela is wrecked. Mira is going to take this out of your pay.');
        return;
      }
      this.updateMarkerPosition(car.position.x, car.position.z);
      if (active.carRing) {
        active.carRing.position.set(car.position.x, this.world.groundHeightAt(car.position.x, car.position.z) + 0.03, car.position.z);
        active.carRing.rotation.y += dt * 0.7;
      }
      if (active.phase === 0 && player.driving === car) {
        active.phase = 1;
        this.audio.uiClick();
        this.say('RAE', 'Hello, beautiful.');
        this.say('MIRA', 'Do not talk to the car. Drive it.');
        this.setObjective({
          title: 'Deliver the Vela to Motor Row',
          sub: 'Mira’s bay is behind the shop. Do not stop for the police.',
          marker: { x: MOTOR_SHOP.x, z: MOTOR_SHOP.z },
        });
      }
      if (active.phase === 1) {
        this.updateMarkerPosition(MOTOR_SHOP.x, MOTOR_SHOP.z);
        if (player.driving === car && distance2(car.position.x, car.position.z, MOTOR_SHOP.x, MOTOR_SHOP.z) < 9.5) {
          this.complete();
        }
      }
      return;
    }

    if (active.index === 1) {
      if (active.phase === 0) {
        this.objective.progress = { label: 'WANTED', value: this.police.wanted, max: 5 };
        if (this.police.wanted === 0) {
          active.phase = 1;
          this.say('MIRA', 'Stars are out. Get to the safehouse before someone else finds you.');
          this.setObjective({
            title: 'Reach the safehouse',
            sub: 'The green door on the Vega Strip. Keep your head down.',
            marker: { x: SAFEHOUSE.x, z: SAFEHOUSE.z },
          });
        }
      } else if (distance2(player.position.x, player.position.z, SAFEHOUSE.x, SAFEHOUSE.z) < 5.0) {
        this.complete();
      }
      return;
    }

    if (active.index === 2) {
      active.timer = Math.max(0, active.timer - dt);
      if (this.objective) this.objective.timer = active.timer;
      if (active.timer <= 0) {
        this.fail('The drop window closed. The bar’s back room is talking.');
        return;
      }
      if (active.caseProp) {
        active.caseProp.rotation.y += dt * 0.9;
        if (active.caseGlow) active.caseGlow.material.opacity = 0.32 + Math.sin(this.time * 3.1) * 0.18;
        if (active.caseSpin) active.caseSpin.position.y = 0.92 + Math.sin(this.time * 2.2) * 0.08;
      }
      if (!active.pickup) {
        if (!player.driving && distance2(player.position.x, player.position.z, -90, 54) < 2.6) {
          active.pickup = true;
          if (active.caseProp) active.caseProp.visible = false;
          this.audio.pickup();
          this.onToast({ title: 'Ledger Secured', sub: 'DELIVER IT TO TOMAS · LUNA PLAZA', life: 3.0 });
          active.caseCarry = this.attachCaseToPlayer();
          this.say('RAE', 'A hundred kilos of paper and bad intentions.');
          active.phase = 1;
          this.setObjective({
            title: 'Deliver the ledger to Tomas',
            sub: 'Luna Plaza fountain. Keep the case closed.',
            marker: { x: 0, z: 12.8 },
            timer: active.timer,
          });
        }
      } else {
        if (active.caseCarry) active.caseCarry.visible = !player.driving;
        if (distance2(player.position.x, player.position.z, 0, 12.8) < 4.4) {
          this.complete();
        }
      }
      return;
    }

    if (active.index === 3 || active.index === 4) {
      const progress = this.objective.progress;
      if (progress) progress.value = active.kills;
      if (active.index === 4 && active.phase === 0) {
        const boss = this.enemies.find((enemy) => enemy.name === 'Aurelio');
        if (boss && !boss.dead) this.updateMarkerPosition(boss.x, boss.z);
      }
      if (active.phase === 0 && active.kills >= active.needed) {
        if (active.clearTimer === null) active.clearTimer = 1.35;
        active.clearTimer -= dt;
        if (active.clearTimer <= 0) {
          if (active.index === 3) this.complete();
          else this.startEscape();
        }
      }
      if (active.index === 4 && active.phase === 1) {
        this.updateMarkerPosition(-160, 70);
        if (distance2(player.position.x, player.position.z, -160, 70) < 8.0) this.complete();
      }
      return;
    }
  }

  startEscape() {
    const active = this.active;
    active.phase = 1;
    this.spawnPierFire();
    this.say('RAE', 'Burn it. I am done carrying other people’s debts.');
    this.say('MIRA', 'The ramp is still clear. Move, Rae.');
    this.setObjective({
      title: 'Escape the Pier',
      sub: 'Get off the deck before the fire reaches the fuel line.',
      marker: { x: -160, z: 70 },
    });
    this.audio.explosion();
    this.effects?.explosion(-244, this.world.groundHeightAt(-244, 70) + 1.2, 70);
    this.onToast({ title: 'The Pier Is Burning', sub: 'GET OFF THE DECK · HEAD EAST', life: 3.2 });
  }

  complete() {
    const active = this.active;
    if (!active) return;
    const def = active.def;
    const reward = def.reward;
    this.player.cash += reward;
    this.player.mission = def.index + 1;
    this.index = Math.min(STORY.length, def.index + 1);
    this.storyDone = this.index >= STORY.length;
    // The delivered car is the player's ride now; keep it in the world.
    if (this.active.car) this.missionCars = this.missionCars.filter((car) => car !== this.active.car);
    this.clearMissionEntities();
    if (this.active.caseCarry) this.active.caseCarry.visible = false;
    this.active = null;
    this.failure = null;
    this.audio.missionComplete();
    this.onReward(reward, 'MISSION COMPLETE');
    this.onToast({
      title: 'Mission Complete',
      sub: `${def.title.toUpperCase()} · $${reward.toLocaleString('en-US')}`,
      life: 4.2,
    });
    this.sayLines(def.outro);
    if (this.storyDone) {
      this.onStoryComplete();
      this.setIdleObjective();
      this.say('MIRA', 'Come home, Rae. The city can wait until morning.');
    } else {
      this.setIdleObjective();
    }
    this.startCooldown = 3.5;
    this.onComplete(this.index, this.storyDone);
  }

  fail(reason) {
    if (!this.active || this.failure) return;
    const def = this.active.def;
    this.clearMissionEntities();
    this.failure = {
      reason,
      title: def.title,
      index: def.index,
      start: { x: def.start.x, z: def.start.z },
    };
    this.active = null;
    this.queue.length = 0;
    this.subtitle = null;
    this.audio.missionFail();
    this.objective = {
      title: `Retry · ${def.title}`,
      sub: 'Press Enter or walk back into the marker.',
      marker: { x: def.start.x, z: def.start.z },
      tag: `MISSION ${pad2(def.index + 1)} FAILED`,
      failed: true,
    };
    this.world.setObjectiveMarker(def.start.x, def.start.z);
    this.retryGrace = 0.8;
    this.onFail(this.failure);
  }

  retry() {
    if (!this.failure) return;
    const index = this.failure.index;
    const def = STORY[index];
    if (this.player.driving) {
      const car = this.player.driving;
      this.player.driving = null;
      this.player.group.visible = true;
      car.driver = null;
      car.setDriver(null);
      car.controls.brake = 1;
      car.controls.handbrake = true;
      this.player.velocity.set(0, 0, 0);
    }
    this.player.revive(def.start.x, def.start.z, def.start.facing ?? 0, (def.start.facing ?? 0) + Math.PI);
    this.player.health = 100;
    this.player.armor = 45;
    this.police.clearWanted({ quiet: true });
    this.police.resetAfterDown();
    this.player.updateCamera(this.camera, 0, true);
    this.player.mission = index;
    this.failure = null;
    this.begin(index);
  }

  handleDown(type) {
    if (!this.active) return;
    this.fail(type === 'busted' ? 'Harbor PD put the cuffs on before the job was done.' : 'You went down before the job was done.');
  }

  // ---------------------------------------------------------------- enemy combat

  traceShot(origin, direction, maxDistance) {
    let best = null;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.removed) continue;
      const chest = raySphere(origin, direction, enemy.x, enemy.chestY, enemy.z, 0.5);
      const head = raySphere(origin, direction, enemy.x, enemy.headY, enemy.z, 0.26);
      let distance = null;
      let headshot = false;
      if (head !== null && (chest === null || head <= chest)) {
        distance = head;
        headshot = true;
      } else if (chest !== null) {
        distance = chest;
      }
      if (distance === null || distance > maxDistance) continue;
      if (!best || distance < best.distance) {
        best = {
          type: 'enemy',
          enemy,
          headshot,
          distance,
          point: new THREE.Vector3(
            origin.x + direction.x * distance,
            origin.y + direction.y * distance,
            origin.z + direction.z * distance,
          ),
        };
      }
    }
    return best;
  }

  applyPlayerHit(target, damage, { weapon = 'pistol' } = {}) {
    const enemy = target?.enemy;
    if (!enemy || enemy.dead || enemy.removed) return;
    const amount = damage * (target.headshot ? 1.7 : 1);
    enemy.health -= amount;
    enemy.hitFlash = 0.22;
    this.player.hitMarker = 1;
    // QA hits (and any future point-less target) still kill and loot; only the
    // cosmetic impact needs a world point.
    if (this.effects && target.point) {
      this.effects.impact(target.point, null, 'metal');
      this.effects.flash(target.point.x, target.point.y, target.point.z, { color: 0xffb36e, scale: 0.55, life: 0.09, grow: 1.4 });
    }
    if (this.audio) this.audio.impact(0.65);
    if (enemy.health <= 0) this.killEnemy(enemy, target.point);
  }

  killEnemy(enemy, point) {
    if (enemy.dead) return;
    enemy.dead = true;
    enemy.deadTimer = 0;
    enemy.los = false;
    this.onHumanDeath?.(enemy.x, enemy.z, enemy.boss ? { cashMin: 150, cashMax: 150 } : { cashMin: 40, cashMax: 120 });
    if (this.effects && point) {
      this.effects.flash(point.x, point.y, point.z, { color: 0xff8d5e, scale: 1.7, life: 0.2, grow: 2.6 });
      this.effects.spark(point.x, point.y, point.z, null, 0xffb064, 8, 4.2);
    }
    if (this.audio) this.audio.impact(1.15);
    if (this.active) {
      this.active.kills += 1;
      if (enemy.boss) {
        this.say(enemy.name.toUpperCase(), enemy.name === 'Tomas' ? 'You always were faster, cousin.' : 'The harbor… is yours.', 3.2);
        this.onToast({ title: `${enemy.name} Down`, sub: 'THE CREW IS BREAKING', life: 2.8 });
      }
    }
  }

  enemyShoot(enemy, player) {
    const muzzle = enemy.muzzle();
    const target = new THREE.Vector3(
      player.position.x + (Math.random() - 0.5) * 1.5,
      player.position.y + 1.12,
      player.position.z + (Math.random() - 0.5) * 1.5,
    );
    const direction = target.clone().sub(muzzle).normalize();
    const hitChance = enemy.boss ? 0.6 : 0.48;
    const hit = Math.random() < hitChance;
    const endpoint = new THREE.Vector3();
    if (hit) {
      endpoint.set(player.position.x, player.position.y + 1.05, player.position.z);
      this.police.damagePlayer(enemy.damage * (0.78 + Math.random() * 0.5), enemy.x, enemy.z, 'enemy');
    } else {
      endpoint.copy(muzzle).addScaledVector(direction, 26);
    }
    if (this.effects) {
      this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd08a);
      this.effects.tracer(muzzle, endpoint, 0xffbd7a);
    }
    if (this.audio) this.audio.gunshot(enemy.boss ? 'smg' : 'pistol');
  }

  // ---------------------------------------------------------------- world dressing

  attachRing(car, color, radius) {
    const group = new THREE.Group();
    group.add(this.makeGroundRing(color, radius));
    this.props.add(group);
    return group;
  }

  makeGroundRing(color, radius = 1.3) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius, 30), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    return ring;
  }

  addCrate(x, z, scale = 1) {
    const ground = this.world.groundHeightAt(x, z);
    const crate = new THREE.Group();
    crate.position.set(x, ground, z);
    crate.rotation.y = (x * 1.7 + z * 0.9) % Math.PI;
    addBox(crate, 1.05 * scale, 0.86 * scale, 1.05 * scale, this.materials.crate, 0, 0.43 * scale, 0);
    addBox(crate, 1.1 * scale, 0.08 * scale, 1.1 * scale, this.materials.crateEdge, 0, 0.84 * scale, 0);
    addBox(crate, 1.1 * scale, 0.08 * scale, 0.1 * scale, this.materials.crateEdge, 0, 0.5 * scale, 0.55 * scale);
    addBox(crate, 0.1 * scale, 0.08 * scale, 1.1 * scale, this.materials.crateEdge, 0.55 * scale, 0.5 * scale, 0);
    this.props.add(crate);
    return crate;
  }

  attachCaseToPlayer() {
    const group = new THREE.Group();
    addBox(group, 0.42, 0.3, 0.15, this.materials.case, 0, 0, 0);
    addBox(group, 0.46, 0.04, 0.18, this.materials.caseTrim, 0, 0.16, 0);
    group.position.set(-0.21, 0.82, 0.16);
    group.rotation.z = 0.12;
    this.player.group.add(group);
    return group;
  }

  spawnPierFire() {
    const spots = [
      [-196, 66], [-214, 76], [-234, 64], [-248, 76], [-258, 68],
    ];
    for (const [x, z] of spots) this.addFireSpot(x, z);
    for (const [x, z] of spots) {
      this.effects?.smokePuff(x, this.world.groundHeightAt(x, z) + 1.2, z, { scale: 3.4, life: 3.2, color: 0x554b4e, rise: 1.7 });
    }
  }

  addFireSpot(x, z) {
    const ground = this.world.groundHeightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, ground, z);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.48, 0.9, 10),
      this.materials.crateEdge,
    );
    barrel.position.y = 0.45;
    barrel.castShadow = true;
    group.add(barrel);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.07, 10),
      this.materials.dark,
    );
    rim.position.y = 0.9;
    group.add(rim);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flameTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.94,
    }));
    flame.center.set(0.5, 0.035);
    flame.position.set(0.03, 0.8, 0);
    flame.scale.set(1.55, 2.75, 1);
    group.add(flame);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flameTexture,
      color: 0xffe6b0,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.72,
    }));
    core.center.set(0.5, 0.035);
    core.position.set(-0.14, 0.78, 0.08);
    core.scale.set(0.82, 1.65, 1);
    group.add(core);
    const glow = makeGlowSprite(0xff7a3c, 3.6, 0.2);
    glow.position.y = 1.4;
    group.add(glow);
    this.props.add(group);
    this.fireSpots.push({ x, z, group, flame, core, glow, phase: Math.random() * 6.28, smoke: Math.random() });
  }

  updateFire(dt) {
    for (const fire of this.fireSpots) {
      fire.phase += dt * 7.2;
      const flicker = 0.5 + Math.sin(fire.phase) * 0.25 + Math.sin(fire.phase * 2.3 + 1.4) * 0.16;
      const lean = Math.sin(fire.phase * 1.7) * 0.07;
      fire.flame.scale.set(1.42 + flicker * 0.36, 2.35 + flicker * 0.7, 1);
      fire.flame.material.rotation = lean;
      fire.flame.material.opacity = 0.82 + flicker * 0.16;
      fire.core.scale.set(0.72 + flicker * 0.24, 1.4 + flicker * 0.42, 1);
      fire.core.material.rotation = -lean * 1.5;
      fire.glow.material.opacity = 0.16 + flicker * 0.12;
      fire.smoke -= dt;
      if (fire.smoke <= 0 && this.effects) {
        fire.smoke = 0.48 + Math.random() * 0.3;
        this.effects.smokePuff(fire.x, this.world.groundHeightAt(fire.x, fire.z) + 1.4, fire.z, {
          scale: 2.5,
          life: 2.4,
          color: 0x443a3d,
          rise: 1.5,
        });
      }
    }
  }

  clearFire() {
    for (const fire of this.fireSpots) fire.group.removeFromParent();
    this.fireSpots.length = 0;
  }

  clearProps() {
    for (const child of [...this.props.children]) {
      child.removeFromParent();
      child.traverse((object) => {
        if (object.isMesh) object.geometry?.dispose();
      });
    }
    this.props.clear();
  }

  clearMissionEntities() {
    for (const enemy of this.enemies) {
      if (!enemy.removed) enemy.remove();
    }
    this.enemies.length = 0;
    for (const car of this.missionCars) {
      if (this.player.driving === car) {
        this.player.driving = null;
        this.player.group.visible = true;
      }
      if (!car.removed) this.vehicles.remove(car);
    }
    this.missionCars.length = 0;
    if (this.active?.carRing) this.active.carRing.removeFromParent();
    if (this.active?.caseProp) this.active.caseProp.removeFromParent();
    if (this.active?.caseCarry) {
      this.active.caseCarry.removeFromParent();
      this.active.caseCarry = null;
    }
  }

  // ---------------------------------------------------------------- debug staging

  // QA-only: place one enemy without starting a mission, so the E2E tool can
  // pin mission-enemy and boss drops. Nothing in the game calls this.
  spawnStagedEnemy(x, z, { boss = false, health = null, name = null } = {}) {
    const spec = {
      x,
      z,
      boss,
      name: name ?? (boss ? 'Staged Boss' : 'Staged Crew'),
      health: health ?? (boss ? 280 : 105),
      damage: boss ? 13 : 7,
      speed: boss ? 2.2 : 2.7,
    };
    const enemy = new Thug(this.scene, this.world, this.materials, spec, this.enemies.length);
    this.enemies.push(enemy);
    return enemy;
  }


  // ---------------------------------------------------------------- deterministic shots

  stageShot(name) {
    stageShotModule(this, name);
  }

  stageMissionShot() {
    stageMissionShotModule(this);
  }

  stageHeistShot() {
    stageHeistShotModule(this);
  }

  poseAim(enemy) {
    poseAimModule(this, enemy);
  }

  stageShotDrama(name) {
    stageShotDramaModule(this, name);
  }
}

function addBoxPanels(materials) {
  const group = new THREE.Group();
  addBox(group, 0.26, 0.06, 0.235, materials.caseTrim, 0, -0.1, 0);
  return group;
}
