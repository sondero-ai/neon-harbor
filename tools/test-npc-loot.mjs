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
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
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
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
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
  {
    name: 'test 10: crowd density',
    shot: 'street',
    body: function crowdDensity() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const traffic = debug && debug.traffic;
      const player = debug && debug.player;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!traffic || typeof traffic.update !== 'function') missing.push('traffic.update');
      if (!traffic || !traffic.crowd || !traffic.crowd.meshes) missing.push('traffic.crowd');
      if (!player || !player.position) missing.push('__neon.debug.player');
      check('test 10: density hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      check(
        'test 10: the crowd targets are 168 / 64 / 28 / 18',
        traffic.maxPeds === 168 && traffic.sidewalkTarget === 64
          && traffic.beachTarget === 28 && traffic.carTarget === 18,
        JSON.stringify({
          maxPeds: traffic.maxPeds,
          sidewalk: traffic.sidewalkTarget,
          beach: traffic.beachTarget,
          cars: traffic.carTarget,
        }),
      );
      check(
        'test 10: the instanced crowd capacity follows MAX_PEDS',
        traffic.crowd.capacity === 168 && Object.keys(traffic.crowd.meshes).every(
          (name) => traffic.crowd.meshes[name].instanceMatrix.count === 168,
        ),
        `capacity=${traffic.crowd.capacity}`,
      );

      const beachAtStart = traffic.peds.filter((ped) => ped.active && ped.mode === 'beach').length;
      check(
        'test 10: the beach crowd seeds all 28 walkers',
        beachAtStart === 28,
        `beach=${beachAtStart}`,
      );

      let maxCars = 0;
      for (let i = 0; i < 180; i += 1) {
        traffic.update(0.5, i * 0.5);
        maxCars = Math.max(maxCars, traffic.density.cars);
      }
      const active = traffic.peds.filter((ped) => ped.active);
      const sidewalk = active.filter((ped) => ped.mode !== 'beach').length;
      const beach = active.filter((ped) => ped.mode === 'beach').length;
      const slots = new Set(active.map((ped) => ped.slot));
      check(
        'test 10: the sidewalk crowd reaches its 64-walker target',
        sidewalk >= 64,
        `sidewalk=${sidewalk}`,
      );
      check(
        'test 10: the beach crowd stays at 28 while the sidewalks fill',
        beach === 28,
        `beach=${beach}`,
      );
      check(
        'test 10: no two pedestrians share a crowd slot',
        slots.size === active.length && active.every((ped) => ped.slot >= 0 && ped.slot < 168),
        `active=${active.length} slots=${slots.size}`,
      );
      check(
        'test 10: the live crowd never exceeds the 168 slot cap',
        active.length <= 168,
        `active=${active.length}`,
      );
      check(
        'test 10: the traffic reaches the 18-car target',
        maxCars === 18,
        `maxCars=${maxCars}`,
      );
      const extra = traffic.spawnPed({
        x: player.position.x + 6,
        z: player.position.z,
        armed: false,
      });
      check(
        'test 10: a free crowd slot is still available after the fill',
        Boolean(extra),
        'spawnPed returned null (slot starvation)',
      );
      return results;
    },
  },
  {
    name: 'test 11: traffic signals',
    shot: 'street',
    body: function trafficSignals() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const signals = neon && neon.signals;
      const system = neon && neon.debug && neon.debug.signals;
      const missing = [];
      if (!signals) missing.push('__neon.signals');
      if (!system) missing.push('__neon.debug.signals');
      check('test 11: signal hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      check(
        'test 11: one signal stands at every one of the 100 intersections',
        signals.intersections === 100,
        `intersections=${signals.intersections}`,
      );
      check(
        'test 11: core and extension intersections both have a signal',
        Boolean(signals.at(189, 81)) && Boolean(signals.at(-135, -189))
          && Boolean(signals.at(351, 243)),
        JSON.stringify({
          core: signals.at(189, 81),
          north: signals.at(-135, -189),
          east: signals.at(351, 243),
        }),
      );
      check(
        'test 11: a mid-block point has no signal',
        signals.at(0, 0) === null,
        JSON.stringify(signals.at(0, 0)),
      );

      function expected(axis, t) {
        const own = axis === 'x' ? t % 18 : (t + 9) % 18;
        return own < 7.5 ? 'green' : own < 9 ? 'amber' : 'red';
      }
      let statesMatch = true;
      const stateRows = [];
      for (const t of [0, 1, 7.4, 8.2, 9.1, 12, 16.5]) {
        const state = signals.stateAt(t);
        const want = { x: expected('x', t), z: expected('z', t) };
        stateRows.push({ t, state, want });
        if (state.x !== want.x || state.z !== want.z) statesMatch = false;
      }
      check(
        'test 11: the state function matches the 7.5 s green / 1.5 s amber cycle',
        statesMatch,
        JSON.stringify(stateRows),
      );

      const atGreen = signals.setTime(1);
      const greenLamps = { x: signals.lamps('x'), z: signals.lamps('z') };
      const atAmber = signals.setTime(8.2);
      const amberLamps = { x: signals.lamps('x'), z: signals.lamps('z') };
      const atRed = signals.setTime(10);
      const redLamps = { x: signals.lamps('x'), z: signals.lamps('z') };
      check(
        'test 11: the lamps show green for one axis and red for the other',
        atGreen.x === 'green' && atGreen.z === 'red'
          && greenLamps.x === 'green' && greenLamps.z === 'red',
        JSON.stringify({ atGreen, greenLamps }),
      );
      check(
        'test 11: the amber window lights amber for the switching axis only',
        atAmber.x === 'amber' && atAmber.z === 'red'
          && amberLamps.x === 'amber' && amberLamps.z === 'red',
        JSON.stringify({ atAmber, amberLamps }),
      );
      check(
        'test 11: the switch flips both axes at once',
        atRed.x === 'red' && atRed.z === 'green'
          && redLamps.x === 'red' && redLamps.z === 'green',
        JSON.stringify({ atRed, redLamps }),
      );
      const sets = system.axisMeshes;
      check(
        'test 11: each colour and axis renders as one instanced lamp set',
        ['x', 'z'].every((axis) => ['red', 'amber', 'green'].every(
          (name) => sets[axis][name].isInstancedMesh && sets[axis][name].count === 200,
        )),
        Object.fromEntries(['x', 'z'].map((axis) => [axis, {
          red: sets[axis].red.count,
          amber: sets[axis].amber.count,
          green: sets[axis].green.count,
        }])),
      );
      return results;
    },
  },
  {
    name: 'test 12: pedestrian wall collision',
    shot: 'street',
    body: function pedestrianWalls() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const traffic = neon && neon.debug && neon.debug.traffic;
      const world = neon && neon.debug && neon.debug.world;
      const player = neon && neon.debug && neon.debug.player;
      const missing = [];
      if (!traffic || typeof traffic.walkToward !== 'function') missing.push('traffic.walkToward');
      if (!world || typeof world.resolveCircle !== 'function') missing.push('world.resolveCircle');
      if (!world || !Array.isArray(world.colliders)) missing.push('world.colliders');
      if (!player) missing.push('__neon.debug.player');
      check('test 12: collision hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const overlaps = (x, z, radius) => world.colliders.some((box) => (
        x > box.minX - radius && x < box.maxX + radius
        && z > box.minZ - radius && z < box.maxZ + radius
      ));
      const buildings = world.colliders.filter((box) => (
        box.kind === 'building' && box.maxX - box.minX > 15 && box.maxZ - box.minZ > 15
        && box.minX > -145 && box.maxX < 195 && box.minZ > -145 && box.maxZ < 195
      ));
      check(
        'test 12: the core exposes building colliders to test against',
        buildings.length > 10,
        `buildings=${buildings.length}`,
      );
      if (buildings.length === 0) return results;

      const building = buildings.reduce((best, box) => {
        const cx = (box.minX + box.maxX) / 2;
        const cz = (box.minZ + box.maxZ) / 2;
        const distance = Math.hypot(cx - player.position.x, cz - player.position.z);
        return !best || distance < best.distance ? { box, distance } : best;
      }, null).box;
      const midZ = (building.minZ + building.maxZ) / 2;
      const wallPed = traffic.spawnPed({
        x: building.minX - 2.2,
        z: midZ,
        yaw: Math.PI / 2,
        mode: 'idle',
      });
      check('test 12: a test pedestrian stages beside a building', Boolean(wallPed), 'spawnPed returned null');
      if (!wallPed) return results;

      wallPed.target = { x: building.maxX + 2.2, z: midZ };
      let everInside = false;
      for (let i = 0; i < 600; i += 1) {
        traffic.walkToward(wallPed, 3, 1 / 60);
        if (overlaps(wallPed.x, wallPed.z, 0.3)) {
          everInside = true;
          break;
        }
      }
      check(
        'test 12: a target straight through a building never puts the walker inside it',
        everInside === false,
        `ped=(${wallPed.x.toFixed(2)}, ${wallPed.z.toFixed(2)}) box=(${building.minX}, ${building.minZ})`,
      );
      check(
        'test 12: the blocked walker stops at the wall face',
        wallPed.x <= building.minX - 0.28,
        `x=${wallPed.x.toFixed(2)} face=${building.minX}`,
      );

      const openPed = traffic.spawnPed({ x: -67, z: 18.1, yaw: 0, mode: 'idle' });
      check('test 12: a reachable-target pedestrian stages', Boolean(openPed), 'spawnPed returned null');
      if (openPed) {
        openPed.target = { x: -61, z: 18.1 };
        for (let i = 0; i < 300; i += 1) traffic.walkToward(openPed, 2, 1 / 60);
        check(
          'test 12: a reachable target is still reached',
          Math.hypot(openPed.x - -61, openPed.z - 18.1) < 0.3,
          `distance=${Math.hypot(openPed.x - -61, openPed.z - 18.1).toFixed(2)}`,
        );
        check(
          'test 12: the reachable walk stays out of every collider',
          overlaps(openPed.x, openPed.z, 0.3) === false,
          `ped=(${openPed.x.toFixed(2)}, ${openPed.z.toFixed(2)})`,
        );
      }

      const slidingPed = traffic.spawnPed({ x: -67, z: 18.1, yaw: 0, mode: 'idle' });
      if (slidingPed) slidingPed.target = { x: -63, z: 18.1 };
      const startX = slidingPed ? slidingPed.x : 0;
      if (slidingPed) {
        for (let i = 0; i < 240; i += 1) traffic.walkToward(slidingPed, 2, 1 / 60);
      }
      check(
        'test 12: the wall slide keeps forward progress along the face',
        Boolean(slidingPed) && slidingPed.x - startX > 1.5,
        `moved=${slidingPed ? (slidingPed.x - startX).toFixed(2) : 'n/a'}`,
      );

      for (let i = 0; i < 120; i += 1) traffic.update(0.5, i * 0.5);
      const live = traffic.peds.filter((ped) => ped.active && !ped.dead);
      const stuck = live.filter((ped) => overlaps(ped.x, ped.z, 0.26));
      check(
        'test 12: after 60 simulated seconds no live pedestrian is inside a wall',
        stuck.length === 0,
        `stuck=${stuck.length}/${live.length} first=${stuck[0] ? `(${stuck[0].x.toFixed(2)}, ${stuck[0].z.toFixed(2)})` : ''}`,
      );
      return results;
    },
  },
  {
    name: 'test 13: living clock',
    shot: 'street',
    body: function livingClock() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const env = neon && neon.debug && neon.debug.environment;
      const debug = neon && neon.debug;
      const missing = [];
      if (!env || typeof env.setClock !== 'function') missing.push('environment.setClock');
      if (!debug || !debug.renderer || !debug.effects || !debug.vehicles || !debug.signals) {
        missing.push('environment targets');
      }
      if (!neon || !neon.city || !neon.time) missing.push('__neon.city/__neon.time');
      check('test 13: clock hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      check(
        'test 13: the expanded city is 81 blocks',
        neon.city.blocks === 81,
        `blocks=${neon.city.blocks}`,
      );
      const shotTime = neon.time;
      check(
        'test 13: a capture pins 23:41 night at 2.5 minutes per second',
        shotTime.clock === '23:41' && shotTime.period === 'night' && shotTime.rate === 2.5,
        JSON.stringify({ clock: shotTime.clock, period: shotTime.period, rate: shotTime.rate }),
      );

      const apply = () => env.apply({
        scene: neon.scene,
        renderer: debug.renderer,
        world: debug.world,
        effects: debug.effects,
        vehicles: debug.vehicles,
        signals: debug.signals,
      }, { force: true });
      const world = debug.world;
      const cases = [
        [6 * 60, 'dawn'],
        [12 * 60, 'day'],
        [18 * 60, 'dusk'],
        [23 * 60, 'night'],
      ];
      const rows = [];
      for (const [minutes, want] of cases) {
        env.setClock(minutes);
        apply();
        const time = neon.time;
        rows.push({
          minutes,
          want,
          period: time.period,
          window: time.palette.window,
          street: time.palette.street,
          stars: time.palette.stars,
          sun: time.palette.sunIntensity,
          sky: world.skyA.material.map === world.skyTextures[want],
        });
      }
      const rowFor = (name) => rows.find((row) => row.want === name);
      check(
        'test 13: all four periods come from the clock',
        rows.every((row) => row.period === row.want),
        JSON.stringify(rows.map((row) => `${row.minutes}:${row.period}`)),
      );
      check(
        'test 13: each period swaps in its own sky texture',
        rows.every((row) => row.sky === true),
        JSON.stringify(rows.map((row) => row.sky)),
      );
      check(
        'test 13: day is bright with no lamps or stars',
        rowFor('day').sun > 2 && rowFor('day').window <= 0.2
          && rowFor('day').street === 0 && rowFor('day').stars === 0,
        JSON.stringify(rowFor('day')),
      );
      check(
        'test 13: night is full window light, stars and moon',
        rowFor('night').window === 1 && rowFor('night').stars >= 0.85
          && neon.time.palette.moon === 1,
        JSON.stringify({ ...rowFor('night'), moon: neon.time.palette.moon }),
      );
      check(
        'test 13: dawn and dusk are partial-light states',
        rowFor('dawn').window > 0.4 && rowFor('dawn').window < 0.8
          && rowFor('dusk').window > 0.4 && rowFor('dusk').window < 0.9,
        JSON.stringify({ dawn: rowFor('dawn').window, dusk: rowFor('dusk').window }),
      );

      neon.newGame();
      const startClock = neon.time.clock;
      neon.advance(30);
      const advanced = neon.time.clock;
      neon.saveGame();
      env.setClock(12 * 60);
      apply();
      const beforeContinue = neon.time.clock;
      neon.continueGame();
      const restored = neon.time.clock;
      check(
        'test 13: a New Game starts at 18:00',
        startClock === '18:00',
        `start=${startClock}`,
      );
      check(
        'test 13: thirty real seconds move the clock seventy-five minutes',
        advanced === '19:15',
        `advanced=${advanced}`,
      );
      check(
        'test 13: Continue restores the saved minute',
        beforeContinue === '12:00' && restored === '19:15',
        JSON.stringify({ beforeContinue, restored }),
      );

      const dayBefore = neon.time.day;
      env.setClock(23 * 60 + 50);
      neon.advance(30);
      check(
        'test 13: crossing midnight rolls the day counter',
        neon.time.clock === '01:05' && neon.time.day === dayBefore + 1,
        JSON.stringify({ clock: neon.time.clock, day: neon.time.day, dayBefore }),
      );
      return results;
    },
  },
  {
    name: 'test 14: radio',
    shot: 'street',
    body: async function radio() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };
      const neon = window.__neon;
      const key = (type, code) => {
        const event = new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true });
        window.dispatchEvent(event);
        return event;
      };
      const tap = (code) => {
        key('keydown', code);
        neon.advance(0.1);
        key('keyup', code);
      };
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (test, timeout = 6000) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          if (test()) return true;
          await sleep(100);
        }
        return false;
      };

      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!neon || !neon.radio) missing.push('__neon.radio');
      if (!neon || !neon.debug || !neon.debug.radio || !neon.debug.radio.player) missing.push('__neon.debug.radio');
      if (!neon || !neon.debug || !neon.debug.hud) missing.push('__neon.debug.hud');
      if (!neon || !neon.debug || !neon.debug.audio) missing.push('__neon.debug.audio');
      if (!neon || !neon.hudRadio) missing.push('__neon.hudRadio');
      check('test 14: radio QA hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      // Create the context while the CDP evaluate's user gesture is fresh.
      const audio = neon.debug.audio;
      audio.unlock();
      const stations = neon.debug.radio.stations;
      const player = neon.debug.radio.player;
      const initial = neon.radio;
      check(
        'test 14: Vega 105.1 track 0 is the default',
        initial.stationId === 'vega'
          && initial.station === 'Vega 105.1'
          && initial.track === 'Vega Strip Money'
          && initial.artist === 'Kade Voss'
          && initial.index === 0
          && initial.trackNumber === 1
          && initial.trackCount === 3
          && initial.enabled === true,
        JSON.stringify(initial),
      );
      check(
        'test 14: six stations carry three tracks each',
        stations.length === 6 && stations.every((station) => station.tracks.length === 3),
        JSON.stringify(stations.map((station) => `${station.id}:${station.tracks.length}`)),
      );
      const hud = neon.hudRadio;
      check(
        'test 14: the HUD reads the same radio state',
        hud.stationId === initial.stationId
          && hud.track === initial.track
          && hud.artist === initial.artist
          && hud.trackNumber === initial.trackNumber
          && hud.trackCount === initial.trackCount
          && hud.enabled === initial.enabled,
        JSON.stringify(hud),
      );

      tap('KeyT');
      check('test 14: T switches the radio off', neon.radio.enabled === false && neon.radio.mode === 'off', JSON.stringify(neon.radio));
      tap('KeyT');
      check('test 14: T switches the radio back on', neon.radio.enabled === true, JSON.stringify(neon.radio));
      tap('BracketRight');
      check(
        'test 14: ] moves to the next station at track 0',
        neon.radio.stationId === 'night-tide' && neon.radio.index === 0 && neon.radio.track === 'Harbor Lights',
        JSON.stringify(neon.radio),
      );
      tap('BracketLeft');
      check('test 14: [ moves back to Vega', neon.radio.stationId === 'vega', JSON.stringify(neon.radio));
      tap('Period');
      check(
        'test 14: . advances the track',
        neon.radio.index === 1 && neon.radio.track === 'Ledger Season' && neon.radio.artist === 'Nia Vex',
        JSON.stringify(neon.radio),
      );
      tap('Comma');
      check(
        'test 14: , rewinds and wraps to track 0',
        neon.radio.index === 0 && neon.radio.track === 'Vega Strip Money',
        JSON.stringify(neon.radio),
      );
      const wasMuted = neon.audio.muted;
      tap('KeyM');
      const nowMuted = neon.audio.muted;
      tap('KeyM');
      check(
        'test 14: M mutes and restores the master output',
        nowMuted === !wasMuted && neon.audio.muted === wasMuted,
        JSON.stringify({ wasMuted, nowMuted, after: neon.audio.muted }),
      );
      player.setStation(0, 2, { autoplay: false });
      neon.advance(0.05);
      tap('Period');
      check(
        'test 14: track keys wrap from the last track to the first',
        neon.radio.stationId === 'vega' && neon.radio.index === 0,
        JSON.stringify(neon.radio),
      );
      player.setStation(5, 0, { autoplay: false });
      neon.advance(0.05);
      tap('BracketRight');
      check(
        'test 14: station keys wrap from Foundry to Vega',
        neon.radio.stationId === 'vega' && neon.radio.index === 0,
        JSON.stringify(neon.radio),
      );

      const tab = key('keydown', 'Tab');
      check('test 14: Tab is prevented from moving focus', tab.defaultPrevented === true, `defaultPrevented=${tab.defaultPrevented}`);
      neon.advance(0.1);
      check('test 14: holding Tab opens the wheel', neon.radio.wheel.open === true, JSON.stringify(neon.radio.wheel));
      check(
        'test 14: the wheel cursor starts on the live tune',
        neon.radio.wheel.station === 0 && neon.radio.wheel.track === 0,
        JSON.stringify(neon.radio.wheel),
      );
      key('keydown', 'ArrowRight');
      neon.advance(0.1);
      key('keyup', 'ArrowRight');
      key('keydown', 'ArrowDown');
      neon.advance(0.1);
      key('keyup', 'ArrowDown');
      check(
        'test 14: arrows move the wheel cursor',
        neon.radio.wheel.station === 1 && neon.radio.wheel.track === 1,
        JSON.stringify(neon.radio.wheel),
      );
      key('keydown', 'Enter');
      neon.advance(0.1);
      key('keyup', 'Enter');
      check(
        'test 14: Enter tunes the wheel selection',
        neon.radio.stationId === 'night-tide' && neon.radio.index === 1 && neon.radio.track === 'Neon Coastline',
        JSON.stringify(neon.radio),
      );
      check('test 14: the wheel stays open until Tab is released', neon.radio.wheel.open === true, JSON.stringify(neon.radio.wheel));

      const hudDebug = neon.debug.hud;
      const clickTarget = hudDebug.wheelHits.find((hit) => hit.station === 5 && hit.track === 2);
      check('test 14: the wheel exposes per-track click targets', Boolean(clickTarget), `${hudDebug.wheelHits.length} targets`);
      if (clickTarget) {
        document.getElementById('hud').dispatchEvent(new MouseEvent('click', {
          clientX: clickTarget.x + clickTarget.width / 2,
          clientY: clickTarget.y + clickTarget.height / 2,
          bubbles: true,
          cancelable: true,
        }));
        neon.advance(0.05);
      }
      check(
        'test 14: a click tunes the clicked track',
        neon.radio.stationId === 'foundry' && neon.radio.index === 2 && neon.radio.track === 'Graveyard Shift',
        JSON.stringify(neon.radio),
      );
      key('keyup', 'Tab');
      neon.advance(0.1);
      check('test 14: releasing Tab closes the wheel', neon.radio.wheel.open === false, JSON.stringify(neon.radio.wheel));

      player.setStation(4, 1, { autoplay: false });
      neon.advance(0.05);
      const saved = neon.saveGame();
      check(
        'test 14: the save carries station, track and on/off',
        saved.radioStation === 'solano-soul' && saved.radioTrack === 1 && saved.radioEnabled === true,
        JSON.stringify({ station: saved.radioStation, track: saved.radioTrack, enabled: saved.radioEnabled }),
      );
      player.setStation(0, 0, { autoplay: false });
      neon.continueGame();
      neon.advance(0.1);
      check(
        'test 14: Continue restores the saved station and track',
        neon.radio.stationId === 'solano-soul'
          && neon.radio.index === 1
          && neon.radio.track === 'Beachside Cantina'
          && neon.radio.enabled === true,
        JSON.stringify(neon.radio),
      );

      const raw = JSON.parse(localStorage.getItem('neon-harbor.save.v1') || 'null');
      if (raw) {
        delete raw.radioStation;
        delete raw.radioTrack;
        delete raw.radioEnabled;
        localStorage.setItem('neon-harbor.save.v1', JSON.stringify(raw));
      }
      neon.continueGame();
      neon.advance(0.1);
      check(
        'test 14: an old save defaults to Vega, track 0, radio on',
        Boolean(raw)
          && neon.radio.stationId === 'vega'
          && neon.radio.index === 0
          && neon.radio.enabled === true,
        JSON.stringify(neon.radio),
      );

      const audioRunning = await waitFor(() => neon.audio.state === 'running', 5000);
      check('test 14: the first-gesture audio unlock reaches running', audioRunning, `state=${neon.audio.state}`);

      const vegaFile = stations[0].tracks[0].file;
      const tideFile = stations[1].tracks[0].file;
      try {
        stations[1].tracks[0].file = 'audio/radio/__missing__.ogg';
        player.setEnabled(true, { autoplay: false });
        player.setStation(1, 0);
        const fellBack = await waitFor(() => neon.radio.fallback === true, 7000);
        check(
          'test 14: a missing file falls back to the station synth bed',
          fellBack && neon.radio.mode === 'synth' && neon.radio.enabled === true,
          JSON.stringify(neon.radio),
        );
        check(
          'test 14: the fallback still reports the track metadata',
          neon.radio.stationId === 'night-tide' && neon.radio.track === 'Harbor Lights' && neon.radio.artist === 'Sable Youth',
          JSON.stringify(neon.radio),
        );
        check('test 14: the procedural sequencer is running', neon.audio.fallbackActive === true, JSON.stringify(neon.audio));

        player.setStation(1, 1);
        const recovered = await waitFor(() => neon.radio.fallback === false && neon.radio.mode === 'file' && neon.radio.playing === true, 7000);
        check('test 14: the next real track leaves the fallback', recovered, JSON.stringify(neon.radio));

        stations[0].tracks[0].file = 'audio/radio/__missing__.ogg';
        player.setStation(0, 0);
        const offAir = await waitFor(() => neon.radio.offAir === true && neon.radio.mode === 'offair', 7000);
        check(
          'test 14: a station with no fallback shows OFF AIR',
          offAir && neon.radio.playing === false && neon.radio.fallback === false,
          JSON.stringify(neon.radio),
        );
        check(
          'test 14: OFF AIR still reports the track metadata',
          neon.radio.station === 'Vega 105.1' && neon.radio.track === 'Vega Strip Money',
          JSON.stringify(neon.radio),
        );

        stations[0].tracks[0].file = vegaFile;
        player.setStation(0, 0);
        const backOnAir = await waitFor(() => neon.radio.offAir === false && neon.radio.mode === 'file' && neon.radio.playing === true, 7000);
        check('test 14: restoring the file brings the station back on air', backOnAir, JSON.stringify(neon.radio));

        const beforeEnded = neon.radio.index;
        player.onEnded(player.activeDeck);
        neon.advance(0.1);
        check(
          'test 14: an ended track auto-advances within the station',
          neon.radio.index === (beforeEnded + 1) % 3,
          `${beforeEnded} -> ${neon.radio.index}`,
        );
      } finally {
        stations[0].tracks[0].file = vegaFile;
        stations[1].tracks[0].file = tideFile;
      }

      const files = stations.flatMap((station) => station.tracks.map((track) => track.file));
      let present = 0;
      let oggMime = 0;
      for (const file of files) {
        const response = await fetch(file, { method: 'HEAD', cache: 'no-store' });
        if (response.ok) present += 1;
        if ((response.headers.get('content-type') || '').includes('audio/ogg')) oggMime += 1;
      }
      check('test 14: all eighteen declared radio files are served', present === 18, `${present}/18`);
      check('test 14: radio files are served as audio/ogg', oggMime === 18, `${oggMime}/18`);
      return results;
    },
  },
  {
    name: 'test 15: vehicle hit response',
    shot: 'street',
    body: function vehicleHits() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const vehicles = debug && debug.vehicles;
      const traffic = debug && debug.traffic;
      const police = debug && debug.police;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!player || typeof player.hitByVehicle !== 'function') missing.push('player.hitByVehicle');
      if (!vehicles || typeof vehicles.spawn !== 'function') missing.push('vehicles.spawn');
      if (!vehicles || !vehicles.list) missing.push('vehicles.list');
      if (!traffic || typeof traffic.reset !== 'function') missing.push('traffic.reset');
      if (!police || typeof police.ramCheck !== 'function') missing.push('police.ramCheck');
      const sample = vehicles && vehicles.list && vehicles.list[0];
      if (!sample || typeof sample.overlapCircle !== 'function') missing.push('vehicle.overlapCircle');
      check('test 15: vehicle-hit hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const round = (value) => Math.round(value * 1000) / 1000;
      const hv = vehicles;

      // The circle/box normal, before any gameplay state is touched.
      const probe = hv.spawn('sedan', { x: 0, z: 0, yaw: 0 });
      const frontHit = probe.overlapCircle(0, probe.halfLength + 0.2, 0.5);
      check(
        'test 15: overlapCircle returns the front face penetration and normal',
        Math.abs(frontHit.penetration - 0.3) < 1e-6
          && Math.abs(frontHit.nx) < 1e-6
          && Math.abs(frontHit.nz - 1) < 1e-6,
        JSON.stringify(frontHit),
      );
      const insideHit = probe.overlapCircle(0, 0, 0.5);
      check(
        'test 15: a centre inside the box exits through the nearest face',
        insideHit.penetration > 0.5 && (Math.abs(insideHit.nx) === 1 || Math.abs(insideHit.nz) === 1),
        JSON.stringify(insideHit),
      );
      const clearHit = probe.overlapCircle(0, probe.halfLength + 2, 0.5);
      check('test 15: a clear circle reports no penetration', clearHit.penetration === 0, JSON.stringify(clearHit));
      hv.remove(probe);

      // A quiet stretch of the 81 road, away from seeded lanes and parked cars.
      traffic.reset({ spawnBeach: false });
      for (const car of [...hv.list]) hv.remove(car);
      police.clearWanted({ quiet: true });
      police.clearUnits();
      police.clearOfficers();
      police.stageAir({ x: 640, y: 40, z: 640 });

      const baseX = 81;
      const baseZ = 0;
      const resetTo = () => {
        player.teleport(baseX, baseZ, Math.PI, 0);
        player.health = 100;
        player.armor = 0;
        player.dead = false;
        player.velocity.set(0, 0, 0);
        return player.health;
      };

      // A fast AI car centred on the player: one hit, a push-out and a knockdown.
      let health = resetTo();
      const fast = hv.spawn('sedan', { x: baseX, z: baseZ, yaw: 0, driver: 'ai' });
      fast.velocity.set(0, 0, 10);
      neon.advance(1 / 60);
      const afterFirst = player.health;
      check(
        'test 15: a 10 m/s overlap lands one damage hit',
        afterFirst < health,
        `health ${health} -> ${afterFirst}`,
      );
      check(
        'test 15: the impact pushes the player out of the car body',
        fast.overlapCircle(player.position.x, player.position.z, 0.46).penetration === 0,
        JSON.stringify({ player: [round(player.position.x), round(player.position.z)], car: [fast.position.x, fast.position.z] }),
      );
      check(
        'test 15: the hit sets the knockdown timer and the QA readout',
        player.knockdown > 0 && neon.player.knockdown > 0 && neon.player.lastVehicleHit !== null,
        JSON.stringify({ knockdown: player.knockdown, qa: neon.player }),
      );
      check(
        'test 15: the last vehicle hit records the car and damage',
        neon.player.lastVehicleHit
          && neon.player.lastVehicleHit.type === 'sedan'
          && neon.player.lastVehicleHit.damage === 16
          && neon.player.lastVehicleHit.speed === 10,
        JSON.stringify(neon.player.lastVehicleHit),
      );

      neon.advance(0.2);
      const healthMid = player.health;
      check(
        'test 15: the knocked-down body tilts toward the fall pose',
        player.knockdown > 0 && player.humanoid.group.rotation.z > 0.35,
        `knockdown=${round(player.knockdown)} tilt=${round(player.humanoid.group.rotation.z)}`,
      );
      check(
        'test 15: one impact never double-hits while the player is down',
        healthMid === afterFirst && player.knockdown > 0,
        `health ${afterFirst} -> ${healthMid}`,
      );

      // A second fast car during the cooldown pushes but cannot damage again.
      hv.remove(fast);
      const during = hv.spawn('sedan', { x: player.position.x, z: player.position.z, yaw: 0, driver: 'ai' });
      during.velocity.set(0, 0, 8);
      neon.advance(1 / 60);
      check(
        'test 15: the shared cooldown blocks a second hit',
        player.health === healthMid,
        `health ${healthMid} -> ${player.health}`,
      );
      check(
        'test 15: the cooldown push still clears the car body',
        during.overlapCircle(player.position.x, player.position.z, 0.46).penetration === 0,
        JSON.stringify({ player: [round(player.position.x), round(player.position.z)] }),
      );
      hv.remove(during);

      neon.advance(1.2);
      check(
        'test 15: the player stands up when the 0.9 s knockdown ends',
        player.knockdown === 0 && player.humanoid.group.rotation.z === 0,
        `knockdown=${player.knockdown} tilt=${player.humanoid.group.rotation.z}`,
      );

      // Movement and fire are ignored while down, then resume.
      const standX = player.position.x;
      const standZ = player.position.z;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      neon.advance(0.4);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      check(
        'test 15: movement resumes after standing up',
        Math.hypot(player.position.x - standX, player.position.z - standZ) > 0.5,
        `moved=${round(Math.hypot(player.position.x - standX, player.position.z - standZ))}`,
      );

      // A fresh hit after the full cooldown lands again.
      health = resetTo();
      const second = hv.spawn('sedan', { x: baseX, z: baseZ, yaw: 0, driver: 'ai' });
      second.velocity.set(0, 0, 9);
      neon.advance(1 / 60);
      check(
        'test 15: a fresh hit after the cooldown lands',
        player.health < health && player.knockdown > 0,
        `health ${health} -> ${player.health}`,
      );
      hv.remove(second);

      // Below 2.5 m/s the contact is only a shove.
      health = resetTo();
      const slow = hv.spawn('sedan', { x: baseX, z: baseZ, yaw: 0, driver: 'ai' });
      slow.velocity.set(0, 0, 1.4);
      neon.advance(1 / 60);
      check(
        'test 15: a slow overlap pushes out without damage or knockdown',
        player.health === health
          && player.knockdown === 0
          && slow.overlapCircle(player.position.x, player.position.z, 0.46).penetration === 0,
        JSON.stringify({ health: player.health, knockdown: player.knockdown }),
      );
      hv.remove(slow);

      // The police ram branch must use the same hit path.
      resetTo();
      const cruiser = hv.spawn('police', { x: baseX, z: baseZ + 2.5, yaw: 0, driver: 'ai' });
      cruiser.velocity.set(0, 0, 8);
      const unit = { car: cruiser, ramCooldown: 0 };
      police.ramCheck(unit, 0);
      check(
        'test 15: police.ramCheck routes through hitByVehicle',
        unit.ramCooldown === 1.4
          && player.knockdown > 0
          && neon.player.lastVehicleHit !== null
          && neon.player.lastVehicleHit.damage === 18
          && neon.player.lastVehicleHit.type === 'police',
        JSON.stringify({ cooldown: unit.ramCooldown, hit: neon.player.lastVehicleHit }),
      );
      check(
        'test 15: the ram leaves the player outside the cruiser',
        cruiser.overlapCircle(player.position.x, player.position.z, 0.46).penetration === 0,
        JSON.stringify({ player: [round(player.position.x), round(player.position.z)] }),
      );
      hv.remove(cruiser);

      // Ignore-fire while down: the knife cannot swing during the knockdown.
      resetTo();
      player.selectWeapon('knife');
      player.fireCooldown = 0;
      const rammer = hv.spawn('sedan', { x: baseX, z: baseZ, yaw: 0, driver: 'ai' });
      rammer.velocity.set(0, 0, 10);
      neon.advance(1 / 60);
      player.fireCooldown = 0;
      player.updateCombat(1 / 60, {
        isMouseDown: () => false,
        wasMousePressed: () => true,
        wasPressed: () => false,
      }, debug.camera);
      check(
        'test 15: fire input is ignored while knocked down',
        player.knockdown > 0 && player.meleeSwing === 0 && player.fireCooldown === 0,
        `knockdown=${round(player.knockdown)} swing=${player.meleeSwing} cooldown=${player.fireCooldown}`,
      );
      hv.remove(rammer);
      return results;
    },
  },
  {
    name: 'test 16: knife arm',
    shot: 'street',
    body: function knifeArm() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const humanoid = player && player.humanoid;
      const traffic = debug && debug.traffic;
      const police = debug && debug.police;
      const camera = debug && debug.camera;
      const vehicles = debug && debug.vehicles;
      const missing = [];
      if (!player || typeof player.fireWeapon !== 'function') missing.push('player.fireWeapon');
      if (!humanoid || !humanoid.arms || !humanoid.arms.right) missing.push('humanoid.arms.right');
      if (!traffic || typeof traffic.spawnPed !== 'function') missing.push('traffic.spawnPed');
      if (!police || typeof police.clearWanted !== 'function') missing.push('police.clearWanted');
      if (!camera || !camera.position) missing.push('__neon.debug.camera');
      if (!vehicles || !vehicles.list) missing.push('__neon.debug.vehicles');
      check('test 16: knife-arm hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const round = (value) => Math.round(value * 1000) / 1000;
      police.clearWanted({ quiet: true });
      police.clearUnits();
      police.clearOfficers();
      police.stageAir({ x: 640, y: 40, z: 640 });
      traffic.reset({ spawnBeach: false });
      for (const car of [...vehicles.list]) vehicles.remove(car);

      player.teleport(81, 0, Math.PI, 0);
      player.health = 100;
      player.armor = 0;
      player.dead = false;
      player.weaponKey = 'pistol';
      player.gun.visible = false;
      player.syncGunModel();
      player.cameraPitch = -0.27;
      player.cameraDistance = 3.1;
      player.updateView(camera, 1 / 60, true);
      neon.advance(1 / 60);
      player.selectWeapon('knife');
      neon.advance(1 / 60);

      const right = humanoid.arms.right;
      const measureElbow = () => {
        right.elbowPivot.updateWorldMatrix(true, false);
        const elements = right.elbowPivot.matrixWorld.elements;
        return { x: elements[12], y: elements[13], z: elements[14] };
      };
      const idleShoulder = right.shoulderPivot.rotation.x;
      const idleElbow = measureElbow();
      check(
        'test 16: the knife arm starts in the idle pose',
        humanoid.melee === 0 && Math.abs(idleShoulder) < 0.01,
        `melee=${humanoid.melee} shoulder=${round(idleShoulder)}`,
      );

      const forwardX = -Math.sin(player.cameraYaw);
      const forwardZ = -Math.cos(player.cameraYaw);
      const victim = traffic.spawnPed({
        x: player.position.x + forwardX * 1.5,
        z: player.position.z + forwardZ * 1.5,
        armed: false,
      });
      check('test 16: a stab target spawns', Boolean(victim), 'spawnPed returned null');
      if (!victim) return results;

      player.fireCooldown = 0;
      player.fireWeapon(camera);
      check(
        'test 16: the stab still kills the target and starts the swing',
        victim.dead === true && player.meleeSwing === 0.28,
        `dead=${victim.dead} swing=${player.meleeSwing}`,
      );

      neon.advance(0.14);
      const duringShoulder = right.shoulderPivot.rotation.x;
      const duringElbow = measureElbow();
      const forwardGain = (duringElbow.x - idleElbow.x) * Math.sin(player.facing)
        + (duringElbow.z - idleElbow.z) * Math.cos(player.facing);
      check(
        'test 16: the right shoulder swings forward at the start of the stab',
        duringShoulder < idleShoulder - 0.5 && humanoid.melee > 0.3,
        `idle=${round(idleShoulder)} during=${round(duringShoulder)} melee=${round(humanoid.melee)}`,
      );
      check(
        'test 16: the hand itself thrusts ahead of the chest',
        forwardGain > 0.25,
        `forward=${round(forwardGain)}`,
      );
      check(
        'test 16: the blade keeps its secondary rotation',
        player.knifeModel.rotation.x < -0.5,
        `blade=${round(player.knifeModel.rotation.x)}`,
      );

      neon.advance(0.3);
      const returned = measureElbow();
      const returnDistance = Math.hypot(
        returned.x - idleElbow.x,
        returned.y - idleElbow.y,
        returned.z - idleElbow.z,
      );
      check(
        'test 16: the arm returns to the idle pose when the swing ends',
        humanoid.melee === 0
          && player.meleeSwing === 0
          && Math.abs(right.shoulderPivot.rotation.x - idleShoulder) < 0.02
          && returnDistance < 0.06,
        `melee=${humanoid.melee} shoulder=${round(right.shoulderPivot.rotation.x)} distance=${round(returnDistance)}`,
      );
      return results;
    },
  },
  {
    name: 'test 17: beach',
    shot: 'street',
    body: function beach() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon && neon.debug && neon.debug.world;
      const traffic = neon && neon.debug && neon.debug.traffic;
      const missing = [];
      if (!world || typeof world.beachHeight !== 'function') missing.push('world.beachHeight');
      if (!world || typeof world.collides !== 'function') missing.push('world.collides');
      if (!world || typeof world.groundHeightAt !== 'function') missing.push('world.groundHeightAt');
      if (!world || !world.beach || !world.beach.geometry) missing.push('world.beach');
      if (!world || !world.beachWet) missing.push('world.beachWet');
      if (!world || !world.foam) missing.push('world.foam');
      if (!traffic || !traffic.peds) missing.push('__neon.debug.traffic.peds');
      check('test 17: beach hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const shorelineX = -232;
      const cityEdgeX = -142;
      const round = (value) => Math.round(value * 1000) / 1000;
      world.beach.geometry.computeBoundingBox();
      const bounds = world.beach.geometry.boundingBox;
      check(
        'test 17: the sand mesh starts at the shoreline and ends at the city edge',
        Math.abs(bounds.min.x - shorelineX) < 0.001 && Math.abs(bounds.max.x - cityEdgeX) < 0.001,
        `minX=${round(bounds.min.x)} maxX=${round(bounds.max.x)}`,
      );
      check(
        'test 17: no sand is drawn west of the shoreline',
        bounds.min.x >= shorelineX - 0.001,
        `minX=${round(bounds.min.x)}`,
      );

      const dryZ = -100;
      check(
        'test 17: half a metre east of the shoreline is walkable',
        world.collides(shorelineX + 0.5, dryZ, 0.46) === false,
        `collides=${world.collides(shorelineX + 0.5, dryZ, 0.46)}`,
      );
      check(
        'test 17: half a metre west of the shoreline is blocked',
        world.collides(shorelineX - 0.5, dryZ, 0.46) === true,
        `collides=${world.collides(shorelineX - 0.5, dryZ, 0.46)}`,
      );
      check(
        'test 17: the ground height is finite on both sides of the line',
        Number.isFinite(world.groundHeightAt(shorelineX + 0.5, dryZ))
          && Number.isFinite(world.groundHeightAt(shorelineX - 0.5, dryZ)),
        JSON.stringify({
          east: world.groundHeightAt(shorelineX + 0.5, dryZ),
          west: world.groundHeightAt(shorelineX - 0.5, dryZ),
        }),
      );

      const cityHeight = world.beachHeight(cityEdgeX, dryZ);
      const shoreHeight = world.beachHeight(shorelineX, dryZ);
      check(
        'test 17: the beach keeps the 0.45 m fall from the city edge to the water',
        Math.abs(cityHeight) < 0.001 && Math.abs(shoreHeight + 0.45) <= 0.0101,
        `city=${round(cityHeight)} shore=${round(shoreHeight)}`,
      );

      let minRipple = Infinity;
      let maxRipple = -Infinity;
      for (let z = -200; z <= 200; z += 3) {
        const height = world.beachHeight(shorelineX, z);
        minRipple = Math.min(minRipple, height);
        maxRipple = Math.max(maxRipple, height);
      }
      check(
        'test 17: the shoreline ripple stays within one centimetre',
        maxRipple - minRipple <= 0.0201,
        `peak-to-peak=${round(maxRipple - minRipple)}`,
      );

      let maxStep = 0;
      let previous = world.beachHeight(shorelineX, dryZ);
      for (let x = shorelineX + 0.5; x <= cityEdgeX; x += 0.5) {
        const height = world.beachHeight(x, dryZ);
        maxStep = Math.max(maxStep, Math.abs(height - previous));
        previous = height;
      }
      check(
        'test 17: the slope is smooth between half-metre samples',
        maxStep < 0.006,
        `maxStep=${round(maxStep)}`,
      );

      let blocked = 0;
      for (let x = shorelineX + 0.5; x <= cityEdgeX; x += 2.5) {
        if (world.collides(x, dryZ, 0.46)) blocked += 1;
      }
      check(
        'test 17: every visible sand metre east of the shoreline is walkable',
        blocked === 0,
        `blocked=${blocked}`,
      );

      world.beachWet.geometry.computeBoundingBox();
      const wetBounds = world.beachWet.geometry.boundingBox;
      check(
        'test 17: the wet-sand strip runs from the shoreline a few metres inland',
        world.beachWet.material.transparent === true
          && Math.abs(wetBounds.min.x - shorelineX) < 0.001
          && wetBounds.max.x > shorelineX + 6
          && wetBounds.max.x < shorelineX + 12,
        `minX=${round(wetBounds.min.x)} maxX=${round(wetBounds.max.x)}`,
      );

      const foam = world.foam;
      const foamHalf = foam.geometry.parameters.width / 2;
      check(
        'test 17: the foam line sits on the water edge',
        Math.abs(foam.position.x - shorelineX) <= 0.5
          && foam.position.x - foamHalf <= shorelineX
          && foam.position.x + foamHalf >= shorelineX,
        JSON.stringify({ x: round(foam.position.x), half: round(foamHalf) }),
      );

      const beachPeds = traffic.peds.filter((ped) => ped.active && ped.mode === 'beach');
      check(
        'test 17: all beach walkers stand on the visible sand',
        beachPeds.length === 28 && beachPeds.every((ped) => ped.x >= shorelineX + 1 - 1e-6),
        `count=${beachPeds.length} minX=${round(Math.min(...beachPeds.map((ped) => ped.x)))}`,
      );
      return results;
    },
  },
  {
    name: 'test 18: carjacking',
    shot: 'street',
    body: function carjacking() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const traffic = debug && debug.traffic;
      const police = debug && debug.police;
      const vehicles = debug && debug.vehicles;
      const hud = debug && debug.hud;
      const missing = [];
      if (!traffic || typeof traffic.ejectDriver !== 'function') missing.push('traffic.ejectDriver');
      if (!traffic || typeof traffic.update !== 'function') missing.push('traffic.update');
      if (!player || typeof player.enterVehicle !== 'function') missing.push('player.enterVehicle');
      if (!player || typeof player.exitVehicle !== 'function') missing.push('player.exitVehicle');
      if (!vehicles || typeof vehicles.spawn !== 'function') missing.push('vehicles.spawn');
      if (!police || typeof police.clearWanted !== 'function') missing.push('police.clearWanted');
      if (!hud || typeof hud !== 'object') missing.push('__neon.debug.hud');
      if (!neon || !neon.loot) missing.push('__neon.loot');
      check('test 18: carjacking hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const round = (value) => Math.round(value * 1000) / 1000;
      const baseX = 81;
      const baseZ = 0;
      const resetWorld = () => {
        police.clearWanted({ quiet: true });
        police.consumeNotice();
        police.clearUnits();
        police.clearOfficers();
        police.stageAir({ x: 640, y: 40, z: 640 });
        traffic.reset({ spawnBeach: false });
        for (const car of [...vehicles.list]) vehicles.remove(car);
      };
      resetWorld();
      player.teleport(baseX, baseZ, Math.PI, 0);
      player.health = 100;
      player.armor = 0;
      player.dead = false;

      // Direct entry of an AI civilian car: the driver bails at the left door.
      const car = vehicles.spawn('sedan', { x: baseX + 2.2, z: baseZ, yaw: Math.PI / 2, driver: 'ai' });
      const beforePeds = new Set(traffic.peds);
      player.enterVehicle(car);
      const ejected = traffic.peds.find((ped) => ped.active && !beforePeds.has(ped));
      check(
        'test 18: taking an AI car leaves the player at the wheel',
        player.driving === car && car.driver === 'player',
        `driving=${player.driving === car} driver=${car.driver}`,
      );
      check(
        'test 18: a driver spawns at the driver door',
        Boolean(ejected),
        'no new pedestrian (crowd slot or door blocked)',
      );
      if (!ejected) return results;
      check(
        'test 18: the ejected driver faces the car from just outside the left door',
        (() => {
          const local = car.localPoint(ejected.x, ejected.z);
          return local.x < 0
            && Math.abs(local.x) >= car.halfWidth + 0.3
            && Math.abs(local.x) <= car.halfWidth + 1.2
            && Math.abs(local.z) <= 1.2;
        })(),
        JSON.stringify({ x: round(ejected.x), z: round(ejected.z), car: [round(car.position.x), round(car.position.z)] }),
      );
      check(
        'test 18: the ejected driver is a normal, fleeing crowd member',
        ejected.health === 55
          && ejected.dead === false
          && ejected.armed === false
          && ejected.mode === 'idle'
          && ejected.fleeTimer === 6
          && ejected.fleeResumeTarget === null
          && ejected.fleeFromX === car.position.x
          && ejected.fleeFromZ === car.position.z,
        JSON.stringify({
          health: ejected.health,
          dead: ejected.dead,
          armed: ejected.armed,
          mode: ejected.mode,
          flee: ejected.fleeTimer,
          resume: ejected.fleeResumeTarget,
        }),
      );

      const distanceBefore = Math.hypot(ejected.x - car.position.x, ejected.z - car.position.z);
      traffic.update(0.2, 0);
      const distanceAfter = Math.hypot(ejected.x - car.position.x, ejected.z - car.position.z);
      check(
        'test 18: the ejected driver runs away from the car',
        distanceAfter > distanceBefore && ejected.fleeTimer < 6 && ejected.fleeTimer > 5,
        `distance ${round(distanceBefore)} -> ${round(distanceAfter)} flee=${round(ejected.fleeTimer)}`,
      );

      const lootBefore = neon.loot.count;
      traffic.applyPlayerHit({ ped: ejected, headshot: false }, 500);
      check(
        'test 18: the ejected driver is still a normal target and drops loot',
        ejected.dead === true && neon.loot.count > lootBefore,
        `dead=${ejected.dead} loot ${lootBefore} -> ${neon.loot.count}`,
      );

      // A police cruiser is not a civilian car: no driver is ejected.
      player.exitVehicle();
      resetWorld();
      player.teleport(baseX, baseZ, Math.PI, 0);
      const cruiser = vehicles.spawn('police', { x: baseX + 2.2, z: baseZ, yaw: Math.PI / 2, driver: 'ai' });
      const pedsBeforeCruiser = traffic.peds.filter((ped) => ped.active).length;
      player.enterVehicle(cruiser);
      const pedsAfterCruiser = traffic.peds.filter((ped) => ped.active).length;
      check(
        'test 18: a police cruiser is taken without ejecting a driver',
        cruiser.driver === 'player' && pedsAfterCruiser === pedsBeforeCruiser,
        `driver=${cruiser.driver} peds ${pedsBeforeCruiser} -> ${pedsAfterCruiser}`,
      );

      // The real key path raises the one-shot CARJACKED / DRIVER BAILED toast.
      player.exitVehicle();
      resetWorld();
      player.teleport(baseX, baseZ, Math.PI, 0);
      const toastCar = vehicles.spawn('sedan', { x: baseX + 2.2, z: baseZ, yaw: Math.PI / 2, driver: 'ai' });
      player.exitCooldown = 0;
      hud.suppressToasts = false;
      hud.toast = null;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true }));
      neon.advance(1 / 60);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f', bubbles: true }));
      check(
        'test 18: entering with F drives the car and shows CARJACKED / DRIVER BAILED',
        player.driving === toastCar
          && hud.toast !== null
          && hud.toast.title === 'CARJACKED'
          && hud.toast.sub === 'DRIVER BAILED',
        JSON.stringify({ driving: player.driving ? player.driving.name : null, toast: hud.toast }),
      );
      const toastPeds = traffic.peds.filter((ped) => ped.active && ped.fleeTimer > 0);
      check(
        'test 18: the key-path carjack leaves one fleeing driver',
        toastPeds.length === 1,
        `fleeing=${toastPeds.length}`,
      );

      neon.advance(3);
      check(
        'test 18: the carjack toast fires once and is not repeated',
        hud.toast === null || hud.toast.title !== 'CARJACKED',
        JSON.stringify(hud.toast),
      );
      return results;
    },
  },
  {
    name: 'test 19: volume settings',
    shot: 'street',
    body: function volumeSettings() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const audio = debug && debug.audio;
      const titleSlider = document.getElementById('title-volume');
      const pauseSlider = document.getElementById('pause-volume');
      const titleValue = document.getElementById('title-volume-value');
      const pauseValue = document.getElementById('pause-volume-value');
      const titleMute = document.getElementById('title-mute');
      const pauseMute = document.getElementById('pause-mute');
      const missing = [];
      if (!neon || !neon.audio) missing.push('__neon.audio');
      if (!audio || typeof audio.unlock !== 'function') missing.push('__neon.debug.audio');
      if (!titleSlider || !pauseSlider) missing.push('volume sliders');
      if (!titleValue || !pauseValue) missing.push('volume labels');
      if (!titleMute || !pauseMute) missing.push('mute buttons');
      if (!neon || typeof neon.pauseGame !== 'function' || typeof neon.resumeGame !== 'function') missing.push('pause hooks');
      check('test 19: volume hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const readSettings = () => {
        try {
          return JSON.parse(localStorage.getItem('neon-harbor.settings.v1') || 'null');
        } catch {
          return null;
        }
      };
      const key = (type, code) => {
        const event = new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true });
        window.dispatchEvent(event);
        return event;
      };
      const tap = (code) => {
        key('keydown', code);
        neon.advance(0.1);
        key('keyup', code);
      };

      audio.unlock();
      const startPercent = Math.round(audio.volume * 100);
      check(
        'test 19: both panels start in sync with the loaded settings',
        titleSlider.value === String(startPercent)
          && pauseSlider.value === String(startPercent)
          && titleValue.textContent === `${startPercent}%`
          && pauseValue.textContent === `${startPercent}%`,
        JSON.stringify({ startPercent, title: titleSlider.value, pause: pauseSlider.value }),
      );
      check(
        'test 19: the sliders are 0-100 range inputs',
        [titleSlider, pauseSlider].every((slider) => (
          slider.type === 'range' && slider.min === '0' && slider.max === '100' && slider.step === '1'
        )),
        JSON.stringify([titleSlider, pauseSlider].map((slider) => ({
          type: slider.type, min: slider.min, max: slider.max, step: slider.step,
        }))),
      );

      // Dragging the title slider changes the live output, both readouts and
      // the persisted settings.
      titleSlider.value = '32';
      titleSlider.dispatchEvent(new Event('input', { bubbles: true }));
      let saved = readSettings();
      check(
        'test 19: the title slider sets the master volume to 32%',
        neon.audio.volume === 0.32
          && audio.volume === 0.32
          && titleValue.textContent === '32%'
          && pauseValue.textContent === '32%'
          && pauseSlider.value === '32',
        JSON.stringify({ volume: audio.volume, title: titleValue.textContent, pause: pauseValue.textContent }),
      );
      check(
        'test 19: the slider writes the volume and unmuted state into settings',
        saved !== null && saved.volume === 0.32 && saved.muted === false,
        JSON.stringify(saved),
      );

      // Mute from the title panel updates both panels and the save.
      titleMute.click();
      saved = readSettings();
      check(
        'test 19: the title mute button mutes and updates both panels',
        audio.muted === true
          && neon.audio.muted === true
          && titleMute.getAttribute('aria-pressed') === 'true'
          && pauseMute.getAttribute('aria-pressed') === 'true'
          && titleMute.textContent === 'Muted'
          && pauseMute.textContent === 'Muted'
          && saved !== null
          && saved.muted === true,
        JSON.stringify({ muted: audio.muted, title: titleMute.textContent, saved }),
      );

      // The = key raises the volume, lifts the mute and syncs both sliders.
      tap('Equal');
      saved = readSettings();
      check(
        'test 19: = raises the volume, unmutes and syncs the sliders',
        Math.abs(audio.volume - 0.4) < 1e-9
          && audio.muted === false
          && titleSlider.value === '40'
          && pauseSlider.value === '40'
          && titleValue.textContent === '40%'
          && pauseValue.textContent === '40%'
          && titleMute.getAttribute('aria-pressed') === 'false'
          && saved !== null
          && Math.abs(saved.volume - 0.4) < 1e-9
          && saved.muted === false,
        JSON.stringify({ volume: audio.volume, muted: audio.muted, title: titleSlider.value, saved }),
      );

      // M stays in sync with the buttons, and pressing it again restores.
      tap('KeyM');
      check(
        'test 19: M mutes in sync with both panels',
        audio.muted === true
          && titleMute.getAttribute('aria-pressed') === 'true'
          && pauseMute.getAttribute('aria-pressed') === 'true'
          && titleSlider.value === '40',
        JSON.stringify({ muted: audio.muted, title: titleMute.textContent, slider: titleSlider.value }),
      );
      tap('KeyM');
      check(
        'test 19: M restores the level without changing the percentage',
        audio.muted === false
          && titleMute.getAttribute('aria-pressed') === 'false'
          && Math.abs(audio.volume - 0.4) < 1e-9,
        JSON.stringify({ muted: audio.muted, volume: audio.volume }),
      );

      // The pause panel is wired to the same path.
      neon.pauseGame();
      const pauseVisible = document.getElementById('screen-pause').hidden === false;
      pauseSlider.value = '64';
      pauseSlider.dispatchEvent(new Event('input', { bubbles: true }));
      saved = readSettings();
      check(
        'test 19: the pause slider sets 64% and syncs the title panel',
        pauseVisible
          && neon.audio.volume === 0.64
          && titleSlider.value === '64'
          && pauseValue.textContent === '64%'
          && titleValue.textContent === '64%'
          && saved !== null
          && saved.volume === 0.64,
        JSON.stringify({ visible: pauseVisible, volume: audio.volume, title: titleSlider.value, saved }),
      );
      pauseMute.click();
      check(
        'test 19: the pause mute button mutes both panels',
        audio.muted === true
          && titleMute.getAttribute('aria-pressed') === 'true'
          && pauseMute.getAttribute('aria-pressed') === 'true',
        JSON.stringify({ muted: audio.muted, title: titleMute.textContent }),
      );
      pauseMute.click();
      neon.resumeGame();

      // Clamping at both ends keeps the UI honest.
      titleSlider.value = '0';
      titleSlider.dispatchEvent(new Event('input', { bubbles: true }));
      check(
        'test 19: zero volume shows 0%',
        audio.volume === 0 && titleValue.textContent === '0%' && pauseSlider.value === '0',
        JSON.stringify({ volume: audio.volume, label: titleValue.textContent }),
      );
      titleSlider.value = '137';
      titleSlider.dispatchEvent(new Event('input', { bubbles: true }));
      check(
        'test 19: values above 100 clamp to 100%',
        audio.volume === 1
          && titleValue.textContent === '100%'
          && pauseValue.textContent === '100%'
          && titleSlider.value === '100',
        JSON.stringify({ volume: audio.volume, label: titleValue.textContent, slider: titleSlider.value }),
      );

      // Leave the profile where the next run expects it.
      titleSlider.value = '72';
      titleSlider.dispatchEvent(new Event('input', { bubbles: true }));
      return results;
    },
  },
  {
    name: 'test 20: ambient cars stay on the road grid',
    shot: 'street',
    body: function ambientRoadGrid() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const traffic = neon?.debug?.traffic;
      const player = neon?.debug?.player;
      const ROADS_X = [-135, -81, -27, 27, 81, 135, 189, 243, 297, 351];
      const ROADS_Z = [-243, -189, -135, -81, -27, 27, 81, 135, 189, 243];
      if (!traffic || !player) {
        check('test 20: traffic and player debug handles exist', false, 'missing handles');
        return results;
      }
      const rng = traffic.rng;
      const saved = { chance: rng.chance, pick: rng.pick, sign: rng.sign, range: rng.range };
      try {
        // Axis z must take its line from the x roads. The first x road is
        // -135; the first z road is -243, which is sand.
        traffic.reset({ spawnBeach: false });
        rng.chance = () => false;
        rng.pick = (list) => list[0];
        rng.sign = () => 1;
        rng.range = (min, max) => (min + max) / 2;
        const zCar = traffic.spawnAmbientCar(player, 0, 5000);
        check(
          'test 20: a z-axis car spawns on an x road, not the beach',
          Boolean(zCar) && zCar.ai.axis === 'z' && ROADS_X.includes(zCar.ai.line) && zCar.position.x >= -142,
          JSON.stringify(zCar ? { axis: zCar.ai.axis, line: zCar.ai.line, x: zCar.position.x, z: zCar.position.z } : null),
        );

        // Axis x must take its line from the z roads. 297 exists only on the
        // x list, so the old mapping puts the car at z = 293.8, off the map.
        traffic.reset({ spawnBeach: false });
        rng.chance = () => true;
        rng.pick = (list) => (list.includes(297) ? 297 : list[0]);
        rng.sign = () => -1;
        rng.range = (min, max) => (min + max) / 2;
        const xCar = traffic.spawnAmbientCar(player, 0, 5000);
        check(
          'test 20: an x-axis car spawns on a z road, inside the city',
          Boolean(xCar) && xCar.ai.axis === 'x' && ROADS_Z.includes(xCar.ai.line) && Math.abs(xCar.position.z) <= 250,
          JSON.stringify(xCar ? { axis: xCar.ai.axis, line: xCar.ai.line, x: xCar.position.x, z: xCar.position.z } : null),
        );

        // A car already off the grid (old build, or pushed onto the sand) is
        // removed on the next traffic tick instead of queueing at a phantom
        // signal.
        traffic.reset({ spawnBeach: false });
        const stray = traffic.spawnLaneCar('sedan', 'z', 1, -189, 0, 10);
        check(
          'test 20: a stray beach car is listed before the tick',
          Boolean(stray) && traffic.cars.includes(stray),
          'stray did not spawn',
        );
        traffic.updateCars(0.016, 0, player);
        check(
          'test 20: the off-grid car is removed by updateCars',
          Boolean(stray) && (!traffic.cars.includes(stray) || stray.removed === true),
          stray ? `still listed=${traffic.cars.includes(stray)} removed=${stray.removed}` : 'stray missing',
        );
      } finally {
        rng.chance = saved.chance;
        rng.pick = saved.pick;
        rng.sign = saved.sign;
        rng.range = saved.range;
      }
      return results;
    },
  },
  {
    name: 'test 21: pier is pedestrian-only',
    shot: 'pier',
    body: function pierOnly() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const vehicles = neon?.debug?.vehicles;
      const police = neon?.debug?.police;
      const traffic = neon?.debug?.traffic;
      const player = neon?.debug?.player;
      const missions = neon?.debug?.missions;
      const deck = { minX: -316, maxX: -172, z: 70, halfWidth: 9, rampMinX: -172, rampMaxX: -156 };
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!world || typeof world.collides !== 'function') missing.push('world.collides');
      if (!world || typeof world.vehicleBlocked !== 'function') missing.push('world.vehicleBlocked');
      if (!vehicles || typeof vehicles.spawn !== 'function') missing.push('vehicles.spawn');
      if (!police || typeof police.spawnCruiserAt !== 'function') missing.push('police.spawnCruiserAt');
      if (!traffic || typeof traffic.pickBeachTarget !== 'function') missing.push('traffic.pickBeachTarget');
      if (!missions) missing.push('__neon.debug.missions');
      if (!neon || !neon.shots) missing.push('__neon.shots');
      check('test 21: pier hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (!world || typeof world.collides !== 'function' || typeof world.vehicleBlocked !== 'function') return results;

      check('test 21: the bait shack centre is solid', world.collides(-188, 66, 0.3) === true, 'shack is walk-through');
      for (const x of [-298, -274, -250, -226, -202]) {
        check(`test 21: the bench at x ${x} is solid`, world.collides(x, 63.1, 0.3) === true, 'bench is walk-through');
      }
      for (const x of [-282, -255, -228, -201]) {
        check(`test 21: the barrel at x ${x} is solid`, world.collides(x, 76.9, 0.3) === true, 'barrel is walk-through');
      }
      const crates = world.pierCrates ?? [];
      check('test 21: the pier registers its twelve crates', crates.length === 12, `crates=${crates.length}`);
      let crateSolid = crates.length === 12;
      for (const crate of crates) {
        if (world.collides(crate.x, crate.z, 0.3) !== true) crateSolid = false;
      }
      check('test 21: every crate is solid', crateSolid, JSON.stringify(crates.map((crate) => ({ x: crate.x, z: crate.z }))));
      check('test 21: the north railing is solid', world.collides(-280, deck.z + deck.halfWidth - 0.4, 0.3) === true, 'railing is walk-through');
      check('test 21: the south railing is solid', world.collides(-280, deck.z - deck.halfWidth + 0.4, 0.3) === true, 'railing is walk-through');
      check('test 21: the open deck centre stays clear', world.collides(-280, 70, 0.3) === false, 'a prop sits on the open deck');

      check('test 21: the deck blocks vehicles', world.vehicleBlocked(-280, 70, false) === true);
      check('test 21: the deck blocks a player-driven car too', world.vehicleBlocked(-280, 70, true) === true);
      check('test 21: the ramp blocks vehicles', world.vehicleBlocked(-164, 70, false) === true);
      check('test 21: a city road is drivable', world.vehicleBlocked(-135, 27, false) === false);
      check('test 21: sand blocks AI vehicles', world.vehicleBlocked(-200, 0, false) === true);
      check('test 21: sand stays drivable for the player', world.vehicleBlocked(-200, 0, true) === false);

      if (vehicles && typeof vehicles.spawn === 'function') {
        const sedan = vehicles.spawn('sedan', { x: -164, z: 70, yaw: Math.PI / 2 });
        check('test 21: a sedan on the ramp cannot reach the deck', sedan.collidesAt(-280, 70, world) === true, 'collidesAt(deck) is false');
        check('test 21: the same sedan can drive a city road', sedan.collidesAt(-135, 27, world) === false, 'collidesAt(road) is true');
        vehicles.remove(sedan);
      }

      if (police && typeof police.spawnCruiserAt === 'function') {
        const officersBefore = police.officers.filter((officer) => !officer.removed).length;
        police.clearUnits();
        police.clearOfficers();
        police.staged = true;
        police.wanted = 3;
        const unit = police.spawnCruiserAt(-235, 20, 0, 'pursue', 'UNIT 99');
        const distance = player ? Math.hypot(-250 - player.position.x, 70 - player.position.z) : 0;
        police.update(0.5, 5);
        const officersAfter = police.officers.filter((officer) => !officer.removed).length;
        check(
          'test 21: a cruiser blocked at the shoreline force-dismounts its officers',
          Boolean(unit) && unit.deployed === true && officersAfter > 0,
          `deployed=${unit?.deployed} officers ${officersBefore} -> ${officersAfter} distance=${distance.toFixed(1)}`,
        );
        police.staged = false;
      }

      if (missions?.pierHeist) {
        const positions = [
          ...missions.pierHeist.crates.map((entry) => ({ kind: 'crate', x: entry[0], z: entry[1] })),
          ...missions.pierHeist.spawns.map((entry) => ({ kind: 'enemy', x: entry.x, z: entry.z })),
        ];
        const blocked = positions.filter((entry) => world.collides(entry.x, entry.z, 0.3));
        check(
          'test 21: every heist crate and enemy stands clear of the pier colliders',
          positions.length >= 18 && blocked.length === 0,
          JSON.stringify(blocked),
        );
      } else {
        check('test 21: the pier heist positions are exposed', false, 'missions.pierHeist missing');
      }

      if (traffic && typeof traffic.pickBeachTarget === 'function') {
        const ped = traffic.spawnPed({ x: -280, z: 70, yaw: 0, mode: 'beach', anchor: { x: -280, z: 70 } });
        let bad = null;
        if (!ped) bad = 'spawnPed returned null';
        for (let i = 0; i < 50 && ped && !bad; i += 1) {
          traffic.pickBeachTarget(ped);
          const inside = ped.target.x >= deck.minX + 3 && ped.target.x <= deck.maxX - 3
            && Math.abs(ped.target.z - deck.z) <= deck.halfWidth - 2;
          if (!inside || world.collides(ped.target.x, ped.target.z, 0.3)) {
            bad = JSON.stringify(ped.target);
          }
        }
        check('test 21: fifty pier wander targets all land on the open deck', bad === null, String(bad || ''));
        if (ped) traffic.despawnPed(ped);
      }

      if (neon?.shots?.heist?.police?.units) {
        const units = neon.shots.heist.police.units;
        const bad = units.filter((unit) => world.vehicleBlocked(unit.x, unit.z, false));
        check(
          'test 21: the heist shot cruisers sit off the blocked pier',
          units.length === 2 && bad.length === 0,
          JSON.stringify(bad),
        );
      }

      const strayCars = vehicles ? vehicles.list.filter((car) => car.driver === 'ai' && (car.position.x < -142 || world.vehicleBlocked(car.position.x, car.position.z, false))) : [];
      check('test 21: no ambient car starts on the sand or the pier', strayCars.length === 0, JSON.stringify(strayCars.map((car) => ({ x: car.position.x, z: car.position.z }))));
      return results;
    },
  },
  {
    name: 'test 22: seats, sitting and the contextual E layer',
    shot: 'street',
    body: function seatsAndSitting() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const player = neon?.debug?.player;
      const vehicles = neon?.debug?.vehicles;
      const interactions = neon?.debug?.interactions;
      const seats = world?.seats;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!Array.isArray(seats)) missing.push('world.seats');
      if (!player || typeof player.sitAt !== 'function' || typeof player.stand !== 'function') missing.push('player.sitAt/stand');
      if (!interactions || typeof interactions.update !== 'function') missing.push('interactions.update');
      if (!vehicles || typeof vehicles.spawn !== 'function') missing.push('vehicles.spawn');
      check('test 22: seat hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const kinds = new Set(seats.map((seat) => seat.kind));
      check('test 22: the registry has a plaza seat', kinds.has('plaza'), JSON.stringify([...kinds]));
      check('test 22: the registry has a pier seat', kinds.has('pier'), JSON.stringify([...kinds]));
      check('test 22: the registry has a beach seat', kinds.has('beach'), JSON.stringify([...kinds]));

      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code.replace('Key', '').toLowerCase(),
        bubbles: true,
        cancelable: true,
      }));

      const seat = seats.find((entry) => entry.kind === 'plaza' && !entry.occupant);
      check('test 22: a free plaza seat exists', Boolean(seat), 'no free plaza seat');
      if (!seat) return results;

      player.teleport(seat.x, seat.z, seat.yaw, seat.yaw + Math.PI);
      neon.advance(1 / 60);
      check(
        'test 22: standing beside a free seat prompts SIT',
        interactions.prompt?.action === 'sit',
        JSON.stringify(interactions.prompt),
      );

      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check(
        'test 22: E seats the player',
        player.sitting === true && player.seat === seat && seat.occupant === 'player',
        JSON.stringify({ sitting: player.sitting, occupant: seat.occupant }),
      );

      const beforeX = player.position.x;
      const beforeZ = player.position.z;
      key('keydown', 'KeyW');
      neon.advance(1 / 60);
      key('keyup', 'KeyW');
      check(
        'test 22: a movement key stands the seated player',
        player.sitting === false && player.seat === null && seat.occupant === null,
        JSON.stringify({ sitting: player.sitting, occupant: seat.occupant }),
      );
      check(
        'test 22: the first movement frame does not slide the seated player',
        Math.hypot(player.position.x - beforeX, player.position.z - beforeZ) < 0.05,
        JSON.stringify({ x: player.position.x, z: player.position.z, beforeX, beforeZ }),
      );
      const standX = player.position.x;
      const standZ = player.position.z;
      key('keydown', 'KeyW');
      neon.advance(0.5);
      key('keyup', 'KeyW');
      check(
        'test 22: the player walks after standing',
        Math.hypot(player.position.x - standX, player.position.z - standZ) > 0.2,
        JSON.stringify({ x: player.position.x, z: player.position.z, standX, standZ }),
      );

      // Re-seat for the E stand check.
      player.teleport(seat.x, seat.z, seat.yaw, seat.yaw + Math.PI);
      neon.advance(1 / 60);
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check('test 22: E seats the player again', player.sitting === true, JSON.stringify({ sitting: player.sitting }));

      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check(
        'test 22: E again stands and frees the seat',
        player.sitting === false && player.seat === null && seat.occupant === null,
        JSON.stringify({ sitting: player.sitting, occupant: seat.occupant }),
      );

      player.teleport(seat.x + 1.2, seat.z, seat.yaw, seat.yaw + Math.PI);
      neon.advance(1 / 60);
      check(
        'test 22: the prompt reads SIT while standing beside it',
        interactions.prompt?.action === 'sit' && interactions.prompt?.label === 'SIT',
        JSON.stringify(interactions.prompt),
      );

      // Squeeze: park a sedan against a known building wall with Rae in the
      // gap. The straight push cannot work, so the push-out must slide her
      // clear of the car without putting her inside the wall.
      const building = world.buildings[0];
      check('test 22: a building wall is available for the squeeze test', Boolean(building), 'no buildings');
      if (building) {
        const wallZ = building.z0;
        const midX = (building.x0 + building.x1) / 2;
        const car = vehicles.spawn('sedan', { x: midX, z: wallZ, yaw: Math.PI / 2 });
        // Place its near edge 8 cm from the wall once the body width is known.
        const halfWidth = car.halfWidth;
        car.setPose(midX, wallZ - halfWidth - 0.08, Math.PI / 2);
        player.teleport(midX, wallZ - 0.3, Math.PI / 2, Math.PI * 1.5);
        player.velocity.set(0, 0, 0);
        check(
          'test 22: the squeeze start overlaps the car',
          car.overlapCircle(player.position.x, player.position.z, 0.46).penetration > 0,
          JSON.stringify(car.overlapCircle(player.position.x, player.position.z, 0.46)),
        );
        player.resolveVehicleContacts();
        const overlap = car.overlapCircle(player.position.x, player.position.z, 0.46);
        check(
          'test 22: the push-out leaves the player outside the car body',
          overlap.penetration === 0,
          JSON.stringify({ overlap, x: player.position.x, z: player.position.z }),
        );
        check(
          'test 22: the push-out never leaves the player inside the wall',
          world.collides(player.position.x, player.position.z, 0.46) === false,
          JSON.stringify({ x: player.position.x, z: player.position.z }),
        );
        vehicles.remove(car);
      }
      return results;
    },
  },
  {
    name: 'test 23: the Solano Mall shell and interior',
    shot: 'street',
    body: function mallShell() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const player = neon?.debug?.player;
      const vehicles = neon?.debug?.vehicles;
      const mall = world?.mall;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!mall) missing.push('world.mall');
      if (!world || typeof world.vehicleBlocked !== 'function') missing.push('world.vehicleBlocked');
      if (!world || typeof world.resolveCircle !== 'function') missing.push('world.resolveCircle');
      if (!player || typeof player.teleport !== 'function') missing.push('player.teleport');
      if (!neon || !neon.mall) missing.push('__neon.mall');
      check('test 23: mall hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (!mall || !world) return results;

      const bounds = mall.bounds;
      player.teleport(54, 8, Math.PI / 2, -Math.PI / 2);
      check(
        'test 23: the hall centre is inside the mall bounds',
        bounds.minX < 54 && bounds.maxX > 54 && bounds.minZ < 8 && bounds.maxZ > 8,
        JSON.stringify(bounds),
      );
      check(
        'test 23: the hall floor is the block floor',
        Math.abs(world.groundHeightAt(54, 8) - 0.15) < 1e-6,
        `ground=${world.groundHeightAt(54, 8)}`,
      );
      check(
        'test 23: the hall centre is walkable',
        world.collides(54, 8, 0.4) === false,
        'a collider sits at the hall centre',
      );

      const wall = world.resolveCircle(46, 16, 0.4);
      check(
        'test 23: resolveCircle pushes a point inside a mall wall back out',
        !world.collides(wall.x, wall.z, 0.4) && (wall.x !== 46 || wall.z !== 16),
        JSON.stringify(wall),
      );

      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code.replace('Key', '').toLowerCase(),
        bubbles: true,
        cancelable: true,
      }));
      player.teleport(54, 18, Math.PI, 0);
      key('keydown', 'KeyW');
      neon.advance(1.4);
      key('keyup', 'KeyW');
      check(
        'test 23: the main door is walkable from the strip into the hall',
        player.position.z < 15.5,
        JSON.stringify({ x: player.position.x, z: player.position.z }),
      );
      player.teleport(54, -2, 0, Math.PI);
      key('keydown', 'KeyW');
      neon.advance(1.4);
      key('keyup', 'KeyW');
      check(
        'test 23: the lot door is walkable from the parking side into the hall',
        player.position.z > 0.5,
        JSON.stringify({ x: player.position.x, z: player.position.z }),
      );

      if (vehicles) {
        const car = vehicles.spawn('sedan', { x: 60, z: 16.3, yaw: Math.PI / 2 });
        const halfWidth = car.halfWidth;
        car.setPose(60, 16.02 + halfWidth + 0.08, Math.PI / 2);
        player.teleport(60, 16.32, Math.PI / 2, Math.PI * 1.5);
        player.velocity.set(0, 0, 0);
        check(
          'test 23: the mall squeeze start overlaps the car',
          car.overlapCircle(player.position.x, player.position.z, 0.46).penetration > 0,
          JSON.stringify(car.overlapCircle(player.position.x, player.position.z, 0.46)),
        );
        player.resolveVehicleContacts();
        const overlap = car.overlapCircle(player.position.x, player.position.z, 0.46);
        check(
          'test 23: the mall squeeze leaves the player outside the car body',
          overlap.penetration === 0,
          JSON.stringify({ overlap, x: player.position.x, z: player.position.z }),
        );
        check(
          'test 23: the mall squeeze leaves the player outside the wall',
          world.collides(player.position.x, player.position.z, 0.46) === false,
          JSON.stringify({ x: player.position.x, z: player.position.z }),
        );
        vehicles.remove(car);
      }

      check('test 23: the mall blocks vehicles', world.vehicleBlocked(54, 8, false) === true);
      check('test 23: the mall blocks a player-driven car too', world.vehicleBlocked(54, 8, true) === true);
      check('test 23: the parking lot stays drivable', world.vehicleBlocked(54, -8, false) === false);

      const seats = mall.seats ?? [];
      check('test 23: the mall owns at least 24 seats', seats.length >= 24, `seats=${seats.length}`);
      const outside = seats.filter((seat) => seat.x < bounds.minX || seat.x > bounds.maxX || seat.z < bounds.minZ || seat.z > bounds.maxZ);
      check('test 23: every mall seat is inside the hall bounds', outside.length === 0, JSON.stringify(outside));
      const registered = seats.every((seat) => Array.isArray(world.seats) && world.seats.includes(seat));
      check('test 23: every mall seat is in the shared registry', registered);
      check(
        'test 23: the minimap state carries the mall label and footprint',
        mall.label === 'SOLANO MALL' && neon.mall?.label === mall.label
          && neon.mall?.bounds?.minX === bounds.minX && neon.mall?.bounds?.maxZ === bounds.maxZ,
        JSON.stringify({ label: mall.label, state: neon.mall }),
      );
      return results;
    },
  },
  {
    name: 'test 24: the parking lot, theft and valet',
    shot: 'street',
    body: function parkingLot() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const player = neon?.debug?.player;
      const vehicles = neon?.debug?.vehicles;
      const parking = neon?.debug?.parking;
      const env = neon?.debug?.environment;
      const interactions = neon?.debug?.interactions;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!world) missing.push('world');
      if (!player) missing.push('player');
      if (!vehicles || typeof vehicles.closestTo !== 'function') missing.push('vehicles.closestTo');
      if (!parking || !Array.isArray(parking.slots)) missing.push('parking.slots');
      if (!env || typeof env.setClock !== 'function') missing.push('environment.setClock');
      if (!interactions) missing.push('interactions');
      if (!neon || !neon.parking) missing.push('__neon.parking');
      check('test 24: parking hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (!parking || !world || !player || !vehicles) return results;

      check('test 24: the lot has 26 stalls', parking.slots.length === 26, `slots=${parking.slots.length}`);
      const outside = parking.slots.filter((slot) => slot.x < 38 || slot.x > 70 || slot.z < -16 || slot.z > 0);
      check('test 24: every stall is inside the lot bounds', outside.length === 0, JSON.stringify(outside.map((slot) => ({ x: slot.x, z: slot.z }))));

      const settle = (minutes) => {
        env.setClock(minutes);
        for (let i = 0; i < 320; i += 1) parking.update(0.2, minutes);
        return parking.occupied;
      };
      const night = settle(22 * 60);
      check(
        'test 24: night occupancy is 20% within one stall',
        Math.abs(night - Math.round(26 * 0.2)) <= 1,
        `occupied=${night} target=${Math.round(26 * 0.2)}`,
      );
      const dusk = settle(18 * 60);
      check(
        'test 24: dusk occupancy is 90% within one stall',
        Math.abs(dusk - Math.round(26 * 0.9)) <= 1,
        `occupied=${dusk} target=${Math.round(26 * 0.9)}`,
      );
      const day = settle(12 * 60);
      check(
        'test 24: day occupancy is 65% within one stall',
        Math.abs(day - Math.round(26 * 0.65)) <= 1,
        `occupied=${day} target=${Math.round(26 * 0.65)}`,
      );

      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code.replace('Key', '').toLowerCase(),
        bubbles: true,
        cancelable: true,
      }));

      // Dusk is the busiest lot; the stall in front of the lot door must stay
      // empty or the only way between the mall and the parking lot is blocked.
      const doorSlot = parking.slots.find((entry) => entry.key === 'B-6');
      settle(18 * 60);
      check(
        'test 24: the stall in front of the lot door stays clear at dusk',
        Boolean(doorSlot) && doorSlot.doorClear === true && doorSlot.occupied === false
          && world.collides(54, -2.5, 0.4) === false,
        JSON.stringify(doorSlot ? { key: doorSlot.key, doorClear: doorSlot.doorClear, occupied: doorSlot.occupied } : null),
      );
      player.teleport(54, -2, 0, Math.PI);
      neon.advance(1 / 60);
      key('keydown', 'KeyW');
      neon.advance(1.4);
      key('keyup', 'KeyW');
      check(
        'test 24: the lot door is walkable at 90% occupancy',
        player.position.z > 0.5,
        JSON.stringify({ x: player.position.x, z: player.position.z }),
      );

      const slot = parking.slots.find((entry) => entry.static && entry.occupied && !entry.stolen);
      check('test 24: an occupied static stall exists for the theft', Boolean(slot), 'no static occupied slot');
      if (slot) {
        check(
          'test 24: an occupied stall has a solid collider',
          Boolean(slot.collider) && world.collides(slot.x, slot.z, 0.4) === true,
          JSON.stringify({ collider: Boolean(slot.collider) }),
        );
        const aisleZ = slot.row === 'A' ? 1.9 : -1.9;
        player.teleport(slot.x, slot.z + aisleZ, slot.row === 'A' ? Math.PI : 0, slot.row === 'A' ? 0 : Math.PI);
        neon.advance(1 / 60);
        check(
          'test 24: standing beside a parked car prompts STEAL',
          interactions.prompt?.action === 'steal',
          JSON.stringify(interactions.prompt),
        );
        key('keydown', 'KeyE');
        neon.advance(1 / 60);
        key('keyup', 'KeyE');
        check(
          'test 24: E steals the static car into a real Vehicle',
          slot.occupied === false && slot.stolen === true && Boolean(slot.vehicle)
            && slot.vehicle.driver === 'player' && player.driving === slot.vehicle,
          JSON.stringify({ occupied: slot.occupied, stolen: slot.stolen, vehicle: Boolean(slot.vehicle), driving: Boolean(player.driving) }),
        );
        check(
          'test 24: stealing removes the stall collider',
          slot.collider === null && world.collides(slot.x, slot.z, 0.4) === false,
          JSON.stringify({ collider: slot.collider, collides: world.collides(slot.x, slot.z, 0.4) }),
        );
      }

      const car = player.driving;
      check('test 24: the stolen car is drivable', Boolean(car), 'player is not driving');
      if (!car) return results;

      const zone = parking.valetZone;
      car.setPose((zone.minX + zone.maxX) / 2, (zone.minZ + zone.maxZ) / 2, Math.PI / 2);
      player.syncFromVehicle();
      const storedType = car.type;
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check(
        'test 24: E in the valet zone parks the car instead of only exiting it',
        Boolean(parking.valet) && player.driving === null && player.sitting === false && car.removed === true,
        JSON.stringify({ valet: Boolean(parking.valet), driving: Boolean(player.driving), removed: car.removed }),
      );
      check(
        'test 24: the valet stores the car type and colour',
        parking.valet?.type === storedType && Number.isFinite(parking.valet?.color),
        JSON.stringify(parking.valet),
      );
      neon.advance(1 / 60);
      check(
        'test 24: the prompt leaves VALET once the car is parked',
        interactions.prompt?.action !== 'valet',
        JSON.stringify(interactions.prompt),
      );

      player.teleport((zone.minX + zone.maxX) / 2, (zone.minZ + zone.maxZ) / 2, 0, Math.PI);
      neon.advance(1 / 60);
      check(
        'test 24: on foot in the valet zone does not prompt to park',
        interactions.prompt?.action !== 'valet',
        JSON.stringify(interactions.prompt),
      );

      player.teleport(parking.podium.x - 1.0, parking.podium.z, 0, Math.PI);
      neon.advance(1 / 60);
      check(
        'test 24: the podium prompts RETRIEVE',
        interactions.prompt?.action === 'retrieve',
        JSON.stringify(interactions.prompt),
      );
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      const returned = vehicles.closestTo(parking.entrance.x, parking.entrance.z, 8);
      check(
        'test 24: retrieveValet puts the car back at the entrance',
        Boolean(returned) && returned.type === storedType && returned.driver === null
          && Math.hypot(returned.position.x - parking.entrance.x, returned.position.z - parking.entrance.z) < 2.0,
        JSON.stringify(returned ? { type: returned.type, x: returned.position.x, z: returned.position.z } : null),
      );
      check('test 24: the valet slot is clear after the return', parking.valet === null);
      return results;
    },
  },
  {
    name: 'test 25: mall life follows the clock',
    shot: 'mall-interior',
    body: function mallLife() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const traffic = neon?.debug?.traffic;
      const life = neon?.debug?.mallLife;
      const mall = neon?.debug?.world?.mall;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!traffic) missing.push('traffic');
      if (!life || typeof life.update !== 'function' || typeof life.updatePed !== 'function') missing.push('mallLife');
      if (!mall) missing.push('world.mall');
      check('test 25: mall-life hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (!life || !traffic || !mall) return results;

      life.update(0.1, 18 * 60);
      const dusk = traffic.peds.filter((ped) => ped.active && ped.mode === 'mall').length;
      check('test 25: dusk brings at least 20 shoppers', dusk >= 20, `mall=${dusk}`);

      const seated = traffic.peds.filter((ped) => ped.active && ped.mode === 'mall' && ped.sitting);
      check('test 25: at least four shoppers are sitting', seated.length >= 4, `seated=${seated.length}`);
      const seats = seated.map((ped) => ped.seat);
      check(
        'test 25: no two shoppers share a seat',
        seats.every((seat, index) => Boolean(seat) && seats.indexOf(seat) === index)
          && seats.every((seat) => seat.occupant && seat.occupant.sitting === true),
        JSON.stringify(seats.map((seat) => ({ x: seat?.x, z: seat?.z }))),
      );
      const seatedInMall = seated.every((ped) => ped.seat.x > mall.bounds.minX && ped.seat.x < mall.bounds.maxX
        && ped.seat.z > mall.bounds.minZ && ped.seat.z < mall.bounds.maxZ);
      check('test 25: every occupied chair is inside the mall', seatedInMall);

      life.update(0.1, 2 * 60);
      const night = traffic.peds.filter((ped) => ped.active && ped.mode === 'mall').length;
      check('test 25: 02:00 leaves at most six shoppers', night <= 6, `mall=${night}`);
      check(
        'test 25: no chair holds a stale occupant after the shrink',
        mall.seats.every((seat) => !seat.occupant || seat.occupant === 'player' || seat.occupant.active === true),
        JSON.stringify(mall.seats.filter((seat) => seat.occupant && seat.occupant !== 'player' && !seat.occupant.active).map((seat) => seat.x)),
      );
      return results;
    },
  },
  {
    name: 'test 26: the mall robbery',
    shot: 'mall-interior',
    body: function mallRobbery() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const player = neon?.debug?.player;
      const traffic = neon?.debug?.traffic;
      const police = neon?.debug?.police;
      const pickups = neon?.debug?.pickups;
      const robbery = neon?.debug?.robbery;
      const interactions = neon?.debug?.interactions;
      const env = neon?.debug?.environment;
      const mall = world?.mall;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!world || !mall) missing.push('world.mall');
      if (!player) missing.push('player');
      if (!traffic) missing.push('traffic');
      if (!police) missing.push('police');
      if (!pickups) missing.push('pickups');
      if (!robbery || !interactions) missing.push('robbery/interactions');
      if (!env || typeof env.setClock !== 'function') missing.push('environment');
      check('test 26: robbery hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code.replace('Key', '').toLowerCase(),
        bubbles: true,
        cancelable: true,
      }));

      env.setClock(18 * 60);
      neon.advance(1 / 60);
      player.teleport(mall.register.x + 1.3, mall.register.z, Math.PI / 2, -Math.PI / 2);
      neon.advance(1 / 60);
      check(
        'test 26: standing at the jewelry counter prompts ROB',
        interactions.prompt?.action === 'rob',
        JSON.stringify(interactions.prompt),
      );

      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check('test 26: E starts the robbery once', robbery.robbed === true);
      check('test 26: the robbery raises three wanted stars', police.wanted === 3, `wanted=${police.wanted}`);

      const guards = traffic.peds.filter((ped) => ped.guard && ped.active && !ped.dead);
      check('test 26: two security guards spawn', guards.length === 2, `guards=${guards.length}`);
      check(
        'test 26: both guards are armed and hostile',
        guards.length === 2 && guards.every((guard) => guard.armed === true && guard.hostile === true),
        JSON.stringify(guards.map((guard) => ({ armed: guard.armed, hostile: guard.hostile }))),
      );
      check(
        'test 26: both guards are inside the mall',
        guards.length === 2 && guards.every((guard) => guard.x > mall.bounds.minX && guard.x < mall.bounds.maxX
          && guard.z > mall.bounds.minZ && guard.z < mall.bounds.maxZ),
        JSON.stringify(guards.map((guard) => ({ x: guard.x, z: guard.z }))),
      );

      const drop = neon.loot.items.find((item) => item.kind === 'cash'
        && Math.hypot(item.x - mall.register.x, item.z - mall.register.z) < 3.5);
      check(
        'test 26: the cash drop sits at the counter and holds $650-950',
        Boolean(drop) && drop.amount >= 650 && drop.amount <= 950,
        JSON.stringify({ drop: drop ?? null, items: neon.loot.items }),
      );
      check('test 26: nearby pedestrians flee', neon.pedestrians.fleeing >= 1, `fleeing=${neon.pedestrians.fleeing}`);

      const frozenCash = drop?.amount ?? 0;
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      const guardsAgain = traffic.peds.filter((ped) => ped.guard && ped.active && !ped.dead).length;
      check(
        'test 26: a second E does not rob again',
        robbery.robbed === true && guardsAgain === 2 && neon.loot.items.filter((item) => item.kind === 'cash').length === 1,
        JSON.stringify({ guards: guardsAgain, cash: neon.loot.items.filter((item) => item.kind === 'cash').length }),
      );

      neon.advance(2);
      const insideUnits = neon.police.unitList.filter((unit) => unit.x > mall.bounds.minX && unit.x < mall.bounds.maxX
        && unit.z > mall.bounds.minZ && unit.z < mall.bounds.maxZ);
      check('test 26: no police cruiser parks inside the mall', insideUnits.length === 0, JSON.stringify(insideUnits));

      const guard = guards[0];
      const lootBefore = neon.loot.count;
      if (guard && !guard.dead) traffic.applyPlayerHit({ ped: guard, headshot: false }, 500);
      check(
        'test 26: a dead guard drops loot like any armed pedestrian',
        Boolean(guard) && guard.dead === true && neon.loot.count === lootBefore + 1,
        JSON.stringify({ dead: guard?.dead, before: lootBefore, after: neon.loot.count }),
      );
      return results;
    },
  },
  {
    name: 'test 27: the gas station forecourt and service lane',
    shot: 'street',
    body: function gasStation() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };
      const neon = window.__neon;
      const world = neon?.debug?.world;
      const station = neon?.debug?.gasStation;
      check('test 27: station hooks are exposed', Boolean(world?.gasStation) && Boolean(station), 'station missing');
      if (!world || !station) return results;
      check('test 27: the forecourt has two pumps and two slots', station.pumps.length === 2 && station.slots.length === 2,
        JSON.stringify({ pumps: station.pumps.length, slots: station.slots.length }));
      check('test 27: a stopped car is within reach of a nozzle',
        Boolean(station.atPump({ x: -96.5, z: -11 }, 3.5)) && Boolean(station.atPump({ x: -96.5, z: 11 }, 3.5)),
        'no nozzle within 3.5 m of a slot');
      check('test 27: the kiosk is solid', world.collides(-120, 0, 0.4) === true);
      check('test 27: both pump islands are solid', world.collides(-100, -8, 0.4) === true && world.collides(-100, 8, 0.4) === true);
      check('test 27: the canopy columns are solid', world.collides(-107.5, -9, 0.4) === true && world.collides(-92.5, 9, 0.4) === true);
      check('test 27: the pump slots are clear for a car',
        world.collides(-96.5, -11, 0.9) === false && world.collides(-96.5, 11, 0.9) === false);
      check('test 27: the service lane and both curb cuts are clear',
        world.collides(-92, -15, 1.2) === false && world.collides(-92, 15, 1.2) === false
          && world.collides(-88, -18, 1.2) === false && world.collides(-88, 18, 1.2) === false);
      check('test 27: the forecourt is not vehicle-blocked',
        world.vehicleBlocked(-100, 0, false) === false && world.vehicleBlocked(-92, -18, false) === false);

      const player = neon?.debug?.player;
      const vehicles = neon?.debug?.vehicles;
      const interactions = neon?.debug?.interactions;
      const hud = neon?.debug?.hud;
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true,
      }));
      // A ?shot= page suppresses toasts for the capture; this group asserts them.
      hud.suppressToasts = false;

      const car = vehicles.spawn('sedan', { x: -96.5, z: -11, yaw: -Math.PI / 2, fuel: 0.4 });
      car.condition = 0.5;
      player.enterVehicle(car);
      neon.advance(1 / 60);
      check('test 27: a car at the pump prompts SERVICE at the quoted price',
        interactions.prompt?.action === 'fuel' && interactions.prompt?.detail === '$123',
        JSON.stringify(interactions.prompt));
      check('test 27: the HUD carries the fuel level', neon.state?.vehicle?.fuel === 0.4,
        JSON.stringify(neon.state?.vehicle ?? null));

      player.cash = 1000;
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check('test 27: E refuels and repairs and debits the quote',
        car.fuel === 1 && car.condition === 1 && player.cash === 877,
        JSON.stringify({ fuel: car.fuel, condition: car.condition, cash: player.cash }));
      neon.advance(1 / 60);
      check('test 27: a fully serviced car has no service prompt', interactions.prompt?.action !== 'fuel');

      key('keydown', 'KeyF');
      neon.advance(1 / 60);
      key('keyup', 'KeyF');
      check('test 27: F still exits at a pump and does not service', player.driving === null);

      const poor = vehicles.spawn('muscle', { x: -96.5, z: 11, yaw: -Math.PI / 2, fuel: 0.5 });
      player.enterVehicle(poor);
      player.cash = 20;
      neon.advance(1 / 60);
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check('test 27: a wallet short of the quote refuses and keeps the car as it was',
        poor.fuel === 0.5 && player.cash === 20 && hud?.toast?.title === 'NOT ENOUGH CASH',
        JSON.stringify({ fuel: poor.fuel, cash: player.cash, toast: hud?.toast?.title }));

      poor.fuel = 0.1;
      neon.advance(1 / 60);
      check('test 27: a low tank raises the LOW FUEL toast', hud?.toast?.title === 'LOW FUEL',
        JSON.stringify(hud?.toast));

      // An empty tank turns throttle into nothing while the car stays drivable.
      const dry = vehicles.spawn('sedan', { x: -70, z: -6, yaw: 0, fuel: 0, driver: 'ai' });
      dry.controls.throttle = 1;
      dry.controls.brake = 0;
      const dryZ = dry.position.z;
      neon.advance(1);
      check('test 27: an empty car cannot accelerate',
        Math.abs(dry.speed) < 0.5 && Math.abs(dry.position.z - dryZ) < 0.5,
        JSON.stringify({ speed: dry.speed, z: dry.position.z }));

      const traffic = neon?.debug?.traffic;

      // The service checks left the player parked across pump 1 and the test
      // cars on the pads; clear every one so both pumps are free for the NPCs.
      if (player.driving) player.exitVehicle();
      vehicles.remove(car);
      vehicles.remove(poor);
      vehicles.remove(dry);
      player.teleport(-63, 27.3);

      // Isolate the station: no ambient car may take a pump, and no crosser
      // may hold the adjacent lane for the length of the 60 s deadlock run.
      traffic.carTarget = 0;
      for (const other of [...traffic.cars]) traffic.removeCar(other);
      traffic.sidewalkTarget = 0;
      traffic.beachTarget = 0;
      for (const ped of traffic.peds) traffic.crowd.hide(ped.slot);
      traffic.peds.length = 0;

      // A flagged northbound car pulls in, pumps, and rejoins.
      const flagged = traffic.spawnLaneCar('sedan', 'z', 1, -81, -30, 11, { fuel: 0.2 });
      let pumpSlot = null;
      for (let i = 0; i < 240 && !pumpSlot; i += 1) {
        neon.advance(0.1);
        pumpSlot = station.slots.find((entry) => entry.car === flagged && entry.phase === 'pump') ?? null;
      }
      check('test 27: a flagged car pulls in and stops at a pump',
        Boolean(pumpSlot) && flagged.position.x < -88,
        JSON.stringify({ mode: flagged.ai.mode, x: flagged.position.x, z: flagged.position.z }));
      check('test 27: the pump wait is 4-6 seconds',
        Boolean(pumpSlot) && pumpSlot.timer >= 4 && pumpSlot.timer <= 6,
        JSON.stringify(pumpSlot ? { timer: pumpSlot.timer } : null));
      neon.advance(3);
      check('test 27: the car is still pumping after three seconds', flagged.ai.mode === 'pump');
      // The pull-out loops around the kiosk; give it the real drive time and
      // stop the moment it merges, so its measured tank is still the fresh fill.
      for (let i = 0; i < 400 && flagged.ai.mode !== 'drive'; i += 1) neon.advance(0.1);
      check('test 27: the pump fills the NPC tank and the car rejoins the lane',
        flagged.fuel > 0.98 && flagged.ai.mode === 'drive' && Math.abs(flagged.position.x + 84.2) < 1.5,
        JSON.stringify({ fuel: flagged.fuel, mode: flagged.ai.mode, x: flagged.position.x, z: flagged.position.z }));

      // An unflagged car never stops.
      const passing = traffic.spawnLaneCar('pickup', 'z', 1, -81, -30, 11, { fuel: 1 });
      neon.advance(6);
      check('test 27: an unflagged car passes the station',
        passing.ai.mode === 'drive' && passing.position.z > -6 && Math.abs(passing.position.x + 84.2) < 1.5,
        JSON.stringify({ mode: passing.ai.mode, x: passing.position.x, z: passing.position.z }));

      // Fill both pumps, then a third flagged car must keep rolling.
      const first = traffic.spawnLaneCar('sedan', 'z', 1, -81, -32, 11, { fuel: 0.2 });
      const second = traffic.spawnLaneCar('muscle', 'z', 1, -81, -44, 12, { fuel: 0.2 });
      for (let i = 0; i < 400; i += 1) {
        neon.advance(0.1);
        if (station.slots.every((slot) => slot.car)) break;
      }
      check('test 27: both pumps can be busy at once', station.slots.every((slot) => slot.car),
        JSON.stringify(station.slots.map((slot) => Boolean(slot.car))));
      const queued = traffic.spawnLaneCar('pickup', 'z', 1, -81, -30, 11, { fuel: 0.2 });
      let queuedPassed = false;
      for (let i = 0; i < 120 && !queuedPassed; i += 1) {
        neon.advance(0.1);
        queuedPassed = queued.position.z > -8;
      }
      check('test 27: a flagged car with both pumps busy keeps driving',
        queuedPassed && !station.owns(queued),
        JSON.stringify({ mode: queued.ai.mode, z: queued.position.z }));

      // 60 simulated seconds: both pumps free themselves, nothing parks at the entry.
      let entryStall = 0;
      let worstStall = 0;
      let secondPumped = false;
      const entryCars = [first, second, queued];
      for (let i = 0; i < 120; i += 1) {
        neon.advance(0.5);
        if (second.fuel > 0.9) secondPumped = true;
        let stalled = false;
        for (const car of entryCars) {
          const distance = Math.hypot(car.position.x + 84.2, car.position.z + 18);
          if (distance < 12 && Math.abs(car.speed) < 0.3) stalled = true;
        }
        entryStall = stalled ? entryStall + 0.5 : 0;
        worstStall = Math.max(worstStall, entryStall);
      }
      check('test 27: the service lane never deadlocks for 60 seconds',
        worstStall <= 8 && station.slots.every((slot) => slot.car === null),
        JSON.stringify({ worstStall, slots: station.slots.map((slot) => Boolean(slot.car)) }));
      check('test 27: the second pump also fills its car', secondPumped,
        JSON.stringify({ fuel: second.fuel, mode: second.ai.mode, x: second.position.x, z: second.position.z }));

      // Removing a pump car frees its slot for the next car.
      const doomed = traffic.spawnLaneCar('sedan', 'z', 1, -81, -30, 11, { fuel: 0.2 });
      let doomedSlot = null;
      for (let i = 0; i < 240 && !doomedSlot; i += 1) {
        neon.advance(0.1);
        doomedSlot = station.slots.find((entry) => entry.car === doomed) ?? null;
      }
      traffic.removeCar(doomed);
      check('test 27: removing a pump car frees its slot',
        Boolean(doomedSlot) && doomedSlot.car === null && doomedSlot.phase === 'free',
        JSON.stringify(doomedSlot ? { car: Boolean(doomedSlot.car), phase: doomedSlot.phase } : null));

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
        const entry = message.params.entry;
        // The radio test deliberately tunes a 404 sentinel to prove the
        // missing-file fallback; that one request is expected to log.
        if (String(entry.url ?? '').includes('/audio/radio/__missing__.ogg')) return;
        errors.push(`log: ${entry.text} ${entry.url ?? ''}`);
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
