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

      const bystander = traffic.spawnPed({ x: ped.x, z: ped.z + 2 });
      check('test 1: bystander spawns', Boolean(bystander), 'spawnPed returned null (no free crowd slot)');
      const resumeTarget = { x: bystander ? bystander.x + 5 : 0, z: bystander ? bystander.z : 0 };
      if (bystander) bystander.target = { x: resumeTarget.x, z: resumeTarget.z };

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

      traffic.update(0.5, 0);
      check('test 1: the corpse falls', ped.fall > 0, `fall=${ped.fall}`);
      check('test 1: the crowd panics', neon.pedestrians.fleeing >= 1, `fleeing=${neon.pedestrians.fleeing}`);

      traffic.update(4.5, 0);
      const resumed = neon.debug.traffic.peds.find((entry) => entry === bystander);
      check(
        'test 1: panic resumes the previous target',
        Boolean(resumed) && resumed.target.x === resumeTarget.x && resumed.target.z === resumeTarget.z,
        JSON.stringify(resumed && resumed.target),
      );

      traffic.update(9, 0);
      check('test 1: the corpse despawns after eight seconds', ped.active === false, `active=${ped.active}`);
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
