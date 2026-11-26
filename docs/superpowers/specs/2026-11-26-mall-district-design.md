# Solano Mall district, living parking, gas station and a faster clock

Status: proposed — 2026-11-26, after the radio and polish branches

## Why

Neon Harbor now has a living street grid, a day/night clock, crowds, police,
radio and a walkable pier, but no large interior, no reason to park a car, and
a day that takes 48 real minutes. The player wants a GTA-style mall they can
walk into, a busy parking lot with theft and valet, a gas station where some
NPC cars refuel and the player can refuel or repair, more pedestrians,
sittable chairs, and a clock five times faster: **2 real seconds = 5 in-game
minutes**. The pier also needs fixing: cars climb the ramp onto the deck and
the player walks through the shack, benches, barrels, crates and railings.

## Goals

1. **Pier 9 is pedestrian-only.** No vehicle can climb the ramp or drive on
   the deck; no NPC car ever spawns on the beach or pier; every pier prop,
   railing and the bait shack is solid to the player.
2. **Clock:** `CLOCK_MINUTES_PER_SECOND = 2.5` (was 0.5), so a full day is
   9.6 real minutes. HUD, save, tests and docs agree.
3. **More people:** capacity 168 (was 96) with ~130 active pedestrians across
   sidewalks, beach, mall, parking lot and station.
4. **Sittable chairs** in the mall food court, Luna Plaza, the beach and the
   pier. The player sits and stands with `E`; NPCs can occupy free seats.
5. **An enterable mall** on block (54,0), one block east of Luna Plaza:
   32×16 building, 30×14 interior hall, shops, food court, two doors, crowds,
   and a 26-stall parking lot behind it.
6. **Mall robbery:** rob the jewelry counter, alarm, hostile security, wanted
   stars, cash drop, panicking crowd, escape.
7. **Mall life follows the clock:** quiet at night, busy at dusk; parking
   occupancy and shopper counts move with the hour.
8. **Gas station** on block (-108,0), near the spawn: two pump islands, a
   kiosk, a parallel service lane; ~22% of ambient cars divert to refuel; the
   player can refuel and repair for cash; a fuel gauge and a car that stalls
   when empty.
9. **Parking is alive:** static parked cars, stealable cars, ambient valets,
   and a basic player valet service.
10. Every existing check stays green, with new E2E coverage and new
    deterministic shots; the draw-call budget is measured, never guessed.

## Non-goals

- No second mall floor, escalator or elevator as a traversable system; the
  engine's ground and collisions are 2D. A visual mezzanine band is allowed.
- No interiors for other buildings in this pass.
- No general pathfinding for cars; NPC cars use lane and service-lane
  waypoints only.
- No economy rewrite; prices are fixed and paid from the existing cash.
- No persistence of mall robbery, parked-car slots or the player car's fuel;
  they reset with the city on load.
- No new story missions attached to the mall.
- No refactor of the existing long files in this plan. A separate
  `refactor-structure` wave follows wave 2, after the features are stable.

## Constraints

- Static ES modules, no dependencies, no build step; Node v24.14.1 on Windows.
- Deterministic `?shot=` staging; tests advance fixed simulation steps, never
  the wall clock or pointer lock.
- `world.collides` and `resolveCircle` are 2D; ground height is flat per
  region; the chase camera already clips against colliders through
  `world.clipCamera`, so interior walls work without a new camera system.
- The crowd is eight `InstancedMesh` parts (eight draw calls regardless of
  count); per-ped CPU work is the real limit.
- Draw calls: the last measured baseline was 370 at `?shot=chase` against a
  ≤380 target. Measure the new mall shot before setting its target.
- Old saves (v1) must load; new fields get defaults. The raw `Suno Audio/`
  folder stays gitignored.

## Approaches considered, and the decisions

1. **Interior.** A separate scene with a teleport/loading step was dropped:
   the engine has no scene manager, and it would duplicate crowd, police, HUD
   and pursuit for a worse, non-seamless result. **Decided: a hollow building
   in the main world**, walls as colliders with two door gaps, the existing
   camera clip doing the occlusion work.
