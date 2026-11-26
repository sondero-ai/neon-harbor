// Capture Neon Harbor's deterministic shot scenes with headless Chrome.
// No dependencies: Node's standard library serves game/, launches Chrome,
// speaks the DevTools protocol over the built-in WebSocket, and writes JPEGs
// through Page.captureScreenshot. Nothing is composited or filtered here.
//
//   node tools/capture.mjs
//
// The four files land in screenshots/ at 1280x720 and are kept under 256 KiB.
// Set CHROME to a Chrome/Chromium binary to override the default lookup.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const gameRoot = resolve(join(here, 'game'));
const shotRoot = join(here, 'screenshots');
const MAX_BYTES = 262144;

const SHOTS = [
  { shot: 'chase', file: '1-cover.jpg', quality: 87 },
  // One daylight frame so the contact sheet shows the living clock.
  { shot: 'blockade', file: '2-street.jpg', quality: 87, time: '10:30' },
  // The B1 slot after the mall wave: the interior at dusk, with shoppers.
  { shot: 'mall-interior', file: '3-mission.jpg', quality: 87, time: '18:00' },
  { shot: 'start', file: '4-title.jpg', quality: 89 },
];

// Gallery stills kept beside the README: the heist moved out of the contact
// sheet when the mall interior took the third slot.
const GALLERY = [
  { shot: 'heist', file: 'heist.jpg', dir: 'docs/media', quality: 87 },
];

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

async function main() {
  if (typeof WebSocket !== 'function') {
    throw new Error('This capture tool needs Node 22+ with the built-in WebSocket client');
  }
  const chrome = chromePath();
  const server = await staticServer();
  const serverPort = server.address().port;
  const cdpPort = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'neon-harbor-shots-'));
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
    for (const entry of [...SHOTS, ...GALLERY]) {
      const url = `http://127.0.0.1:${serverPort}/?shot=${entry.shot}${entry.time ? `&time=${entry.time}` : ''}&capture=${Date.now()}`;
      await send('Page.navigate', { url });
      const deadline = Date.now() + 30000;
      let ready = false;
      while (Date.now() < deadline) {
        try {
          ready = await evaluate(`Boolean(window.__neonReady && window.__neon && window.__neon.shot === ${JSON.stringify(entry.shot)} && window.__neon.draws > 0)`);
        } catch {
          ready = false;
        }
        if (ready) break;
        await sleep(200);
      }
      if (!ready) throw new Error(`${entry.shot}: game did not reach the staged shot`);
      await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      await sleep(450);

      let chosen = null;
      let quality = entry.quality;
      for (const level of [quality, 84, 80, 76, 72, 68]) {
        const capture = await send('Page.captureScreenshot', {
          format: 'jpeg',
          quality: level,
          fromSurface: true,
          captureBeyondViewport: false,
        });
        const buffer = Buffer.from(capture.data, 'base64');
        const dims = jpegDimensions(buffer);
        if (!dims || dims.width !== 1280 || dims.height !== 720) {
          throw new Error(`${entry.shot}: Chrome returned ${dims ? `${dims.width}x${dims.height}` : 'an unknown frame'}`);
        }
        chosen = { buffer, quality: level, dims };
        if (buffer.length <= MAX_BYTES) break;
      }
      if (!chosen || chosen.buffer.length > MAX_BYTES) {
        throw new Error(`${entry.shot}: could not get under ${MAX_BYTES} bytes`);
      }
      writeFileSync(join(entry.dir ? join(here, entry.dir) : shotRoot, entry.file), chosen.buffer);
      const draws = await evaluate('window.__neon.draws');
      console.log(`${entry.file}  ${chosen.dims.width}x${chosen.dims.height}  q${chosen.quality}  ${(chosen.buffer.length / 1024).toFixed(1)} KiB  ${draws} draws`);
    }

    if (errors.length) {
      throw new Error(`console errors:\n${errors.join('\n')}`);
    }
    console.log('capture PASS: 4 screenshots and the heist still, each 1280x720 and under 256 KiB, clean console');
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
