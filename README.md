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
city and the street life under pressure: a fully procedural world, a
third-person camera that stays out of walls, a walk/run/jump cycle, seven
drivable vehicle classes, a grid-aware traffic and pedestrian simulation, a
five-star police response with cruiser pursuit, foot officers and roadblocks,
two hitscan weapons with ammo, reloads and pickups, pooled muzzle flashes,
sparks, smoke, explosions and skid marks, three original synthesised radio
stations, a readable canvas HUD and a local save. Missions and the wider story
arrive in later chapters.

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
  leave skid marks. **Left click** or **H** sounds the horn.
- **Left click** fires on foot; **right click** raises the weapon and tightens
  the camera. **R** reloads, **1** selects the Solano 9 pistol and **2** the
  Kestrel SMG once it has been picked up.
- **Mouse** looks around on foot and while driving; the driving camera swings
  back behind the car after a moment. The **wheel** pulls the foot camera in or
  out.
- **T** switches the radio on or off, **`[`** and **`]`** change stations, and
  **M** mutes. **`-`** and **`=`** trim the master volume.
- **Esc** or **P** pauses and saves. **Enter** confirms the focused menu action.
- Drag-look still works after the pointer unlocks; click the view to recapture.
- The title screen’s **Quality** switch moves between high (shadows on, full
  pixel ratio) and low (no shadows, lighter pixel ratio) without a reload.

**New Game** starts on Vega Strip beside a parked Riptide, facing the water.
**Continue** returns to the last pause or save, including weapons, ammo and any
heat that was still on you. The HUD shows health and armor (with hit flashes),
cash, the live wanted stars and pursuit status, the district and clock, a baked
minimap with the player arrow, traffic blips, alternating red/blue police and
officer blips and the objective marker, live car/walker counts, the current
objective and distance, the radio line, the context prompt, the on-foot weapon
panel with magazine and reserve, a dynamic crosshair and hit marker, and either
the on-foot readout or the driving panel with vehicle name, speed, gear and
engine load. Getting wasted or busted takes over the screen with a full-frame
overlay, drops part of the cash on hand and returns Rae to the strip with the
heat cleared.

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

## Heat and combat

`police.js` runs the five-star director. A cruiser spawns on a road node out of
view and follows the road grid to the player with a small breadth-first route,
then switches to a direct pursuit, rams at speed and fires from the window once
the heat reaches three stars. At three stars cruisers also stop and put officers
on foot, and at four a two-car roadblock with waiting officers can appear ahead
of a moving car. Every officer and cruiser is a real target: shots land on
heads, bodies and bodywork, cruisers have health and explode when destroyed,
and the minimap draws their blips. When the player is out of sight for a few
seconds the department switches to a search around the last known position;
after a longer wait the stars fall one at a time and the units stand down.
Stopped on foot, close to an officer, with no weapon raised and no recent shot,
the bust timer runs. The flow hands control back to `main.js`, which paints the
wasted/busted overlay, takes a cut of the cash and respawns Rae.

Combat lives on `player.js`: the pistol and SMG are hitscan with spread,
recoil, muzzle flash, tracer, impact sparks, a hit marker, magazine and reserve
ammo and a reload timer. Bullets stop on the nearest collider, vehicle or
officer, so cover works. Armor absorbs part of each hit before health, damage
shakes the camera and reddens the screen edge. `pickups.js` places both weapons
plus medkits and armor on chrome rings around the map; they float, glow,
respawn and announce themselves in a toast.

## Effects and audio

`effects.js` owns fixed-size pools for sparks, smoke, flash sprites and tracers,
a single reusable explosion light, the skid-mark ribbon and the camera shake.
The hurt level it accumulates feeds the HUD vignette. Headlight beams and
taillight halos attach to the player's current car and to police cruisers; the
skyline and storefront neon remain part of the world build. Nothing in the
effect layer allocates a mesh at the moment of a shot or an explosion.

`audio.js` builds the whole soundscape with WebAudio oscillators and noise: an
engine hum tracking rpm, load and speed, a two-tone siren whose level follows
the nearest cruiser or officer, pistol and SMG reports, impacts, explosions,
the horn, reload clicks, pickup chimes, hurt and wasted/busted stings, and menu
blips. Three original station loops — synthwave, chiptune and surf — are
sequenced live from the same oscillator kit. The context is created on the
first real pointer or keyboard gesture; no audio files and no network requests
are involved. Volume and mute persist with the quality setting.

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
- `game/src/police.js` — wanted level, pursuit driving, search/decay, cruiser
  and officer combat, roadblocks, busted/wasted handshake and police staging.
- `game/src/pickups.js` — weapon, health and armor pickups with glow and
  respawn timers.
- `game/src/player.js`, `humanoid.js` — third-person movement, driving, chase
  camera, vehicle collision, pistol/SMG hitscan, aiming, damage and Rae’s
  low-poly walk/run/aim cycle.
- `game/src/effects.js` — sparks, smoke, flashes, tracers, explosions, skid
  marks, vehicle light beams, screen shake and hurt accumulation.
- `game/src/audio.js` — the WebAudio engine, sirens, guns, impacts, horn, UI
  blips and the three live radio sequencers.
- `game/src/hud.js` — the Canvas 2D HUD, minimap, police blips, wanted status,
  weapon panel, crosshair, damage vignette and down overlays.
- `game/src/input.js` — keyboard, mouse, wheel, pointer lock and mouse edges.
- `game/src/save.js` — guarded localStorage save, weapons, quality, volume and
  mute settings.
- `game/src/random.js`, `config.js` — the seeded RNG and all shared constants.
- `game/src/shots.js` — the fixed `start`, `street`, `drive`, `chase` and
  `pier` screenshot poses.
- `game/vendor/` — three.js r180 as its minified module and core builds, reached
  through the one-line `three.module.js` shim.

## Screenshots

`screenshots/` holds real 1280×720 Chrome renders, in cover order:

- `1-pier.jpg` — `?shot=pier`
- `2-street.jpg` — `?shot=street`
- `3-start.jpg` — `?shot=start`

Every shot runs the real world, player, police, combat HUD and effects through a
fixed number of simulation steps and then freezes; no pointer lock, clock or
network is involved. `?shot=drive` is a driving composition on the strip with
staged traffic, crosswalk pedestrians and a parked cruiser. `?shot=chase` is
the police version: four wanted stars, three cruisers and two officers closing
on the Riptide, a lit roadblock ahead, a frozen tracer, the minimap full of
red/blue blips and the `Break the Blockade` objective. Both are used to check
the camera and HUD at 1280×720 during development.

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
