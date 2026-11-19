# Neon Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Harbor is an original third-person open-world crime game for the desktop
browser. It runs from plain static files with no build step, no package
install and no network request after the page loads. The setting is a
golden-hour coastal city: six by six blocks of low-rise storefronts and
downtown towers, a wide beach, a long pier, a working lighthouse, palms,
streetlights and hand-built neon.

You play courier **Rae Solano**, back in the harbor to settle a family debt.
The build is the whole first chapter: a seeded city, a third-person camera
that stays out of walls, seven drivable vehicle classes, grid traffic and
pedestrians, a five-star police response, two hitscan weapons, five story
missions with dialogue and combat, free-roam jobs, three synthesised radio
stations, a canvas HUD and a local save.

## Play

Node 22.18 or newer serves the folder; the game itself is HTML, CSS, ES
modules and a WebGL canvas. There is no build step and no network use.

```bash
node serve.ts --port 8080
# open http://localhost:8080
```

Click the view to capture the mouse. If the browser refuses pointer lock, the
same mouse drag looks around. **Enter** confirms the focused menu action.

- **WASD** or the arrow keys walk; **Shift** sprints; **Space** jumps.
- **F** or **E** enters the nearest slow car or leaves the car you are in.
- While driving, **W/S** is throttle and brake/reverse, **A/D** steers, and
  **Space** is the handbrake. Hold it through a corner to drift; the rear
  tires leave skid marks. **Left click** or **H** sounds the horn.
- On foot, **left click** fires, **right click** aims and tightens the camera.
  **R** reloads, **1** selects the Solano 9 pistol and **2** the Kestrel SMG
  once it has been picked up.
- **Mouse** looks around; the **wheel** pulls the foot camera in or out.
- **T** switches the radio on or off, **`[`** and **`]`** change stations, and
  **M** mutes. **`-`** and **`=`** trim the master volume.
- Walk into a coral story marker to start the next mission. **Enter** retries
  a failed mission, and walking back into its marker does the same.
- The **safehouse** on the Vega Strip heals, recharges armor, clears heat and
  writes the save when you walk into its teal ring.
- Between jobs: walk over a gold cash stash, take a marked car to the Motor
  Row chop shop for a delivery fee, or step into the red **Heat Run** ring and
  hold three stars for forty-two seconds.
- **Esc** or **P** pauses and saves. The title screen's **Quality** switch
  moves between high (shadows, full pixel ratio) and low (no shadows, lighter
  pixel ratio) without a reload.

**New Game** starts on Vega Strip beside a parked Riptide, facing the water.
**Continue** returns to the last pause or save, including the story index,
cash, health, armor, weapons, ammo, position and any heat that was still on
you.

## The Solano story

Five missions run in order. Each has a start marker, a world objective, a
dialogue script, a completion condition and a cash reward; finishing one sets
the marker for the next.

1. **The Riptide Job** — Mira sends Rae to steal a Vela GT from the Sunset
   Hotel and deliver it to the Motor Row bay. ($1,200)
2. **Heat Check** — the car had a tracker. Lose the Harbor PD and reach the
   safehouse clean. ($1,800)
3. **Special Delivery** — carry the Solano ledger from Casa Luna to Tomas at
   Luna Plaza before the timer runs out. ($1,500)
4. **Family Cut** — Tomas' crew springs an ambush at the fountain. Fight out
   of the plaza and learn where Aurelio is waiting. ($2,400)
5. **Pier 9 Burning** — clear Aurelio's enforcers from the pier, set the place
   on fire and escape before the deck goes up. ($6,000)

Combat missions put real low-poly crew on the street with chest and head hit
boxes, line-of-sight checks, advancing and firing AI, death poses and a boss
health pool. The player's hitscan queries mission enemies as well as cruisers,
officers and cars. Each combat mission supplies an SMG and armor so a new
player is never sent in with an empty pistol. Finishing the fifth mission
paints **THE HARBOR IS YOURS** and leaves free roam open.

Failure is a state, not a reload. A downed or busted player, a missed delivery
window or a wrecked mission car sets the failure panel, returns the objective
marker to the mission start and offers **Enter** or a walk back into the
marker. Retrying resets the mission, heals Rae, clears the heat and rebuilds
the setup. The active mission index is written in the save, so Continue
re-offers the job from its start marker.

Free roam is always live around the story: six gold cash stashes respawn, a
marked Vela GT / Riptide / Dune Hauler appears in rotation for the chop-shop
delivery loop, and the Heat Run marker starts a timed three-star holdout. The
safehouse at `(-71.5, 36.6)` is the save point. Every completed mission, cash
pickup, delivery, heat run and safehouse visit writes progress through
`save.js`. Settings (quality, volume, mute) live in their own key; the save
carries cash, health, armor, wanted stars, mission index, story-complete flag,
weapons, ammo, camera yaw and position.

## The city

