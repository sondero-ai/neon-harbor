// Pedestrian simulation: block loops, crosswalk crossings, beach and pier
// wanderers, panic, armed witnesses, death and loot events, wall sliding and
// the ambient spawn/despawn budget. Every function takes the Traffic instance;
// the renderer lives in traffic-crowd.js and the car AI in traffic-cars.js.

import * as THREE from '../vendor/three.module.js';
import { BLOCK_CENTERS_X, BLOCK_CENTERS_Z, WORLD } from './config.js';
import { MAX_PEDS } from './traffic-crowd.js';
import { PANIC_SECONDS } from './traffic-cars.js';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const TAU = Math.PI * 2;

const CORNER = 17.4;
export const PANIC_RADIUS = 14;
const FLEE_SPEED = 1.6;
const ARMED_JACKET = 0x6b1e29;
const ARMED_CHANCE = 0.15;
const ARMED_DRAW_SECONDS = 0.9;
const ARMED_FIRE_SECONDS = 1.2;
const ARMED_RANGE = 30;
const ARMED_GIVE_UP_RANGE = 45;
const ARMED_GIVE_UP_SECONDS = 12;
const ARMED_DAMAGE = 9;

const CORNERS = [
  [CORNER, CORNER],
  [-CORNER, CORNER],
  [-CORNER, -CORNER],
  [CORNER, -CORNER],
];

function cornerIndexFor(relativeX, relativeZ) {
  for (let i = 0; i < CORNERS.length; i += 1) {
    if (Math.sign(CORNERS[i][0]) === Math.sign(relativeX) && Math.sign(CORNERS[i][1]) === Math.sign(relativeZ)) {
      return i;
    }
  }
  return 0;
}

// Same ray/sphere test the Harbor PD uses, kept local so the traffic module
// stays independent of police.js.
function raySphere(origin, direction, cx, cy, cz, radius) {
  const ox = origin.x - cx;
  const oy = origin.y - cy;
  const oz = origin.z - cz;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t = -b - root;
  if (t < 0.05) {
    const t2 = -b + root;
    return t2 > 0.05 ? t2 : null;
  }
  return t;
}

const clothing = [0xd75543, 0x3f8f8f, 0xe4d6b8, 0x6a7f54, 0x8a4f6d, 0x4b5f8c, 0xe0a94f, 0x9c3b42, 0x557a6a, 0xc7a887];
const pants = [0x252334, 0x3a3340, 0x2d3f4a, 0x51463c, 0x1d222c, 0x5d5548];
const skins = [0xb87a60, 0x8c5a44, 0xd9a37c, 0x6e4636, 0xc28d6a, 0x9c6c50];
const hairs = [0x24161c, 0x3b241c, 0x17141a, 0x6b4a2c, 0x8f8272, 0x4a2b33];