2. **Footprint.** A two-block mall with a lot across a road was dropped: more
   stalls, but shoppers cross traffic and it reads as two places. **Decided:
   one 40×40 block**, mall on the strip-facing half, parking on the back half,
   everything together.
3. **Gas station AI.** Free waypoint pathfinding into a pump lot was dropped:
   a mini-pathfinder for one station risks stuck cars. **Decided: a service
   lane parallel to the adjacent road**, where flagged cars pull out of their
   lane, stop at a pump, wait, and merge back.
4. **Delivery.** **Decided: two waves.** `mall-district` first (pier, clock,
   crowd, seats, mall, parking, robbery), then `gas-station` (fuel, player
   service, NPC refuel, valet upgrade). Each wave has its own E2E and merge.

## 1. Pier fixes

- Register colliders in `buildPier` for:
  - the bait shack at (-188, 66), 6.2×4.2 plus its roof overhang;
  - the five benches (`x = DECK.minX + 18 + i * 24`, z = 63.1), 2.2×0.62;
  - the four barrels (`x = DECK.minX + 34 + i * 27`, z = 76.9), 0.9×0.9;
  - the twelve crates, using their sampled position and size;
  - two railing strips along the deck at z = 70 ± 8.6 and two along the ramp,
    thin boxes so the player cannot walk through the rail.
- The lighthouse collider stays.
- Add `World.vehicleBlocked(x, z, isPlayer)`:
  - true on the pier deck and ramp for **every** vehicle;
  - true on beach sand (x < `WORLD.cityMinX`) for **non-player** vehicles;
  - true inside the mall building footprint for **every** vehicle (the doors
    are pedestrian-only); the parking lot stays drivable;
  - false for a player-driven car on sand, so beach driving stays possible.
- `Vehicle.collidesAt` consults it after `world.collides`. A pursuit cruiser
  blocked at the sand edge or the ramp base **force-dismounts its officers at
  once** — the existing 28 m dismount check cannot fire from 60–110 m away —
  and the foot officers take over. Police foot units are unaffected.
- The new pier colliders live in the shared `world.colliders`, so they apply
  to pedestrians, officers and mission enemies too. The Pier 9 heist staging
  moves the crate at (-188, 65) out of the bait shack and the enemy at
  (-201, 62) off the bench, and pier pedestrian targets are clamped to the
  open deck (a target inside a collider is rejected and re-rolled).
- Ambient car spawns already use road lines; add an assertion test that no
  ambient/stage car starts west of `cityMinX` or on the pier. An AI car found
  inside a blocked zone is removed by `Traffic.updateCars`.
- `groundHeightAt` is unchanged; vehicles simply can never reach the deck.

## 2. Faster clock

- `game/src/config.js`: `CLOCK_MINUTES_PER_SECOND = 2.5`; the comment becomes
  “2 real seconds = 5 in-game minutes; 9.6 real minutes per day”.
- `environment.js` and save code are unchanged; the HUD and `__neon` rate
  read the constant.
- Traffic signals stay on their real-time 18 s cycle; the in-game clock is a
  time-of-day indicator, not a signal clock. Document this.
- Update the E2E assertion “30 real seconds → 15 minutes” to **75 minutes**,
  and any doc sentence that says 48 real minutes per day.

## 3. Crowd, chairs and sitting

- `MAX_PEDS` 96 → **168**; `SIDEWALK_TARGET` 48 → **64**; `BEACH_TARGET`
  22 → **28**.
- New zone targets: mall interior up to **30** (period-driven), parking
  shoppers **2–8**, valets **2**, station **2**. Expected active peak ~130,
  leaving room for corpses and crossers.
- `World.seats` registry built by the plaza, beach, pier and mall builders:
  `{ x, z, y, yaw, kind, occupant }`.
- Player: within 1.8 m of a free seat and on foot, the look hint shows
  `E · SIT`. `E` snaps the player onto the seat, sets `player.sitting`,
  disables movement and fire, lowers the camera slightly; `E`, `Space` or a
  movement key stands. A seated player cannot be pushed by pedestrians.
- `Humanoid` gains a seated pose: hips at seat height, thighs forward, shins
  down, arms resting; it composes with the existing joint pivots and is
  driven by `player.sitting` / `ped.sitting`.
