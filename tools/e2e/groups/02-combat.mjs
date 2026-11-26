// Neon Harbor E2E groups 5-8: mission drops, target precedence, murder heat and the street knife.
// Entries are moved verbatim from tools/test-npc-loot.mjs.
export const groups = [
  {
    name: 'test 5: mission enemy drops',
    shot: 'street',
    body: function missionDrops() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const missions = debug && debug.missions;
      const missing = [];
      if (!neon || !neon.loot) missing.push('__neon.loot');
      if (!missions || typeof missions.spawnStagedEnemy !== 'function') missing.push('__neon.debug.missions.spawnStagedEnemy');
      if (!missions || typeof missions.applyPlayerHit !== 'function') missing.push('missions.applyPlayerHit');
      check('test 5: mission-staging hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const p = debug.player;
      const normalX = p.position.x + 8;
      const normalZ = p.position.z + 1;
      const enemy = missions.spawnStagedEnemy(normalX, normalZ);
      check(
        'test 5: a mission enemy is staged',
        Boolean(enemy) && enemy.boss === false && enemy.health === 105 && missions.enemies.includes(enemy),
        JSON.stringify(enemy && { boss: enemy.boss, health: enemy.health }),
      );

      // rollDrop's kind is random. Pin it to cash by replacing Math.random
      // around the real kill, then restore it before anything else runs.
      const lootBefore = neon.loot.count;
      const originalRandom = Math.random;
      let hitError = null;
      try {
        Math.random = () => 0;
        missions.applyPlayerHit(
          { enemy, headshot: false, point: { x: enemy.x, y: enemy.y + 1.2, z: enemy.z } },
          500,
        );
      } catch (error) {
        hitError = error.message;
      } finally {
        Math.random = originalRandom;
      }
      const drop = neon.loot.items.find((item) => item.x === enemy.x && item.z === enemy.z);
      check(
        'test 5: the mission enemy drops exactly one cash item at its position',
        !hitError && neon.loot.count === lootBefore + 1 && Boolean(drop) && drop.kind === 'cash'
          && drop.x === enemy.x && drop.z === enemy.z,
        hitError ?? `loot ${lootBefore} -> ${neon.loot.count} items=${JSON.stringify(neon.loot.items)}`,
      );
      check(
        'test 5: mission-enemy cash is in the $40-120 range',
        Boolean(drop) && drop.amount >= 40 && drop.amount <= 120 && drop.amount % 5 === 0,
        JSON.stringify(drop),
      );

      const boss = missions.spawnStagedEnemy(normalX + 3, normalZ + 3, { boss: true, name: 'Staged Boss' });
      check('test 5: a boss enemy is staged', Boolean(boss) && boss.boss === true, JSON.stringify(boss && { boss: boss.boss }));
      const bossBefore = neon.loot.count;
      let bossError = null;
      try {
        Math.random = () => 0;
        missions.applyPlayerHit(
          { enemy: boss, headshot: false, point: { x: boss.x, y: boss.y + 1.2, z: boss.z } },
          500,
        );
      } catch (error) {
        bossError = error.message;
      } finally {
        Math.random = originalRandom;
      }
      const bossDrop = neon.loot.items.find((item) => item.x === boss.x && item.z === boss.z);
      check(
        'test 5: the boss drops exactly one cash item at its position',
        !bossError && neon.loot.count === bossBefore + 1 && Boolean(bossDrop) && bossDrop.kind === 'cash'
          && bossDrop.x === boss.x && bossDrop.z === boss.z,
        bossError ?? `loot ${bossBefore} -> ${neon.loot.count} items=${JSON.stringify(neon.loot.items)}`,
      );
      check(
        'test 5: the boss cash drop is exactly $150',
        Boolean(bossDrop) && bossDrop.amount === 150,
        JSON.stringify(bossDrop),
      );

      // The QA surface can hit with no world point. The guard in missions.js
      // must still kill the enemy and drop exactly one item instead of throwing.
      const guard = missions.spawnStagedEnemy(normalX - 3, normalZ + 3);
      const guardBefore = neon.loot.count;
      let guardError = null;
      try {
        missions.applyPlayerHit({ enemy: guard, headshot: false }, 500);
      } catch (error) {
        guardError = error.message;
      }
      check(
        'test 5: a point-less mission hit kills and drops without throwing',
        !guardError && guard.dead === true && neon.loot.count === guardBefore + 1,
        guardError ?? `dead=${guard.dead} loot ${guardBefore} -> ${neon.loot.count}`,
      );
      return results;
    },
  },
  {
    name: 'test 6: nearest-target precedence',
    shot: 'street',
    body: function nearestTarget() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const traffic = debug && debug.traffic;
      const police = debug && debug.police;
      const camera = debug && debug.camera;
      const missing = [];
      if (!player || typeof player.fireWeapon !== 'function') missing.push('__neon.debug.player.fireWeapon');
      if (!traffic || typeof traffic.spawnPed !== 'function') missing.push('traffic.spawnPed');
      if (!traffic || typeof traffic.despawnPed !== 'function') missing.push('traffic.despawnPed');
      if (!police || typeof police.spawnOfficerAt !== 'function') missing.push('police.spawnOfficerAt');
      if (!police || typeof police.clearOfficers !== 'function') missing.push('police.clearOfficers');
      if (!camera || !camera.position) missing.push('__neon.debug.camera');
      check('test 6: precedence hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const p = player;
      p.cameraPitch = -0.27;
      p.cameraDistance = 3.1;
      p.updateView(camera, 1 / 60, true);
      const ax = -Math.sin(p.cameraYaw);
      const az = -Math.cos(p.cameraYaw);
      const near = { x: p.position.x + ax * 3, z: p.position.z + az * 3 };
      const far = { x: p.position.x + ax * 6, z: p.position.z + az * 6 };
      // The pistol spread is random and would make a 6 m shot flaky; pin it to
      // zero for the two calls, then restore. The fire path itself is untouched.
      const originalRandom = Math.random;
      const fire = () => {
        p.fireCooldown = 0;
        Math.random = () => 0.5;
        try {
          p.fireWeapon(camera);
        } finally {
          Math.random = originalRandom;
        }
      };

      // Order A: pedestrian in front, officer behind.
      const pedA = traffic.spawnPed({ x: near.x, z: near.z });
      const officerA = police.spawnOfficerAt(far.x, far.z, 0, 'QA 1');
      check('test 6: order A stages a near pedestrian and a far officer', Boolean(pedA) && Boolean(officerA), 'staging returned null');
      if (pedA && officerA) {
        const pedHealth = pedA.health;
        const officerHealth = officerA.health;
        fire();
        check(
          'test 6: the nearer pedestrian takes the shot, not the officer behind',
          (pedA.health < pedHealth || pedA.dead === true) && officerA.health === officerHealth && officerA.dead === false,
          `ped ${pedHealth} -> ${pedA.health} (dead=${pedA.dead}); officer ${officerHealth} -> ${officerA.health}`,
        );
        traffic.despawnPed(pedA);
        police.clearOfficers();
      }

      // Order B: officer in front, pedestrian behind.
      const officerB = police.spawnOfficerAt(near.x, near.z, 0, 'QA 2');
      const pedB = traffic.spawnPed({ x: far.x, z: far.z });
      check('test 6: order B stages a near officer and a far pedestrian', Boolean(officerB) && Boolean(pedB), 'staging returned null');
      if (officerB && pedB) {
        const officerHealth = officerB.health;
        const pedHealth = pedB.health;
        fire();
        check(
          'test 6: the nearer officer takes the shot, not the pedestrian behind',
          (officerB.health < officerHealth || officerB.dead === true) && pedB.health === pedHealth && pedB.dead === false,
          `officer ${officerHealth} -> ${officerB.health}; ped ${pedHealth} -> ${pedB.health}`,
        );
      }
      return results;
    },
  },
  {
    name: 'test 7: murder heat',
    shot: 'street',
    body: function murderHeat() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const police = debug && debug.police;
      const traffic = debug && debug.traffic;
      const player = debug && debug.player;
      const camera = debug && debug.camera;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!police || typeof police.reportCivilianDeath !== 'function') missing.push('police.reportCivilianDeath');
      if (!police || typeof police.update !== 'function') missing.push('police.update');
      if (!traffic || typeof traffic.spawnPed !== 'function') missing.push('traffic.spawnPed');
      if (!traffic || typeof traffic.applyPlayerHit !== 'function') missing.push('traffic.applyPlayerHit');
      if (!player || typeof player.fireWeapon !== 'function') missing.push('player.fireWeapon');
      if (!player || typeof player.selectWeapon !== 'function') missing.push('player.selectWeapon');
      if (!camera || !camera.position) missing.push('__neon.debug.camera');
      check('test 7: murder-heat hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const px = player.position.x;
      const pz = player.position.z;
      // Air 1 patrols close to the opening block, so park it outside the 90 m
      // police-witness range before the quiet-street cases.
      police.stageAir({ x: 640, y: 40, z: 640 });
      police.clearWanted({ quiet: true });

      // Phase A: civilian witnesses only.
      const victim = traffic.spawnPed({ x: px + 20, z: pz + 20, armed: false });
      const witness = traffic.spawnPed({ x: px + 22, z: pz + 20, armed: false });
      check('test 7: the witness-only murder stages', Boolean(victim) && Boolean(witness), 'spawnPed returned null');
      if (!victim || !witness) return results;
      traffic.applyPlayerHit({ ped: victim, headshot: false }, 500);
      check(
        'test 7: a witnessed murder without police stays at zero stars at once',
        police.wanted === 0 && Boolean(police.witnessReport),
        `wanted=${police.wanted} report=${JSON.stringify(police.witnessReport)}`,
      );
      check(
        'test 7: the 911 report starts a 3 s timer',
        Boolean(police.witnessReport) && police.witnessReport.timer === 3,
        JSON.stringify(police.witnessReport),
      );
      police.update(2.9, 0);
      check('test 7: the witness kill is still at zero stars before 3 s', police.wanted === 0, `wanted=${police.wanted}`);
      police.update(0.2, 2.9);
      check(
        'test 7: the 911 call adds one star after the delay',
        police.wanted === 1 && police.witnessReport === null,
        `wanted=${police.wanted} report=${JSON.stringify(police.witnessReport)}`,
      );

      // Phase B: an officer within 70 m of the body is an immediate witness.
      police.clearWanted({ quiet: true });
      police.clearOfficers();
      const bodyX = px - 20;
      const bodyZ = pz + 20;
      const officer = police.spawnOfficerAt(bodyX + 2, bodyZ);
      const victim2 = traffic.spawnPed({ x: bodyX, z: bodyZ, armed: false });
      check('test 7: the staged officer and second victim exist', Boolean(officer) && Boolean(victim2), 'staging returned null');
      if (victim2) {
        traffic.applyPlayerHit({ ped: victim2, headshot: false }, 500);
        check(
          'test 7: an officer witnessing the murder adds a star immediately',
          police.wanted === 1 && police.witnessReport === null,
          `wanted=${police.wanted} report=${JSON.stringify(police.witnessReport)}`,
        );
      }

      // Phase C: a silent knife kill with nobody around adds no heat at all.
      police.clearWanted({ quiet: true });
      police.clearOfficers();
      player.teleport(81, 0, Math.PI, 0);
      player.cameraPitch = -0.27;
      player.cameraDistance = 3.1;
      player.updateView(camera, 1 / 60, true);
      player.selectWeapon('knife');
      player.fireCooldown = 0;
      const lone = traffic.spawnPed({ x: 81, z: -1.5, armed: false });
      check(
        'test 7: the knife reaches a lone pedestrian',
        Boolean(lone) && player.weaponKey === 'knife',
        `ped=${Boolean(lone)} weapon=${player.weaponKey}`,
      );
      if (lone) {
        player.fireWeapon(camera);
        check(
          'test 7: a lone knife murder adds no heat',
          lone.dead === true && police.wanted === 0 && police.witnessReport === null,
          `dead=${lone.dead} wanted=${police.wanted} report=${JSON.stringify(police.witnessReport)}`,
        );
        police.update(3.2, 6);
        check(
          'test 7: no 911 call follows a witness-free knife murder',
          police.wanted === 0 && police.witnessReport === null,
          `wanted=${police.wanted} report=${JSON.stringify(police.witnessReport)}`,
        );
      }
      return results;
    },
  },
  {
    name: 'test 8: street knife',
    shot: 'street',
    body: function streetKnife() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const traffic = debug && debug.traffic;
      const police = debug && debug.police;
      const camera = debug && debug.camera;
      const missing = [];
      if (!neon || !neon.loot) missing.push('__neon.loot');
      if (!player || typeof player.fireWeapon !== 'function') missing.push('player.fireWeapon');
      if (!player || typeof player.selectWeapon !== 'function') missing.push('player.selectWeapon');
      if (!player || !player.combatState) missing.push('player.combatState');
      if (!traffic || typeof traffic.spawnPed !== 'function') missing.push('traffic.spawnPed');
      if (!police || typeof police.reportGunfire !== 'function') missing.push('police.reportGunfire');
      if (!camera || !camera.position) missing.push('__neon.debug.camera');
      check('test 8: knife hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      // Park the air unit so the knife's murder heat stays a civilian 911 call.
      police.stageAir({ x: 640, y: 40, z: 640 });
      police.clearWanted({ quiet: true });
      police.clearOfficers();

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' }));
      neon.advance(1 / 60);
      check(
        'test 8: Digit3 selects the knife',
        neon.combat.weapon === 'knife' && player.weaponKey === 'knife',
        `weapon=${neon.combat.weapon} key=${player.weaponKey}`,
      );
      const state = player.combatState;
      check(
        'test 8: combat state reports a melee knife with no ammo',
        state.key === 'knife' && state.weaponKey === 'knife' && state.melee === true && state.ammo === null,
        JSON.stringify({ key: state.key, weaponKey: state.weaponKey, melee: state.melee, ammo: state.ammo }),
      );
      check(
        'test 8: the knife model replaces the guns in the right hand',
        player.knifeModel.visible === true && player.pistolModel.visible === false && player.smgModel.visible === false,
        JSON.stringify({ knife: player.knifeModel.visible, pistol: player.pistolModel.visible, smg: player.smgModel.visible }),
      );

      player.cameraPitch = -0.27;
      player.cameraDistance = 3.1;
      player.updateView(camera, 1 / 60, true);
      const forwardX = -Math.sin(player.cameraYaw);
      const forwardZ = -Math.cos(player.cameraYaw);
      const victim = traffic.spawnPed({
        x: player.position.x + forwardX * 1.5,
        z: player.position.z + forwardZ * 1.5,
        armed: false,
      });
      const witness = traffic.spawnPed({
        x: player.position.x + forwardX * 1.5 + 2,
        z: player.position.z + forwardZ * 1.5,
        armed: false,
      });
      check('test 8: the stab target and witness spawn', Boolean(victim) && Boolean(witness), 'spawnPed returned null');
      if (!victim || !witness) return results;

      let gunfireReports = 0;
      const originalReportGunfire = police.reportGunfire;
      police.reportGunfire = (...args) => {
        gunfireReports += 1;
        return originalReportGunfire.apply(police, args);
      };
      const lootBefore = neon.loot.count;
      let stabError = null;
      try {
        player.fireCooldown = 0;
        player.fireWeapon(camera);
      } catch (error) {
        stabError = error.message;
      } finally {
        police.reportGunfire = originalReportGunfire;
      }
      check(
        'test 8: one 1.5 m stab kills a full-health pedestrian',
        !stabError && victim.dead === true && victim.health === 0,
        stabError ?? `dead=${victim.dead} health=${victim.health}`,
      );
      check(
        'test 8: the swing starts the 0.28 s animation',
        player.meleeSwing === 0.28,
        `swing=${player.meleeSwing}`,
      );
      check(
        'test 8: the knife kill drops the usual loot',
        neon.loot.count > lootBefore,
        `loot ${lootBefore} -> ${neon.loot.count}`,
      );
      check(
        'test 8: the stab never reports gunfire',
        gunfireReports === 0,
        `reports=${gunfireReports}`,
      );
      check(
        'test 8: the knife murder queues the witness 911 report',
        police.wanted === 0 && Boolean(police.witnessReport),
        `wanted=${police.wanted} report=${JSON.stringify(police.witnessReport)}`,
      );

      player.selectWeapon('pistol');
      const pistol = player.combatState;
      check(
        'test 8: slot 1 restores the pistol and its ammo',
        pistol.key === 'pistol' && pistol.melee === false && pistol.ammo === player.weapons.pistol.ammo
          && player.weapons.knife.owned === true && player.pistolModel.visible === true && player.knifeModel.visible === false,
        JSON.stringify({ key: pistol.key, melee: pistol.melee, ammo: pistol.ammo }),
      );

      // A pre-knife save carries no knife slot and must still load it owned.
      player.loadFromSave({
        cash: player.cash,
        health: player.health,
        armor: player.armor,
        wanted: 0,
        mission: 0,
        playSeconds: 0,
        weaponKey: 'pistol',
        weapons: {
          pistol: { owned: true, ammo: 7, reserve: 21 },
          smg: { owned: false, ammo: 0, reserve: 0 },
        },
        cameraYaw: player.cameraYaw,
        cameraPitch: player.cameraPitch,
        position: { x: player.position.x, y: player.position.y, z: player.position.z },
      });
      check(
        'test 8: an old save loads with the knife owned',
        player.weapons.knife.owned === true && player.weapons.pistol.ammo === 7 && player.weaponKey === 'pistol',
        JSON.stringify({ knife: player.weapons.knife, ammo: player.weapons.pistol.ammo, key: player.weaponKey }),
      );
      return results;
    },
  },
];
