// The Harbor PD: a five-star wanted director with cruiser pursuit, PIT-style
// ramming, sidearm fire, foot officers at high heat, roadblocks, a search phase
// when the player breaks line of sight, and the busted/wasted handshake with
// main.js. Units are ordinary vehicles with a 'police' driver, so they obey the
// same arcade physics and collisions as the player's car.

import * as THREE from '../vendor/three.module.js';
import { POLICE, ROADS_X, ROADS_Z, WORLD } from './config.js';
import { makeRng } from './random.js';
import { AirUnit } from './police-air.js';
import {
  CRUISERS_PER_STAR, nearestRoad, rayLocalBox, raySphere, roadRoute, UNIT_CALLSIGNS,
} from './police-shared.js';
import { Officer } from './police-units.js';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

const _vec = new THREE.Vector3();
const _forward = new THREE.Vector3();

// ---------------------------------------------------------------- police

export class Police {
  constructor(scene, world, vehicles, player, traffic, effects, audio, options = {}) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.player = player;
    this.traffic = traffic;
    this.effects = effects;
    this.audio = audio;
    this.onDown = options.onDown ?? null;
    this.onHumanDeath = null;
    this.rng = makeRng(0x9c0ffee);
    this.time = 0;
    this.wanted = 0;
    this.status = 'patrol';
    this.units = [];
    this.officers = [];
    this.unitSpawnTimer = 0;
    this.roadblockTimer = 18;
    this.roadblock = null;
    this.lastSeen = -99;
    this.lastKnown = new THREE.Vector3();
    this.searchTimer = 0;
    this.decayTimer = 0;
    this.wantedFlash = 0;
    this.bustTimer = 0;
    this.down = null;
    this.notice = null;
    // One queued civilian 911 report. A second witnessed murder refreshes the
    // same slot instead of stacking a second call.
    this.witnessReport = null;
    this.staged = false;
    this.sightTimer = 0;
    this.playerVisible = false;
    this.sirenLevel = 0;
    this.sirenClock = 0;
    this.ramFlash = 0;
    this.callsignCursor = 0;
    this.air = new AirUnit(scene, world, player);
    this.air.update(0, 0, this);
  }

  nextCallsign() {
    const number = UNIT_CALLSIGNS[this.callsignCursor % UNIT_CALLSIGNS.length];
    this.callsignCursor += 1;
    return `UNIT ${String(number).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------- public

  notify(title, sub = '') {
    this.notice = { title, sub, life: 3.0 };
  }

  consumeNotice() {
    const notice = this.notice;
    this.notice = null;
    return notice;
  }

  addWanted(amount = 1, reason = '') {
    if (this.down) return;
    const next = clamp(this.wanted + amount, 0, 5);
    if (next === this.wanted) return;
    this.wanted = next;
    this.wantedFlash = 1;
    this.lastSeen = this.time;
    this.lastKnown.copy(this.player.position);
    this.status = 'pursuit';
    this.searchTimer = 0;
    this.decayTimer = 0;
    if (reason) this.notify(reason, `WANTED LEVEL ${this.wanted}`);
  }

  setWanted(stars, { silent = false } = {}) {
    this.wanted = clamp(Math.round(stars), 0, 5);
    this.wantedFlash = 1;
    this.lastSeen = this.time;
    this.lastKnown.copy(this.player.position);
    this.status = this.wanted > 0 ? 'pursuit' : 'patrol';
    this.searchTimer = 0;
    this.decayTimer = 0;
    if (this.wanted === 0) this.clearUnits();
    if (!silent && this.wanted > 0) this.notify('Harbor PD Alert', `WANTED LEVEL ${this.wanted}`);
  }

  clearWanted({ quiet = false } = {}) {
    const had = this.wanted;
    this.wanted = 0;
    this.status = 'patrol';
    this.bustTimer = 0;
    this.searchTimer = 0;
    this.decayTimer = 0;
    this.witnessReport = null;
    this.clearUnits();
    this.clearOfficers();
    this.roadblock = null;
    if (had > 0 && !quiet) this.notify('Heat Lost', 'HARBOR PD STOOD DOWN');
  }

  reportGunfire(x, z) {
    if (this.down) return;
    this.lastKnown.set(x, 0, z);
    if (this.wanted === 0) {
      let near = false;
      for (const unit of this.units) if (!unit.car?.removed && unit.car.position.distanceTo(this.player.position) < 90) near = true;
      for (const officer of this.officers) if (!officer.dead && Math.hypot(officer.x - x, officer.z - z) < 70) near = true;
      if (near) this.addWanted(1, 'Gunfire Reported');
    } else {
      this.lastSeen = this.time;
      this.lastKnown.set(x, 0, z);
      this.status = 'pursuit';
      this.decayTimer = 0;
    }
  }

  /** A civilian died from player damage. Police see it or the street calls 911. */
  reportCivilianDeath(x, z, { witnesses = 0 } = {}) {
    if (this.down) return;
    let policeWitness = false;
    for (const officer of this.officers) {
      if (officer.dead || officer.removed) continue;
      if (Math.hypot(officer.x - x, officer.z - z) < 70) {
        policeWitness = true;
        break;
      }
    }
    if (!policeWitness) {
      for (const unit of this.units) {
        if (!unit.car || unit.car.removed) continue;
        if (unit.car.position.distanceTo(this.player.position) < 90) {
          policeWitness = true;
          break;
        }
      }
    }
    if (!policeWitness && this.air) {
      const air = this.air.group.position;
      if (Math.hypot(air.x - x, air.z - z) < 90) policeWitness = true;
    }
    if (policeWitness) {
      if (this.wanted === 0) {
        this.addWanted(1, 'Civilian Killed');
      } else {
        this.lastSeen = this.time;
        this.lastKnown.set(x, 0, z);
        this.status = 'pursuit';
        this.searchTimer = 0;
        this.decayTimer = 0;
      }
      return;
    }
    if (witnesses > 0) this.witnessReport = { x, z, timer: 3 };
  }

  /** Civilian witnesses only raise heat after the 3 s 911 call. */
  updateWitnessReport(dt) {
    if (!this.witnessReport) return;
    this.witnessReport.timer -= dt;
    if (this.witnessReport.timer > 0) return;
    const { x, z } = this.witnessReport;
    this.witnessReport = null;
    if (this.down) return;
    if (this.wanted === 0) {
      this.addWanted(1, 'Witness Called 911');
    } else {
      this.lastSeen = this.time;
      this.lastKnown.set(x, 0, z);
      this.status = 'pursuit';
      this.searchTimer = 0;
      this.decayTimer = 0;
    }
  }

  reportCarTheft() {
    this.addWanted(2, 'Police Cruiser Stolen');
  }

  /** Called by player when a hitscan shot lands. Also used by effects-free tests. */
  applyPlayerHit(target, damage, { weapon = 'pistol' } = {}) {
    if (!target) return;
    if (target.officer) {
      const officer = target.officer;
      if (officer.dead) return;
      const amount = damage * (target.headshot ? 1.75 : 1);
      officer.health -= amount;
      this.lastSeen = this.time;
      this.lastKnown.copy(this.player.position);
      if (officer.health <= 0) {
        officer.dead = true;
        officer.deadTimer = 6;
        this.addWanted(2, 'Officer Down');
        this.onHumanDeath?.(officer.x, officer.z);
        // QA hits (and any future point-less target) still kill and loot; only
        // the cosmetic impact needs a world point.
        if (this.effects && target.point) this.effects.impact(target.point, null, 'metal');
        if (this.audio) this.audio.impact(1.2);
      } else {
        this.addWanted(1);
        if (this.effects && target.point) this.effects.impact(target.point, null, 'metal');
      }
      return;
    }
    if (target.unit) {
      const unit = target.unit;
      if (!unit.car || unit.car.removed) return;
      unit.health -= damage;
      this.lastSeen = this.time;
      this.lastKnown.copy(this.player.position);
      if (this.effects) this.effects.impact(target.point, null, 'metal');
      if (this.audio) this.audio.impact(0.7);
      if (target.headshot) this.addWanted(1);
      else this.addWanted(1);
      if (unit.health <= 0) this.destroyUnit(unit);
      return;
    }
    if (target.vehicle) {
      if (this.effects) this.effects.impact(target.point, null, 'metal');
      if (this.audio) this.audio.impact(0.5);
    }
  }

  /** Nearest solid thing the player's ray can hit, limited by the world hit. */
  traceShot(origin, direction, maxDistance) {
    let best = null;
    for (const officer of this.officers) {
      if (officer.dead || officer.removed) continue;
      const chest = raySphere(origin, direction, officer.x, officer.y + 1.16, officer.z, 0.48);
      const head = raySphere(origin, direction, officer.x, officer.y + 1.72, officer.z, 0.25);
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
          type: 'officer',
          officer,
          headshot,
          distance,
          point: new THREE.Vector3(origin.x + direction.x * distance, origin.y + direction.y * distance, origin.z + direction.z * distance),
        };
      }
    }
    for (const vehicle of this.vehicles.list) {
      if (vehicle.removed) continue;
      const halfWidth = vehicle.halfWidth + 0.08;
      const halfLength = vehicle.halfLength + 0.06;
      const distance = rayLocalBox(origin, direction, vehicle.yaw, vehicle.position.x, vehicle.position.z, halfWidth, halfLength, vehicle.position.y + 0.22, vehicle.position.y + 1.72);
      if (distance === null || distance > maxDistance) continue;
      if (best && distance >= best.distance) continue;
      const unit = this.units.find((entry) => entry.car === vehicle) ?? null;
      best = {
        type: unit ? 'unit' : 'vehicle',
        unit,
        vehicle,
        distance,
        point: new THREE.Vector3(origin.x + direction.x * distance, origin.y + direction.y * distance, origin.z + direction.z * distance),
      };
    }
    return best;
  }

  // ---------------------------------------------------------------- stage

  stageChase(spec, playerCar) {
    this.clearUnits();
    this.clearOfficers();
    this.staged = true;
    this.wanted = clamp(spec.wanted ?? 4, 0, 5);
    this.status = 'pursuit';
    this.lastSeen = this.time;
    this.lastKnown.copy(playerCar.position);
    this.wantedFlash = 0.4;
    for (const entry of spec.units ?? []) {
      const unit = this.spawnCruiserAt(entry.x, entry.z, entry.yaw, entry.mode ?? 'pursue', entry.callsign ?? null);
      if (!unit) continue;
      const speed = entry.speed ?? 0;
      unit.car.velocity.set(Math.sin(entry.yaw) * speed, 0, Math.cos(entry.yaw) * speed);
      unit.car.controls.throttle = entry.throttle ?? 0;
      unit.car.controls.brake = entry.mode === 'block' ? 1 : 0;
      unit.car.controls.handbrake = entry.mode === 'block';
      unit.car.controls.steer = 0;
      unit.shootTimer = entry.shootTimer ?? 1.1;
      unit.health = entry.health ?? 130;
    }
    for (const entry of spec.officers ?? []) {
      const officer = this.spawnOfficerAt(entry.x, entry.z, entry.yaw ?? 0, entry.callsign ?? null);
      if (officer) {
        officer.shootTimer = entry.shootTimer ?? officer.shootTimer;
        officer.losTimer = 0;
      }
    }
  }

  stageRoadblock(entries) {
    for (const entry of entries ?? []) {
      const unit = this.spawnCruiserAt(entry.x, entry.z, entry.yaw, 'block', entry.callsign ?? null);
      if (unit) {
        unit.car.controls.brake = 1;
        unit.car.controls.handbrake = true;
      }
    }
  }

  stageAir(spec = null) {
    if (spec) this.air.stage(spec);
    else this.air.staged = false;
  }

  // ---------------------------------------------------------------- spawning

  spawnCruiserAt(x, z, yaw, mode = 'pursue', callsign = null) {
    const car = this.vehicles.spawn('police', { x, z, yaw, color: 0x1d2029 });
    car.setDriver('police');
    car.ai = { police: true };
    car.controls.throttle = 0;
    car.controls.brake = 1;
    const unit = {
      car,
      callsign: callsign ?? this.nextCallsign(),
      mode,
      health: 130,
      maxHealth: 130,
      shootTimer: this.rng.range(0.8, 2.0),
      ramCooldown: 0,
      stuckTimer: 0,
      reverseTimer: 0,
      dismountTimer: 1.2,
      deployed: false,
      path: null,
      pathTimer: this.rng.range(0, 0.6),
      age: 0,
      distanceTimer: 0,
    };
    this.units.push(unit);
    if (this.effects) this.effects.registerVehicle(car);
    return unit;
  }

  spawnOfficerAt(x, z, yaw = 0, callsign = null) {
    if (this.officers.filter((officer) => !officer.removed).length >= POLICE.maxOfficers + 4) return null;
    const officer = new Officer(this.scene, this.world, x, z, this.rng);
    officer.yaw = yaw;
    officer.callsign = callsign ?? this.nextCallsign();
    officer.applyTransform();
    this.officers.push(officer);
    return officer;
  }

  findSpawnNode() {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    let best = null;
    let bestScore = -Infinity;
    for (const roadX of ROADS_X) {
      for (const roadZ of ROADS_Z) {
        const distance = Math.hypot(roadX - px, roadZ - pz);
        if (distance < 62 || distance > 165) continue;
        if (this.units.some((unit) => unit.car && !unit.car.removed && Math.hypot(unit.car.position.x - roadX, unit.car.position.z - roadZ) < 18)) continue;
        const score = -Math.abs(distance - 105) + this.rng.range(-12, 12);
        if (score > bestScore) {
          bestScore = score;
          best = { x: roadX, z: roadZ };
        }
      }
    }
    return best;
  }

  spawnPursuitUnit() {
    if (this.units.filter((unit) => unit.car && !unit.car.removed).length >= POLICE.maxCruisers + 2) return null;
    const node = this.findSpawnNode();
    if (!node) return null;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const yaw = Math.atan2(px - node.x, pz - node.z);
    return this.spawnCruiserAt(node.x, node.z, yaw, 'pursue');
  }

  // ---------------------------------------------------------------- removal

  clearUnits() {
    for (const unit of this.units) {
      if (unit.car) {
        if (this.effects) this.effects.unregisterVehicle(unit.car);
        this.vehicles.remove(unit.car);
      }
      unit.car = null;
    }
    this.units.length = 0;
  }

  clearOfficers() {
    for (const officer of this.officers) officer.remove();
    this.officers.length = 0;
  }

  removeUnit(unit) {
    if (unit.car) {
      if (this.effects) this.effects.unregisterVehicle(unit.car);
      this.vehicles.remove(unit.car);
      unit.car = null;
    }
    const index = this.units.indexOf(unit);
    if (index !== -1) this.units.splice(index, 1);
  }

  destroyUnit(unit) {
    if (!unit.car) return;
    const { x, y, z } = unit.car.position;
    if (this.effects) {
      this.effects.unregisterVehicle(unit.car);
      this.effects.explosion(x, y + 0.4, z);
    }
    if (this.audio) this.audio.explosion();
    this.vehicles.remove(unit.car);
    unit.car = null;
    this.addWanted(1, 'Cruiser Destroyed');
  }

  // ---------------------------------------------------------------- update

  update(dt, elapsed) {
    this.time = elapsed;
    this.air.update(dt, elapsed, this);
    if (this.down) {
      this.sirenLevel = Math.max(0, this.sirenLevel - dt * 0.6);
      if (this.audio) this.audio.setSiren(this.sirenLevel, dt);
      return;
    }
    this.wantedFlash = Math.max(0, this.wantedFlash - dt * 1.7);
    this.ramFlash = Math.max(0, this.ramFlash - dt * 3);
    this.updateWitnessReport(dt);

    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.28;
      this.playerVisible = this.isPlayerVisible();
    }
    if (this.time - this.player.lastGunfire < 1.3) this.playerVisible = true;

    if (!this.staged) {
      this.updateWanted(dt);
      this.updateSpawner(dt);
      this.updateRoadblock(dt);
    }

    this.updateUnits(dt);
    this.updateOfficers(dt);
    this.updateBusted(dt);
    this.updateSiren(dt);
  }

  updateWanted(dt) {
    if (this.wanted <= 0) {
      this.status = 'patrol';
      this.decayTimer = 0;
      this.searchTimer = 0;
      return;
    }
    if (this.playerVisible) {
      this.lastSeen = this.time;
      this.lastKnown.copy(this.player.position);
      if (this.status !== 'pursuit') this.status = 'pursuit';
      this.searchTimer = 0;
      this.decayTimer = 0;
      return;
    }
    if (this.time - this.lastSeen < POLICE.lostSightSeconds) return;
    if (this.status !== 'search') {
      this.status = 'search';
      this.notify('Searching', 'BREAK LINE OF SIGHT');
    }
    this.searchTimer += dt;
    if (this.searchTimer > POLICE.searchSeconds) {
      this.decayTimer += dt;
      if (this.decayTimer >= POLICE.decayStepSeconds) {
        this.decayTimer = 0;
        this.wanted = Math.max(0, this.wanted - 1);
        this.wantedFlash = 1;
        if (this.wanted === 0) {
          this.clearWanted();
        } else {
          this.notify('Heat Cooling', `WANTED LEVEL ${this.wanted}`);
        }
      }
    }
  }

  updateSpawner(dt) {
    if (this.wanted <= 0) return;
    this.unitSpawnTimer -= dt;
    if (this.unitSpawnTimer > 0) return;
    this.unitSpawnTimer = 1.4;
    const target = CRUISERS_PER_STAR[this.wanted] ?? 0;
    const active = this.units.filter((unit) => unit.car && !unit.car.removed).length;
    if (active < target) this.spawnPursuitUnit();
    const officerTarget = this.wanted >= POLICE.officersFromStars ? Math.min(POLICE.maxOfficers, this.wanted - 1) : 0;
    const activeOfficers = this.officers.filter((officer) => !officer.dead && !officer.removed).length;
    if (activeOfficers < officerTarget && this.status !== 'search') {
      const unit = this.units.find((entry) => entry.car && !entry.car.removed && !entry.deployed
        && entry.car.position.distanceTo(this.player.position) < 46);
      if (unit) this.dismount(unit);
    }
  }

  updateRoadblock(dt) {
    if (this.wanted < POLICE.roadblockFromStars) {
      this.roadblock = null;
      this.roadblockTimer = 12;
      return;
    }
    this.roadblockTimer -= dt;
    if (this.roadblockTimer > 0 || !this.player.driving || Math.abs(this.player.driving.speed) < 4) return;
    this.roadblockTimer = 30;
    const car = this.player.driving;
    const dirX = Math.sin(car.yaw);
    const dirZ = Math.cos(car.yaw);
    let blockX = car.position.x + dirX * 92;
    let blockZ = car.position.z + dirZ * 92;
    const roadHorizontal = Math.abs(nearestRoad(car.position.z, ROADS_Z) - car.position.z) < 8;
    if (roadHorizontal) {
      blockZ = nearestRoad(car.position.z, ROADS_Z);
      blockX = clamp(blockX, WORLD.cityMinX + 10, WORLD.cityMaxX - 10);
      for (let i = 0; i < 2; i += 1) {
        const unit = this.spawnCruiserAt(blockX, blockZ + (i === 0 ? -2.3 : 2.3), 0, 'block');
        if (unit) {
          unit.car.controls.brake = 1;
          unit.car.controls.handbrake = true;
        }
      }
      this.spawnOfficerAt(blockX - dirX * 7 - 2.4, blockZ - 3.4, Math.PI);
      this.spawnOfficerAt(blockX - dirX * 7 + 2.4, blockZ + 3.4, Math.PI);
    } else {
      blockX = nearestRoad(car.position.x, ROADS_X);
      blockZ = clamp(blockZ, WORLD.cityMinZ + 10, WORLD.cityMaxZ - 10);
      for (let i = 0; i < 2; i += 1) {
        const unit = this.spawnCruiserAt(blockX + (i === 0 ? -2.3 : 2.3), blockZ, Math.PI / 2, 'block');
        if (unit) {
          unit.car.controls.brake = 1;
          unit.car.controls.handbrake = true;
        }
      }
      this.spawnOfficerAt(blockX - 3.4, blockZ - dirZ * 7 - 2.4, 0);
      this.spawnOfficerAt(blockX + 3.4, blockZ - dirZ * 7 + 2.4, 0);
    }
    this.notify('Roadblock', 'HARBOR PD IS WAITING AHEAD');
    if (this.audio) {
      // Distant siren sting for the new block.
      this.audio.setSiren(0.8, 0);
    }
  }

  updateUnits(dt) {
    for (const unit of [...this.units]) {
      if (!unit.car || unit.car.removed) {
        this.removeUnit(unit);
        continue;
      }
      const car = unit.car;
      unit.age += dt;
      unit.ramCooldown = Math.max(0, unit.ramCooldown - dt);
      unit.shootTimer -= dt;
      unit.pathTimer -= dt;
      unit.distanceTimer += dt;

      const distance = car.position.distanceTo(this.player.position);
      if (distance > 260) {
        if (unit.distanceTimer > 4) {
          this.removeUnit(unit);
          continue;
        }
      } else {
        unit.distanceTimer = 0;
      }

      if (unit.mode === 'block') {
        car.controls.throttle = 0;
        car.controls.brake = 1;
        car.controls.handbrake = true;
        car.controls.steer = 0;
        if (distance < 34 && this.wanted > 0) {
          unit.mode = 'pursue';
          unit.dismountTimer = 0.8;
        }
      } else if (unit.deployed) {
        car.controls.throttle = 0;
        car.controls.brake = 1;
        car.controls.handbrake = true;
        car.controls.steer = 0;
      } else {
        this.driveUnit(unit, dt);
      }

      if (!unit.deployed && this.wanted >= POLICE.officersFromStars && distance < 28
        && (!this.player.driving || Math.abs(this.player.driving.speed) < 2.5)) {
        unit.dismountTimer -= dt;
        if (unit.dismountTimer <= 0) this.dismount(unit);
      } else {
        unit.dismountTimer = 1.2;
      }

      // The pier, the sand and (later) the mall block vehicles outright. The
      // 28 m dismount cannot fire from the far side of that line, so a cruiser
      // held at a blocked edge deploys its officers at once and they take over
      // on foot. A unit still driving on open road is never touched here.
      if (!unit.deployed && this.wanted >= POLICE.officersFromStars && distance < 110
        && typeof this.world.vehicleBlocked === 'function') {
        const carBlocked = this.world.vehicleBlocked(car.position.x, car.position.z, false);
        const aheadBlocked = this.world.vehicleBlocked(
          car.position.x + Math.sin(car.yaw) * 7,
          car.position.z + Math.cos(car.yaw) * 7,
          false,
        );
        const playerBlocked = this.world.vehicleBlocked(this.player.position.x, this.player.position.z, false);
        if ((carBlocked || aheadBlocked) && playerBlocked
          && (!this.player.driving || Math.abs(this.player.driving.speed) < 2.5)) {
          unit.dismountTimer = 0;
          this.dismount(unit);
        }
      }

      const holdingUp = !this.player.driving && Math.abs(this.player.speed) < 1.2 && !this.player.aiming;
      if (this.wanted >= POLICE.shootFromStars && distance < 44 && unit.shootTimer <= 0 && this.playerVisible
        && !(holdingUp && distance < 8)) {
        unit.shootTimer = this.rng.range(1.35, 2.4);
        this.cruiserShoot(unit);
      }
      this.ramCheck(unit, dt);
    }
  }

  driveUnit(unit, dt) {
    const car = unit.car;
    const player = this.player;
    const px = player.position.x;
    const pz = player.position.z;
    const distance = car.position.distanceTo(player.position);
    let targetX = px;
    let targetZ = pz;
    if (this.status === 'search' && !this.playerVisible) {
      targetX = this.lastKnown.x;
      targetZ = this.lastKnown.z;
    } else if (!player.driving) {
      // Aim slightly behind a runner so cruisers do not drive through them.
      targetX += player.velocity.x * 0.25;
      targetZ += player.velocity.z * 0.25;
    } else {
      targetX += player.driving.velocity.x * 0.35;
      targetZ += player.driving.velocity.z * 0.35;
    }

    if (distance > 40 && unit.pathTimer <= 0) {
      unit.pathTimer = 0.9;
      const path = roadRoute(car.position.x, car.position.z, targetX, targetZ);
      unit.path = path.length > 0 ? path : null;
      if (unit.path && unit.path.length > 0 && Math.hypot(unit.path[0].x - car.position.x, unit.path[0].z - car.position.z) < 9) {
        unit.path.shift();
      }
    }
    if (distance > 36 && unit.path && unit.path.length > 0) {
      targetX = unit.path[0].x;
      targetZ = unit.path[0].z;
      if (Math.hypot(targetX - car.position.x, targetZ - car.position.z) < 12) unit.path.shift();
    }

    const dx = targetX - car.position.x;
    const dz = targetZ - car.position.z;
    const error = Math.atan2(dx, dz) - car.yaw;
    const wrapped = Math.atan2(Math.sin(error), Math.cos(error));
    car.controls.steer = clamp(wrapped * 2.3, -1, 1);
    car.controls.handbrake = false;

    const close = distance < 46;
    let desired = car.spec.maxSpeed * (close ? POLICE.cruiseSpeed : 0.86);
    if (Math.abs(wrapped) > 0.72) desired = Math.min(desired, 13);
    if (this.status === 'search') desired = Math.min(desired, 17);
    const speed = car.speed;
    if (unit.reverseTimer > 0) {
      unit.reverseTimer -= dt;
      car.controls.throttle = -0.72;
      car.controls.brake = 0;
      car.controls.steer = -car.controls.steer;
      return;
    }
    if (speed < desired - 0.4) {
      car.controls.throttle = clamp((desired - speed) * 0.3, 0.22, 1);
      car.controls.brake = 0;
    } else if (speed > desired + 1.5) {
      car.controls.throttle = 0;
      car.controls.brake = clamp((speed - desired) * 0.32, 0.18, 1);
    } else {
      car.controls.throttle = 0.12;
      car.controls.brake = 0;
    }

    if (Math.abs(speed) < 0.65 && unit.age > 2.5) unit.stuckTimer += dt;
    else unit.stuckTimer = 0;
    if (unit.stuckTimer > 1.5) {
      unit.stuckTimer = 0;
      unit.reverseTimer = 0.9;
    }
  }

  dismount(unit) {
    if (!unit.car || unit.deployed) return;
    unit.deployed = true;
    unit.dismountTimer = 1.2;
    unit.car.controls.brake = 1;
    unit.car.controls.handbrake = true;
    unit.car.velocity.multiplyScalar(0.2);
    const car = unit.car;
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    const side = this.rng.chance(0.5) ? 1 : -1;
    const x = car.position.x + cos * side * (car.halfWidth + 0.9) + sin * 1.2;
    const z = car.position.z - sin * side * (car.halfWidth + 0.9) + cos * 1.2;
    if (!this.world.collides(x, z, 0.4)) {
      this.spawnOfficerAt(x, z, car.yaw + Math.PI);
    } else {
      this.spawnOfficerAt(car.position.x - sin * 3.2, car.position.z - cos * 3.2, car.yaw + Math.PI);
    }
    if (this.audio) this.audio.impact(0.5);
  }

  ramCheck(unit, dt) {
    const car = unit.car;
    if (!car || unit.ramCooldown > 0) return;
    const player = this.player;
    if (player.driving) {
      const target = player.driving;
      const dx = target.position.x - car.position.x;
      const dz = target.position.z - car.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 4.9) {
        const relative = Math.abs(car.speed - target.speed);
        if (relative > 5.5) {
          unit.ramCooldown = 1.1;
          this.ramFlash = 1;
          const damage = clamp(4 + relative * 0.45, 5, 17);
          this.damagePlayer(damage, car.position.x, car.position.z, 'RAMMED');
          if (this.effects) {
            this.effects.impact(new THREE.Vector3((car.position.x + target.position.x) / 2, car.position.y + 0.8, (car.position.z + target.position.z) / 2), null, 'metal');
            this.effects.shake(0.5);
          }
          if (this.audio) this.audio.impact(1.3);
        }
      }
    } else {
      const dx = player.position.x - car.position.x;
      const dz = player.position.z - car.position.z;
      if (dx * dx + dz * dz < 7.2 && Math.abs(car.speed) > 6) {
        // The cruiser rams through the same player-side push-out as every
        // civilian car: one shared cooldown, one damage hit, one knockdown.
        if (player.hitByVehicle(car, 18)) unit.ramCooldown = 1.4;
        if (this.effects) this.effects.shake(0.7);
      }
    }
  }

  cruiserShoot(unit) {
    const car = unit.car;
    if (!car) return;
    const player = this.player;
    const muzzle = new THREE.Vector3(
      car.position.x + Math.cos(car.yaw) * 0.8 + Math.sin(car.yaw) * 1.4,
      car.position.y + 1.15,
      car.position.z - Math.sin(car.yaw) * 0.8 + Math.cos(car.yaw) * 1.4,
    );
    const target = new THREE.Vector3(player.position.x, player.position.y + 1.15, player.position.z);
    target.x += (Math.random() - 0.5) * 2.6;
    target.y += (Math.random() - 0.5) * 0.9;
    target.z += (Math.random() - 0.5) * 2.6;
    const direction = target.sub(muzzle).normalize();
    if (this.world.lineBlocked(muzzle.x, muzzle.y, muzzle.z, player.position.x, player.position.y + 1.1, player.position.z, 0.3)) return;
    const hit = Math.random() < 0.54;
    const endpoint = new THREE.Vector3();
    if (hit) {
      endpoint.set(player.position.x, player.position.y + 1.1, player.position.z);
      this.damagePlayer(7 + Math.random() * 4, car.position.x, car.position.z);
    } else {
      endpoint.copy(muzzle).addScaledVector(direction, 38);
      const worldHit = this.world.raycast(muzzle, direction, 38);
      if (worldHit) {
        endpoint.copy(worldHit.point);
        if (this.effects) this.effects.impact(worldHit.point, worldHit.normal, 'concrete');
      }
    }
    if (this.effects) {
      this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd59a);
      this.effects.tracer(muzzle, endpoint, 0xffcf8a);
    }
    if (this.audio) this.audio.gunshot('pistol');
  }

  updateOfficers(dt) {
    for (const officer of [...this.officers]) {
      if (officer.removed) {
        const index = this.officers.indexOf(officer);
        if (index !== -1) this.officers.splice(index, 1);
        continue;
      }
      officer.update(dt, this.player, this);
      if (officer.dead) continue;
      if (this.down || this.wanted <= 0) continue;
      const distance = Math.hypot(officer.x - this.player.position.x, officer.z - this.player.position.z);
      if (distance > 140) {
        officer.remove();
        continue;
      }
      officer.losTimer -= dt;
      if (officer.losTimer <= 0) {
        officer.losTimer = 0.45;
        officer.los = distance < 36 && !this.world.lineBlocked(
          officer.x,
          officer.y + 1.35,
          officer.z,
          this.player.position.x,
          this.player.position.y + 1.2,
          this.player.position.z,
          0.2,
        );
      }
      officer.shootTimer -= dt;
      const holdingUp = !this.player.driving && Math.abs(this.player.speed) < 1.2 && !this.player.aiming;
      if (officer.los && distance < 38 && officer.shootTimer <= 0 && !(holdingUp && distance < 8)) {
        officer.shootTimer = this.rng.range(1.25, 2.3);
        this.officerShoot(officer);
      }
    }
  }

  officerShoot(officer) {
    const player = this.player;
    const muzzle = new THREE.Vector3(officer.x + Math.sin(officer.yaw) * 0.66, officer.y + 1.33, officer.z + Math.cos(officer.yaw) * 0.66);
    const target = new THREE.Vector3(player.position.x, player.position.y + 1.1, player.position.z);
    target.x += (Math.random() - 0.5) * 1.8;
    target.z += (Math.random() - 0.5) * 1.8;
    const direction = target.sub(muzzle).normalize();
    const hit = Math.random() < 0.6;
    const endpoint = new THREE.Vector3();
    if (hit) {
      endpoint.set(player.position.x, player.position.y + 1.05, player.position.z);
      this.damagePlayer(8 + Math.random() * 5, officer.x, officer.z);
    } else {
      endpoint.copy(muzzle).addScaledVector(direction, 30);
    }
    if (this.effects) {
      this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd59a);
      this.effects.tracer(muzzle, endpoint, 0xffcf8a);
    }
    if (this.audio) this.audio.gunshot('pistol');
  }

  damagePlayer(amount, fromX, fromZ, cause = '') {
    if (this.down) return;
    const dead = this.player.applyDamage(amount, fromX, fromZ);
    if (cause && this.effects) this.effects.flash(fromX, this.player.position.y + 1.2, fromZ, { color: 0xff6a5c, scale: 1.1, life: 0.08, grow: 1 });
    if (dead) this.triggerDown('wasted');
  }

  updateBusted(dt) {
    if (this.wanted <= 0 || this.down) {
      this.bustTimer = 0;
      return;
    }
    if (this.player.driving || this.player.dead || this.player.aiming
      || this.player.playSeconds - this.player.lastGunfire < 1.2) {
      this.bustTimer = 0;
      return;
    }
    let close = false;
    if (Math.abs(this.player.speed) < 0.9) {
      for (const officer of this.officers) {
        if (officer.dead) continue;
        if (Math.hypot(officer.x - this.player.position.x, officer.z - this.player.position.z) < POLICE.bustRange) {
          close = true;
          break;
        }
      }
      if (!close) {
        for (const unit of this.units) {
          if (!unit.car || unit.car.removed) continue;
          if (unit.car.position.distanceTo(this.player.position) < POLICE.bustRange + 0.8 && Math.abs(unit.car.speed) < 2) {
            close = true;
            break;
          }
        }
      }
    }
    if (close) {
      this.bustTimer += dt;
      if (this.bustTimer >= POLICE.bustSeconds) {
        this.bustTimer = 0;
        this.triggerDown('busted');
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 1.8);
    }
  }

  updateSiren(dt) {
    let nearest = Infinity;
    for (const unit of this.units) {
      if (!unit.car || unit.car.removed) continue;
      nearest = Math.min(nearest, unit.car.position.distanceTo(this.player.position));
    }
    for (const officer of this.officers) {
      if (officer.dead) continue;
      nearest = Math.min(nearest, Math.hypot(officer.x - this.player.position.x, officer.z - this.player.position.z));
    }
    let target = 0;
    if (!this.down && this.wanted > 0 && nearest < 160) {
      target = clamp(1 - nearest / 170, 0.28, 1);
      if (this.status === 'search') target *= 0.62;
    }
    this.sirenLevel = damp(this.sirenLevel, target, 4, dt);
    if (this.audio) this.audio.setSiren(this.sirenLevel, dt);
  }

  isPlayerVisible() {
    const px = this.player.position.x;
    const py = this.player.position.y + 1.2;
    const pz = this.player.position.z;
    const inCar = Boolean(this.player.driving);
    for (const unit of this.units) {
      if (!unit.car || unit.car.removed) continue;
      const distance = unit.car.position.distanceTo(this.player.position);
      if (distance > POLICE.sightRange) continue;
      if (distance < 24) return true;
      if (this.staged) return true;
      if (!this.world.lineBlocked(unit.car.position.x, unit.car.position.y + 1.4, unit.car.position.z, px, py, pz, 0.5)) return true;
    }
    for (const officer of this.officers) {
      if (officer.dead || officer.removed) continue;
      const distance = Math.hypot(officer.x - px, officer.z - pz);
      if (distance > 34) continue;
      if (distance < 12) return true;
      if (!this.world.lineBlocked(officer.x, officer.y + 1.4, officer.z, px, py, pz, 0.2)) return true;
    }
    if (inCar && this.time - this.lastSeen < 0.4) return true;
    return false;
  }

  triggerDown(type) {
    if (this.down) return;
    this.down = type;
    this.bustTimer = 0;
    this.witnessReport = null;
    for (const unit of this.units) {
      if (!unit.car) continue;
      unit.car.controls.throttle = 0;
      unit.car.controls.brake = 1;
      unit.car.controls.handbrake = true;
    }
    if (this.audio) {
      if (type === 'busted') this.audio.busted();
      else this.audio.wasted();
    }
    if (this.onDown) this.onDown(type);
  }

  resetAfterDown() {
    this.down = null;
    this.wanted = 0;
    this.status = 'patrol';
    this.bustTimer = 0;
    this.searchTimer = 0;
    this.decayTimer = 0;
    this.lastSeen = -99;
    this.witnessReport = null;
    this.staged = false;
    this.sirenLevel = 0;
    this.roadblock = null;
    this.roadblockTimer = 18;
    this.air.staged = false;
    this.clearUnits();
    this.clearOfficers();
  }

  get hudState() {
    const player = this.player.position;
    const units = this.units
      .filter((unit) => unit.car && !unit.car.removed)
      .map((unit) => {
        const distance = Math.round(unit.car.position.distanceTo(player));
        const role = unit.mode === 'block'
          ? 'ROADBLOCK'
          : unit.deployed
            ? 'ON FOOT'
            : distance <= 10
              ? 'RAMMING'
              : 'PURSUIT';
        return {
          kind: 'unit',
          callsign: unit.callsign,
          role,
          distance,
          x: unit.car.position.x,
          z: unit.car.position.z,
          yaw: unit.car.yaw,
          speed: unit.car.speed,
          mode: unit.mode,
          deployed: unit.deployed,
        };
      });
    const officers = this.officers
      .filter((officer) => !officer.dead && !officer.removed)
      .map((officer) => {
        const distance = Math.round(Math.hypot(officer.x - player.x, officer.z - player.z));
        return {
          kind: 'officer',
          callsign: officer.callsign,
          role: distance <= 32 ? 'CLOSING IN' : 'ON FOOT',
          distance,
          x: officer.x,
          z: officer.z,
          yaw: officer.yaw,
        };
      });
    const air = this.air.hudState(this.player);
    const roster = [
      ...units.map(({ kind, callsign, role, distance }) => ({ kind, callsign, role, distance })),
      ...officers.map(({ kind, callsign, role, distance }) => ({ kind, callsign, role, distance })),
      { kind: 'air', callsign: 'AIR 1', role: air.spotlight ? 'SPOTLIGHT' : 'PATROL', distance: air.distance },
    ].sort((a, b) => a.distance - b.distance);
    const overflow = roster.slice(5);
    const extra = overflow.length > 0
      ? {
          count: overflow.length,
          hint: overflow.some((entry) => entry.role === 'ROADBLOCK')
            ? 'roadblock ahead'
            : overflow.some((entry) => entry.kind === 'air')
              ? 'air unit overhead'
              : 'closing in',
        }
      : null;
    return {
      wanted: this.wanted,
      status: this.status,
      wantedFlash: this.wantedFlash,
      bustProgress: this.bustTimer / POLICE.bustSeconds,
      down: this.down,
      ramFlash: this.ramFlash,
      sirenLevel: this.sirenLevel,
      units,
      officers,
      roster,
      rosterCount: roster.length,
      extra,
      air,
    };
  }
}
