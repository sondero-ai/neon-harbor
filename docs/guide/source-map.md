# Source map

[← README](../../README.md) · [Building](building.md) · [Testing](testing.md)

Every source file is plain ES modules or TypeScript run directly by Node.
There is no package manifest, bundler or generated bundle. Paths are relative
to the repository root.

## Game

| Path | Responsibility |
| --- | --- |
| `game/index.html` | page, title/pause/controls markup, CSS (including the Audio row), boot-error reporter |
| `game/src/main.js` | boot, the `Game` class, fixed-step loop, city reset and save wiring, and the `window.__neon` surface |
| `game/src/main-menu.js` | title, pause and controls screens, DOM/window bindings, quality, resize, pause stats and the look hint |
| `game/src/main-radio.js` | radio keys, the hold-Tab wheel, station/track toasts and the volume/mute UI |
| `game/src/main-hud-state.js` | the respect, crew and full HUD state reads |
| `game/src/main-shots.js` | the deterministic `?shot=` staging and chase drama |
| `game/src/main-shared.js` | `STEP`, the title view, `byId`, `formatCash` and `setHidden` shared by the main modules |
| `game/src/world.js` | the `World` class: construction order, merged batches, glow field, objective marker, public query wrappers and animation |
| `game/src/world/query.js` | ground/beach height, `collides`/`resolveCircle`, ray/line/camera queries, `vehicleBlocked` and the block/pier predicates |
| `game/src/world/sky.js` | sky textures, sun/moon, lights, the cloud pass and the environment blend |
| `game/src/world/ground.js` | the ground grid, road paint, beach and ocean |
| `game/src/world/city.js` | the nine-by-nine blocks, towers, storefronts, rooftops, market square and beacons |
| `game/src/world/landmarks.js` | the hotel, Casa Luna, Motor Row, radio block and Luna Plaza |
| `game/src/world/pier.js` | the pier, its props, the lighthouse and the boats |
| `game/src/world/props.js` | beach dressing, vegetation, streetlights, signs, arches, pylons and billboards |
| `game/src/world/shared.js` | the constants and helpers shared by the world modules |
| `game/src/world-kit.js` | the shared part/box/cylinder/crown-band/material helpers and the geometry-merge re-export used by the world, mall and pier |
| `game/src/environment.js` | the 24-hour clock, the dawn/day/dusk/night palettes, the boundary blend, `?time=` parsing, renderer/scene apply |
| `game/src/glow-field.js` | one instanced camera-facing quad mesh for static glow sprites, with per-item colour and brightness |
| `game/src/geo.js` | reusable mesh, facade, sign and billboard factories, and the geometry merge |
| `game/src/vehicles.js` | the `Vehicle` class: arcade physics, the tank, lights, skid marks and `overlapCircle` |
| `game/src/vehicle-geometry.js` | the seven class builders, wheels, decals and geometry |
| `game/src/vehicle-fleet.js` | the `Vehicles` pool, contacts, nearest-enterable and blocking queries |
| `game/src/fuel.js` | the fuel constants, distance drain, HUD percent and the pure service quote |
| `game/src/gas-station.js` | the Solano Fuel forecourt: merged canopy, islands, kiosk, lanes and colliders, pump slots, player service and the NPC pull-in/pump/pull-out state machine |
| `game/src/traffic.js` | the `Traffic` class and update loop, ambient seeding, beach/mall staging, density and public wrappers |
| `game/src/traffic-cars.js` | the 18 lane cars, gap/stop-line AI, low-fuel station divert hook, recycling, ejection and cleanup |
| `game/src/traffic-peds.js` | pedestrian spawn, sidewalk/crossing routes, panic, armed witnesses, hits and death |
| `game/src/traffic-crowd.js` | the 168-slot instanced crowd renderer |
| `game/src/traffic-signals.js` | the shared 18 s signal clock, merged pole/housing mesh, six instanced lamp sets and the night pool |
| `game/src/mall.js` | the Solano Mall shell: walls, glass doors, skylight, mezzanine, six shop bays, the food court and its 24 seats, the jewelry register and the hall lights |
| `game/src/parking.js` | the 26-stall lot, instanced static cars and their colliders, clock-driven occupancy, parked-car theft and the valet storage |
| `game/src/mall-life.js` | the shopper schedule from the clock, mall routes, door transit and chair allocation |
| `game/src/robbery.js` | the one-per-reset register robbery, alarm, two security guards, crowd panic and the counter cash drop |
| `game/src/interactions.js` | the contextual **E** layer and its priority: stand, sit, rob, steal, valet, retrieve, then vehicle entry, plus **SERVICE** at a pump while driving |
| `game/src/police.js` | wanted level, pursuit driving, search/decay, roadblocks, the 911 call, response roster, busted/wasted and chase staging |
| `game/src/police-shared.js` | the star/callsign tables, road routing and police ray helpers |
| `game/src/police-units.js` | the officer body and materials |
| `game/src/police-air.js` | the Air 1 airframe, decal, rotor and searchlight |
| `game/src/missions.js` | the `Missions` director: markers, dialogue, objectives, timers, rewards, failure/retry and runtime entities |
| `game/src/missions-data.js` | the five-story table and the Pier 9 crate/spawn data |
| `game/src/missions-actor.js` | the mission enemy actor and its materials |
| `game/src/missions-shots.js` | the staged mission and heist poses |
| `game/src/activities.js` | cash stashes, the rotating hot-car delivery, the Heat Run, the safehouse save/heal/clear-heat point and their street panels |
| `game/src/loot.js` | the pure death-drop table: weights, $5 cash steps and the SMG unlock gate |
| `game/src/pickups.js` | walk-over pickup rings, weapon/medkit/armor spawns, one-shot death drops, 30-second expiry, payout and reset cleanup |
| `game/src/player.js` | the `Player` class: state, weapon models, seats, knockdown and public wrappers |
| `game/src/player-controls.js` | movement, driving, vehicle enter/exit, contacts and the chase camera |
| `game/src/player-combat.js` | hitscan guns, the knife swing, aiming, damage and healing |
| `game/src/humanoid.js` | Rae's low-poly body, walk/run/aim cycle and the melee arm stab pose |
| `game/src/effects.js` | sparks, smoke, flashes, tracers, explosions, skid marks, vehicle lights, screen shake and hurt accumulation |
| `game/src/audio.js` | the WebAudio engine, sirens, guns, impacts, horn, UI blips, stings and the three procedural synthwave/chiptune/surf fallback beds |
| `game/src/radio.js` | the two-deck OGG player: crossfade, auto-advance, station/track wrap, master volume and mute, missing-file fallback and OFF AIR |
| `game/src/hud.js` | the `Hud` class: canvas, state, update and draw orchestration |
| `game/src/hud/draw-utils.js` | the shared fonts/colours and the chamfer/panel/label/text primitives |
| `game/src/hud/panels.js` | mission, vitals, state, district, air, objective, challenge, dialogue, crew and police panels |
| `game/src/hud/cards.js` | vehicle/radio cards, weapon strip, reward, failure, ending and toast |
| `game/src/hud/minimap.js` | the minimap renderer with the mall/parking footprint |
| `game/src/hud/prompts.js` | crosshair, damage, down, prompt and the hold-Tab wheel |
| `game/src/input.js` | keyboard, mouse, wheel, pointer lock, mouse edges and the Tab-wheel focus capture |
| `game/src/save.js` | guarded localStorage save, story/mission index, weapons, clock minute and day, radio station/track/on-off, quality, volume and mute |
| `game/src/random.js` | seeded RNG |
| `game/src/config.js` | city dimensions and road grid, clock constants, district and street names, tune labels, the six radio stations and their eighteen tracks, shared constants and weapon specs |
| `game/src/shots.js` | the fixed `start`, `street`, `blockade`, `drive`, `chase`, `mission`, `mall`, `mall-interior`, `station`, `heist` and `pier` screenshot poses, each pinnable to a different `?time=HH:MM` |
| `game/audio/radio/` | the eighteen Suno-generated OGG tracks, three per station |
| `game/vendor/` | three.js r180's minified module and core builds behind the one-line `three.module.js` shim |

