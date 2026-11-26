import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RADIO, radioStationIndex } from '../game/src/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const gameRoot = join(root, 'game');
const promptPack = readFileSync(join(root, 'docs', 'audio', 'suno-radio-prompts.md'), 'utf8');
const music = readFileSync(join(root, 'MUSIC.md'), 'utf8');

const STATION_ORDER = ['vega', 'night-tide', 'knrv', 'breakwater', 'solano-soul', 'foundry'];

test('six stations in wheel order, Vega the default', () => {
  assert.equal(RADIO.stations.length, 6);
  assert.deepEqual(RADIO.stations.map((station) => station.id), STATION_ORDER);
  assert.equal(RADIO.defaultStation, 'vega');
  assert.equal(RADIO.defaultTrack, 0);
  assert.equal(radioStationIndex('vega'), 0);
  assert.equal(radioStationIndex('foundry'), 5);
  assert.equal(radioStationIndex('not-a-station'), 0);
});

test('each station has three unique tracks and a colour', () => {
  const paths = new Set();
  for (const station of RADIO.stations) {
    assert.equal(station.tracks.length, 3, station.id);
    assert.match(station.color, /^#[0-9a-f]{6}$/i, station.id);
    assert.ok(station.station.length > 0 && station.genre.length > 0, station.id);
    for (const track of station.tracks) {
      assert.ok(track.title.length > 0 && track.artist.length > 0, station.id);
      assert.ok(Number.isFinite(track.duration) && track.duration > 30, `${station.id}/${track.title}`);
      assert.equal(typeof track.vocals, 'boolean', `${station.id}/${track.title}`);
      assert.match(track.file, new RegExp(`^audio/radio/${station.id}/[a-z0-9-]+\\.ogg$`), track.file);
      assert.equal(paths.has(track.file), false, `duplicate ${track.file}`);
      paths.add(track.file);
      assert.ok(promptPack.includes(track.file), `${track.file} missing from the prompt pack`);
    }
  }
  assert.equal(paths.size, 18);
});

test('only the three procedural styles have a fallback', () => {
  const fallback = Object.fromEntries(RADIO.stations.map((station) => [station.id, station.fallbackStyle]));
  assert.deepEqual(fallback, {
    vega: null,
    'night-tide': 'synthwave',
    knrv: 'chiptune',
    breakwater: 'surf',
    'solano-soul': null,
    foundry: null,
  });
});

test('all eighteen OGG files exist, read as Ogg, and fit the audio budget', () => {
  let total = 0;
  for (const station of RADIO.stations) {
    for (const track of station.tracks) {
      const file = join(gameRoot, track.file);
      assert.ok(existsSync(file), `${track.file} is missing`);
      const bytes = readFileSync(file);
      assert.equal(bytes.subarray(0, 4).toString('ascii'), 'OggS', `${track.file} is not an OGG`);
      total += bytes.length;
      assert.ok(bytes.length > 100000, `${track.file} is suspiciously small`);
    }
  }
  assert.ok(total <= 36 * 1024 * 1024, `audio is ${total} bytes`);
});

test('MUSIC.md credits every track and the generation date', () => {
  assert.match(music, /2026-11-26/);
  assert.match(music, /Suno/);
  for (const station of RADIO.stations) {
    for (const track of station.tracks) {
      assert.ok(music.includes(track.title), `${track.title} missing from MUSIC.md`);
      assert.ok(music.includes(track.artist), `${track.artist} missing from MUSIC.md`);
    }
  }
});
