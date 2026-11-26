// Neon Harbor E2E groups 1-4: pedestrians, pickups and the player/officer fire paths.
// Entries are moved verbatim from tools/test-npc-loot.mjs.
export const groups = [
  {
    name: 'test 1: pedestrians',
    shot: 'street',
    body: function pedestrians() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const traffic = neon && neon.debug && neon.debug.traffic;
      const player = neon && neon.debug && neon.debug.player;
      const camera = neon && neon.debug && neon.debug.camera;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!neon || !neon.pedestrians) missing.push('__neon.pedestrians');
      if (!traffic || typeof traffic.spawnPed !== 'function') missing.push('traffic.spawnPed');
      if (!traffic || typeof traffic.traceShot !== 'function') missing.push('traffic.traceShot');
      if (!traffic || typeof traffic.applyPlayerHit !== 'function') missing.push('traffic.applyPlayerHit');
      if (!player || !player.position) missing.push('__neon.debug.player');
      if (!camera || !camera.position) missing.push('__neon.debug.camera');
      check('test 1: QA hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const round = (value) => Math.round(value * 10) / 10;
      const before = neon.pedestrians;
      const spawnX = player.position.x - Math.sin(player.cameraYaw) * 3;
      const spawnZ = player.position.z - Math.cos(player.cameraYaw) * 3;
      const ped = traffic.spawnPed({ x: spawnX, z: spawnZ });
      check('test 1: pedestrian spawns', Boolean(ped), 'spawnPed returned null (no free crowd slot)');
      if (!ped) return results;

      const afterSpawn = neon.pedestrians;
      check('test 1: alive count rose by one', afterSpawn.alive === before.alive + 1, `${before.alive} -> ${afterSpawn.alive}`);
      const near = afterSpawn.near.find((entry) => entry.x === round(spawnX) && entry.z === round(spawnZ));
      check(
        'test 1: spawned pedestrian reported near the player',
        Boolean(near) && near.health === 55 && near.dead === false,
        JSON.stringify(afterSpawn.near),
      );

      const cam = camera.position;
      const dx = ped.x - cam.x;
      const dy = ped.y + 1.12 * ped.scale - cam.y;
      const dz = ped.z - cam.z;
      const length = Math.hypot(dx, dy, dz);
      const direction = { x: dx / length, y: dy / length, z: dz / length };
      const hit = traffic.traceShot(cam, direction, 100);
      check(
        'test 1: chest ray hits the pedestrian',
        Boolean(hit) && hit.ped === ped && hit.type === 'ped',
        JSON.stringify(hit && { type: hit.type, distance: hit.distance, headshot: hit.headshot }),
      );

      const bounded = traffic.traceShot(cam, direction, hit ? hit.distance - 1 : 0);
      check('test 1: bounded ray misses', bounded === null, JSON.stringify(bounded && { type: bounded.type }));

      const bystander = traffic.spawnPed({ x: ped.x, z: ped.z + 2, armed: false });
      check('test 1: bystander spawns', Boolean(bystander), 'spawnPed returned null (no free crowd slot)');
      const resumeTarget = { x: bystander ? bystander.x + 5 : 0, z: bystander ? bystander.z : 0 };
      if (bystander) bystander.target = { x: resumeTarget.x, z: resumeTarget.z };
      // The panic radius is 14 m: 13 m must run, 15 m must not.
      const panicNear = traffic.spawnPed({ x: ped.x + 13, z: ped.z, armed: false });
      const panicFar = traffic.spawnPed({ x: ped.x + 15, z: ped.z, armed: false });
      check('test 1: the panic-radius pair spawns', Boolean(panicNear) && Boolean(panicFar), 'spawnPed returned null');

      const beforeKill = neon.pedestrians;
      traffic.applyPlayerHit(hit, 34);
      traffic.applyPlayerHit(hit, 34);
      const afterKill = neon.pedestrians;
      check(
        'test 1: two 34-damage hits kill the pedestrian',
        ped.dead === true && ped.health === 0,
        `dead=${ped.dead} health=${ped.health}`,
      );
      check('test 1: alive count dropped by one', afterKill.alive === beforeKill.alive - 1, `${beforeKill.alive} -> ${afterKill.alive}`);

      const corpseRay = traffic.traceShot(cam, direction, 100);
      check('test 1: dead pedestrian is not targetable', corpseRay === null, JSON.stringify(corpseRay && { type: corpseRay.type }));

      check(
        'test 1: the death panic starts a 6 s flee timer on the bystander',
        Boolean(bystander) && bystander.fleeTimer === 6,
        `fleeTimer=${bystander && bystander.fleeTimer}`,
      );
      check(
        'test 1: a pedestrian 13 m from the body panics at the 14 m radius',
        Boolean(panicNear) && panicNear.fleeTimer === 6,
        `fleeTimer=${panicNear && panicNear.fleeTimer}`,
      );
      check(
        'test 1: a pedestrian 15 m from the body stays calm',
        Boolean(panicFar) && panicFar.fleeTimer === 0,
        `fleeTimer=${panicFar && panicFar.fleeTimer}`,
      );
      check(
        'test 1: the panic saves the bystander target for the resume',
        Boolean(bystander) && Boolean(bystander.fleeResumeTarget)
          && bystander.fleeResumeTarget.x === resumeTarget.x
          && bystander.fleeResumeTarget.z === resumeTarget.z,
        JSON.stringify(bystander && bystander.fleeResumeTarget),
      );
      check('test 1: a fresh corpse starts at fall 0', ped.fall === 0, `fall=${ped.fall}`);
      check('test 1: the crowd panics', neon.pedestrians.fleeing >= 1, `fleeing=${neon.pedestrians.fleeing}`);

      // The fall takes 0.45 s (updatePeds: ped.fall += dt / 0.45). Step small
      // enough to see it leave 0, stay under 1 at 0.44 s and clamp at 0.45 s.
      traffic.update(0.2, 0);
      const fallEarly = ped.fall;
      check('test 1: the corpse is mid-fall after 0.2 s', fallEarly > 0 && fallEarly < 1, `fall=${fallEarly}`);
      traffic.update(0.2, 0);
      check('test 1: the corpse is still falling after 0.4 s', ped.fall > fallEarly && ped.fall < 1, `fall=${ped.fall}`);
      traffic.update(0.04, 0);
      check('test 1: the corpse is still falling after 0.44 s', ped.fall < 1, `fall=${ped.fall}`);
      traffic.update(0.02, 0);
      check('test 1: the corpse reaches fall 1 at the 0.45 s fall duration', ped.fall === 1, `fall=${ped.fall}`);

      // The flee branch walks at ped.speed * 1.6; over a fixed dt the
      // displacement is exact, so the multiplier is observable.
      const fleeX = bystander.x;
      const fleeZ = bystander.z;
      const fleeSpeed = bystander.speed;
      traffic.update(0.1, 0);
      const fleeMoved = Math.hypot(bystander.x - fleeX, bystander.z - fleeZ);
      check(
        'test 1: the fleeing pedestrian moves at 1.6x its walk speed',
        Math.abs(fleeMoved - fleeSpeed * 1.6 * 0.1) < 1e-6,
        `moved=${fleeMoved.toFixed(6)} expected=${(fleeSpeed * 1.6 * 0.1).toFixed(6)}`,
      );

      // The corpse timer is 8 s. At 7.86 s the body is still in the crowd; at
      // 8.06 s the same pedestrian is gone.
      traffic.update(7.3, 0);
      check(
        'test 1: the corpse is still in the crowd just before eight seconds',
        ped.active === true && neon.pedestrians.dead >= 1,
        `active=${ped.active} dead=${neon.pedestrians.dead}`,
      );
      const resumed = neon.debug.traffic.peds.find((entry) => entry === bystander);
      check(
        'test 1: panic resumes the previous target',
        Boolean(resumed) && resumed.target.x === resumeTarget.x && resumed.target.z === resumeTarget.z,
        JSON.stringify(resumed && resumed.target),
      );
      traffic.update(0.2, 0);
      check('test 1: the corpse despawns after eight seconds', ped.active === false, `active=${ped.active}`);

      // A pedestrian that dies while panicking must stop counting as fleeing.
      // The pair is 212 m from the player, away from every seeded or ambient
      // slot, so only these two pedestrians react to each other.
      const farX = player.position.x + 150;
      const farZ = player.position.z + 150;
      const fleeVictim = traffic.spawnPed({ x: farX, z: farZ, armed: false });
      const fleeCorpse = traffic.spawnPed({ x: farX + 2, z: farZ, armed: false });
      check('test 1: the fleeing-corpse pair spawns', Boolean(fleeVictim) && Boolean(fleeCorpse), 'spawnPed returned null');
      if (fleeVictim && fleeCorpse) {
        const fleeingBeforePanic = neon.pedestrians.fleeing;
        traffic.applyPlayerHit({ ped: fleeVictim, headshot: false }, 500);
        const fleeingAfterPanic = neon.pedestrians.fleeing;
        check(
          'test 1: a bystander starts fleeing at the 6 s panic duration',
          fleeCorpse.fleeTimer === 6 && fleeingAfterPanic === fleeingBeforePanic + 1,
          `fleeTimer=${fleeCorpse.fleeTimer} fleeing ${fleeingBeforePanic} -> ${fleeingAfterPanic}`,
        );
        traffic.applyPlayerHit({ ped: fleeCorpse, headshot: false }, 34);
        traffic.applyPlayerHit({ ped: fleeCorpse, headshot: false }, 34);
        const fleeingAfterDeath = neon.pedestrians.fleeing;
        check(
          'test 1: a pedestrian killed while fleeing is not counted as fleeing',
          fleeCorpse.dead === true && fleeCorpse.fleeTimer === 0 && fleeingAfterDeath === fleeingAfterPanic - 1,
          `dead=${fleeCorpse.dead} fleeTimer=${fleeCorpse.fleeTimer} fleeing ${fleeingAfterPanic} -> ${fleeingAfterDeath}`,
        );
      }

      // Headshot: 34 * the game's headshot multiplier kills a 55 hp pedestrian
      // in one hit, while one 34-damage body hit leaves it alive.
      const headPed = traffic.spawnPed({ x: player.position.x - 150, z: player.position.z + 150 });
      const bodyPed = traffic.spawnPed({ x: player.position.x - 150, z: player.position.z + 180 });
      check('test 1: the headshot and body targets spawn', Boolean(headPed) && Boolean(bodyPed), 'spawnPed returned null');
      if (headPed && bodyPed) {
        traffic.applyPlayerHit(
          { ped: bodyPed, headshot: false, point: { x: bodyPed.x, y: bodyPed.y + 1.12 * bodyPed.scale, z: bodyPed.z } },
          34,
        );
        check(
          'test 1: one 34-damage body shot leaves a full-health pedestrian alive',
          bodyPed.dead === false && bodyPed.health === 55 - 34,
          `dead=${bodyPed.dead} health=${bodyPed.health}`,
        );
        traffic.applyPlayerHit(
          { ped: headPed, headshot: true, point: { x: headPed.x, y: headPed.y + 1.55 * headPed.scale, z: headPed.z } },
          34,
        );
        check(
          'test 1: one 34-damage headshot kills a full-health pedestrian',
          headPed.dead === true && headPed.health === 0,
          `dead=${headPed.dead} health=${headPed.health}`,
        );
      }
      return results;
    },
  },
  {
    name: 'test 2: pickups',
    shot: 'street',
    body: function pickups() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const player = neon && neon.debug && neon.debug.player;
      const pickups = neon && neon.debug && neon.debug.pickups;
      const world = neon && neon.debug && neon.debug.world;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!player || !player.position) missing.push('__neon.debug.player');
      if (!pickups || typeof pickups.spawnDrop !== 'function') missing.push('__neon.debug.pickups.spawnDrop');
      if (!pickups || typeof pickups.spawnDeathLoot !== 'function') missing.push('__neon.debug.pickups.spawnDeathLoot');
      if (!world || typeof world.groundHeightAt !== 'function') missing.push('__neon.debug.world.groundHeightAt');
      if (!neon || !neon.loot) missing.push('__neon.loot');
      if (!neon || !neon.combat || typeof neon.combat.cash !== 'number') missing.push('__neon.combat.cash');
      check('test 2: loot hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const p = player;
      const pk = pickups;

      const cashBefore = neon.combat.cash;
      const cashDrop = pk.spawnDrop({ x: p.position.x, z: p.position.z, kind: 'cash', amount: 40 });
      pk.update(0.016, p);
      check(
        'test 2: a cash drop pays out',
        neon.combat.cash === cashBefore + 40,
        `cash ${cashBefore} -> ${neon.combat.cash}`,
      );
      check('test 2: collected cash leaves no live loot', neon.loot.count === 0, JSON.stringify(neon.loot.items));
      const cashAfterCollect = neon.combat.cash;
      pk.update(40, p);
      check(
        'test 2: a spent cash drop never respawns',
        neon.combat.cash === cashAfterCollect && neon.loot.count === 0 && !pk.items.includes(cashDrop),
        `cash ${cashAfterCollect} -> ${neon.combat.cash} loot=${neon.loot.count}`,
      );

      const reserveBefore = neon.combat.reserve;
      pk.spawnDrop({ x: p.position.x, z: p.position.z, kind: 'pistol', amount: 12 });
      pk.update(0.016, p);
      check(
        'test 2: a pistol drop tops up the reserve',
        neon.combat.reserve === reserveBefore + 12,
        `reserve ${reserveBefore} -> ${neon.combat.reserve}`,
      );

      const dropX = p.position.x + 40;
      const dropZ = p.position.z;
      const expiring = pk.spawnDrop({ x: dropX, z: dropZ, kind: 'cash', amount: 25, expire: 30 });
      const live = neon.loot.items.find((entry) => entry.kind === 'cash' && entry.x === dropX && entry.z === dropZ);
      check(
        'test 2: live loot reports the spawned amount and position',
        Boolean(live) && live.amount === 25 && live.x === dropX && live.z === dropZ,
        JSON.stringify(neon.loot.items),
      );
      pk.update(31, p);
      check(
        'test 2: an expired drop is released from the pickups list',
        !pk.items.includes(expiring) && pk.items.every((entry) => !entry.removed),
        `items=${pk.items.length} removed=${pk.items.filter((entry) => entry.removed).length}`,
      );
      check('test 2: a drop expires while the player is away', neon.loot.count === 0, JSON.stringify(neon.loot.items));

      const resetDrop = pk.spawnDrop({ x: p.position.x + 20, z: p.position.z, kind: 'cash', amount: 10 });
      const beforeReset = neon.loot.count;
      pk.reset();
      check(
        'test 2: reset purges one-shot drops',
        beforeReset === 1 && neon.loot.count === 0 && !pk.items.includes(resetDrop),
        `before=${beforeReset} after=${neon.loot.count} items=${pk.items.length}`,
      );

      for (let i = 0; i < 20; i += 1) pk.spawnDeathLoot(p.position.x + 30 + i, p.position.z, { smgOwned: false });
      const kinds = neon.loot.items.map((item) => item.kind);
      check(
        'test 2: no SMG drop without an owned SMG',
        kinds.length === 20 && !kinds.includes('smg'),
        kinds.join(', '),
      );

      const item = pk.spawnDrop({ x: -210, z: 70, kind: 'cash', amount: 25 });
      const expected = world.groundHeightAt(-210, 70);
      check(
        'test 2: the drop sits on the pier deck',
        Boolean(item) && item.y === expected && expected > 1,
        `y=${item && item.y} expected=${expected}`,
      );
      return results;
    },
  },
  {
    name: 'test 3: player fire path',
    shot: 'street',
    body: function firePath() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const traffic = debug && debug.traffic;
      const camera = debug && debug.camera;
      const missing = [];
      if (!neon || !neon.loot) missing.push('__neon.loot');
      if (!traffic || typeof traffic.spawnPed !== 'function') missing.push('traffic.spawnPed');
      if (!player || typeof player.fireWeapon !== 'function') missing.push('player.fireWeapon');
      if (!camera || !camera.position) missing.push('__neon.debug.camera');
      check('test 3: fire-path hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const p = player;
      const spawnX = p.position.x - Math.sin(p.cameraYaw) * 3;
      const spawnZ = p.position.z - Math.cos(p.cameraYaw) * 3;
      const ped = traffic.spawnPed({ x: spawnX, z: spawnZ });
      check('test 3: pedestrian spawns down the aim', Boolean(ped), 'spawnPed returned null (no free crowd slot)');
      if (!ped) return results;

      p.cameraYaw = Math.atan2(-(ped.x - p.position.x), -(ped.z - p.position.z));
      p.cameraPitch = -0.27;
      // At the shot's 5.5 m orbit the -0.27 pitch puts the camera below the
      // chest and the ray climbs over a target 3 m ahead. The pitch is level at
      // the min orbit, so pin the distance there; the aim values stay exact.
      p.cameraDistance = 3.1;
      p.fireCooldown = 0;
      p.updateView(camera, 1 / 60, true);

      const healthBefore = ped.health;
      const lootBefore = neon.loot.count;
      p.fireWeapon(camera);
      check(
        'test 3: fireWeapon damages the pedestrian',
        ped.health < healthBefore || ped.dead === true,
        `health ${healthBefore} -> ${ped.health} dead=${ped.dead}`,
      );

      p.fireCooldown = 0;
      p.fireWeapon(camera);
      check('test 3: two pistol shots kill the pedestrian', ped.dead === true, `health=${ped.health} dead=${ped.dead}`);
      check(
        'test 3: the pedestrian death spawns loot',
        neon.loot.count >= 1 && neon.loot.count > lootBefore,
        `loot ${lootBefore} -> ${neon.loot.count}`,
      );
      return results;
    },
  },
  {
    name: 'test 4: officer fire path',
    shot: 'blockade',
    body: function officerFirePath() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const police = debug && debug.police;
      const missing = [];
      if (!neon || !neon.loot) missing.push('__neon.loot');
      if (!police || !Array.isArray(police.officers)) missing.push('__neon.debug.police.officers');
      if (!police || typeof police.applyPlayerHit !== 'function') missing.push('police.applyPlayerHit');
      check('test 4: officer hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const officer = police.officers.find((entry) => !entry.dead);
      check('test 4: a live officer is staged', Boolean(officer), 'no live officer on the blockade');
      if (!officer) return results;

      const lootBefore = neon.loot.count;
      police.applyPlayerHit({ officer, headshot: false }, 500);
      check('test 4: the officer dies', officer.dead === true, `dead=${officer.dead} health=${officer.health}`);
      check(
        'test 4: the officer death spawns loot',
        neon.loot.count > lootBefore,
        `loot ${lootBefore} -> ${neon.loot.count}`,
      );
      return results;
    },
  },
];