export function spawnPed(traffic, { x, z, yaw = 0, mode = 'loop', target = null, anchor = null, phase = null, armed = null, guard = false, bag = false, valet = false }) {
  let slot = -1;
  for (let i = 0; i < MAX_PEDS; i += 1) {
    if (!traffic.peds.some((ped) => ped.active && ped.slot === i)) {
      slot = i;
      break;
    }
  }
  if (slot === -1) return null;

  // Only block-loop walkers carry a pistol; an explicit option from a shot or
  // a test always wins, and beach and crosswalk pedestrians stay unarmed.
  // A security guard is always armed, hostile, hatted and in a dark uniform.
  const isArmed = guard || (armed === null ? mode === 'loop' && traffic.rng.chance(ARMED_CHANCE) : Boolean(armed));
  const spec = {
    cloth: clothing[Math.floor(traffic.rng() * clothing.length) % clothing.length],
    pants: pants[Math.floor(traffic.rng() * pants.length) % pants.length],
    skin: skins[Math.floor(traffic.rng() * skins.length) % skins.length],
    hair: hairs[Math.floor(traffic.rng() * hairs.length) % hairs.length],
    hatColor: traffic.rng.pick([0x2d2a36, 0x7a3e35, 0x3f5a5e, 0xd6c6a4]),
    bagColor: traffic.rng.pick([0x3a2a44, 0x24414a, 0x4a332e, 0x2f3a24]),
  };
  if (guard) {
    spec.cloth = 0x252b36;
    spec.pants = 0x141821;
    spec.hair = 0x1a161c;
    spec.hatColor = 0x10141b;
  } else if (valet) {
    spec.cloth = 0x2f6f6a;
    spec.pants = 0x141821;
    spec.hatColor = 0x1d3d3a;
  } else if (isArmed) {
    spec.cloth = ARMED_JACKET;
  }
  const ped = {
    active: true,
    slot,
    x,
    z,
    y: traffic.world.groundHeightAt(x, z),
    yaw,
    scale: traffic.rng.range(0.9, 1.07),
    speed: traffic.rng.range(1.05, 1.55),
    phase: phase ?? traffic.rng.range(0, TAU),
    motion: 0.6,
    health: guard ? 78 : 55,
    dead: false,
    deadTimer: 0,
    fall: 0,
    fleeTimer: 0,
    fleeFromX: 0,
    fleeFromZ: 0,
    fleeResumeTarget: null,
    armed: isArmed,
    hostile: guard,
    hostileDraw: 0,
    hostileTime: 0,
    shootTimer: 0,
    guard: Boolean(guard),
    valet: Boolean(valet),
    bag: Boolean(bag),
    sitting: false,
    seat: null,
    mode: guard ? 'guard' : mode,
    target: target ?? { x, z },
    anchor: anchor ?? { x, z },
    pause: 0,
    blockX: 0,
    blockZ: 0,
    cornerIndex: 0,
    direction: traffic.rng.chance(0.5) ? 1 : -1,
    crossingAxis: null,
    nextBlockX: 0,
    nextBlockZ: 0,
    hat: guard ? true : traffic.rng.chance(0.32),
  };

  if (mode === 'loop') {
    const block = traffic.nearestBlock(x, z);
    ped.blockX = block.x;
    ped.blockZ = block.z;
    ped.cornerIndex = cornerIndexFor(x - block.x, z - block.z);
    traffic.setNextCorner(ped);
  }

  traffic.peds.push(ped);
  traffic.crowd.setColors(slot, spec);
  traffic.crowd.write(ped);
  return ped;
}

export function spawnSidewalkPed(traffic, x, z, cornerIndex = 0) {
  const block = traffic.nearestBlock(x, z);
  const ped = traffic.spawnPed({ x, z, yaw: traffic.rng.range(0, TAU), mode: 'loop' });
  if (!ped) return null;
  ped.blockX = block.x;
  ped.blockZ = block.z;
  ped.cornerIndex = clamp(cornerIndex, 0, 3);
  ped.direction = traffic.rng.chance(0.5) ? 1 : -1;
  traffic.setNextCorner(ped);
  return ped;
}

export function nearestBlock(traffic, x, z) {
  let best = { x: BLOCK_CENTERS_X[0], z: BLOCK_CENTERS_Z[0] };
  let bestDistance = Infinity;
  for (const cx of BLOCK_CENTERS_X) {
    for (const cz of BLOCK_CENTERS_Z) {
      const distance = Math.abs(x - cx) + Math.abs(z - cz);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: cx, z: cz };
      }
    }
  }
  return best;
}

export function setNextCorner(traffic, ped) {
  const corner = CORNERS[ped.cornerIndex];
  ped.target = { x: ped.blockX + corner[0], z: ped.blockZ + corner[1] };
}

/** Stand a seated pedestrian up and free the chair for anyone else. */
export function releasePedSeat(traffic, ped) {
  if (ped.seat && ped.seat.occupant === ped) ped.seat.occupant = null;
  ped.seat = null;
  ped.sitting = false;
}

export function despawnPed(traffic, ped) {
  traffic.releasePedSeat(ped);
  ped.active = false;
  traffic.crowd.hide(ped.slot);
}

