// Neon Harbor's make.fun entrypoint. The game is plain static files under
// game/; this program makes a clean copy of game/ and screenshots/ in the
// output directory, builds the dossier with the vendored make.fun library, and
// (with --check) reports the copy against the scorer's caps in one line.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//   MAKEFUN_OUTPUT_DIR=out node main.ts --check
//
// Play the game locally with `node serve.ts`, then open http://localhost:8080.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, readGameTree } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const wantCheck = process.argv.includes('--check');

// The scorer's gate.json, copied here so a local run refuses the same input.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const dossierCap = 1536 * 1024;

const mib = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

mkdirSync(outputDir, { recursive: true });

// Replace the two handed-in trees rather than layering a new build over an old
// one; the dossier has to describe exactly the files the scorer will read.
for (const name of ['game', 'screenshots']) {
  rmSync(join(outputDir, name), { recursive: true, force: true });
  const source = join(here, name);
  if (existsSync(source)) {
    cpSync(source, join(outputDir, name), { recursive: true });
  } else {
    mkdirSync(join(outputDir, name), { recursive: true });
  }
}

const dossierPath = join(outputDir, 'dossier.json');
writeFileSync(dossierPath, buildDossier(outputDir, caps));

if (wantCheck) {
  const problems: string[] = [];
  let game = null;
  try {
    game = readGameTree(join(outputDir, 'game'), caps);
  } catch (error) {
    problems.push(`game tree (${(error as Error).message})`);
  }

  const shotsDir = join(outputDir, 'screenshots');
  const shotFiles = existsSync(shotsDir)
    ? readdirSync(shotsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort()
    : [];
  const shotSizes = shotFiles.map((name) => statSync(join(shotsDir, name)).size);
  const largestShot = shotSizes.length > 0 ? Math.max(...shotSizes) : 0;
  const dossierBytes = statSync(dossierPath).size;

  if (game) {
    if (game.count > caps.game_max_files) problems.push(`game entries ${game.count}`);
    if (game.totalBytes > caps.game_max_bytes) problems.push(`game bytes ${game.totalBytes}`);
  }
  if (shotFiles.length < 3 || shotFiles.length > caps.screenshots.max) problems.push(`screenshots ${shotFiles.length}`);
  if (shotSizes.some((bytes) => bytes > caps.screenshots.max_bytes)) problems.push('screenshot over 256 KiB');
  if (dossierBytes > dossierCap) problems.push(`dossier ${dossierBytes} bytes`);

  // A quick read-back catches a truncated or obviously malformed dossier.
  try {
    const parsed = JSON.parse(readFileSync(dossierPath, 'utf8')) as { schema?: string; images?: unknown[] };
    if (parsed.schema !== 'makefun/dossier/v1') problems.push('dossier schema');
    if (!Array.isArray(parsed.images) || parsed.images.length !== shotFiles.length) problems.push('dossier images');
  } catch (error) {
    problems.push(`dossier JSON (${(error as Error).message})`);
  }

  if (problems.length === 0 && game) {
    console.log(
      `check PASS: game ${game.count}/${caps.game_max_files} entries, ${mib(game.totalBytes)}/${mib(caps.game_max_bytes)}; ` +
        `screenshots ${shotFiles.length}/${caps.screenshots.max}, largest ${kib(largestShot)}/${kib(caps.screenshots.max_bytes)}; ` +
        `dossier ${mib(dossierBytes)}/${mib(dossierCap)}`,
    );
  } else {
    console.log(
      `check FAIL (${problems.join(', ') || 'game tree'}): game ${game?.count ?? '?'} entries; ` +
        `screenshots ${shotFiles.length}/${caps.screenshots.max}, largest ${kib(largestShot)}/${kib(caps.screenshots.max_bytes)}; ` +
        `dossier ${mib(dossierBytes)}/${mib(dossierCap)}`,
    );
    process.exitCode = 1;
  }
}
