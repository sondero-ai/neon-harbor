# Neon Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Harbor is an original third-person open-world game that runs in a desktop
browser from plain static files. It is set on a neon coastal city at golden
hour: a six-by-six grid of low-rise storefronts and downtown towers, a wide
sand beach, a long pier, a working lighthouse, palms, streetlights and a lot
of hand-painted neon.

You play as courier **Rae Solano**, newly back in the harbor. This build is the
city and the street life: a fully procedural world, a third-person camera that
stays out of walls, a walk/run/jump cycle, seven drivable vehicle classes, a
grid-aware traffic and pedestrian simulation, a readable canvas HUD, a title
screen over the live skyline, pause and controls screens, quality switching and
a local save. Police pursuits, combat, audio and the wider story arrive in later
chapters.

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
- **F** or **E** enters the nearest slow car, and leaves the car you are in.
- On the road, **W/S** is throttle and brake/reverse, **A/D** steers, and
  **Space** is the handbrake. Hold it through a corner to drift; the rear tires
  leave skid marks.
- **Mouse** looks around on foot and while driving; the driving camera swings
  back behind the car after a moment. The **wheel** pulls the foot camera in or
  out.
- **R** switches the radio feed on or off.
- **Esc** or **P** pauses and saves. **Enter** confirms the focused menu action.
- Drag-look still works after the pointer unlocks; click the view to recapture.
- The title screen’s **Quality** switch moves between high (shadows on, full
  pixel ratio) and low (no shadows, lighter pixel ratio) without a reload.

**New Game** starts on Vega Strip beside a parked Riptide, facing the water.
**Continue** returns to the last pause or save. The HUD shows health, armor,
cash, wanted stars, the district and clock, a baked minimap with the player
arrow, vehicle blips and the objective marker, live car/walker counts, the
current objective and distance, the radio line, the context prompt, and either
the on-foot readout or the driving panel with vehicle name, speed, gear and
engine load.

## The city

The whole harbor is built from one seed in `game/src/config.js`, so every tree,
tower, window layout and sign lands in the same place on every load. Roads form
a seven-line grid with lane paint, crossings and raised sidewalks. Buildings
use eight facade palettes with lit window grids, rooftop tanks and antennas,
emissive storefronts and neon boards. Landmarks include the Sunset Hotel tower,
Casa Luna on the beach, Motor Row, the Luna Plaza fountain, the radio mast, the
Vega Strip arch, Pier 9 and its lighthouse. The sun sits low in the west, warm
fog blends the distance, and the water carries a moving shimmer.

## Traffic and driving

`vehicles.js` builds seven original classes from merged low-poly parts: the
**Fathom 400** sedan, **Harbor Cab**, **Vela GT** sports car, **Riptide 442**
muscle car, **Mule 9** van, **Dune Hauler** pickup and **Harbor PD Cruiser**.
Each has its own proportions, paint palette, wheels, headlights, taillights,
glass and handling; the cruiser adds a white-door livery, a door decal and a
red/blue light bar. Bodies, trim, glass and lamps are separate shared
geometries, so a car stays around nine draw calls. Handling is arcade: throttle
and reverse, speed-sensitive steering, lateral grip that lets the rear step out
under the handbrake, ground-following pitch and roll on curbs and the pier ramp,
building collision, and a pooled skid-mark ribbon. Engine state is exposed per
vehicle for the audio chapter.

`traffic.js` keeps cars in the grid lanes and runs a two-phase signal at every
intersection. Cars brake for the stop line, keep a following gap to anything in
their lane, wait for pedestrians in the crosswalk, and recycle in and out of
view around the player. Pedestrians loop the block sidewalks, stop at corners,
cross at the painted crosswalks, and gather on the pier and the beach. The whole
crowd is drawn through seven instanced meshes, so the street stays close to 60
fps with a few dozen people on screen. The minimap mirrors the traffic with
vehicle blips, and the HUD reports the live car and walker counts.

## Source map

- `game/index.html` — the page, title, pause and controls markup, and the
  inline boot-error reporter.
- `game/src/main.js` — boot, fixed-step loop, screen state machine, quality,
  save wiring, vehicle entry/exit, radio state and deterministic shot staging.
- `game/src/world.js` — city generation, ground/collision/camera queries, beach,
  pier, lighthouse, ocean, sky, lights, signs and animation.
- `game/src/geo.js` — reusable mesh, facade, sign and billboard factories.
- `game/src/vehicles.js` — seven vehicle classes, meshes, arcade physics,
  enter/exit support, lights and pooled skid marks.
- `game/src/traffic.js` — lane traffic, signals, following, pedestrians,
  crosswalk crossings, beach/pier crowd and deterministic staging.
- `game/src/player.js`, `humanoid.js` — third-person movement, driving, chase
  camera, vehicle collision and Rae’s low-poly walk/run cycle.
- `game/src/hud.js` — the Canvas 2D HUD, minimap, vehicle blips and prompts.
- `game/src/input.js` — keyboard, mouse, wheel and pointer lock.
- `game/src/save.js` — guarded localStorage save and quality settings.
- `game/src/random.js`, `config.js` — the seeded RNG and all shared constants.
- `game/src/shots.js` — the fixed `start`, `street`, `drive` and `pier`
  screenshot poses.
- `game/vendor/` — three.js r180 as its minified module and core builds, reached
  through the one-line `three.module.js` shim.

## Screenshots

`screenshots/` holds real 1280×720 Chrome renders, in cover order:

- `1-pier.jpg` — `?shot=pier`
- `2-street.jpg` — `?shot=street`
- `3-start.jpg` — `?shot=start`

Every shot runs the real world, player and HUD through a fixed number of
simulation steps and then freezes; no pointer lock, clock or network is
involved. `?shot=drive` is a fourth, driving composition on the strip, with
staged traffic, crosswalk pedestrians and a parked cruiser; it is used to check
the driving camera and HUD during development.

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
