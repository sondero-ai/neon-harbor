# Solano Mall District Implementation Plan (wave 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the enterable Solano Mall, its living parking lot, sittable seats, the mall robbery, the pier/vehicle fixes and the faster clock described in the design spec.

**Architecture:** New systems live in purpose-named ES modules (`mall.js`, `parking.js`, `mall-life.js`, `robbery.js`, `interactions.js`); `world.js` only gains small hooks (geometry kit extraction, seat registry, `vehicleBlocked`, the mall build call). The stock player/traffic/police code gains narrow hooks, and the frozen `?shot=` pages plus the 244-check E2E suite stay the regression net. Wave 2 (`gas-station`) gets its own plan after this wave ships.

**Tech Stack:** Static ES modules, vendored three.js r180, Node v24.14.1, no build step or dependencies, custom Node + headless Chrome CDP E2E in `tools/test-npc-loot.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-26-mall-district-design.md`

## Global Constraints

- No `package.json`, dependency install, build step or framework.
- Windows 11; Node v24.14.1; commands run from the repository root.
- Deterministic `?shot=` pages: fixed simulation steps, no wall clock and no pointer lock in tests.
- Baseline is **244 E2E checks**, 4 loot tests, 5 radio tests; every task keeps them green.
- `CLOCK_MINUTES_PER_SECOND = 2.5` after Task 3; old saves must load unchanged.
- Save v1 shape stays compatible; mall robbery, parking slots and valet state reset with the city.
- Draw calls are measured on the actual shot before a target is set; never tune to a guessed number.
- English code, comments, docs and commit messages; commit trailer `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- The raw `Suno Audio/` folder stays untracked; no secrets in commits.

## Review Focus

These are the failure modes the spec implies but no single test naturally covers. Each gets a check in its owning task.

1. **A player squeezed between a car and a mall wall** — the vehicle push-out must not leave her inside either body; test in Task 4's interaction/vehicle path.
2. **A shopper or officer walking through a mall or pier wall** — every new collider must go through `resolveCircle`; test in Tasks 2 and 5.
3. **`E` at a pump or valet zone while driving** — the context action must win over exit and `F` must still exit; test in Task 6.
4. **A static parked car whose collider survives theft or occupancy change** — the player must never be trapped in an empty slot; test in Task 6.
5. **A robbery with police outside the mall** — officers may hold the doors, but the two guards inside must always engage; test in Task 7.

---

## File Structure

**Create**
- `game/src/world-kit.js` — the seven geometry/material helpers moved out of `world.js`.
- `game/src/mall.js` — `buildMall(world)`, shell, interior, shops, food court, doors, seats, register.
- `game/src/parking.js` — `ParkingLot`, 26 slots, static cars, theft, valet, occupancy.
- `game/src/mall-life.js` — `MallLife`, period-driven shopper target and interior routes.
- `game/src/robbery.js` — `MallRobbery`, register, alarm, guards, cash drop.
- `game/src/interactions.js` — `Interactions`, the contextual `E` layer and prompt.

**Modify**
- `game/src/world.js` — import the kit, `seats`, `vehicleBlocked`, mall call, pier colliders.
- `game/src/vehicles.js` — `collidesAt` consults `vehicleBlocked`; export `vehicleBodyGeometry(type)`.
- `game/src/player.js` — sitting state, contextual `E` in `handleVehicleInput`.
- `game/src/humanoid.js` — seated pose.
- `game/src/traffic.js` — capacity, seated crowd pose, `mall` mode hook, pier target rejection, guard ped option.
- `game/src/police.js` — forced dismount at a blocked edge.
- `game/src/missions.js` — pier heist crate/enemy positions.
- `game/src/pickups.js` — no change if `spawnDrop` is used; confirm the spec shape.
- `game/src/main.js` — construct and tick the new systems, pass `contextPrompt`, `allowE`.
- `game/src/hud.js` — context prompt, mall map label.
- `game/src/shots.js` — `mall`, `mall-interior` shots.
- `game/src/config.js` — clock constant.
- `tools/test-npc-loot.mjs` — new E2E groups.
- `tools/capture.mjs`, `README.md`, `docs/guide/*` — media and docs.

**Exact shared interfaces (later tasks rely on these names)**

```js
// world.js
World.vehicleBlocked(x, z, isPlayer = false) -> boolean
World.seats: Seat[]
World.mall: Mall | null

// world-kit.js
addPart(parts, geometry, x, y, z, color, options)
addBox(parts, width, height, depth, x, y, z, color, options)
addCylinder(parts, radiusTop, radiusBottom, height, segments, x, y, z, color, options)
addCrownBand(parts, cx, cz, width, depth, y, color, thickness)
material(color, options)
basicMaterial(color, options)
matrixFor(x, y, z, options)

// mall.js
buildMall(world) -> Mall
Mall = { bounds, doors, register, seats, label: 'SOLANO MALL', interior }

// parking.js
new ParkingLot(world, vehicles, traffic, player, mall)
lot.slots: Slot[]; lot.occupied: number
lot.update(dt, clockMinutes)
lot.steal(slot) -> Vehicle | null
lot.parkValet(car) -> boolean
lot.retrieveValet() -> Vehicle | null

// mall-life.js
new MallLife(traffic, mall, environment)
life.update(dt, clockMinutes)
life.updatePed(ped, dt)
life.target: number

// robbery.js
new MallRobbery({ mall, player, police, traffic, pickups, onToast, audio })
robbery.tryRob() -> boolean
robbery.update(dt)

// interactions.js
new Interactions({ player, world, vehicles, parking, robbery })
interactions.update(dt, input) -> boolean  // true when E was consumed
interactions.prompt: { action, label, detail } | null

// player.js
player.sitting: boolean
player.seat: Seat | null
player.sitAt(seat); player.stand()
player.handleVehicleInput(input, { allowE = true } = {})
```

---

### Task 1: Extract the geometry kit

**Files:**
- Create: `game/src/world-kit.js`
- Modify: `game/src/world.js` (delete the seven local helpers, import them)

**Interfaces:**
- Produces: the exact kit signatures above.
- Consumes: `THREE`, `mergeGeometries` (already imported by `world.js`).

- [ ] **Step 1: Move the helpers**

Copy `matrixFor`, `addPart`, `addBox`, `addCylinder`, `addCrownBand`, `material` and `basicMaterial` from `game/src/world.js` into `game/src/world-kit.js` with `export` on each, and import `THREE` and `mergeGeometries` there. Delete the local definitions from `world.js` and add the import line.

- [ ] **Step 2: Prove no behavior change**

Run: `node tools/test-npc-loot.mjs`
Expected: 244 `ok`, 0 `not ok`, `PASS: all checks passed`.

- [ ] **Step 3: Commit**

```bash
git add game/src/world.js game/src/world-kit.js
git commit -m "Extract the world geometry kit"
```

---

### Task 2: Pier is pedestrian-only

**Files:**
- Modify: `game/src/world.js` (`buildPier` colliders, `vehicleBlocked`), `game/src/vehicles.js` (`collidesAt`), `game/src/police.js` (forced dismount), `game/src/missions.js` (heist positions), `game/src/traffic.js` (`pickBeachTarget`), `game/src/shots.js` (heist cruisers)
- Test: `tools/test-npc-loot.mjs`

**Interfaces:**
- Produces: `World.vehicleBlocked(x, z, isPlayer = false)`, `Vehicle.collidesAt` consults it.
- Consumes: `PLAYER.radius`, `world.colliders`, `this.dismount(unit)` in `police.js`.

- [ ] **Step 1: Write the failing test group (`test 21`)**

Add a `shot: 'pier'` group with these checks:

```js
// world.collides true at the shack centre, each bench, barrel, crate and
// railing sample; false at the open deck centre (e.g. -280, 70).
// world.vehicleBlocked true on the deck and ramp, false on a city road.
// vehicleBlocked(sand, false) true and vehicleBlocked(sand, true) false.
// A sedan placed on the ramp has collidesAt(deck point) === true.
// A wanted cruiser placed at the shoreline deploys officers after update.
// Every heist crate/enemy position is outside world.colliders.
// 50 pickBeachTarget calls for a pier ped produce no colliding/off-deck target.
// The heist shot's cruisers sit where vehicleBlocked is false.
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: `not ok` for the new group, old 244 still `ok`.

- [ ] **Step 3: Implement**

1. `buildPier`: push colliders for the bait shack (`-188, 66`, 6.2×4.2), the five benches (`DECK.minX + 18 + i*24`, z 63.1, 2.2×0.62), the four barrels (`DECK.minX + 34 + i*27`, z 76.9, 0.9×0.9), the twelve sampled crates, and thin rail strips at `z = DECK.z ± (halfWidth - 0.4)` and the ramp sides.
2. `World.vehicleBlocked`: true on `onPierDeck`/`onRamp`; true for `x < WORLD.cityMinX` when `!isPlayer`; false otherwise.
3. `Vehicle.collidesAt`: before returning false, return true when `world.vehicleBlocked(px, pz, this.driver === 'player')`.
4. `Police.updateUnits`: when a cruiser is within 30 m of a blocked edge and the player is on the other side, set `unit.dismountTimer = 0` and call `this.dismount(unit)` (same path as the 28 m check). Do not deploy a unit the player can see driving normally.
5. `missions.js`: move the crate at `(-188, 65)` to a free deck point (validate with `world.collides`), and the enemy at `(-201, 62)` clear of the bench; keep the rest.
6. `traffic.pickBeachTarget`: after choosing a target, reject it and retry if `world.collides(x, z, 0.3)` or the target is outside the deck margin.
7. `shots.js` heist cruisers: move them from the ramp (`x -171/-177`) to the city-side approach (about `x -138`) so the frozen shot obeys the rule.

- [ ] **Step 4: Run the tests**

Run: `node tools/test-npc-loot.mjs`
Expected: all old checks plus the new group `ok`; `PASS`.

- [ ] **Step 5: Commit**

```bash
git add game/src/world.js game/src/vehicles.js game/src/police.js game/src/missions.js game/src/traffic.js game/src/shots.js tools/test-npc-loot.mjs
git commit -m "Make the pier pedestrian-only"
```

---

### Task 3: The faster clock

**Files:**
- Modify: `game/src/config.js`, `tools/test-npc-loot.mjs`, `README.md`, `docs/guide/city.md`, `docs/guide/testing.md`

**Interfaces:**
- Produces: `CLOCK_MINUTES_PER_SECOND = 2.5`.

- [ ] **Step 1: Update the failing expectation**

In the living-clock group, change the 30-real-second assertion from 15 minutes to **75 minutes** and rename the check.

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: the 75-minute check is `not ok`.

- [ ] **Step 3: Implement and document**

Set `CLOCK_MINUTES_PER_SECOND = 2.5` in `game/src/config.js`; update the comment to “2 real seconds = 5 in-game minutes; 9.6 real minutes per day”. Update README, `docs/guide/city.md` (one minute per two seconds / 48 minutes → 2.5 per second / 9.6 minutes) and `docs/guide/testing.md` (the living-clock description). Leave the 18 s traffic-signal cycle alone and say so in the guide.

- [ ] **Step 4: Run the tests**

Run: `node tools/test-npc-loot.mjs`
Expected: `PASS` with the 75-minute check `ok`.

- [ ] **Step 5: Commit**

```bash
git add game/src/config.js tools/test-npc-loot.mjs README.md docs/guide/city.md docs/guide/testing.md
git commit -m "Speed the in-game clock to five minutes per two seconds"
```

---

### Task 4: Seats, sitting and the contextual E layer

**Files:**
- Create: `game/src/interactions.js`
- Modify: `game/src/world.js` (seat registry + plaza/pier/beach seat anchors), `game/src/humanoid.js` (seated pose), `game/src/player.js` (sitting + `allowE`), `game/src/main.js` (construct/tick interactions), `game/src/hud.js` (context prompt)
- Test: `tools/test-npc-loot.mjs`

**Interfaces:**
- Produces: `player.sitAt(seat)`, `player.stand()`, `player.sitting`, `player.seat`; `Interactions.update(dt, input) -> boolean`, `interactions.prompt`.
- Consumes: `input.consumePressed('KeyE')`, `world.seats`, `player.handleVehicleInput(input, { allowE })`.

- [ ] **Step 1: Write the failing test group (`test 22`, `shot: 'street'`)**

```js
// world.seats has at least one plaza seat, one pier seat and one beach seat.
// Teleport to a free seat; press E; player.sitting === true and seat.occupant
// is 'player'; a movement key for 0.5 s does not change x/z.
// Press E again; player.sitting === false and the seat is free.
// The interactions prompt reads { action: 'sit', ... } when standing beside it.
// A car placed against a known city building wall with the player between it
// and the wall leaves the player outside the car body after resolveVehicleContacts.
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: the new group fails on the missing `world.seats`/`player.sitting`.

- [ ] **Step 3: Implement**

1. `world.js`: `this.seats = []` in the constructor; push seat objects from `buildPlaza`, `buildBeachProps` and `buildPier` using the existing bench/lounger coordinates (`{ x, z, y, yaw, kind, occupant: null }`).
2. `humanoid.js`: a `seated` value; after the walk/aim/melee blocks, bend the hips and knees (thighs forward, shins down, arms resting) when seated.
3. `player.js`: `sitting`, `seat`, `sitAt(seat)`, `stand()`; an early `sitting` branch in `update` like the knockdown branch (no movement/fire, keep camera); `handleVehicleInput(input, { allowE = true })` uses `KeyF` always and `KeyE` only when `allowE`.
4. `interactions.js`: scan `world.seats` within 1.8 m; if E is pressed, `input.consumePressed('KeyE')`, sit/stand, return true; expose a prompt.
5. `main.js`: build the interactions object after the player/vehicles; in `tick`, call `interactions.update` before `player.handleVehicleInput`, pass `allowE: !consumedE`; add `contextPrompt` to `hudState`.
6. `hud.js`: draw the context prompt beside the vehicle prompt (`E · SIT`, `E · STAND`).

- [ ] **Step 4: Run the tests**

Run: `node tools/test-npc-loot.mjs`
Expected: all old + new `ok`; `PASS`.

- [ ] **Step 5: Commit**

```bash
git add game/src/world.js game/src/humanoid.js game/src/player.js game/src/interactions.js game/src/main.js game/src/hud.js tools/test-npc-loot.mjs
git commit -m "Add sittable seats and the contextual E layer"
```

---

### Task 5: The mall shell and interior

**Files:**
- Create: `game/src/mall.js`
- Modify: `game/src/world.js` (build call, `vehicleBlocked`, `world.mall`), `game/src/hud.js` (map label), `game/src/shots.js` (mall shots), `game/src/main.js` (shot staging), `game/src/world-kit.js` (use)
- Test: `tools/test-npc-loot.mjs`

**Interfaces:**
- Produces: `buildMall(world) -> Mall` with `bounds {minX,maxX,minZ,maxZ}`, `doors`, `register`, `seats`, `label`, `interior`.
- Consumes: `world-kit` helpers, `world.colliders`, `world.seats`.

- [ ] **Step 1: Write the failing test group (`test 23`, `shot: 'street'`)**

```js
// Teleport inside the hall (54, 8); world.mall.bounds contains the point;
// groundHeightAt is the block floor; no collides at the hall centre.
// resolveCircle on a point inside a mall wall returns a point outside it.
// Teleport to each door, walk 4 m through it, and assert the player crossed
// the wall line without colliding.
// A car pressed against the mall wall with the player between leaves the
// player outside the car body.
// world.vehicleBlocked(mall centre) === true, vehicleBlocked(lot centre) === false.
// Mall seats: at least 24, all inside the hall bounds.
// The mall footprint appears in the minimap state (world.mall.label).
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: the new group fails; old 244 remain `ok`.

- [ ] **Step 3: Implement**

1. `mall.js`: build the shell at x 38–70, z 0–16 with 0.5 m walls, a +z main door and a -z lot door, each 3.2 m wide; colliders per wall segment; an interior floor at 0.16, a 6.2 m ceiling with a skylight strip, six shop bays, a food court with 6 tables × 4 chairs, planters, a visual mezzanine band, three point lights and emissive materials; the `SOLANO MALL` sign; push the 24 food-court seats into `world.seats`; return the Mall object.
2. `world.js`: in `buildCity`, handle `cx === 54 && cz === 0` with `this.mall = buildMall(this)`; add the mall footprint to `vehicleBlocked`; keep the generic ped loop untouched (the 4 m setback).
3. `hud.js`: draw the mall footprint and label on the minimap.
4. `shots.js` + `main.js`: add `mall` (player on the strip facing the entrance) and `mall-interior` (player in the hall, food court visible); stage them with fixed positions and `time` values; no pointer lock.

- [ ] **Step 4: Run the tests and measure**

Run: `node tools/test-npc-loot.mjs`
Expected: `PASS`; record the mall shot's draw calls via `__neon.renderStats()`/`measureFrames(30)` and put the number in the commit message.

- [ ] **Step 5: Commit**

```bash
git add game/src/mall.js game/src/world.js game/src/hud.js game/src/shots.js game/src/main.js tools/test-npc-loot.mjs
git commit -m "Build the enterable Solano Mall"
```

---

### Task 6: The parking lot, theft and valet

**Files:**
- Create: `game/src/parking.js`
- Modify: `game/src/vehicles.js` (`vehicleBodyGeometry` export), `game/src/main.js` (construct/tick), `game/src/interactions.js` (parked-car/valet prompts), `game/src/hud.js` (lot label), `tools/test-npc-loot.mjs`

**Interfaces:**
- Produces: `ParkingLot` with `slots`, `occupied`, `update(dt, clockMinutes)`, `steal(slot)`, `parkValet(car)`, `retrieveValet()`.
- Consumes: `vehicleBodyGeometry(type)`, `vehicles.spawn`, `player.exitVehicle`, `input.consumePressed`.

- [ ] **Step 1: Write the failing test group (`test 24`, `shot: 'street'`)**

```js
// lot.slots.length === 26; every slot is inside x 38..70, z -16..0.
// set environment clock 22:00 / 18:00 / 12:00 and update; occupancy is
// roughly 20% / 90% / 65% within one slot of the target.
// Teleport beside an occupied slot, press E; slot.occupied false, slot has a
// real Vehicle, world.collides at the slot is false (collider removed).
// Stop a car in the valet zone, press E; the car is stored, the player is on
// foot, the prompt changes; press E at the podium; a car appears at the entrance.
// E in the valet zone does NOT exit the car before parking.
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: the new group fails; old checks stay green.

- [ ] **Step 3: Implement**

1. `parking.js`: 26 slots (13 × 2) at x 38–70, z -16..0, stripes, lights; per-type instanced static bodies using `vehicleBodyGeometry` (≤6 body draw calls) plus one shared wheel mesh; each occupied slot gets an AABB collider stored on the slot and pushed to `world.colliders`.
2. Occupancy: `targetFor(periodAt(minutes))` = 20/35/65/90%; fill/empty static slots with a short stagger; the 4–6 real cars near the entrance stay.
3. Theft: hide the instance, remove the collider, `vehicles.spawn(type, { x, z, yaw, driver: 'player' })`, `player.enterVehicle`; mark the slot stolen until reset.
4. Valet: podium at the lot entrance, marked zone; `parkValet` calls `player.exitVehicle()`, removes/hides the car, stores type/color; `retrieveValet` spawns it at the entrance; a valet ped walks to the stall as theater.
5. `interactions.js`: nearest parked car within 2 m → `E · STEAL`; valet zone while stopped → `E · VALET`; podium → `E · RETRIEVE`; consume E and call the lot.
6. `main.js`: construct/tick the lot; `hud.js`: draw the lot and label.

- [ ] **Step 4: Run the tests**

Run: `node tools/test-npc-loot.mjs`
Expected: `PASS`; record the mall shot draw calls (new static cars included).

- [ ] **Step 5: Commit**

```bash
git add game/src/parking.js game/src/vehicles.js game/src/main.js game/src/interactions.js game/src/hud.js tools/test-npc-loot.mjs
git commit -m "Add the living parking lot, theft and valet"
```

---

### Task 7: Mall life, crowd schedule and robbery

**Files:**
- Create: `game/src/mall-life.js`, `game/src/robbery.js`
- Modify: `game/src/traffic.js` (capacity, seated pose, `mall` mode, guard option, panic helper), `game/src/main.js` (construct/tick), `game/src/interactions.js` (register), `game/src/hud.js` (toast), `tools/test-npc-loot.mjs`

**Interfaces:**
- Produces: `MallLife` (`update`, `updatePed`, `target`), `MallRobbery` (`tryRob`, `update`, `robbed`).
- Consumes: `traffic.spawnPed`, `traffic.despawnPed`, `traffic.walkToward`, `pickups.spawnDrop`, `police.addWanted(3, 'Mall Robbery')`, `ped.sitting`, `ped.bag`.

- [ ] **Step 1: Write the failing test groups (`test 25` mall life, `test 26` robbery) on `?shot=mall-interior`**

```js
// set clock 18:00; life.update; at least 20 active mode==='mall' shoppers;
// set clock 02:00; update; at most 6.
// At least 4 shoppers are sitting at a seat, and no two share a seat.
// Robbery: teleport to the register, press E; wanted === 3; two guard peds
// are armed and hostile and both are inside world.mall.bounds; a cash pickup
// exists at the counter; nearby peds flee; no police unit is inside the mall.
// A second E does nothing (robbed === true); guard death drops loot.
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: the two new groups fail; old 244 remain `ok`.

- [ ] **Step 3: Implement**

1. `mall-life.js`: target by period (night 4, dawn 10, day 20, dusk 30); spawn at a door, walk a waypoint route through the shops/food court, despawn at a door; shoppers reserve mall seats for 20–60 in-game minutes; updatePed drives the walk; `ped.bag` on some.
2. `traffic.js`: `MAX_PEDS 168`, `SIDEWALK_TARGET 64`, `BEACH_TARGET 28`; `Crowd.write` seated pose and a bag part; `updatePeds` delegates `mode === 'mall'` to `this.mallLife`; `spawnPed` accepts `guard` (dark uniform, armed, hostile, hat); add `panic(x, z, radius)` setting flee.
3. `robbery.js`: register at the jewelry counter; `tryRob` once per city reset: alarm, `police.addWanted(3, 'Mall Robbery')`, spawn 2 guards inside, `pickups.spawnDrop({ x, z, kind: 'cash', amount: 650 + rng*300, label: 'CASH' })`, `traffic.panic(register.x, register.z, 18)`, toast.
4. `interactions.js`: register within 2 m → `E · ROB`, consume E, call `robbery.tryRob`.
5. `main.js`: construct/tick both; pass `mallLife` to traffic and the HUD toast callback.

- [ ] **Step 4: Run the tests**

Run: `node tools/test-npc-loot.mjs`
Expected: `PASS` with all new checks; record the interior crowd/draw calls.

- [ ] **Step 5: Commit**

```bash
git add game/src/mall-life.js game/src/robbery.js game/src/traffic.js game/src/main.js game/src/interactions.js game/src/hud.js tools/test-npc-loot.mjs
git commit -m "Fill the mall and add the robbery"
```

---

### Task 8: Media, documentation and final verification

**Files:**
- Modify: `tools/capture.mjs` (shot list; third file becomes `mall-interior`), `README.md`, `docs/guide/*`, `screenshots/*`, `docs/media/*`
- Test: the four commands, link check, capture outputs

**Interfaces:**
- Consumes: the `mall`/`mall-interior` shots.

- [ ] **Step 1: Capture the new contact sheet**

Change `tools/capture.mjs` so `screenshots/3-mission.jpg` is the **mall interior** shot; add a one-off gallery capture of the heist to `docs/media/heist.jpg`. Regenerate the four 1280×720 images; verify each is ≤256 KiB and inspect at full resolution and at 300 px.

- [ ] **Step 2: Regenerate the trailer**

Run `node tools/capture-media.mjs`; confirm `docs/media/overview.gif` is ≤4.5 MiB and the combat still exists. If the tool still records only the opening walk, leave a note in the guide; do not fake multi-scene capture.

- [ ] **Step 3: Update the docs**

README: controls (`E` context, `F` enter/exit; sit, rob, valet), the mall and lot, the clock (2.5 min/s, 9.6 real minutes/day), 26 stalls, new E2E count, the new screenshot table. `docs/guide/city.md`, `driving.md`, `combat.md`, `hud-audio.md`, `testing.md`, `building.md`: the mall, parking, robbery, seats, clock and shot list. Run the 88-link check and add the new pages/anchors.

- [ ] **Step 4: Run the full verification**

```bash
node --test test/loot.test.mjs
node --test test/radio.test.mjs
node tools/test-npc-loot.mjs
MAKEFUN_OUTPUT_DIR=out node main.ts --check
```

Expected: 4/4, 5/5, the new total with 0 `not ok` and `PASS`, and `check PASS` with screenshots 4/4.

- [ ] **Step 5: Commit**

```bash
git add tools/capture.mjs README.md docs/guide screenshots docs/media
git commit -m "Refresh the media and docs for the mall"
```

---

## Self-review notes

- Every spec section has a task: pier (2), clock (3), crowd/seats (4, 7), mall (5), parking/valet/theft (6), robbery (7), shots/media (8), save compatibility (global), draw calls (5–7), refactor deferral (spec section 12).
- The two waves are separate plans; this file ends at the mall wave. The gas-station plan is written after wave 1 ships, using the interfaces above plus `fuel.js`/`gas-station.js`.
- Tests use the existing `TESTS` harness; each new group names its `shot`, its assertions and its abort condition.
- The 26-slot figure, 32×16 mall, 4 m setback, E/F precedence, forced police dismount and B1 screenshot are the approved decisions from the spec.
