// The read-only HUD reads extracted from main.js: respect, the crew roster
// and the per-frame hudState snapshot. Every function takes the Game
// instance; the HUD itself is untouched.

import { districtAt, streetAt } from './config.js';

export function respectState(game) {
  const value = Math.min(250, Math.floor(game.player.cash / 20) + game.missions.index * 30);
  const tiers = [
    [200, 'HARBOR LEGEND'],
    [140, 'SOLANO CREW'],
    [85, 'HARBOR HEAVY'],
    [45, 'STRIP RUNNER'],
    [0, 'NEW BLOOD'],
  ];
  const rank = tiers.find(([floor]) => value >= floor)?.[1] ?? 'NEW BLOOD';
  return { rank, value, max: 250 };
}

export function crewState(game) {
  const driving = game.player.driving;
  const wanted = game.police.wanted;
  const active = Boolean(game.missions.active);
  const failed = Boolean(game.missions.failure);
  return [
    {
      name: 'MIRA SOL',
      role: 'DRIVER',
      status: failed ? 'STANDING BY' : active ? (driving ? 'ON COMMS' : 'EN ROUTE') : 'READY',
    },
    {
      name: 'ODIN',
      role: 'MECHANIC',
      status: driving && driving.condition < 0.82 ? 'EN ROUTE' : 'IN THE BAY',
    },
    {
      name: 'KIKI',
      role: 'LOOKOUT',
      status: wanted > 0 ? (game.police.status === 'search' ? 'BLACKOUT' : 'EYES ON') : 'ON THE CORNER',
    },
  ];
}

export function hudState(game) {
  const player = game.player;
  const driving = player.driving;
  const blips = [];
  for (const vehicle of game.vehicles.list) {
    const dx = vehicle.position.x - player.position.x;
    const dz = vehicle.position.z - player.position.z;
    if (dx * dx + dz * dz > 9600) continue;
    blips.push({
      x: vehicle.position.x,
      z: vehicle.position.z,
      yaw: vehicle.yaw,
      kind: vehicle.type,
      parked: !vehicle.driver,
      player: vehicle === driving,
    });
  }
  let vehiclePrompt = null;
  if (driving) {
    vehiclePrompt = { action: 'exit', name: driving.name };
  } else if (player.nearVehicle) {
    vehiclePrompt = {
      action: 'enter',
      name: player.nearVehicle.name,
      distance: player.nearVehicle.distanceToBox(player.position.x, player.position.z) + 0.4,
    };
  }
  const police = game.police.hudState;
  const radio = game.radio.state;
  return {
    player,
    objective: game.objective,
    radio: {
      ...radio,
      wheel: game.radioWheel.open
        ? { open: true, station: game.radioWheel.station, track: game.radioWheel.track }
        : { open: false },
    },
    clock: game.environment.clock,
    day: game.environment.day,
    period: game.environment.period,
    district: districtAt(player.position.x, player.position.z),
    street: streetAt(player.position.x, player.position.z),
    mall: game.world.mall
      ? { label: game.world.mall.label, bounds: game.world.mall.bounds }
      : null,
    parking: game.parking
      ? { occupied: game.parking.occupied, slots: game.parking.slots.length, valet: Boolean(game.parking.valet) }
      : null,
    missionCard: game.shot?.missionCard ?? game.missions.hudCard,
    missionActive: Boolean(game.missions.active),
    missionFailed: Boolean(game.missions.failure),
    respect: game.respectState(),
    crew: game.crewState(),
    vehicle: driving
      ? {
          name: driving.name,
          className: driving.className,
          tune: driving.tune,
          speedKmh: driving.speedKmh,
          gear: driving.gear,
          engineRpm: driving.engineRpm,
          condition: driving.condition,
          fuel: driving.fuel,
        }
      : null,
    vehicles: blips,
    density: game.traffic.density,
    vehiclePrompt,
    contextPrompt: game.interactions.prompt,
    police,
    weapons: game.player.combatState,
    down: game.down,
    subtitle: game.missions.subtitle,
    challenge: game.activities.challenge,
    fail: game.missions.failure,
    missionEnemies: game.missions.enemies.filter((enemy) => !enemy.dead && !enemy.removed).map((enemy) => ({ x: enemy.x, z: enemy.z })),
    effects: {
      hurt: game.effects.hurtLevel,
      lowHealth: player.health < 32,
      flash: player.damageFlash,
    },
    pickup: game.pickups.hint,
  };
}