/** Start every standing pedestrian near (x, z) fleeing for the panic time. */
export function panic(traffic, x, z, radius = PANIC_RADIUS) {
  const radiusSq = radius * radius;
  let count = 0;
  for (const ped of traffic.peds) {
    if (!ped.active || ped.dead) continue;
    const dx = ped.x - x;
    const dz = ped.z - z;
    if (dx * dx + dz * dz >= radiusSq) continue;
    traffic.releasePedSeat(ped);
    if (!ped.fleeResumeTarget) ped.fleeResumeTarget = { x: ped.target.x, z: ped.target.z };
    ped.fleeTimer = PANIC_SECONDS;
    ped.fleeFromX = x;
    ped.fleeFromZ = z;
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------- combat

/** Nearest living pedestrian the player's ray can hit, with chest and head spheres. */
export function traceShot(traffic, origin, direction, maxDistance) {
  let best = null;
  for (const ped of traffic.peds) {
    if (!ped.active || ped.dead) continue;
    const chest = raySphere(origin, direction, ped.x, ped.y + 1.12 * ped.scale, ped.z, 0.42);
    const head = raySphere(origin, direction, ped.x, ped.y + 1.55 * ped.scale, ped.z, 0.22);
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
        type: 'ped',
        ped,
        headshot,
        distance,
        point: new THREE.Vector3(origin.x + direction.x * distance, origin.y + direction.y * distance, origin.z + direction.z * distance),
      };
    }
  }
  return best;
}

export function applyPlayerHit(traffic, target, damage) {
  const ped = target?.ped;
  if (!ped || !ped.active || ped.dead) return;
  ped.health -= damage * (target.headshot ? 1.75 : 1);
  if (traffic.player) {
    traffic.player.hitMarker = 1;
    if (traffic.player.effects && target.point) traffic.player.effects.impact(target.point, null, 'metal');
    if (traffic.player.audio) traffic.player.audio.impact(0.9);
  }
  if (ped.health > 0) return;
  ped.dead = true;
  ped.deadTimer = 8;
  ped.health = 0;
  traffic.releasePedSeat(ped);
  // A corpse is not fleeing; stop it counting as panicked after death.
  ped.fleeTimer = 0;
  let witnesses = 0;
  for (const other of traffic.peds) {
    if (other === ped || !other.active || other.dead) continue;
    if (Math.hypot(other.x - ped.x, other.z - ped.z) >= PANIC_RADIUS) continue;
    witnesses += 1;
    if (!other.fleeResumeTarget) other.fleeResumeTarget = { x: other.target.x, z: other.target.z };
    if (other.armed) {
      // An armed witness stops running and reaches for the pistol.
      other.fleeTimer = 0;
      if (!other.hostile && other.hostileDraw <= 0) {
        other.hostileDraw = ARMED_DRAW_SECONDS;
        other.shootTimer = 0;
      }
      continue;
    }
    other.fleeTimer = PANIC_SECONDS;
    other.fleeFromX = ped.x;
    other.fleeFromZ = ped.z;
  }
  traffic.onPedDeath?.(ped, { witnesses });
}

export function pickBeachTarget(traffic, ped) {
  const anchorOnPier = traffic.world.groundHeightAt(ped.anchor.x, ped.anchor.z) > 1;
  if (anchorOnPier) {
    // The deck is now full of solid props. Re-roll a target that lands in
    // the shack, a bench, a barrel, a crate or a railing rather than
    // steering a walker into it.
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const x = clamp(ped.anchor.x + traffic.rng.range(-7, 7), WORLD.pier.minX + 3, WORLD.pier.maxX - 3);
      const z = clamp(ped.anchor.z + traffic.rng.range(-3.5, 3.5), WORLD.pier.z - WORLD.pier.halfWidth + 2, WORLD.pier.z + WORLD.pier.halfWidth - 2);
      if (traffic.world.collides(x, z, 0.3)) continue;
      ped.target = { x, z };
      return;
    }
    ped.target = {
      x: clamp(ped.anchor.x, WORLD.pier.minX + 3, WORLD.pier.maxX - 3),
      z: clamp(ped.anchor.z, WORLD.pier.z - WORLD.pier.halfWidth + 2, WORLD.pier.z + WORLD.pier.halfWidth - 2),
    };
    return;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = traffic.rng.range(0, TAU);
    const radius = traffic.rng.range(2, 9);
    const x = ped.anchor.x + Math.cos(angle) * radius;
    const z = ped.anchor.z + Math.sin(angle) * radius;
    if (x < WORLD.shorelineX + 2) continue;
    ped.target = { x, z };
    return;
  }
  ped.target = { ...ped.anchor };
}

