// End-to-end checks for NPC death and loot, driven through window.__neon on
// the frozen ?shot= scenes. No dependencies: Node's standard library serves
// game/, launches headless Chrome and speaks the DevTools protocol, exactly
// like tools/capture.mjs. Every check prints an "ok - name" / "not ok - name"
// line and any failure makes the process exit non-zero.
//
//   node tools/test-npc-loot.mjs
//
// Set CHROME to a Chrome/Chromium binary to override the default lookup.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const gameRoot = resolve(join(here, 'game'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env.PROGRAMFILES ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
      ]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error('Chrome not found; set CHROME to its executable path');
  return found;
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function staticServer() {
  return new Promise((resolveServer, reject) => {
    const server = createServer((request, response) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      } catch {
        response.writeHead(400).end('bad request');
        return;
      }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = resolve(join(gameRoot, normalize(pathname)));
      if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      let stats;
      try {
        stats = statSync(file);
        if (!stats.isFile()) throw new Error('not a file');
      } catch {
        response.writeHead(404).end('not found');
        return;
      }
      response.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': stats.size,
        'cache-control': 'no-store',
      });
      response.end(readFileSync(file));
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForChrome(cdpPort, child) {
  const deadline = Date.now() + 20000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Chrome exited early (${child.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page');
        if (page) return page;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw new Error(`Chrome DevTools did not answer: ${lastError?.message ?? 'timeout'}`);
}

// Each test loads a frozen shot, waits for its staged frame, then evaluates
// `body` in the page. `body` must return an array of { name, ok, detail }.
const TESTS = [
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
  {
    name: 'test 9: armed witness',
    shot: 'street',
    body: function armedWitness() {
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
      if (!traffic || typeof traffic.spawnPed !== 'function') missing.push('traffic.spawnPed');
      if (!traffic || typeof traffic.update !== 'function') missing.push('traffic.update');
      if (!traffic || typeof traffic.despawnPed !== 'function') missing.push('traffic.despawnPed');
      if (!police || typeof police.clearWanted !== 'function') missing.push('police.clearWanted');
      if (!player || !player.position) missing.push('__neon.debug.player');
      if (!camera || !camera.position) missing.push('__neon.debug.camera');
      check('test 9: armed-witness hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const baseX = 81;
      const baseZ = 0;
      police.stageAir({ x: 640, y: 40, z: 640 });
      police.clearWanted({ quiet: true });
      police.clearOfficers();
      player.teleport(baseX, baseZ, Math.PI, 0);
      player.cameraPitch = -0.27;
      player.cameraDistance = 3.1;
      player.updateView(camera, 1 / 60, true);
      player.health = 100;
      player.armor = 0;
      player.dead = false;

      const armed = traffic.spawnPed({ x: baseX, z: baseZ - 6, yaw: 0, armed: true });
      const victim = traffic.spawnPed({ x: baseX, z: baseZ - 8, armed: false });
      check(
        'test 9: an armed pedestrian stages with a victim in the panic radius',
        Boolean(armed) && armed.armed === true && Boolean(victim),
        JSON.stringify({ armed: Boolean(armed), flag: armed && armed.armed }),
      );
      if (!armed || !victim) return results;

      traffic.applyPlayerHit({ ped: victim, headshot: false }, 500);
      check(
        'test 9: the armed witness draws for 0.9 s before it is hostile',
        armed.hostile === false && armed.hostileDraw === 0.9,
        `hostile=${armed.hostile} draw=${armed.hostileDraw}`,
      );
      traffic.update(0.5, 0);
      check(
        'test 9: the armed witness is still drawing after 0.5 s',
        armed.hostile === false && armed.hostileDraw > 0,
        `hostile=${armed.hostile} draw=${armed.hostileDraw}`,
      );

      const healthBefore = player.health;
      const originalRandom = Math.random;
      try {
        Math.random = () => 0;
        traffic.update(0.45, 0);
      } finally {
        Math.random = originalRandom;
      }
      check(
        'test 9: the first shot after the draw lowers the player health',
        armed.hostile === true && player.health < healthBefore,
        `hostile=${armed.hostile} health ${healthBefore} -> ${player.health}`,
      );

      // The next shot is gated by the 1.2 s fire interval, so 1.0 s later the
      // health is untouched and the 0.25 s step after that fires again.
      const healthAfterFirst = player.health;
      try {
        Math.random = () => 0;
        traffic.update(1.0, 0);
      } finally {
        Math.random = originalRandom;
      }
      check(
        'test 9: the armed witness waits out the 1.2 s fire interval',
        player.health === healthAfterFirst,
        `health ${healthAfterFirst} -> ${player.health}`,
      );
      try {
        Math.random = () => 0;
        traffic.update(0.25, 0);
      } finally {
        Math.random = originalRandom;
      }
      check(
        'test 9: the next shot lands once the interval elapses',
        player.health === healthAfterFirst - 9,
        `health ${healthAfterFirst} -> ${player.health}`,
      );

      player.teleport(baseX + 50, baseZ, Math.PI, 0);
      traffic.update(0.06, 0);
      check(
        'test 9: moving beyond 45 m sends the armed witness back to fleeing',
        armed.hostile === false && armed.fleeTimer > 0,
        `hostile=${armed.hostile} flee=${armed.fleeTimer}`,
      );

      const lootBefore = neon.loot.count;
      traffic.applyPlayerHit({ ped: armed, headshot: false }, 500);
      check(
        'test 9: an armed pedestrian still dies like any other and drops loot',
        armed.dead === true && neon.loot.count > lootBefore,
        `dead=${armed.dead} loot ${lootBefore} -> ${neon.loot.count}`,
      );

      // The same staged position, unarmed: it should only run.
      player.teleport(baseX, baseZ, Math.PI, 0);
      const unarmed = traffic.spawnPed({ x: baseX, z: baseZ - 6, yaw: 0, armed: false });
      const victim2 = traffic.spawnPed({ x: baseX, z: baseZ - 8, armed: false });
      check('test 9: the unarmed witness stages', Boolean(unarmed) && Boolean(victim2), 'spawnPed returned null');
      if (unarmed && victim2) {
        traffic.applyPlayerHit({ ped: victim2, headshot: false }, 500);
        check(
          'test 9: an unarmed witness only flees',
          unarmed.hostile === false && unarmed.fleeTimer === 6,
          `hostile=${unarmed.hostile} flee=${unarmed.fleeTimer}`,
        );
        traffic.update(1.2, 0);
        check(
          'test 9: the unarmed witness never turns hostile',
          unarmed.hostile === false && unarmed.fleeTimer > 0,
          `hostile=${unarmed.hostile} flee=${unarmed.fleeTimer}`,
        );
      }
      return results;
    },
  },
];

async function main() {
  if (typeof WebSocket !== 'function') {
    throw new Error('This test tool needs Node 22+ with the built-in WebSocket client');
  }
  const chrome = chromePath();
  const server = await staticServer();
  const serverPort = server.address().port;
  const cdpPort = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'neon-harbor-npc-loot-'));
  const errors = [];

  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-component-update',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--force-device-scale-factor=1',
    '--window-size=1280,720',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let chromeLog = '';
  child.stderr.on('data', (chunk) => { chromeLog += chunk.toString(); });

  let socket;
  let failures = 0;
  try {
    const page = await waitForChrome(cdpPort, child);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
        else entry.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        errors.push(`exception: ${details.exception?.description ?? details.text}`);
      } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(`console: ${message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')}`);
      } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        errors.push(`log: ${message.params.entry.text} ${message.params.entry.url ?? ''}`);
      }
    });
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });

    const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
      const id = nextId++;
      pending.set(id, { resolve: resolveSend, reject: rejectSend, method });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      }
      return result.result?.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 720,
    });

    console.log(`Chrome ${chrome}`);
    for (const test of TESTS) {
      const url = `http://127.0.0.1:${serverPort}/?shot=${test.shot}&capture=${Date.now()}`;
      await send('Page.navigate', { url });
      const deadline = Date.now() + 30000;
      let ready = false;
      while (Date.now() < deadline) {
        try {
          ready = await evaluate(`Boolean(window.__neonReady && window.__neon && window.__neon.shot === ${JSON.stringify(test.shot)} && window.__neon.draws > 0)`);
        } catch {
          ready = false;
        }
        if (ready) break;
        await sleep(200);
      }
      if (!ready) throw new Error(`${test.name}: ?shot=${test.shot} did not reach the staged frame`);
      await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');

      let results = null;
      try {
        results = await evaluate(`(${test.body.toString()})()`);
      } catch (error) {
        results = [{ name: `${test.name}: page body`, ok: false, detail: error.message }];
      }
      if (!Array.isArray(results) || results.length === 0) {
        results = [{ name: `${test.name}: page body`, ok: false, detail: 'test body returned no checks' }];
      }
      for (const result of results) {
        const detail = result.detail ? ` (${result.detail})` : '';
        console.log(`${result.ok ? 'ok' : 'not ok'} - ${result.name}${detail}`);
        if (!result.ok) failures += 1;
      }
    }

    if (errors.length) {
      failures += 1;
      console.log(`not ok - page console clean (${errors.join(' | ')})`);
    }
    if (failures > 0) {
      console.log(`FAIL: ${failures} check(s) failed`);
      process.exitCode = 1;
    } else {
      console.log('PASS: all checks passed');
    }
    await send('Browser.close').catch(() => {});
  } catch (error) {
    if (chromeLog.trim()) console.error(chromeLog.trim().split('\n').slice(-12).join('\n'));
    throw error;
  } finally {
    try { socket?.close(); } catch { /* ignore */ }
    try { child.kill(); } catch { /* ignore */ }
    await new Promise((resolveClose) => server.close(resolveClose));
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file on Windows */ }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
