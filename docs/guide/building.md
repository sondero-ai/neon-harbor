# Serving, capture and the entry build

[← README](../../README.md) · [Testing](testing.md) · [Source map](source-map.md) · [Screenshots](../../screenshots/1-cover.jpg)

Neon Harbor has no build step and no dependency install. It is HTML, CSS, ES
modules, one WebGL canvas and local OGG files. `game/vendor/` holds three.js
r180's minified module and core builds behind a one-line `three.module.js`
shim; nothing else is third-party code.

## Requirements

- **Node 22.18 or newer** for `serve.ts`, the capture tools and `main.ts`
  (the repository is verified on Node 24.14.1).
- A half-decent WebGL browser. The capture tools use headless Chrome with
  GPU WebGL; set `CHROME` to a Chrome/Chromium executable if the default
  lookup misses.
- **ffmpeg** on `PATH` (or set `FFMPEG`) only for the animated media capture.

## Serve the game

```bash
node serve.ts --port 8080
# open http://localhost:8080
```

Click the view to capture the mouse. If the browser refuses pointer lock, the
same mouse drag looks around. **Enter** confirms the focused menu action.

The page reads `game/index.html` and the ES-module graph directly. There is
no bundler, no transpiler and no npm package. A static server must serve
`game/` as the document root (or map `/` to it) because the radio paths are
relative to the page.

## Screenshots

```bash
node tools/capture.mjs
```

The tool starts a stdlib HTTP server for `game/`, launches headless Chrome on
the DevTools protocol, loads each frozen `?shot=` scene at 1280×720, waits for
`window.__neonReady`, captures a JPEG and retries at a lower quality if the
file would exceed 256 KiB. It checks the JPEG header dimensions and fails on
any console or page exception.

Output: four files in `screenshots/`, each 1280×720 and at most 256 KiB:

| File | Shot | What it shows |
| --- | --- | --- |
| `1-cover.jpg` | `?shot=chase` | the night chase on Vega Strip, Air 1, two cruisers, traffic and the full HUD |
| `2-street.jpg` | `?shot=blockade&time=10:30` | the same roadblock in daylight, proving the living clock |
| `3-mission.jpg` | `?shot=heist` | Pier 9 burning at night, the lighthouse, Aurelio's crew and the CH.5 card |
| `4-title.jpg` | `?shot=start` | the title and menu over the night skyline, with the Audio row |

The first file by name is the cover. Shot mode builds the real world, player,
police or mission director, weapons, effects and HUD, runs a fixed number of
simulation steps and freezes. It forces high quality, suppresses toasts and
the fresh-slot title card, and does not depend on pointer lock or the wall
clock. The cover, heist and title use the pinned 23:41 clock; the roadblock
uses `?time=10:30`. The other poses (`street`, `drive`, `mission`, `pier`)
remain available for development checks.

The latest run:

```text
1-cover.jpg  1280x720  q87  184.7 KiB  371 draws
2-street.jpg 1280x720  q87  174.2 KiB  350 draws
3-mission.jpg 1280x720 q87  143.9 KiB  393 draws
4-title.jpg  1280x720  q89  140.1 KiB  307 draws
capture PASS: 4 JPEGs, each 1280x720 and under 256 KiB, clean console
```

## Animated media

```bash
node tools/capture-media.mjs
```

The same dependency-free DevTools driver:

1. records **New Game** at 1280×720 from the live page, presses **Enter**,
   waits for the intro toasts to clear, holds **W** and records 36 frames at
   about 11 fps;
2. encodes `docs/media/overview.gif` with ffmpeg, preferring 800×450 with 160
   colours and falling back to 640×360 or 560×315 until the file is at most
   **4.5 MiB**;
3. reloads the frozen `?shot=street` scene, stages one pedestrian kill through
   the game's own QA hooks and writes `docs/media/combat.jpg` at 1280×720.

The GIF is real input, not a rendered video: the tool presses Enter and W,
and only hides the pointer-lock hint. The still uses the same hit and death
path as a shot, so the body and loot ring are the real ones.

The latest run:

```text
overview.gif  36 frames  11.1 fps  2.88 MiB
combat.jpg    1280x720  169.0 KiB  loot 1
capture-media PASS: overview.gif and combat.jpg written
```

The current tool records the opening walk at the default dusk start. It does
not drive a car or stage a second time of day in the GIF; the day/night range
is covered by the four screenshots and combat by the still.

## Entry build

`main.ts` makes a clean copy of `game/` and `screenshots/` under
`MAKEFUN_OUTPUT_DIR` (or `/output`), writes `dossier.json` with
`vendor/makefun-game.ts`, and leaves the output ready to hand in. It uses only
the Node standard library and runs directly as TypeScript on Node 22.18+.

```bash
MAKEFUN_OUTPUT_DIR=out node main.ts
MAKEFUN_OUTPUT_DIR=out node main.ts --check
```

`--check` re-reads the copy against the bounty caps and prints one summary
line:

- game files and directories at most **993**;
- game bytes at most **48 MiB**;
- **3–4** screenshots, each at most **256 KiB**;
- dossier at most **1.5 MiB**, with the dossier text cut at **160 KiB**.

The latest run:

```text
check PASS: game 56/993 entries, 33.75 MiB/48.00 MiB; screenshots 4/4, largest 184.7 KiB/256.0 KiB; dossier 1.00 MiB/1.50 MiB, text 159.9 KiB/160.0 KiB
```

The dossier lists the game's source, then `game/index.html` and the module
import graph, then the remaining source in path order. The two minified
three.js builds and the one-line `three.module.js` shim are vendored files and
are listed by path and size rather than shown as source. The only binary
assets in `game/` are the eighteen radio OGG files, about 32.4 MiB, which the
build check counts against the 48 MiB game cap.

## Reproducibility

The city is seeded (`SEED = 20261119`), shots are frozen and the capture tools
write only `screenshots/` and `docs/media/`. Regenerating on the same Chrome
and GPU should give the same composition; JPEG bytes can differ slightly
between Chrome builds, so the checks assert dimensions and size caps, not
byte equality.