export function updatePeds(traffic, dt, elapsed) {
  for (const ped of traffic.peds) {
    if (!ped.active) continue;
    if (ped.dead) {
      ped.deadTimer -= dt;
      ped.fall = Math.min(1, ped.fall + dt / 0.45);
      ped.motion = 0;
      traffic.releasePedSeat(ped);
      if (ped.deadTimer <= 0) traffic.despawnPed(ped);
      continue;
    }
    if (ped.armed && (ped.hostile || ped.hostileDraw > 0)) {
      traffic.releasePedSeat(ped);
      traffic.updateArmedPed(ped, dt);
      continue;
    }
    if (ped.fleeTimer > 0) {
      traffic.releasePedSeat(ped);
      ped.fleeTimer -= dt;
      const dx = ped.x - ped.fleeFromX;
      const dz = ped.z - ped.fleeFromZ;
      const distance = Math.hypot(dx, dz) || 1;
      ped.target = { x: ped.x + (dx / distance) * 12, z: ped.z + (dz / distance) * 12 };
      traffic.walkToward(ped, ped.speed * FLEE_SPEED, dt);
      ped.phase += dt * 7;
      ped.motion = damp(ped.motion, 1, 8, dt);
      ped.y = damp(ped.y, traffic.world.groundHeightAt(ped.x, ped.z), 15, dt);
      if (ped.fleeTimer <= 0) {
        if (ped.fleeResumeTarget) {
          ped.target = { ...ped.fleeResumeTarget };
          ped.fleeResumeTarget = null;
        }
      }
      continue;
    }
    const ground = traffic.world.groundHeightAt(ped.x, ped.z);
    let moving = false;

    if (ped.pause > 0) {
      ped.pause -= dt;
      ped.motion = damp(ped.motion, 0, 9, dt);
    } else if (ped.mode === 'beach') {
      moving = traffic.walkToward(ped, ped.speed * 0.8, dt);
      if (!moving) {
        ped.pause = traffic.rng.range(1.2, 4.5);
        traffic.pickBeachTarget(ped);
      }
    } else if (ped.mode === 'mall') {
      moving = traffic.mallLife ? traffic.mallLife.updatePed(ped, dt) : false;
    } else if (ped.mode === 'idle' || ped.mode === 'walk') {
      moving = traffic.walkToward(ped, ped.speed, dt);
      if (!moving) {
        ped.pause = traffic.rng.range(0.3, 1.6);
        if (ped.mode === 'walk') ped.target = { x: ped.x + traffic.rng.range(-6, 6), z: ped.z };
      }
    } else if (ped.mode === 'cross') {
      let speed = Math.max(1.5, ped.speed * 1.1);
      if (traffic.carNear(ped.x, ped.z, 11)) speed = 2.7;
      moving = traffic.walkToward(ped, speed, dt);
      if (!moving) traffic.finishCrossing(ped);
    } else {
      moving = traffic.walkToward(ped, ped.speed, dt);
      if (!moving) traffic.arriveCorner(ped);
    }

    if (moving) {
      ped.phase += dt * (ped.mode === 'cross' ? 7.2 : 4.9) * (ped.mode === 'cross' ? 1.15 : 1);
      ped.motion = damp(ped.motion, 1, 8, dt);
    }
    ped.y = damp(ped.y, traffic.world.groundHeightAt(ped.x, ped.z), 15, dt);
  }

  traffic.pedTimer -= dt;
  if (traffic.pedTimer <= 0 && traffic.player) {
    traffic.pedTimer = 0.5;
    const sidewalkCount = traffic.peds.filter((ped) => ped.active
      && ped.mode !== 'beach' && ped.mode !== 'mall' && ped.mode !== 'guard').length;
    if (sidewalkCount < traffic.sidewalkTarget) {
      traffic.spawnAmbientPed(traffic.player);
    }
    for (const ped of traffic.peds) {
      // Mall shoppers despawn at their door, and security guards are a
      // robbery actor rather than ambient sidewalk traffic.
      if (!ped.active || ped.mode === 'beach' || ped.mode === 'mall' || ped.mode === 'guard') continue;
      if (Math.hypot(ped.x - traffic.player.position.x, ped.z - traffic.player.position.z) > 190) {
        traffic.despawnPed(ped);
      }
    }
    if (traffic.peds.length > MAX_PEDS * 2) traffic.peds = traffic.peds.filter((ped) => ped.active);
  }
}