## Entrypoints and tools

| Path | Responsibility |
| --- | --- |
| `main.ts` | entry build: copy `game/` and `screenshots/` under `MAKEFUN_OUTPUT_DIR`, write `dossier.json`, support `--check` |
| `serve.ts` | the development static server |
| `vendor/makefun-game.ts` | the bounty's dossier library |
| `tools/capture.mjs` | stdlib-only headless-Chrome screenshot driver; the four JPEGs at 1280×720 plus the heist and Solano Fuel gallery stills |
| `tools/capture-media.mjs` | README media driver: the 36-frame overview GIF and the combat still; needs ffmpeg |
| `tools/test-npc-loot.mjs` | the stdlib-only headless-Chrome E2E harness: static server, CDP client, runner and report |
| `tools/e2e/groups/` | the 28 E2E groups in seven modules (movement, combat, crowd, vehicles, world, city life, mall/station) |
| `test/loot.test.mjs` | pure loot table |
| `test/fuel.test.mjs` | pure fuel drain, HUD percent and service quote |
| `test/radio.test.mjs` | station order, track data, OGG files, budget and MUSIC.md credits |

## Documentation

| Path | Contents |
| --- | --- |
| `docs/guide/` | this reader's guide: story, city, driving, combat, radio, HUD/audio, building, testing, source map |
| `docs/superpowers/specs/` | design specs for the living city, NPC death/loot, murder heat and knife, radio playlists, polish pass |
| `docs/superpowers/plans/` | implementation plans for the same phases |
| `docs/audio/suno-radio-prompts.md` | generation prompts and lyrics for the eighteen tracks |
| `docs/media/` | the overview GIF, the combat still, the heist gallery still and the Solano Fuel gallery still |
| `screenshots/` | the four 1280×720 entry screenshots; `1-cover.jpg` is the cover |
| `MUSIC.md` | track credits, durations, vocal flags and the licence note |
| `README.md` | the landing page and quick start |

## Runtime shape

`main.js` owns a fixed-step loop. Systems are constructed once and updated in
order: interactions, player, mall life, traffic, parking, robbery, police,
vehicles, missions, activities, pickups, effects, environment, the mall doors,
signals, HUD and radio. `window.__neon` exposes a read-only live state plus
debug handles for traffic, player, police, missions, pickups, vehicles,
effects, signals, world, environment, HUD, radio, interactions, parking,
gasStation, mall life and the robbery; `__neon.mall`, `__neon.parking`,
`__neon.robbery` and `__neon.state` are the live read-only summaries, and
`__neon.state.vehicle.fuel` is the tank the HUD draws. The screenshot tooling
uses `?shot=` to build a real world, run a fixed number of steps and freeze;
the QA suite uses the same frozen scenes and the debug handles.