- `Crowd.write` writes a seated pose when `ped.sitting` is true (torso lower,
  legs forward, no walk swing).
- NPCs choose free seats in the mall food court and plaza, sit 20–60 in-game
  minutes, and release the seat when standing, panicking, fleeing or dying.
- Add sittable benches on the pier and loungers on the beach; the plaza
  seating is extended if needed. Benches keep their thin colliders; the sit
  anchor is in front of the collider.

## 4. The mall (block 54,0)

Block bounds: x 34–74, z -20–20.

- **Building** 32 wide × 16 deep at x 38–70, z 0–16 (the +z wall faces Vega
  Strip and the spawn, with a 4 m setback). The parking lot occupies
  z -16–0, x 38–70. The 4 m band at each z edge keeps the generic sidewalk
  loop at z = ±17.4 clear of both the walls and the lot, so block pedestrians
  do not walk into the mall.
- **Interior hall** 30×14, floor at 0.16 (the block sidewalk height), ceiling
  at 6.2 m with a glass skylight strip. Walls are 0.5 m thick with two 3.2 m
  door gaps: the main entrance centred on the +z wall (strip side), the lot
  entrance centred on the -z wall. Each wall segment is a collider; the door
  gaps are always walkable.
- **Facade:** a distinct mall material, a lit `SOLANO MALL` sign on the +z
  face, glass storefront bands, and two automatic sliding-door visuals that
  part when the player is within 3 m (visual only, no collider).
- **Inside:** six shop bays along the long walls with lit signs (jewelry,
  electronics, clothing, pharmacy, cafe, arcade), a food court with six
  tables × four chairs on the east side, a vendor counter, planters, a
  central bench cluster, and a visual mezzanine band (no access) to sell the
  scale. All static geometry is merged by material into a small number of
  draw calls; three point lights plus emissive surfaces light the hall.
- **Robbery target:** the jewelry counter in the -x wall bay. A glowing
  register and a `E · ROB` prompt.
- **Map:** the mall footprint and lot are drawn on the minimap and labelled
  `SOLANO MALL`.
- **Shots:** `?shot=mall` (exterior with the lot, entrance and a few cars) and
  `?shot=mall-interior` (hall, food court, seated shoppers, security). Both
  staged deterministically.

## 5. Parking lot, parked cars, theft and valet

- The lot is 32×16 with two rows of 13 stalls (2.4×5 m) and a 6 m aisle:
  **26 stalls**. The four parallel stalls were dropped because they would sit
  on the block's ±17.4 m sidewalk loop; the 4 m setback band keeps the loop
  clear.
- Most stalls hold **static parked cars** rendered as per-type instanced body
  meshes (one draw call per model, at most six) plus one shared glass/wheel
  mesh, with per-instance colour. Each occupied slot also has a solid
  axis-aligned collider, removed when the slot empties or the car is stolen.
  Four to six stalls near the lot entrance hold real `Vehicle`s so theft is
  immediate and varied.
- **Theft:** press `E` beside a static car. Its instance is hidden and a real
  `Vehicle` of that type/colour spawns at the slot with the player as driver;
  the slot stays empty until the next city reset. A real car is simply
  entered as usual.
- **Occupancy follows the clock:** night ~20%, dawn ~35%, day ~65%, dusk
  ~90% of static slots filled; changes stagger over a few seconds rather than
  popping in one frame.
- **Valets:** two valet NPCs in a distinct vest at a podium beside the lot
  entrance. Ambient behaviour: walk between the podium, the door and the
  stalls, open doors, carry bags.
- **Player valet service (basic):** stop a car in the marked valet zone and
  press `E`; the player steps out, the car is placed in a free stall (hidden
  with a `VALET PARKED` toast) and a valet walks there. Press `E` at the
  podium to retrieve it; the car is placed at the entrance and the player can
  enter it. No AI driving in this wave; a driving upgrade is optional in the
  gas-station wave.
- **Interaction precedence:** `F` remains the unconditional enter/exit key;
  `E` is contextual and, while stopped in a car at a pump or the valet zone,
  wins over exit. On foot, the prompt priority is seat > register > parked
  car > vehicle entry, and the HUD shows the active action.