// An armed witness plants its feet, faces Rae, and fires after the draw.
export function updateArmedPed(traffic, ped, dt) {
  const player = traffic.player;
  if (!player || player.dead) {
    ped.hostile = false;
    ped.hostileDraw = 0;
    return;
  }
  const dx = player.position.x - ped.x;
  const dz = player.position.z - ped.z;
  const distance = Math.hypot(dx, dz);
  const targetYaw = Math.atan2(dx, dz);
  ped.yaw += Math.atan2(Math.sin(targetYaw - ped.yaw), Math.cos(targetYaw - ped.yaw)) * (1 - Math.exp(-12 * dt));
  ped.y = damp(ped.y, traffic.world.groundHeightAt(ped.x, ped.z), 15, dt);
  ped.motion = damp(ped.motion, 0.22, 8, dt);

  if (!ped.hostile) {
    ped.hostileDraw -= dt;
    if (ped.hostileDraw > 0) return;
    ped.hostileDraw = 0;
    ped.hostile = true;
    ped.hostileTime = 0;
    ped.shootTimer = 0;
    if (!traffic.armedAlertShown) {
      traffic.armedAlertShown = true;
      traffic.onArmedHostile?.(ped);
    }
  }

  ped.hostileTime += dt;
  if (distance > ARMED_GIVE_UP_RANGE || ped.hostileTime > ARMED_GIVE_UP_SECONDS) {
    traffic.sendPedFleeing(ped, player.position.x, player.position.z);
    return;
  }

  ped.shootTimer -= dt;
  if (ped.shootTimer > 0) return;
  if (distance > ARMED_RANGE) {
    ped.shootTimer = 0.25;
    return;
  }
  const blocked = traffic.world.lineBlocked(
    ped.x,
    ped.y + 1.3,
    ped.z,
    player.position.x,
    player.position.y + 1.2,
    player.position.z,
    0.2,
  );
  if (blocked) {
    ped.shootTimer = 0.25;
    return;
  }
  ped.shootTimer = ARMED_FIRE_SECONDS;
  traffic.armedPedShoot(ped);
}

export function sendPedFleeing(traffic, ped, fromX, fromZ) {
  traffic.releasePedSeat(ped);
  ped.hostile = false;
  ped.hostileDraw = 0;
  ped.hostileTime = 0;
  ped.shootTimer = 0;
  if (!ped.fleeResumeTarget) ped.fleeResumeTarget = { x: ped.target.x, z: ped.target.z };
  ped.fleeTimer = PANIC_SECONDS;
  ped.fleeFromX = fromX;
  ped.fleeFromZ = fromZ;
}

export function armedPedShoot(traffic, ped) {
  const player = traffic.player;
  if (!player) return;
  const muzzle = new THREE.Vector3(
    ped.x + Math.sin(ped.yaw) * 0.42,
    ped.y + 1.32,
    ped.z + Math.cos(ped.yaw) * 0.42,
  );
  const target = new THREE.Vector3(player.position.x, player.position.y + 1.12, player.position.z);
  const direction = target.clone().sub(muzzle).normalize();
  const hit = Math.random() < 0.6;
  const endpoint = new THREE.Vector3();
  if (hit) {
    endpoint.set(player.position.x, player.position.y + 1.05, player.position.z);
    if (traffic.police) traffic.police.damagePlayer(ARMED_DAMAGE, ped.x, ped.z, 'witness');
    else player.applyDamage(ARMED_DAMAGE, ped.x, ped.z);
  } else {
    endpoint.copy(muzzle).addScaledVector(direction, 30);
    const worldHit = traffic.world.raycast(muzzle, direction, 30);
    if (worldHit) endpoint.copy(worldHit.point);
  }
  if (player.effects) {
    player.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd59a);
    player.effects.tracer(muzzle, endpoint, 0xffcf8a);
  }
  if (player.audio) player.audio.gunshot('pistol');
}

