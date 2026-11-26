// The Solano story: five missions, their markers, dialogue, enemies and the
// fail/retry loop. Everything here is built from the city's own systems — the
// player's hitscan asks missions.js for enemy hits, police handle the heat and
// the wasted/busted flow, vehicles.js supplies the stolen car, effects.js the
// muzzle flash and fire, and hud.js draws the subtitle, objective and progress.

import * as THREE from '../vendor/three.module.js';
import { makeGlowSprite } from './geo.js';

const CORAL = 0xff6f61;
const GOLD = 0xffc95c;
const TEAL = 0x3fe0cf;

const TRIGGER_RADIUS = 3.3;
const SAFEHOUSE = { x: -71.5, z: 36.6 };
const MOTOR_SHOP = { x: 162, z: 18.2 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pad2 = (value) => String(value).padStart(2, '0');
const distance2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

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

// The five story beats. Positions are on the street: a marker is where the
// player meets the job, not a trigger that teleports anyone.
const STORY = [
  {
    key: 'riptide',
    title: 'The Riptide Job',
    operation: 'DOCK RUN',
    start: { x: -72, z: 26.2, facing: -Math.PI / 2 },
    reward: 1200,
    idleTitle: 'Meet Mira on the Strip',
    idleSub: 'A courier job on Vega Strip. Walk into the marker.',
    intro: [
      ['MIRA', 'Rae Solano. Back in the harbor and already late.'],
      ['RAE', 'I am not late. The city moved.'],
      ['MIRA', 'There is a Vela GT parked at the Sunset Hotel. Bring it to my bay on Motor Row. Do not scratch it.'],
      ['RAE', 'You are not going to ask how I have been?'],
      ['MIRA', 'I am asking you to steal a car. That is how I say welcome home.'],
    ],
    outro: [
      ['MIRA', 'Clean. The Solanos still know how to steal.'],
      ['RAE', 'The Solanos know how to make a mess look intentional.'],
    ],
  },
  {
    key: 'heat',
    title: 'Heat Check',
    operation: 'STRIP HEAT',
    start: { x: 162, z: 18.2, facing: Math.PI },
    reward: 1800,
    idleTitle: 'Find Mira at the Motor Row bay',
    idleSub: 'The Vela is hot. Mira has a way to cool it.',
    intro: [
      ['MIRA', 'That car had a tracker. Harbor PD is already on the lane.'],
      ['RAE', 'You could have said that before I drove it across the city.'],
      ['MIRA', 'Then it would not have been a test. Lose them. Get to the safehouse clean.'],
      ['RAE', 'And if I cannot?'],
      ['MIRA', 'Then I will need a new courier.'],
    ],
    outro: [
      ['MIRA', 'Stars are out. Maybe you are still good at this.'],
      ['RAE', 'Tell that to the five cruisers behind me.'],
    ],
  },
  {
    key: 'delivery',
    title: 'Special Delivery',
    operation: 'THE LEDGER RUN',
    start: { x: SAFEHOUSE.x - 4.9, z: SAFEHOUSE.z, facing: Math.PI },
    reward: 1500,
    idleTitle: 'Meet Mira at the safehouse',
    idleSub: 'She has a case for you. She will not say what is in it.',
    intro: [
      ['MIRA', 'Casa Luna. The case behind the bar. Do not open it.'],
      ['RAE', 'What is in it?'],
      ['MIRA', 'The reason you came home. Deliver it to Tomas at Luna Plaza. You have a hundred seconds before the bar closes and the back room talks.'],
      ['RAE', 'A courier run. Like the old days.'],
      ['MIRA', 'Exactly like the old days. That is the problem.'],
    ],
    outro: [
      ['TOMAS', 'Little cousin. You are carrying my ledger.'],
      ['RAE', 'Tomas. You look like a man who sold his own family.'],
      ['TOMAS', 'I look like a man who got paid. Meet me at the fountain.'],
    ],
  },
  {
    key: 'betrayal',
    title: 'Family Cut',
    operation: 'LUNA PLAZA',
    start: { x: 0, z: 17.6, facing: Math.PI },
    reward: 2400,
    idleTitle: 'Meet Tomas at Luna Plaza',
    idleSub: 'The fountain. Come armed. Tomas did not say why.',
    intro: [
      ['TOMAS', 'You brought the case. And a conscience. You always did.'],
      ['RAE', 'You sold the crew out, Tomas.'],
      ['TOMAS', 'I sold you. There is a difference. Boys, show her the difference.'],
      ['RAE', 'You should have brought more boys.'],
    ],
    outro: [
      ['AURELIO', 'You just killed my son, Rae.'],
      ['RAE', 'He killed the family first. Tell me where the pier is, Aurelio.'],
      ['AURELIO', 'Pier 9. Come see what your name buys now.'],
    ],
  },
  {
    key: 'pier',
    title: 'Pier 9 Burning',
    operation: 'LAST EXIT',
    start: { x: -168, z: 70, facing: -Math.PI / 2 },
    reward: 6000,
    idleTitle: 'Take the fight to Pier 9',
    idleSub: 'Aurelio Solano is waiting at the end of the pier. End it.',
    intro: [
      ['AURELIO', 'The harbor always collects, Rae. Even from family.'],
      ['RAE', 'Then collect this.'],
      ['MIRA', 'Rae, listen to me. The ledger burns tonight. You do not have to be standing next to it when it does.'],
      ['RAE', 'Yes I do. Keep the engine running.'],
    ],
    outro: [
      ['MIRA', 'The pier is burning. Tell me you are not still on it.'],
      ['RAE', 'The ledger is ash. The harbor is mine.'],
    ],
  },
];

export const MISSION_COUNT = STORY.length;

export function missionName(index) {
  return STORY[clamp(Math.round(index), 0, STORY.length - 1)]?.title ?? 'The Solano Story';
}

export function missionLabel(index, storyDone = false) {
  if (storyDone || index >= STORY.length) return 'Story complete';
  return `Mission ${index + 1}/${STORY.length} · ${STORY[index].title}`;
}

function buildThugMaterials() {
  const jackets = [0x2b2638, 0x3a2928, 0x23342f, 0x352d22, 0x2a2335].map((color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.06 }));
  return {
    jackets,
    pants: new THREE.MeshStandardMaterial({ color: 0x17151f, roughness: 0.9 }),
    shirt: new THREE.MeshStandardMaterial({ color: 0x463b3c, roughness: 0.86 }),
    skin: [0x9c6a50, 0xb87a60, 0x8a5a44, 0x6f4838].map((color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.82 })),
    hair: new THREE.MeshStandardMaterial({ color: 0x19141a, roughness: 0.92 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xd94b52, roughness: 0.55, emissive: 0x2a0709 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5c5966, roughness: 0.36, metalness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x121016, roughness: 0.6, metalness: 0.2 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x6a4c36, roughness: 0.92 }),
    crateEdge: new THREE.MeshStandardMaterial({ color: 0x36251c, roughness: 0.9 }),
    case: new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.5, metalness: 0.35 }),
    caseTrim: new THREE.MeshStandardMaterial({ color: 0xffc95c, roughness: 0.35, metalness: 0.45, emissive: 0x3b2a04 }),
  };
}

function makeFlameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.moveTo(64, 249);
  ctx.bezierCurveTo(18, 226, 30, 184, 41, 150);
  ctx.bezierCurveTo(20, 156, 27, 119, 45, 107);
  ctx.bezierCurveTo(39, 78, 55, 44, 66, 15);
  ctx.bezierCurveTo(73, 57, 96, 72, 94, 106);
  ctx.bezierCurveTo(117, 120, 105, 160, 99, 181);
  ctx.bezierCurveTo(113, 217, 96, 241, 64, 249);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 252, 0, 8);
  gradient.addColorStop(0, 'rgba(255, 244, 186, 0.98)');
  gradient.addColorStop(0.38, 'rgba(255, 197, 63, 0.98)');
  gradient.addColorStop(0.72, 'rgba(255, 92, 18, 0.94)');
  gradient.addColorStop(1, 'rgba(255, 40, 6, 0.72)');
  ctx.shadowColor = 'rgba(255, 114, 24, 0.8)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'source-atop';
  const hot = ctx.createRadialGradient(62, 208, 2, 62, 208, 66);
  hot.addColorStop(0, 'rgba(255, 255, 232, 0.9)');
  hot.addColorStop(0.55, 'rgba(255, 236, 150, 0.34)');
  hot.addColorStop(1, 'rgba(255, 220, 120, 0)');
  ctx.fillStyle = hot;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const lick = ctx.createLinearGradient(0, 120, 0, 20);
  lick.addColorStop(0, 'rgba(255, 100, 18, 0)');
  lick.addColorStop(1, 'rgba(255, 54, 8, 0.55)');
  ctx.fillStyle = lick;
  ctx.fillRect(40, 8, 50, 130);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addBox(parent, width, height, depth, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

class Thug {
  constructor(scene, world, materials, spec, index) {
    this.scene = scene;
    this.world = world;
    this.spec = spec;
    this.index = index;
    this.x = spec.x;
    this.z = spec.z;
    this.y = world.groundHeightAt(spec.x, spec.z);
    this.anchorX = spec.x;
    this.anchorZ = spec.z;
    this.health = spec.health ?? 105;
    this.maxHealth = this.health;
    this.boss = Boolean(spec.boss);
    this.name = spec.name ?? 'Solano Crew';
    this.damage = spec.damage ?? (this.boss ? 12 : 7);
    this.dead = false;
    this.removed = false;
    this.deadTimer = 0;
    this.yaw = spec.yaw ?? 0;
    this.speed = spec.speed ?? (this.boss ? 2.15 : 2.7);
    this.phase = Math.random() * Math.PI * 2;
    this.shootTimer = 0.7 + Math.random() * 1.5;
    this.losTimer = 0;
    this.los = false;
    this.hitFlash = 0;
    this.aim = 0;
    this.walk = 0;
    this.group = new THREE.Group();
    this.group.name = `solano-enforcer-${index}`;
    this.group.position.set(this.x, this.y, this.z);
    scene.add(this.group);
    this.build(materials);
    this.setPose(this.yaw);
    if (spec.dead) {
      this.dead = true;
      this.deadTimer = 1.4;
      this.group.rotation.z = 1.48;
      this.group.position.y = this.y + 0.2;
    }
  }

  build(materials) {
    const jacket = materials.jackets[this.index % materials.jackets.length];
    const skin = materials.skin[this.index % materials.skin.length];
    this.materials = materials;
    const root = this.group;
    addBox(root, 0.38, 0.18, 0.24, materials.pants, 0, 0.92, 0);
    this.torso = new THREE.Group();
    this.torso.position.y = 0.99;
    root.add(this.torso);
    addBox(this.torso, 0.47, 0.55, 0.28, jacket, 0, 0.3, 0);
    addBox(this.torso, 0.5, 0.13, 0.29, materials.pants, 0, 0.55, 0);
    addBox(this.torso, 0.16, 0.3, 0.012, materials.shirt, 0, 0.3, 0.15);
    if (this.boss) {
      addBox(this.torso, 0.12, 0.46, 0.02, materials.accent, 0.12, 0.31, 0.157);
    }
    this.head = new THREE.Group();
    this.head.position.y = 0.73;
    this.torso.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 7), skin);
    neck.position.y = -0.02;
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 9), skin);
    skull.scale.set(0.93, 1.05, 0.92);
    skull.position.y = 0.12;
    skull.castShadow = true;
    this.head.add(skull);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), materials.hair);
    cap.position.y = 0.148;
    cap.castShadow = true;
    this.head.add(cap);
    if (this.boss) addBox(this.head, 0.24, 0.035, 0.05, materials.accent, 0, 0.12, 0.155);

    this.arms = {};
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.29, 0.51, 0);
      this.torso.add(shoulder);
      addBox(shoulder, 0.13, 0.32, 0.15, jacket, 0, -0.15, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -0.31;
      shoulder.add(elbow);
      addBox(elbow, 0.115, 0.28, 0.125, materials.shirt, 0, -0.14, 0);
      this.arms[side === -1 ? 'left' : 'right'] = { shoulder, elbow };
    }
    this.gun = new THREE.Group();
    addBox(this.gun, 0.06, 0.08, 0.34, materials.dark, 0, 0, 0.12);
    addBox(this.gun, 0.05, 0.13, 0.07, materials.dark, 0, -0.08, -0.02);
    this.gun.position.set(0, -0.34, 0.04);
    this.arms.right.elbow.add(this.gun);

    this.legs = {};
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.125, 0.9, 0);
      root.add(hip);
      addBox(hip, 0.16, 0.42, 0.18, materials.pants, 0, -0.21, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      addBox(knee, 0.14, 0.38, 0.16, materials.pants, 0, -0.19, 0);
      addBox(knee, 0.17, 0.1, 0.28, materials.dark, 0, -0.41, 0.05);
      this.legs[side === -1 ? 'left' : 'right'] = { hip, knee };
    }
  }

  get chestY() {
    return this.y + 1.18;
  }

  get headY() {
    return this.y + 1.72;
  }

  setPose(yaw) {
    this.yaw = yaw;
    this.group.rotation.y = yaw;
  }

  update(dt, player, missions) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.dead) {
      this.deadTimer += dt;
      this.group.rotation.z = Math.min(1.48, this.group.rotation.z + dt * 3.4);
      this.group.position.y = this.y + Math.min(0.2, this.deadTimer * 0.3);
      this.gun.visible = false;
      return;
    }
    const dx = player.position.x - this.x;
    const dz = player.position.z - this.z;
    const distance = Math.hypot(dx, dz) || 0.001;
    const playerVisible = distance < 46 && !player.dead;
    if (playerVisible) {
      const targetYaw = Math.atan2(dx, dz);
      this.setPose(targetYaw);
      this.aim = Math.min(1, this.aim + dt * 7);
    } else {
      this.aim = Math.max(0, this.aim - dt * 4);
    }

    const anchorDistance = distance2(this.x, this.z, this.anchorX, this.anchorZ);
    let moving = false;
    if (playerVisible && distance > (this.boss ? 6.5 : 7.2) && distance < 36 && anchorDistance < 24) {
      const step = this.speed * dt;
      const nextX = this.x + (dx / distance) * step;
      const nextZ = this.z + (dz / distance) * step;
      const resolved = this.world.resolveCircle(nextX, nextZ, 0.36);
      const ground = this.world.groundHeightAt(resolved.x, resolved.z);
      if (Math.abs(ground - this.y) < 0.55) {
        this.x = resolved.x;
        this.z = resolved.z;
        this.y = ground;
        moving = true;
      }
    }
    if (playerVisible && distance < 11) moving = false;
    this.walk += dt * (moving ? 8.4 : 1.6);
    const stride = moving ? 0.48 : 0;
    this.legs.left.hip.rotation.x = Math.sin(this.walk) * stride;
    this.legs.right.hip.rotation.x = Math.sin(this.walk + Math.PI) * stride;
    this.legs.left.knee.rotation.x = Math.max(0, Math.sin(this.walk + 0.7)) * stride * 1.2;
    this.legs.right.knee.rotation.x = Math.max(0, Math.sin(this.walk + Math.PI + 0.7)) * stride * 1.2;
    this.arms.left.shoulder.rotation.x = -Math.sin(this.walk) * stride * 0.7;
    this.arms.left.shoulder.rotation.z = 0.08;
    this.arms.right.shoulder.rotation.x = -1.25 * this.aim + Math.sin(this.walk) * stride * 0.2;
    this.arms.right.shoulder.rotation.z = -0.08;
    this.arms.right.elbow.rotation.x = -0.2 - this.aim * 0.2;
    this.torso.rotation.x = moving ? 0.05 : 0.015;
    this.group.position.set(this.x, this.y + (moving ? Math.abs(Math.sin(this.walk)) * 0.025 : 0), this.z);
    this.group.rotation.y = this.yaw;

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.5;
      this.los = playerVisible && distance < 39 && !this.world.lineBlocked(
        this.x, this.y + 1.32, this.z,
        player.position.x, player.position.y + 1.2, player.position.z,
        0.2,
      );
    }
    this.shootTimer -= dt;
    if (!this.staged && this.los && this.shootTimer <= 0 && !player.dead && distance < 38) {
      this.shootTimer = (this.boss ? 1.25 : 1.7) + Math.random() * 1.1;
      missions.enemyShoot(this, player);
    }
  }

  remove() {
    this.removed = true;
    this.scene.remove(this.group);
  }

  muzzle(out = new THREE.Vector3()) {
    return out.set(
      this.x + Math.sin(this.yaw) * 0.62,
      this.y + 1.34,
      this.z + Math.cos(this.yaw) * 0.62,
    );
  }
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
    this.suspended = true;
    this.staged = false;
    this.clearMissionEntities();
    this.clearProps();
    this.clearFire();
    this.active = null;
    this.failure = null;
    this.subtitle = null;
    this.queue.length = 0;
    this.storyDone = false;
    this.index = 0;
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
    const crates = [
      [-188, 65, 1.2], [-193, 75, 1.0], [-201, 62, 1.05], [-209, 77, 0.9],
      [-218, 64, 1.15], [-226, 75, 1.0], [-236, 63, 0.9], [-242, 77, 1.2],
      [-249, 66, 1.0], [-255, 74, 0.9],
    ];
    for (const [x, z, scale] of crates) this.addCrate(x, z, scale);
    const spawns = [
      { x: -196, z: 66, health: 115 },
      { x: -204, z: 74, health: 115 },
      { x: -212, z: 69, health: 120 },
      { x: -221, z: 65, health: 115 },
      { x: -228, z: 75, health: 125 },
      { x: -238, z: 68, health: 120 },
      { x: -246, z: 73, health: 125 },
      { x: -254, z: 70, health: 280, boss: true, name: 'Aurelio', damage: 13, speed: 2.2 },
    ];
    for (const spec of spawns) this.enemies.push(new Thug(this.scene, this.world, this.materials, spec, this.enemies.length));
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
    this.prepareShot();
    this.staged = true;
    this.subtitle = null;
    this.queue.length = 0;
    if (name === 'mission') this.stageMissionShot();
    else if (name === 'heist') this.stageHeistShot();
  }

  stageMissionShot() {
    this.addCrate(-5.6, 11.3, 1.1);
    this.addCrate(6.4, 10.8, 1.0);
    this.addCrate(-8.2, 8.8, 0.85);
    this.addCrate(8.0, 7.8, 0.95);
    const spawns = [
      { x: 0, z: 9.3, health: 205, boss: true, name: 'Tomas', damage: 11, speed: 2.2 },
      { x: -4.8, z: 9.9, health: 105 },
      { x: 4.9, z: 9.5, health: 105 },
      { x: 2.7, z: 12.2, health: 105 },
      { x: -3.9, z: 15.1, health: 105, dead: true },
    ];
    for (const spec of spawns) this.enemies.push(new Thug(this.scene, this.world, this.materials, spec, this.enemies.length));
    this.enemies[0].setPose(0);
    this.enemies[0].aim = 1;
    this.enemies[1].setPose(0.5);
    this.enemies[2].setPose(-0.5);
    this.enemies[3].setPose(0.2);
    this.enemies[4].setPose(-1.2);
    for (let i = 0; i < 4; i += 1) this.poseAim(this.enemies[i]);
    this.objective = {
      title: 'Survive the Ambush',
      sub: 'Tomas and his crew have the fountain covered.',
      marker: { x: 0, z: 8.4 },
      tag: 'MISSION 04 · FAMILY CUT',
      progress: { label: 'CREW', value: 2, max: 5 },
    };
    this.world.setObjectiveMarker(0, 8.4);
    this.subtitle = {
      speaker: 'TOMAS',
      text: 'You brought the case. And a conscience.',
      life: 999,
    };
  }

  stageHeistShot() {
    this.addCrate(-236, 62.8, 1.0);
    this.addCrate(-239, 77.0, 1.1);
    this.addCrate(-247, 62.4, 0.9);
    this.addCrate(-252, 77.2, 1.0);
    this.addFireSpot(-256, 62.8);
    this.addFireSpot(-258, 76.2);
    this.addFireSpot(-249, 58.8);
    this.addFireSpot(-237.2, 77.0);
    this.addFireSpot(-243.5, 62.2);
    this.addFireSpot(-234.2, 73.9);
    this.addFireSpot(-236.4, 65.6);
    const spawns = [
      { x: -250, z: 70, health: 280, boss: true, name: 'Aurelio', damage: 13, speed: 2.2 },
      { x: -237.5, z: 65.6, health: 115 },
      { x: -238.5, z: 74.8, health: 115 },
      { x: -243.4, z: 69.4, health: 120 },
      { x: -243.8, z: 72.7, health: 120 },
      { x: -247.4, z: 65.3, health: 125 },
      { x: -246.8, z: 75.4, health: 125 },
      { x: -231.9, z: 68.4, health: 105, dead: true },
    ];
    for (const spec of spawns) this.enemies.push(new Thug(this.scene, this.world, this.materials, spec, this.enemies.length));
    this.enemies[0].setPose(Math.PI / 2);
    this.enemies[0].aim = 1;
    for (let i = 1; i < 7; i += 1) {
      this.enemies[i].setPose(Math.PI / 2 + (i % 2 === 0 ? 0.3 : -0.3));
      this.enemies[i].aim = 0.8;
      this.poseAim(this.enemies[i]);
    }
    this.poseAim(this.enemies[0]);
    this.objective = {
      title: 'Clear Pier 9',
      sub: 'Put Aurelio down and get off the deck.',
      marker: { x: -250, z: 70 },
      tag: 'MISSION 05 · PIER 9 BURNING',
      progress: { label: 'ENFORCERS', value: 4, max: 8 },
    };
    this.world.setObjectiveMarker(-250, 70);
    this.subtitle = {
      speaker: 'AURELIO',
      text: 'The harbor always collects, Rae. Even from family.',
      life: 999,
    };
    for (const fire of this.fireSpots) {
      this.effects?.smokePuff(fire.x, this.world.groundHeightAt(fire.x, fire.z) + 1.4, fire.z, {
        scale: 3.0, life: 3.4, color: 0x40383b, rise: 1.7,
      });
    }
  }

  poseAim(enemy) {
    enemy.arms.right.shoulder.rotation.x = -1.25 * enemy.aim;
    enemy.arms.right.shoulder.rotation.z = -0.08;
    enemy.arms.right.elbow.rotation.x = -0.2 - enemy.aim * 0.2;
    enemy.arms.left.shoulder.rotation.x = -0.3;
    enemy.torso.rotation.x = 0.02;
  }

  stageShotDrama(name) {
    const player = this.player;
    const facing = player.facing;
    const muzzle = new THREE.Vector3(
      player.position.x + Math.sin(facing) * 0.62,
      player.position.y + 1.36,
      player.position.z + Math.cos(facing) * 0.62,
    );
    if (name === 'mission') {
      const boss = this.enemies.find((enemy) => enemy.name === 'Tomas');
      const flunky = this.enemies[1];
      if (boss && flunky) {
        const chest = new THREE.Vector3(flunky.x, flunky.y + 1.2, flunky.z);
        this.effects?.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd79a);
        this.effects?.flash(muzzle.x, muzzle.y, muzzle.z, { color: 0xffe0a0, scale: 0.9, life: 0.1, grow: 1.8 });
        this.effects?.tracer(muzzle, chest, 0xffd49a);
        this.effects?.flash(chest.x, chest.y, chest.z, { color: 0xff9a63, scale: 0.8, life: 0.1, grow: 1.7 });
        this.effects?.spark(chest.x, chest.y, chest.z, null, 0xffb04a, 12, 4.8);
        const enemyMuzzle = boss.muzzle();
        const target = new THREE.Vector3(player.position.x, player.position.y + 1.05, player.position.z);
        this.effects?.muzzle(enemyMuzzle.x, enemyMuzzle.y, enemyMuzzle.z, 0xffd08a);
        this.effects?.tracer(enemyMuzzle, target, 0xffbd7a);
        this.effects?.flash(flunky.x, flunky.y + 1.3, flunky.z, { color: 0xffb066, scale: 1.6, life: 0.18, grow: 2.8 });
        this.effects?.smokePuff(-5.6, 1.1, 11.3, { scale: 1.8, life: 2.0, color: 0x5a4c4c, rise: 0.9 });
        player.hitMarker = 0.75;
      }
    } else if (name === 'heist') {
      const boss = this.enemies.find((enemy) => enemy.name === 'Aurelio');
      if (boss) {
        const chest = new THREE.Vector3(boss.x, boss.y + 1.2, boss.z);
        this.effects?.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd79a);
        this.effects?.tracer(muzzle, chest, 0xffd49a);
        this.effects?.flash(chest.x, chest.y, chest.z, { color: 0xffa063, scale: 0.9, life: 0.1, grow: 1.8 });
      }
      const visible = this.enemies.slice(1, 4);
      for (let i = 0; i < visible.length; i += 1) {
        const enemy = visible[i];
        const origin = enemy.muzzle();
        const target = new THREE.Vector3(player.position.x, player.position.y + 1.02, player.position.z);
        this.effects?.muzzle(origin.x, origin.y, origin.z, 0xffd08a);
        this.effects?.tracer(origin, target, 0xffbd7a);
        if (i === 0) this.effects?.flash(origin.x, origin.y, origin.z, { color: 0xffcf8a, scale: 1.15, life: 0.12, grow: 2.0 });
      }
      const ground = this.world.groundHeightAt(-256, 62.8);
      this.effects?.explosion(-256, ground + 1.4, 62.8);
      this.effects?.explosion(-238.5, this.world.groundHeightAt(-238.5, 76.9) + 1.0, 76.9);
      this.effects?.flash(-250, 1.6, 72, { color: 0xff8a4a, scale: 2.4, life: 0.24, grow: 3.2 });
      this.effects?.spark(-244, 1.8, 70, null, 0xffb05a, 14, 7);
      this.effects?.smokePuff(-246, 1.4, 70, { scale: 2.6, life: 2.4, color: 0x54484c, rise: 1.2 });
      this.effects?.smokePuff(-239, 1.2, 76.5, { scale: 2.2, life: 2.2, color: 0x4c4246, rise: 1.1 });
      player.hitMarker = 0.5;
    }
  }
}

function addBoxPanels(materials) {
  const group = new THREE.Group();
  addBox(group, 0.26, 0.06, 0.235, materials.caseTrim, 0, -0.1, 0);
  return group;
}
