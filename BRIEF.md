# Neon Harbor — build brief (make.fun gta6-01)

You are an autonomous coding agent building the game in this repository for the
make.fun competition **gta6-01 "Make GTA 6"**. Work only inside this repository.
Every tool call you make is recorded; build the game yourself, file by file.

## The job

Build the most complete open-world crime game you can, in the spirit of GTA,
playable in desktop Chrome from static files with no network request. An AI
judge compares entries **two at a time** using one contact sheet of the
entry's screenshots and an outline of its source (file paths, byte sizes,
top-level declarations). Completeness counts most, then polish. The 100
highest-ranked entries share $1,666.

You author the game inside `game/`. `main.ts` hands `game/` and `screenshots/`
to the grader and writes `dossier.json`; leave its plumbing intact.

## Hard rules (a violation means the entry is refused)

- The game is static files under `game/`. `game/index.html` opens in desktop
  Chrome and plays. Every file it loads is under `game/` (relative paths or a
  data: URI). No network request at runtime: no CDN, no remote font, no fetch,
  no external image or audio URL.
- Vendor three.js yourself: download `https://unpkg.com/three@0.180.0/build/three.module.js`
  once during the build into `game/vendor/three.module.js`, commit it, and import
  it by relative path.
- Original IP only. City, district names, characters, vehicles, story, art,
  sound and music are yours. Nothing from GTA or Rockstar: no names, no
  assets, no copied map, no "Vice City"/"Los Santos" style naming. All art is
  procedural: three.js geometry plus canvas-drawn textures. No external art.
- Sound and music are synthesized at runtime with WebAudio oscillators and
  noise buffers; no audio files.
- Deterministic screenshot mode. `?shot=start|street|chase|mission&seed=1` must
  set up that scene immediately (no waiting for input, no pointer lock) and
  render it in the first frames, at 1280x480.
- Keep it fast: aim under ~120k triangles and ~200 draw calls; instancing or
  merged geometry for buildings, windows and props.
- English only in code, comments and UI.

Do not modify `vendor/makefun-game.ts`. Do not run the make.fun CLI, do not
submit, do not touch `.makefun/`. Do not force-push.

## Feature checklist (all of it, in this order)

1. **World.** A coastal neon city, roughly 1.4 km x 1.4 km: a grid of blocks
   with roads, lane markings, sidewalks, curbs, crosswalks, streetlights,
   palms, traffic lights, benches, dumpsters, neon signs, billboards, a beach
   with a pier and a lighthouse, and a downtown skyline. Buildings are
   procedural with window grids and lit windows. Sunset sky with a sun, haze
   and fog. Water plane with a cheap animated uv shimmer.
2. **Player on foot.** Third-person character with a procedural walk/run
   cycle, sprint, jump, camera orbit with mouse, camera collision, health and
   armor, respawn at a hospital when wasted.
3. **Vehicles.** At least 6 distinct car types (sedan, sports, van, taxi,
   police cruiser, muscle) built from boxes with wheels, lights and glass.
   Enter/exit the nearest car with F/E. Arcade physics with acceleration,
   braking, reverse, steering, lateral grip, drift and handbrake, suspension
   bounce, tire smoke on drift, skid marks, headlights and brake lights.
   Vehicle damage and explosions at low health.
4. **Traffic and pedestrians.** Cars follow the road graph in lanes, respect
   traffic lights, brake for cars and the player, and despawn/respawn around
   the player. Pedestrians walk the sidewalks with simple avoidance, cross at
   crosswalks, flee when shots are fired or a car horn sounds nearby.
5. **Wanted level and police.** 0-5 stars. Crimes raise heat (carjacking,
   hitting a pedestrian, firing a gun in public, damaging police). Police
   cruisers spawn and chase, officers on foot shoot at 2+ stars, a helicopter
   at 4+. Evade by breaking line of sight; stars cool down after a hiding
   timer. Busted/wasted screens.
6. **Combat.** Pistol and SMG with hitscan, tracers, muzzle flash, recoil,
   camera shake, hit sparks, damage numbers off. Aim with right mouse,
   crosshair, ammo and reload. Melee punch. Health pickups and armor.
7. **Missions and story.** A four-mission chain with a named protagonist
   (Rae Solano, a courier for the Solano import ring), a supporting cast,
   dialogue boxes with portraits, waypoint markers and a minimap route,
   objective updates, timers, fail and retry, cash rewards, and a short
   epilogue card. Missions: steal a car and deliver it; tail a rival and
   photograph the handoff; survive a police ambush; a final chase to the pier
   and a boat escape.