The whole harbor is built from one seed in `game/src/config.js`, so every
tower, window layout and sign lands in the same place on every load. Roads
form a seven-line grid with lane paint, crossings and raised sidewalks.
Buildings use eight facade palettes with punched, ribbon and glass window
patterns, floor bands, lit rooms with blinds and curtains, rooftop tanks and
antennas, emissive storefronts and neon boards. Landmarks include the Sunset
Hotel tower, Casa Luna on the beach, Motor Row, the Luna Plaza fountain, the
radio mast, the Vega Strip arch, Pier 9 and its lighthouse.

The sun sits low in the west. Warm fog blends the distance, emissive windows
and signs carry the neon, and instanced pools under the streetlights and blade
signs spill colour onto the pavement. The water plane scrolls its surface
texture, the foam breathes, a points cloud supplies the sun glitter, the
lighthouse beam turns, and cloud sprites drift over the skyline. A typical 1280×720 frame in
this build uses roughly 250–400 draw calls and runs comfortably above 60 fps
on a desktop GPU.

## Traffic and driving

`vehicles.js` builds seven original classes from merged low-poly parts: the
**Fathom 400** sedan, **Harbor Cab**, **Vela GT** sports car, **Riptide 442**
muscle car, **Mule 9** van, **Dune Hauler** pickup and **Harbor PD Cruiser**.
Each has its own proportions, paint palette, wheels, headlights, taillights,
glass and handling; the cruiser adds a white-door livery, a door decal and a
red/blue light bar. Bodies, trim, glass and lamps share geometries, so a car
stays around nine draw calls. Handling is arcade: throttle and reverse,
speed-sensitive steering, lateral grip that lets the rear step out under the
handbrake, ground-following pitch and roll on curbs and the pier ramp,
building collision, and a pooled skid-mark ribbon. Engine state is exposed per
vehicle for audio.

`traffic.js` keeps cars in the grid lanes and runs a two-phase signal at every
intersection. Cars brake for the stop line, keep a following gap to anything in
their lane, wait for pedestrians in the crosswalk, and recycle in and out of
view around the player. Pedestrians loop the block sidewalks, stop at corners,
cross at the painted crosswalks, and gather on the pier and the beach. The
whole crowd is drawn through instanced meshes, so the street stays fluid with a
few dozen people on screen. The minimap mirrors the traffic with vehicle blips,
and the HUD reports the live car and walker counts.

## Heat and combat

`police.js` runs the five-star director. A cruiser spawns on a road node out of
view and follows the road grid toward the player with a small breadth-first
route, then switches to a direct pursuit, rams at speed and fires from the
window once the heat reaches three stars. At three stars cruisers also stop and
put officers on foot, and at four a two-car roadblock with waiting officers can
appear ahead of a moving car. Every officer and cruiser is a real target: shots
land on heads, bodies and bodywork, cruisers have health and explode when
destroyed, and the minimap draws their blips. When the player is out of sight
for a few seconds the department switches to a search around the last known
position; after a longer wait the stars fall one at a time and the units stand
down. Stopped on foot, close to an officer, with no weapon raised and no recent
shot, the bust timer runs. The flow hands control back to `main.js`, which
paints the wasted/busted overlay, takes a cut of the cash and respawns Rae.

Combat lives on `player.js`: the pistol and SMG are hitscan with spread,
recoil, muzzle flash, tracer, impact sparks, a hit marker, magazine and reserve
ammo and a reload timer. Bullets stop on the nearest collider, vehicle or
officer, so cover works. Armor absorbs part of each hit before health; damage
shakes the camera and reddens the screen edge. `pickups.js` places both weapons
plus medkits and armor on chrome rings around the map; they float, glow,
respawn and announce themselves in a toast.

## Effects, HUD and audio

`effects.js` owns fixed-size pools for sparks, smoke, flash sprites and tracers,
a reusable explosion light, the skid-mark ribbon, headlight beams and taillight
halos, and camera shake. The hurt level it accumulates feeds the HUD vignette.
Nothing in the effect layer allocates a mesh at the moment of a shot or an
explosion.

`hud.js` is a Canvas 2D layer over the WebGL view: health and armor bars with
hit flashes, a cash card, the live wanted stars and pursuit/search status, the
district and clock, a baked minimap with the player arrow, traffic blips,
alternating red/blue police and officer blips, mission enemies in coral and the
objective marker, live car/walker counts, the mission tag, objective and
distance, progress or a countdown, the radio line, the context prompt, the
on-foot weapon panel with magazine and reserve, a dynamic crosshair and hit
marker, and either the on-foot readout or the driving panel with vehicle name,
speed, gear and engine load. Dialogue appears as a speaker-coloured subtitle
above the objective; rewards and mission results arrive as toasts and a gold
cash banner. Street jobs get their own progress panel above the minimap.
Getting wasted or busted takes over the screen with a full-frame overlay, drops
part of the cash on hand and returns Rae to the strip with the heat cleared; a
failed mission stays on screen with a retry prompt until you take it again.

