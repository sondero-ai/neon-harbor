# Neon Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Harbor is an original third-person open-world game that runs in a desktop
browser from plain static files. It is set on a neon coastal city at golden
hour: a six-by-six grid of low-rise storefronts and downtown towers, a wide
sand beach, a long pier, a working lighthouse, palms, streetlights and a lot
of hand-painted neon.

You play as courier **Rae Solano**, newly back in the harbor. This opening
build is the city and the on-foot foundation: a fully procedural world, a
third-person camera that stays out of walls, a walk/run/jump cycle, a readable
canvas HUD, a title screen over the live skyline, pause and controls screens,
quality switching and a local save. Vehicles, traffic, police, the wider story
and the full mission set arrive in later chapters.

## Play

Node 22.18 or newer serves the folder; the game itself is HTML, CSS, ES modules
and a WebGL canvas. There is no build step, no package install and no network
request after the page loads.

```bash
node serve.ts --port 8080
# open http://localhost:8080
```

Click the view to capture the mouse. If the browser refuses pointer lock, the
same mouse drag looks around.

- **WASD** or the arrow keys walk; **Shift** sprints; **Space** jumps.
- **Mouse** looks around; the **wheel** pulls the camera in or out.
- **Esc** or **P** pauses and saves. **Enter** confirms the focused menu action.
- Drag-look still works after the pointer unlocks; click the view to recapture.
- The title screen’s **Quality** switch moves between high (shadows on, full
  pixel ratio) and low (no shadows, lighter pixel ratio) without a reload.

**New Game** starts at the west end of Vega Strip, facing the water. **Continue**
returns to the last pause or save. The HUD shows health, armor, cash, wanted
stars, the district and clock, a baked minimap with the player arrow and the
objective marker, the current objective and distance, the radio line and the
on-foot speed readout.

## The city

The whole harbor is built from one seed in `game/src/config.js`, so every tree,
tower, window layout and sign lands in the same place on every load. Roads form
a seven-line grid with lane paint, crossings and raised sidewalks. Buildings
use eight facade palettes with lit window grids, rooftop tanks and antennas,
emissive storefronts and neon boards. Landmarks include the Sunset Hotel tower,
Casa Luna on the beach, Motor Row, the Luna Plaza fountain, the radio mast, the
Vega Strip arch, Pier 9 and its lighthouse. The sun sits low in the west, warm
fog blends the distance, and the water carries a moving shimmer.

## Source map

- `game/index.html` — the page, title, pause and controls markup, and the
  inline boot-error reporter.
- `game/src/main.js` — boot, fixed-step loop, screen state machine, quality,
  save wiring and deterministic shot staging.
- `game/src/world.js` — city generation, ground/collision/camera queries, beach,
  pier, lighthouse, ocean, sky, lights, signs and animation.
- `game/src/geo.js` — reusable mesh, facade, sign and billboard factories.
- `game/src/player.js`, `humanoid.js` — third-person movement, camera, collision
  and Rae’s low-poly walk/run cycle.
- `game/src/hud.js` — the Canvas 2D HUD and its baked minimap.
- `game/src/input.js` — keyboard, mouse, wheel and pointer lock.
- `game/src/save.js` — guarded localStorage save and quality settings.
- `game/src/random.js`, `config.js` — the seeded RNG and all shared constants.
- `game/src/shots.js` — the fixed `start`, `street` and `pier` screenshot poses.
- `game/vendor/` — three.js r180 as its minified module and core builds, reached
  through the one-line `three.module.js` shim.

## Screenshots

`screenshots/` holds real 1280×720 Chrome renders, in cover order:

- `1-pier.jpg` — `?shot=pier`
- `2-street.jpg` — `?shot=street`
- `3-start.jpg` — `?shot=start`

Every shot runs the real world, player and HUD through a fixed number of
simulation steps and then freezes; no pointer lock, clock or network is
involved. To reproduce one, run the local server and open the query above.

## Build the entry

`main.ts` makes a clean copy of `game/` and `screenshots/` under
`MAKEFUN_OUTPUT_DIR` (or `/output`), writes `dossier.json` with
`vendor/makefun-game.ts`, and leaves the output ready to hand in.

```bash
MAKEFUN_OUTPUT_DIR=out node main.ts
MAKEFUN_OUTPUT_DIR=out node main.ts --check
```

`--check` re-reads the copy against the bounty caps (game entries and bytes,
3–4 screenshots each at most 256 KiB, dossier at most 1.5 MiB) and prints one
summary line.

## Bounty

Built for [make.fun · Make GTA 6](https://make.fun/bounty/gta6-01). The city,
characters, names, art and code are original to this project.

## License

MIT, see [LICENSE](LICENSE).