export function walkToward(traffic, ped, speed, dt) {
  const dx = ped.target.x - ped.x;
  const dz = ped.target.z - ped.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.08) {
    ped.x = ped.target.x;
    ped.z = ped.target.z;
    return false;
  }
  const step = Math.min(distance, speed * dt);
  const stepX = (dx / distance) * step;
  const stepZ = (dz / distance) * step;
  const radius = 0.36;
  const wantX = ped.x + stepX;
  const wantZ = ped.z + stepZ;

  // Slide along a wall rather than walking through it: the full step first,
  // then one axis at a time, then stop and let the caller pick a new target.
  const full = traffic.world.resolveCircle(wantX, wantZ, radius);
  let movedX = 0;
  let movedZ = 0;
  if (Math.hypot(full.x - wantX, full.z - wantZ) < 0.01) {
    movedX = full.x - ped.x;
    movedZ = full.z - ped.z;
  } else {
    const slideX = traffic.world.resolveCircle(wantX, ped.z, radius);
    if (Math.abs(slideX.x - wantX) < 0.01 && Math.abs(slideX.z - ped.z) < 0.01) {
      movedX = slideX.x - ped.x;
    } else {
      const slideZ = traffic.world.resolveCircle(ped.x, wantZ, radius);
      if (Math.abs(slideZ.z - wantZ) < 0.01 && Math.abs(slideZ.x - ped.x) < 0.01) {
        movedZ = slideZ.z - ped.z;
      }
    }
  }
  if (Math.abs(movedX) < 0.0005 && Math.abs(movedZ) < 0.0005) return false;
  ped.x += movedX;
  ped.z += movedZ;
  const desiredYaw = Math.atan2(dx, dz);
  const delta = Math.atan2(Math.sin(desiredYaw - ped.yaw), Math.cos(desiredYaw - ped.yaw));
  ped.yaw += delta * (1 - Math.exp(-9 * dt));
  return true;
}

export function arriveCorner(traffic, ped) {
  const corner = CORNERS[ped.cornerIndex];
  if (traffic.rng.chance(0.24) && traffic.tryCross(ped, corner)) return;
  if (traffic.rng.chance(0.2)) ped.pause = traffic.rng.range(0.4, 1.8);
  ped.cornerIndex = (ped.cornerIndex + ped.direction + 4) % 4;
  traffic.setNextCorner(ped);
}

export function tryCross(traffic, ped, corner) {
  const signX = Math.sign(corner[0]);
  const signZ = Math.sign(corner[1]);
  const alongX = traffic.rng.chance(0.5);
  if (alongX) {
    const nextX = ped.blockX + signX * 54;
    if (!BLOCK_CENTERS_X.includes(nextX)) return false;
    ped.nextBlockX = nextX;
    ped.nextBlockZ = ped.blockZ;
    ped.mode = 'cross';
    ped.crossingAxis = 'x';
    ped.target = { x: ped.blockX + signX * (54 - CORNER), z: ped.blockZ + signZ * CORNER };
    return true;
  }
  const nextZ = ped.blockZ + signZ * 54;
  if (!BLOCK_CENTERS_Z.includes(nextZ)) return false;
  ped.nextBlockX = ped.blockX;
  ped.nextBlockZ = nextZ;
  ped.mode = 'cross';
  ped.crossingAxis = 'z';
  ped.target = { x: ped.blockX + signX * CORNER, z: ped.blockZ + signZ * (54 - CORNER) };
  return true;
}

export function finishCrossing(traffic, ped) {
  ped.blockX = ped.nextBlockX;
  ped.blockZ = ped.nextBlockZ;
  ped.cornerIndex = cornerIndexFor(ped.x - ped.blockX, ped.z - ped.blockZ);
  ped.mode = 'loop';
  ped.crossingAxis = null;
  ped.pause = traffic.rng.range(0, 0.5);
  traffic.setNextCorner(ped);
}

export function carNear(traffic, x, z, radius) {
  const radiusSq = radius * radius;
  for (const car of traffic.vehicles.list) {
    if (!car.driver) continue;
    const dx = car.position.x - x;
    const dz = car.position.z - z;
    if (dx * dx + dz * dz < radiusSq && Math.abs(car.speed) > 2) return true;
  }
  return false;
}

export function spawnAmbientPed(traffic, player) {
  const px = player.position.x;
  const pz = player.position.z;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const blockX = traffic.rng.pick(BLOCK_CENTERS_X);
    const blockZ = traffic.rng.pick(BLOCK_CENTERS_Z);
    const distance = Math.hypot(blockX - px, blockZ - pz);
    if (distance < 30 || distance > 145) continue;
    const corner = CORNERS[traffic.rng.int(0, 3)];
    const x = blockX + corner[0];
    const z = blockZ + corner[1];
    if (Math.hypot(x - px, z - pz) < 14) continue;
    traffic.spawnSidewalkPed(x, z, traffic.rng.int(0, 3));
    return;
  }
}