- **Shoppers:** 2–8 pedestrians walk from occupied stalls to the lot door and
  disappear inside; later they emerge, walk back to a stall and despawn. They
  join the normal panic/flee/death systems.

## 6. Mall life and robbery

- **Crowd schedule** from `environment.minutes` and `periodAt()`:
  night 4, dawn 10, day 20, dusk 30 interior shoppers; the lot shopper count
  is **2–8**, capped at 8, and near zero at night.
- **Interior flow:** shoppers walk between the doors, shop bays, food court
  and seating; some sit; some carry a bag (a small box attached to the hand
  slot in the crowd write); a few stand in groups. Spawn and despawn at the
  doors so nobody pops in the middle of the hall.
- **Robbery:** within 2 m of the jewelry register, `E` starts the robbery:
  alarm audio, `police.addWanted(3, 'Mall Robbery')`, two security guards
  (armed, hostile, distinct uniform) inside, mall peds panic and flee toward
  the doors, and a cash drop of **$650–950** at the counter. The register is
  robbed once per city reset. Security guards are normal armed pedestrians:
  killable, lootable, and counted by the existing witness/heat systems.
- Police foot officers can enter through the wide doors; cruisers stay
  outside because vehicles are blocked from the building. If direct steering
  cannot path around a wall, officers hold the doors; that is acceptable.
- **HUD/audio:** a `MALL` map label, a robbery toast, the existing alarm/
  wanted audio, and a `VALET` prompt. No new audio files.

## 7. Gas station (wave 2, block -108,0)

Block bounds: x -128–-88, z -20–20; the east edge faces the x=-81 road.

- **Forecourt:** canopy 16×14 centred near x=-100, z=0; two pump islands at
  z=-8 and z=+8, four nozzles; kiosk 10×8 at x=-120 with a lit sign and a
  service bay; air/water stand. Pumps, kiosk and canopy columns are
  colliders. A **service lane** runs parallel to the road at x≈-92, with an
  entry curb cut near z=-18 and an exit near z=+18.
- **Fuel:** `Vehicle.fuel` 0..1, `FUEL_BURN_PER_METER ≈ 0.00007` (a full tank
  lasts roughly 12–16 real minutes), zero throttle when empty, a HUD fuel
  bar, and a `LOW FUEL` toast. Player cars start with 0.5–1.0 fuel; ambient
  cars are full unless flagged.
- **Player service:** stop within 3.5 m of a pump at <0.5 m/s and press `E`:
  refuel to 100% and repair `condition` to 100% for a combined price shown in
  the prompt (about $8 per 10% fuel + $150 for a full repair, scaled by
  damage). Insufficient cash refuses with a toast.
- **NPC refuelling:** about **22%** of ambient cars spawn flagged with
  `fuel < 0.35`. When a flagged car on the adjacent lane reaches the station
  and a pump is free, it switches to `ai.mode = 'pullin'`, steers to the pump
  slot with the existing car controls, stops, waits 4–6 s, then `pullout` to
  the merge point and returns to its lane. A second flagged car waits at the
  entry or skips if both pumps are busy. Unflagged cars never stop.
- The station is its own `?shot=station` staged scene, with a car at a pump
  and one approaching.

## 8. Save, determinism and shots

- Save v1 unchanged in shape. Mall robbery, parked-car slots, valet state and
  player-car fuel reset with the city; the clock and cash still persist.
- New shots are frozen scenes with fixed simulation steps:
  `?shot=mall`, `?shot=mall-interior` (wave 1), `?shot=station` (wave 2).
  Crowd counts and car positions in those shots are deterministic.
- **Screenshot slots (B1):** after wave 1 the four `screenshots/` files become
  `1-cover` (night chase), `2-street` (daylight roadblock), `3-mission` →
  **mall interior** (`?shot=mall-interior`), and `4-title`. The Pier 9 heist
  moves to `docs/media/heist.jpg` as a gallery image, and its staged cruisers
  move off the ramp so the shot no longer contradicts the vehicle rule.
  `?shot=mall` and `?shot=station` feed the README gallery.
- `window.__neon` gains read-only views for `mall` (shoppers, seats, register,
  wanted), `parking` (slots, occupied, stolen) and, in wave 2, `fuel`.

