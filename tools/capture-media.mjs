// Capture the README's media: a short live gameplay loop as a GIF and a still
// of a pedestrian death with its loot drop. No npm dependencies: Node's
// standard library serves game/, launches headless Chrome, speaks the
// DevTools protocol over the built-in WebSocket, and writes frames; ffmpeg
// (on PATH, or set FFMPEG) turns the frames into the GIF.
//
//   node tools/capture-media.mjs
//
// Outputs:
//   docs/media/overview.gif   800x450 preferred, ~3 s of real gameplay, under
//                             4.5 MiB; falls back to 640x360 or 560x315
//   docs/media/combat.jpg     1280x720 still of a fallen pedestrian and loot
//
// The GIF is real input: the tool presses Enter, holds W and records the walk
// down Vega Strip. The still uses the frozen street shot and the game's own
// QA hooks to stage one kill; nothing is composited or filtered.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const gameRoot = resolve(join(here, 'game'));
const mediaRoot = resolve(join(here, 'docs', 'media'));
const MAX_GIF_BYTES = 4.5 * 1024 * 1024;

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

function jpegDimensions(buffer) {
  let index = 2;
  while (index + 9 < buffer.length) {
    if (buffer[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = buffer[index + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      index += 2;
      continue;
    }
    const length = buffer.readUInt16BE(index + 2);
    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(index + 5), width: buffer.readUInt16BE(index + 7) };
    }
    index += 2 + length;
  }
  return null;
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

function keyEvent(type, code, key, vk) {
  return {
    type,
    code,
    key,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
  };
}

function encodeGif(framesDir, fps, width, colors, output) {
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
  const filter = `[0:v]scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;
  const result = spawnSync(ffmpeg, [
    '-y',
    '-framerate', String(fps),
    '-i', join(framesDir, 'f%04d.jpg'),
    '-filter_complex', filter,
    '-loop', '0',
    output,
  ], { stdio: 'ignore', windowsHide: true });
  if (result.error) throw new Error(`ffmpeg failed to start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg exited ${result.status}`);
}

async function main() {
  if (typeof WebSocket !== 'function') {
    throw new Error('This capture tool needs Node 22+ with the built-in WebSocket client');
  }
  mkdirSync(mediaRoot, { recursive: true });
  const chrome = chromePath();
  const server = await staticServer();
  const serverPort = server.address().port;
  const cdpPort = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'neon-harbor-media-'));
  const framesDir = mkdtempSync(join(tmpdir(), 'neon-harbor-frames-'));
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
    '--window-size=800,450',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let chromeLog = '';
  child.stderr.on('data', (chunk) => { chromeLog += chunk.toString(); });

  let socket;
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
    const waitFor = async (expression, label, timeout = 30000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        try {
          if (await evaluate(expression)) return;
        } catch { /* the page may still be loading */ }
        await sleep(200);
      }
      throw new Error(`${label}: timed out`);
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 800,
      height: 450,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 800,
      screenHeight: 450,
    });

    // ---------------------------------------------------------------- GIF
    await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?media=${Date.now()}` });
    await waitFor(`Boolean(window.__neonReady && window.__neon && window.__neon.mode === 'title')`, 'title');
    await send('Input.dispatchKeyEvent', keyEvent('keyDown', 'Enter', 'Enter', 13));
    await send('Input.dispatchKeyEvent', keyEvent('keyUp', 'Enter', 'Enter', 13));
    await waitFor(`window.__neon.mode === 'playing'`, 'playing');
    await sleep(1200);
    // The pointer-lock hint is a control affordance, not gameplay; hide it so
    // the README loop shows the game, not the prompt.
    await evaluate(`document.body.classList.add('shot'); true`);
    await send('Input.dispatchKeyEvent', keyEvent('keyDown', 'KeyW', 'w', 87));

    const totalFrames = 36;
    const period = 90;
    const started = Date.now();
    for (let index = 0; index < totalFrames; index += 1) {
      const shot = await send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 82,
        fromSurface: true,
        captureBeyondViewport: false,
      });
      writeFileSync(join(framesDir, `f${String(index).padStart(4, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
      const wait = (index + 1) * period - (Date.now() - started);
      if (wait > 0) await sleep(wait);
    }
    await send('Input.dispatchKeyEvent', keyEvent('keyUp', 'KeyW', 'w', 87));
    const elapsed = Math.max(1, Date.now() - started);
    const fps = Math.max(6, Math.min(15, totalFrames / (elapsed / 1000)));
    const gifPath = join(mediaRoot, 'overview.gif');
    for (const attempt of [{ width: 800, colors: 160 }, { width: 640, colors: 128 }, { width: 560, colors: 96 }]) {
      encodeGif(framesDir, fps.toFixed(2), attempt.width, attempt.colors, gifPath);
      if (statSync(gifPath).size <= MAX_GIF_BYTES) break;
    }
    const gifBytes = statSync(gifPath).size;
    if (gifBytes > MAX_GIF_BYTES) {
      throw new Error(
        `overview.gif is ${(gifBytes / 1024 / 1024).toFixed(2)} MiB, over the ${(MAX_GIF_BYTES / 1024 / 1024).toFixed(1)} MiB limit after the final 560x315 attempt`,
      );
    }
    console.log(`overview.gif  ${totalFrames} frames  ${fps.toFixed(1)} fps  ${(gifBytes / 1024 / 1024).toFixed(2)} MiB`);

    // ---------------------------------------------------------------- still
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 720,
    });
    await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?shot=street&media=${Date.now()}` });
    await waitFor(`Boolean(window.__neonReady && window.__neon && window.__neon.shot === 'street')`, 'street shot');
    const result = await evaluate(`(() => {
      const debug = window.__neon.debug;
      const traffic = debug.traffic;
      const player = debug.player;
      const ax = -Math.sin(player.cameraYaw);
      const az = -Math.cos(player.cameraYaw);
      const ped = traffic.spawnPed({
        x: player.position.x + ax * 4.2 - az * 2.6,
        z: player.position.z + az * 4.2 + ax * 2.6,
      });
      if (!ped) return { ok: false, why: 'no crowd slot' };
      const target = {
        type: 'ped',
        ped,
        headshot: false,
        distance: 3.2,
        point: { x: ped.x, y: ped.y + 1.12 * ped.scale, z: ped.z },
      };
      traffic.applyPlayerHit(target, 34);
      traffic.applyPlayerHit(target, 34);
      traffic.update(0.7, 0);
      return { ok: ped.dead === true, slot: ped.slot, loot: window.__neon.loot.count };
    })()`);
    if (!result?.ok) throw new Error(`combat still: kill failed (${JSON.stringify(result)})`);
    await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await sleep(200);
    const still = await send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 90,
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const stillBuffer = Buffer.from(still.data, 'base64');
    const dims = jpegDimensions(stillBuffer);
    if (!dims || dims.width !== 1280 || dims.height !== 720) {
      throw new Error(`combat still: Chrome returned ${dims ? `${dims.width}x${dims.height}` : 'an unknown frame'}`);
    }
    const stillPath = join(mediaRoot, 'combat.jpg');
    writeFileSync(stillPath, stillBuffer);
    console.log(`combat.jpg    ${dims.width}x${dims.height}  ${(stillBuffer.length / 1024).toFixed(1)} KiB  loot ${result.loot}`);

    if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`);
    console.log('capture-media PASS: overview.gif and combat.jpg written');
    await send('Browser.close').catch(() => {});
  } catch (error) {
    if (chromeLog.trim()) console.error(chromeLog.trim().split('\n').slice(-12).join('\n'));
    throw error;
  } finally {
    try { socket?.close(); } catch { /* ignore */ }
    try { child.kill(); } catch { /* ignore */ }
    await new Promise((resolveClose) => server.close(resolveClose));
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file on Windows */ }
    try { rmSync(framesDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
