// Neon Harbor's make.fun entrypoint (Node 22, standard library only). The game is game/: static
// HTML, CSS and ES modules that a desktop browser loads offline, with three.js r180 vendored as its
// minified builds. This program copies game/ and screenshots/ from beside it into the output
// directory (MAKEFUN_OUTPUT_DIR, /output in the grader) and writes dossier.json with the vendored
// make.fun library. With --check it also validates the copy against the scorer's caps and prints
// one summary line; without it, the program does exactly the copy and dossier build, as before.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Hand it in with `MAKEFUN_OUTPUT_DIR=out node main.ts`, or add --check to validate the output.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, readGameTree } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const wantCheck = process.argv.includes('--check');

// The scorer's caps, straight from its gate.json. Only text_max_bytes shapes the dossier; the rest
// refuse an entry the scorer would refuse, and --check reports the same numbers.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const dossierMaxBytes = 1536 * 1024;
const mib = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, buildDossier(out, caps));

if (wantCheck) {
  const game = readGameTree(join(out, 'game'));
  const shots = readdirSync(join(out, 'screenshots'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => statSync(join(out, 'screenshots', entry.name)).size);
  const dossierBytes = statSync(dossierPath).size;
  const problems: string[] = [];
  if (game.count > caps.game_max_files) problems.push(`game entries ${game.count}`);
  if (game.totalBytes > caps.game_max_bytes) problems.push(`game bytes ${game.totalBytes}`);
  if (shots.length < 3 || shots.length > caps.screenshots.max) problems.push(`screenshots ${shots.length}`);
  if (shots.some((bytes) => bytes > caps.screenshots.max_bytes)) problems.push('screenshot over 256 KiB');
  if (dossierBytes > dossierMaxBytes) problems.push(`dossier ${dossierBytes} bytes`);
  const verdict = problems.length === 0 ? 'PASS' : `FAIL (${problems.join(', ')})`;
  console.log(
    `check ${verdict}: game ${game.count}/${caps.game_max_files} entries, ${mib(game.totalBytes)}/${mib(caps.game_max_bytes)}; ` +
      `screenshots ${shots.length} (3-4), largest ${kib(Math.max(0, ...shots))}/${kib(caps.screenshots.max_bytes)}; ` +
      `dossier ${mib(dossierBytes)}/${mib(dossierMaxBytes)}`,
  );
  if (problems.length > 0) process.exitCode = 1;
}
