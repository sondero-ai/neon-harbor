# Source map

[← README](../../README.md) · [Building](building.md) · [Testing](testing.md)

Every source file is plain ES modules or TypeScript run directly by Node.
There is no package manifest, bundler or generated bundle. Paths are relative
to the repository root.

## Game

| Path | Responsibility |
| --- | --- |
| `game/index.html` | page, title/pause/controls markup, CSS (including the Audio row), boot-error reporter |
| `game/src/main.js` | boot, fixed-step loop, screen state machine, quality, save wiring, vehicle entry/exit, radio input and the hold-Tab wheel, `__neon.radio`, volume/mute UI, deterministic shot staging |
| `game/src/world.js` | nine-by-nine city generation, Old Town and the Foundry, the market square, ground/collision/camera queries, the shoreline beach and wet sand, pier, lighthouse, ocean, four sky textures, sun and moon, lights, signs, the merged glow field, the seat registry, pier props and the mall hook |
| `game/src/world-kit.js` | the shared part/box/cylinder/crown-band/material helpers and the geometry-merge re-export used by the world, mall and pier |
| `game/src/environment.js` | the 24-hour clock, the dawn/day/dusk/night palettes, the boundary blend, `?time=` parsing, renderer/scene apply |
| `game/src/glow-field.js` | one instanced camera-facing quad mesh for static glow sprites, with per-item colour and brightness |
| `game/src/geo.js` | reusable mesh, facade, sign and billboard factories, and the geometry merge |
| `game/src/vehicles.js` | seven vehicle classes, meshes, instanced wheels, arcade physics, fuel tanks, lights, pooled skid marks and `overlapCircle` |
| `game/src/fuel.js` | the fuel constants, distance drain, HUD percent and the pure service quote |
| `game/src/gas-station.js` | the Solano Fuel forecourt: merged canopy, islands, kiosk, lanes and colliders, pump slots, player service and the NPC pull-in/pump/pull-out state machine |
| `game/src/traffic.js` | 18 lane cars, the 168-slot crowd, crosswalks, beach/pier crowd, seated shoppers, mall guards, low-fuel station divert, panic and armed witnesses, wall sliding, driver ejection, off-grid cleanup and shot staging |
| `game/src/traffic-signals.js` | the shared 18 s signal clock, merged pole/housing mesh, six instanced lamp sets and the night pool |
| `game/src/mall.js` | the Solano Mall shell: walls, glass doors, skylight, mezzanine, six shop bays, the food court and its 24 seats, the jewelry register and the hall lights |
| `game/src/parking.js` | the 26-stall lot, instanced static cars and their colliders, clock-driven occupancy, parked-car theft and the valet storage |
| `game/src/mall-life.js` | the shopper schedule from the clock, mall routes, door transit and chair allocation |
| `game/src/robbery.js` | the one-per-reset register robbery, alarm, two security guards, crowd panic and the counter cash drop |
| `game/src/interactions.js` | the contextual **E** layer and its priority: stand, sit, rob, steal, valet, retrieve, then vehicle entry, plus **SERVICE** at a pump while driving |
| `game/src/police.js` | wanted level, pursuit driving, search/decay, cruiser and officer combat, civilian murder reports and the 911 call, roadblocks, callsigns, the merged Air 1 airframe and searchlight, the response roster, busted/wasted handshake and chase staging |
| `game/src/missions.js` | the five-mission director: markers, dialogue queue, mission crew and bosses, objectives, timers, rewards, failure and retry, pier fire, mission/heist staging |
| `game/src/activities.js` | cash stashes, the rotating hot-car delivery, the Heat Run, the safehouse save/heal/clear-heat point and their street panels |
| `game/src/loot.js` | the pure death-drop table: weights, $5 cash steps and the SMG unlock gate |
| `game/src/pickups.js` | walk-over pickup rings, weapon/medkit/armor spawns, one-shot death drops, 30-second expiry, payout and reset cleanup |
| `game/src/player.js` | movement, driving, chase camera, vehicle contacts and knockdown, hitscan guns, the street knife swing, aiming, damage and Rae's low-poly walk/run/aim cycle |
| `game/src/humanoid.js` | Rae's low-poly body, walk/run/aim cycle and the melee arm stab pose |
| `game/src/effects.js` | sparks, smoke, flashes, tracers, explosions, skid marks, vehicle lights, screen shake and hurt accumulation |
| `game/src/audio.js` | the WebAudio engine, sirens, guns, impacts, horn, UI blips, stings and the three procedural synthwave/chiptune/surf fallback beds |
| `game/src/radio.js` | the two-deck OGG player: crossfade, auto-advance, station/track wrap, master volume and mute, missing-file fallback and OFF AIR |
| `game/src/hud.js` | the Canvas 2D HUD: mission card, vitals, state card, minimap with the mall footprint and parking lot, crew panel, portrait dialogue, police response roster, Air 1 banner, five-slot weapon strip, vehicle/radio card with the fuel gauge, hold-Tab station wheel, objective and street-job panels, the contextual **E** prompt, crosshair, rewards and failure/down/ending screens |
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
| `tools/test-npc-loot.mjs` | stdlib-only headless-Chrome E2E for death, loot, heat, knife, crowd density, signals, wall collision, the clock, radio, vehicle hits, knife arm, beach, carjacking, volume, ambient spawns, the pier, seats, the mall, parking, mall life, the robbery and the gas station |
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