`audio.js` builds the whole soundscape with WebAudio oscillators and noise: an
engine hum tracking rpm, load and speed, a two-tone siren whose level follows
the nearest cruiser or officer, pistol and SMG reports, impacts, explosions,
the horn, reload clicks, pickup chimes, hurt and wasted/busted stings, and menu
blips. Three original station loops — synthwave, chiptune and surf — are
sequenced live from the same oscillator kit: Night Tide 88.3, KNRV 104.7 and
The Breakwater 97.1. The context is created on the first real pointer or
keyboard gesture; no audio files and no network requests are involved. Volume
and mute persist with the quality setting.

## Screenshots

`screenshots/` holds exactly four real Chrome renders at **1280×720 JPEG**,
each under 256 KiB. The first by name is the cover.

- `1-cover.jpg` — `?shot=chase`: four wanted stars, three cruisers and two
  officers closing on the Riptide, the `Break the Blockade` objective, the
  minimap full of blips and 78 km/h on the speed panel.
- `2-street.jpg` — `?shot=street`: Rae on foot on Vega Strip with lane traffic,
  a taxi, crossing pedestrians, the safehouse ring, `Find Pier 9` and the
  minimap.
- `3-mission.jpg` — `?shot=mission`: Tomas' ambush around the Luna Plaza
  fountain, aimed fire and tracers, the `Survive the Ambush` objective and the
  mission dialogue line.
- `4-title.jpg` — `?shot=start`: the title and menu over the live golden-hour
  skyline, Sunset Hotel, the pier and the water.

Every shot builds the real world, player, police or mission director, weapons,
effects and HUD, runs a fixed number of simulation steps and then freezes. Shot
mode forces high quality, suppresses toasts and the fresh-slot title card, and
does not depend on pointer lock or the wall clock. The other staged poses
(`drive`, `heist`, `pier`) remain available for development checks.

## Build the entry

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

The dossier lists the game's source, then `game/index.html` and the module
import graph, then the remaining source in path order. The two minified
three.js builds and the one-line `three.module.js` shim are vendored files and
are listed by path and size rather than shown as source. There are no other
libraries, no generated bundles and no binary assets in `game/`.

## Source map

- `game/index.html` — page, title/pause/controls markup, CSS, boot-error
  reporter.
- `game/src/main.js` — boot, fixed-step loop, screen state machine, quality,
  save wiring, vehicle entry/exit, radio state and deterministic shot staging.
- `game/src/world.js` — city generation, ground/collision/camera queries, beach,
  pier, lighthouse, ocean, sky, lights, signs, light pools and animation.
- `game/src/geo.js` — reusable mesh, facade, sign and billboard factories, and
  the geometry merge.
- `game/src/vehicles.js` — seven vehicle classes, meshes, arcade physics,
  lights and pooled skid marks.
- `game/src/traffic.js` — lane traffic, signals, following, pedestrians,
  crosswalk crossings, beach/pier crowd and shot staging.
- `game/src/police.js` — wanted level, pursuit driving, search/decay, cruiser
  and officer combat, roadblocks, busted/wasted handshake, chase staging.
- `game/src/missions.js` — the five-mission director: markers, dialogue queue,
  mission enemies and bosses, objectives, timers, rewards, failure and retry,
  pier fire, and mission/heist staging.
- `game/src/activities.js` — cash stashes, the rotating hot-car delivery, the
  Heat Run, the safehouse save/heal/clear-heat point and their street panels.
- `game/src/player.js`, `humanoid.js` — movement, driving, chase camera,
  vehicle collision, hitscan weapons, aiming, damage and Rae's low-poly
  walk/run/aim cycle.
- `game/src/effects.js` — sparks, smoke, flashes, tracers, explosions, skid
  marks, vehicle lights, screen shake and hurt accumulation.
- `game/src/audio.js` — the WebAudio engine, sirens, guns, impacts, horn, UI
  blips, stings and three live radio sequencers.
- `game/src/hud.js` — the Canvas 2D HUD, minimap, blips, wanted status,
  subtitles, objective/progress/timer, street-job panel, rewards, weapon panel,
  crosshair, failure/down/ending screens.
- `game/src/input.js` — keyboard, mouse, wheel, pointer lock and mouse edges.
- `game/src/save.js` — guarded localStorage save, story/mission index, weapons,
  quality, volume and mute settings.
- `game/src/random.js`, `config.js` — seeded RNG and shared constants.
- `game/src/shots.js` — the fixed `start`, `street`, `drive`, `chase`,
  `mission`, `heist` and `pier` screenshot poses.
- `game/vendor/` — three.js r180's minified module and core builds behind the
  one-line `three.module.js` shim.
- `main.ts`, `serve.ts`, `vendor/makefun-game.ts` — entrypoint, development
  server and the bounty's dossier library.

## Bounty and license

Built for [make.fun · Make GTA 6](https://make.fun/bounty/gta6-01). The city,
characters, names, art, audio and code are original to this project. No
Rockstar assets, names, music, levels or art are used.

MIT, see [LICENSE](LICENSE).