## 9. Tests and acceptance

- **Unit:** fuel drain/clamp, seat registry, clock rate constant, mall config,
  pier vehicle-block predicate, no ambient spawn west of `cityMinX`.
- **E2E, wave 1:**
  - walking into the shack/bench/barrel/railing is blocked;
  - a car placed on the ramp cannot move onto the deck, a police car on sand
    cannot pass the shoreline, and a blocked pursuit cruiser dismounts its
    officers;
  - 30 real seconds advance the clock 75 minutes;
  - the player sits and stands, and cannot move while seated;
  - both mall doors are walkable, the register prompts, and a robbery raises
    wanted, spawns two hostile guards and a cash drop;
  - dusk has at least 20 interior shoppers, night at most 6;
  - stealing a static parked car spawns a drivable vehicle, empties its slot
    and removes its solid collider; valet parking hides and returns a car;
  - the lot holds 26 solid stalls and the mall interior is the third
    screenshot slot.
- **E2E, wave 2:**
  - a flagged NPC car pulls in, waits, leaves, and rejoins; an unflagged car
    passes;
  - the player refuels and repairs, cash is debited, the gauge fills;
  - an empty car cannot accelerate;
  - the service-lane queue never deadlocks for 60 simulated seconds.
- **Acceptance:** 244 existing checks plus the new ones pass; `main.ts
  --check` PASS; screenshots 4/4 under 256 KiB; the new shots' draw calls are
  measured and recorded; no console errors; 60 fps target on the high preset.
- **Verification gate:** run `node --test test/loot.test.mjs`, `node --test
  test/radio.test.mjs`, `node tools/test-npc-loot.mjs`, and
  `MAKEFUN_OUTPUT_DIR=out node main.ts --check` before each merge.

## 10. Risks

- **Interior cost:** many new materials and lights. Mitigation: merge static
  geometry by material, cap point lights at three, measure the new shot first.
- **Camera at doors:** clipping can pop the camera. Mitigation: 3.2 m doors,
  0.5 m walls, test walking through both entrances with the chase camera.
- **Crowd CPU:** 130+ peds. Mitigation: zone targets, despawn beyond 190 m,
  measure frame time; mall peds take priority over extra sidewalk peds.
- **NPC cars at pumps:** stuck or colliding. Mitigation: waypoint steering,
  a 12 s refuel timeout, and a remove/respawn fallback for stalled flagged
  cars.
- **Robbery pathing:** guards and police on foot may catch on walls.
  Mitigation: guards spawn inside, two wide doors, officers may hold outside.
- **Clock speed:** the city changes period in minutes; tests and docs that
  assume 0.5 min/s must be updated in the same commit.
- **Pedestrian loop vs mall:** the 4 m setback and 26-stall lot keep the
  generic loop clear; a target inside a new pier collider is rejected.
- **Refactor deferred:** the long existing files are not split in this plan;
  mixing that with new features would make both harder to review.

## 11. Documentation

- README: controls for sitting, robbery, valet, fuel/repair; a mall district
  section; the new clock rate; the new shots.
- `docs/superpowers/specs/` (this file) and the implementation plan.
- `docs/guide/` detail pages are updated when the docs-slim branch lands; for
  this wave, keep README edits to the new features only.

## 12. Module layout and later refactor

- New systems go into purpose-named modules rather than more lines in
  `world.js`, `hud.js`, `traffic.js` or `player.js`: `mall.js` (shell,
  interior, shops, doors, seats), `parking.js` (stalls, static cars, theft,
  valet), `mall-life.js` (shopper schedule and interior routes), `robbery.js`
  (register, alarm, security), `gas-station.js` (forecourt, pumps, service
  lane) and `fuel.js` (fuel/condition and the HUD gauge).
- The existing long files are **not** refactored in this plan. After wave 2, a
  separate `refactor-structure` wave uses the code-review skill: mechanical
  moves only, one module per commit, and the full E2E suite after each step.
  Splitting `world.js`, `hud.js`, `traffic.js`, `player.js`, `vehicles.js` and
  `police.js` is too risky to mix with new feature work.