8. **HUD and UI.** Canvas HUD: health and armor bars, cash with a rolling
   counter, wanted stars, weapon icon with ammo, minimap (top-down road map
   with blips, mission marker, police, north indicator), mission title and
   objective, speedometer while driving, radio station name, subtitle bar,
   notification toasts, damage vignette, pause menu, controls screen.
9. **Start screen and save.** Title screen with the logo, animated city
   backdrop, "NEW GAME / CONTINUE", controls, and a settings toggle for
   quality. Save to `localStorage` (position, cash, mission progress, wanted,
   time of day) with autosave after each mission and on pause; continue
   restores it.
10. **Polish.** Screen shake, day/night cycle frozen at a golden-hour preset,
    emissive windows and neon, sun shafts via fog, particle effects (sparks,
    smoke, dust, water splash), smooth camera, animated loading of the city,
    and a locked 60fps loop with fixed-step simulation.

## Suggested architecture (keep modules small and declarative)

```
game/index.html          shell, import map, canvas, UI overlays
game/src/main.js         boot, game loop, state machine (menu/play/pause)
game/src/world.js        city generation, roads, props, collision grid
game/src/player.js       on-foot controller, animation, combat
game/src/vehicles.js     car models, physics, damage
game/src/traffic.js      traffic + pedestrian agents
game/src/police.js       wanted level, pursuit AI, spawns
game/src/missions.js     mission chain, triggers, dialogue
game/src/hud.js          canvas HUD, minimap, menus
game/src/audio.js        WebAudio engine, weapons, siren, music
game/src/save.js         localStorage persistence
game/src/shots.js        deterministic screenshot scenes
```

Export named classes/functions from each module; the dossier outline lists
declarations, so rich, well-named modules help the judge.

## Screenshot protocol

Screenshots are the judge's main evidence. They must be real renders of the
game's own code: exactly 1280x480, 3 or 4 files, each at most 262,144 bytes,
stored in `screenshots/`.

Scenes (all with HUD visible, no menus except the title shot):

1. `1-title.jpg` — title screen over the city at sunset, logo, NEW GAME.
2. `2-street.jpg` — third-person on foot on a downtown street, neon signs,
   cars, pedestrians, minimap, mission marker.
3. `3-chase.jpg` — driving a sports car at speed with 3 wanted stars, police
   cruisers behind with flashing lights, minimap, speedometer.
4. `4-mission.jpg` — a mission firefight at the pier: muzzle flash, tracer,
   objective text, health/armor, cash.

How to take them (run from the repository root):

```bash
node serve.ts --port 8080 &
google-chrome --headless=new --use-gl=angle --use-angle=swiftshader \
  --enable-unsafe-swiftshader --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1280,480 --virtual-time-budget=15000 \
  --screenshot=/tmp/2-street.png "http://localhost:8080/?shot=street&seed=1"
```

Convert each capture to JPEG (`python3 -c` with Pillow, or ImageMagick) at a
quality that keeps it under 256 KiB, at exactly 1280x480, then verify with
`file screenshots/*` and `stat -c '%n %s' screenshots/*`. Replace the starter
placeholders; keep the numeric prefixes so the first file is the cover.

Each shot scene must simulate a fixed number of steps (e.g. 600 steps at
1/60 s) synchronously before presenting, so the frame is identical every run.

## Build and verification

- `node serve.ts` serves the game at http://localhost:8080.
- Build the entry and check the dossier:
  `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts && ls -la out`
- `node main.ts` must run twice and write identical bytes (determinism).
- Check the gate before you finish: 3-4 screenshots, each ≤ 256 KiB at
  1280x480; `game/` under 48 MiB and 993 files; no absolute or remote URLs in
  `index.html` or the modules it reaches; `dossier.json` builds.
- Play-test each scene in headless Chrome: fail on any console error. Keep
  the browser console clean.

## Git

Commit in milestones with clear messages, and push to `origin main` after
each milestone (SSH is configured). The repository is public and owned by
the entrant's GitHub account. Never rewrite published history.

## Definition of done

All ten checklist items are implemented, the four screenshots are real
renders and committed, `node main.ts` produces a valid `out/` with a
`dossier.json` under 1.5 MiB, the game runs with zero console errors in
headless Chrome, and `git status` is clean with everything pushed.
