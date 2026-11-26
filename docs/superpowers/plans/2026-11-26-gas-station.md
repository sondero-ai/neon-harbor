# Solano Fuel Gas Station Implementation Plan (wave 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Solano Fuel station on block (-108, 0): a four-nozzle forecourt, a parallel service lane, a fuel tank that drains and can strand a car, player refuel/repair paid from cash, about 22% of ambient cars diverting to refuel, a fuel gauge and a deterministic `?shot=station`.

**Architecture:** Two new purpose-named modules: `fuel.js` (pure constants and quote math) and `gas-station.js` (merged forecourt geometry, pump slots, the NPC pull-in/pump/pull-out state machine). `world.js` swaps one generic block for the station build, `traffic.js` gains a 22% low-fuel flag and a per-car hook, and `vehicles.js` gains the tank. `interactions.js`, `hud.js`, `main.js`, `shots.js` gain narrow hooks only; no existing long file is refactored.

**Tech Stack:** Static ES modules, vendored three.js r180, Node v24.14.1, no build step or dependencies, the existing stdlib-only Node + headless Chrome E2E in `tools/test-npc-loot.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-26-mall-district-design.md` (section 7 and the wave-2 test list in section 9)

## Global Constraints

- No `package.json`, dependency install, build step or framework.
- Windows 11; Node v24.14.1; commands run from the repository root.
- Baseline is **347 E2E checks**, 4 loot tests, 5 radio tests; every task keeps them green.
- Deterministic `?shot=` pages: fixed simulation steps, no wall clock and no pointer lock in tests.
- Fuel and condition are session state only; they are **not** added to save v1. The save shape stays unchanged.
- `FUEL_BURN_PER_METER = 0.00007`, `LOW_FUEL = 0.2`, fuel at **$8 per 10%** of the missing tank, repair **$150** scaled by damage; these are fixed prices, no economy rewrite.
- Only northbound cars on the x = -81 road divert; no general car pathfinding, only the station waypoint lists.
- The design's phrase "valet upgrade" names no behavior anywhere; the shipped valet (park/retrieve) is treated as complete in this wave. Do not invent a new valet feature.
- Draw calls are measured on the actual `?shot=station` page before a target is set; never tune to a guessed number.
- English code, comments, docs and commit messages; commit trailer `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Work on branch `gas-station`; do not merge, push or deploy. The main session merges and publishes.
- The raw `Suno Audio/` folder stays untracked; no secrets in commits.

## Review Focus

1. **An NPC car removed or stuck while it owns a pump** — the slot must be released, or that pump is dead for the rest of the session; release it from `Traffic.removeCar` and test in Task 4.
2. **`E` at a pump while driving** — service must win over exit, `F` must still exit without paying, and a second `E` on a full car must not charge; test in Task 3.
3. **A full tank or a wallet too small** — never charge $0, never go negative, always toast the refusal; test in Task 3.
4. **A pumped car pulling out across the service lane while another flagged car arrives** — no car may sit stationary at the entry for more than 8 s in 60 simulated seconds; test in Task 4.
5. **A car spawned at a pump or on the lane overlapping a collider** — slots, waypoints and the curb cut must be collider-free at a 1.2 m radius; test in Task 2.

---

## File Structure

**Create**
- `game/src/fuel.js` — constants, `drainFuel`, `fuelPct`, `quoteService`.
- `game/src/gas-station.js` — forecourt geometry, colliders, pump slots, `atPump`, service, NPC divert state machine, shot staging.
- `test/fuel.test.mjs` — pure fuel/quote tests.

**Modify**
- `game/src/vehicles.js` — `fuel` option/field, distance drain, no throttle when empty.
- `game/src/traffic.js` — `options.fuel`, the ambient 22% flag, the station hook in `updateCars`, slot release in `removeCar`.
- `game/src/world.js` — build the station instead of the generic block at (-108, 0).
- `game/src/interactions.js` — the driving fuel prompt, wired to `gasStation`.
- `game/src/hud.js` — the fuel readout and bar in the vehicle card.
- `game/src/main.js` — construct/wire, low-fuel toast, `hudState.vehicle.fuel`, debug, shot staging, reset.
- `game/src/shots.js` — the `station` shot.
- `tools/test-npc-loot.mjs` — group 27 (the station) and group 28 (the station shot).
- `tools/capture.mjs` — the `docs/media/station.jpg` gallery still.
- `README.md`, `docs/guide/{driving,city,testing,building,source-map}.md`, `docs/media/station.jpg`.

---

### Task 1: Fuel module and tank physics

**Files:**
- Create: `game/src/fuel.js`
- Create: `test/fuel.test.mjs`
- Modify: `game/src/vehicles.js`
- Modify: `game/src/main.js` (opening-car fuel only)

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `FUEL_BURN_PER_METER`, `LOW_FUEL`, `FUEL_PRICE_PER_TANK`, `REPAIR_PRICE`, `drainFuel(fuel, metres) -> number`, `fuelPct(fuel) -> number`, `quoteService({ fuel, condition }) -> { fuelCost, repairCost, total }`; `Vehicle.fuel` in 0..1 set from the `fuel` spawn option (default 1).

- [ ] **Step 1: Write the failing tests**

Create `test/fuel.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUEL_BURN_PER_METER,
  LOW_FUEL,
  drainFuel,
  fuelPct,
  quoteService,
} from '../game/src/fuel.js';

test('fuel drains by distance and clamps at zero', () => {
  assert.equal(FUEL_BURN_PER_METER, 0.00007);
  assert.equal(drainFuel(1, 0), 1);
  assert.ok(Math.abs(drainFuel(1, 1000) - 0.93) < 1e-9);
  assert.equal(drainFuel(0.05, 1000), 0);
  assert.equal(drainFuel(0.5, -10), 0.5);
});

test('service quote charges for the missing fuel and the damage', () => {
  assert.deepEqual(quoteService({ fuel: 1, condition: 1 }), { fuelCost: 0, repairCost: 0, total: 0 });
  assert.deepEqual(quoteService({ fuel: 0.4, condition: 0.5 }), { fuelCost: 48, repairCost: 75, total: 123 });
  assert.deepEqual(quoteService({ fuel: 0, condition: 0 }), { fuelCost: 80, repairCost: 150, total: 230 });
});

test('fuel percent and the low-fuel threshold are pinned', () => {
  assert.equal(LOW_FUEL, 0.2);
  assert.equal(fuelPct(1), 100);
  assert.equal(fuelPct(0.416), 42);
  assert.equal(fuelPct(0), 0);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/fuel.test.mjs`
Expected: FAIL, `Cannot find module .../game/src/fuel.js`.

- [ ] **Step 3: Implement the module**

Create `game/src/fuel.js` with exactly these exports:

```js
export const FUEL_BURN_PER_METER = 0.00007;
export const LOW_FUEL = 0.2;
export const FUEL_PRICE_PER_TANK = 80;   // $8 per 10%
export const REPAIR_PRICE = 150;
export function drainFuel(fuel, metres) // clamp01(fuel - max(0, metres) * FUEL_BURN_PER_METER)
export function fuelPct(fuel)            // Math.round(clamp01(fuel) * 100)
export function quoteService(car)        // { fuelCost, repairCost, total }, both rounded
```

`quoteService` uses `Math.round((1 - clamp01(car.fuel)) * FUEL_PRICE_PER_TANK)` and `Math.round((1 - clamp01(car.condition ?? 1)) * REPAIR_PRICE)`; `total` is their sum.

- [ ] **Step 4: Add the tank to `Vehicle`**

In `game/src/vehicles.js`:
1. Import `drainFuel` from `./fuel.js`.
2. Constructor signature: `constructor(type, { x = 0, z = 0, yaw = 0, color = null, fuel = 1 } = {})`; add `this.fuel = Math.max(0, Math.min(1, fuel));` beside `this.condition = 1`.
3. In `stepPhysics`, change `const throttle = clamp(controls.throttle, -1, 1);` to `const throttle = this.fuel <= 0 ? 0 : clamp(controls.throttle, -1, 1);`.
4. Before the substep loop that moves `this.position`, store `const startX = this.position.x; const startZ = this.position.z;`; after that loop, drain with `this.fuel = drainFuel(this.fuel, Math.hypot(this.position.x - startX, this.position.z - startZ));`.
5. `Vehicles.spawn` already forwards `options`, so `vehicles.spawn('sedan', { fuel: 0.6 })` works without further change.

- [ ] **Step 5: Set the opening cars' tanks**

In `game/src/main.js` → `spawnOpeningCars`, add `fuel: 0.62` to the muscle car spawn and `fuel: 0.88` to the sedan spawn.

- [ ] **Step 6: Run the tests**

Run: `node --test test/fuel.test.mjs`
Expected: 3 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add game/src/fuel.js game/src/vehicles.js game/src/main.js test/fuel.test.mjs
git commit -m "Add the fuel tank model and service quote"
```

---

### Task 2: The forecourt and the world hook

**Files:**
- Create: `game/src/gas-station.js`
- Modify: `game/src/world.js`
- Modify: `game/src/main.js` (debug exposure)
- Modify: `tools/test-npc-loot.mjs` (new group 27)

**Interfaces:**
- Consumes: `world-kit.js` helpers (`addBox`, `addCylinder`, `material`, `basicMaterial`, `mergeGeometries`), `makeSignTexture` from `geo.js`, `world.colliders`, `world.root`.
- Produces: `buildGasStation(world) -> GasStation`; `GasStation.pumps` (2 nozzle points), `.slots` (2 pump stop poses), `.atPump(point, reach = 3.5)`, `.reset()`; `world.gasStation`.

**Pinned layout (block bounds x -128..-88, z -20..20):**
- Canopy 16 (x) × 20 (z), centred (-100, 0), roof at y 4.7, fascia sign `SOLANO FUEL`. The design's 14 m depth would leave the z = ±8 islands outside the roof; 20 m covers them.
- Two islands at (-100, -8) and (-100, +8), 6 (x) × 1.2 (z) × 0.95; two nozzles each at x -101.2 and -98.8.
- Pump nozzle points: `(-97.2, -8)` and `(-97.2, +8)`.
- Pump stop slots: `{ x: -96.5, z: -11, yaw: -Math.PI / 2, pump: 0 }` and `{ x: -96.5, z: +11, yaw: -Math.PI / 2, pump: 1 }`.
- Kiosk 10 × 8 at (-120, 0), door facing east, lit sign and a service-bay door on its north face.
- Air/water stand 0.8 × 0.8 at (-116, 13).
- Canopy columns 0.5 × 0.5 at x -107.5 and -92.5, z -9 and +9.
- Service lane centre x -92 from z -20 to +20; painted entry at (-84.2, -18) and exit at (-84.2, +18); the entry curb cut spans z -20..-16, the exit z +16..+20.
- Two warm point lights under the canopy at (-104, 4.2, 0) and (-96, 4.2, 0).

- [ ] **Step 1: Write the failing E2E group**

Add this group to `tools/test-npc-loot.mjs` after group 26 (keep the existing `check` helper shape); `shot: 'street'`:

```js
{
  name: 'test 27: the gas station forecourt and service lane',
  shot: 'street',
  body: function gasStation() {
    const results = [];
    const check = (name, ok, detail = '') => {
      results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
    };
    const neon = window.__neon;
    const world = neon?.debug?.world;
    const station = neon?.debug?.gasStation;
    check('test 27: station hooks are exposed', Boolean(world?.gasStation) && Boolean(station), 'station missing');
    if (!world || !station) return results;
    check('test 27: the forecourt has two pumps and two slots', station.pumps.length === 2 && station.slots.length === 2,
      JSON.stringify({ pumps: station.pumps.length, slots: station.slots.length }));
    check('test 27: a stopped car is within reach of a nozzle',
      Boolean(station.atPump({ x: -96.5, z: -11 }, 3.5)) && Boolean(station.atPump({ x: -96.5, z: 11 }, 3.5)),
      'no nozzle within 3.5 m of a slot');
    check('test 27: the kiosk is solid', world.collides(-120, 0, 0.4) === true);
    check('test 27: both pump islands are solid', world.collides(-100, -8, 0.4) === true && world.collides(-100, 8, 0.4) === true);
    check('test 27: the canopy columns are solid', world.collides(-107.5, -9, 0.4) === true && world.collides(-92.5, 9, 0.4) === true);
    check('test 27: the pump slots are clear for a car',
      world.collides(-96.5, -11, 0.9) === false && world.collides(-96.5, 11, 0.9) === false);
    check('test 27: the service lane and both curb cuts are clear',
      world.collides(-92, -15, 1.2) === false && world.collides(-92, 15, 1.2) === false
        && world.collides(-88, -18, 1.2) === false && world.collides(-88, 18, 1.2) === false);
    check('test 27: the forecourt is not vehicle-blocked',
      world.vehicleBlocked(-100, 0, false) === false && world.vehicleBlocked(-92, -18, false) === false);
    return results;
  },
},
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: the new group fails on `station hooks are exposed`; every earlier group stays green.

- [ ] **Step 3: Build `gas-station.js`**

Create `game/src/gas-station.js` with:
- The constants and layout above (`STATION_BOUNDS`, `STATION_LABEL`, `PUMP_POINTS`, `PUMP_SLOTS`).
- A local `addCollider(world, kind, minX, maxX, minZ, maxZ, maxY)` matching the shape in `mall.js`.
- `export class GasStation` whose constructor builds merged part lists (concrete, canopy, kiosk, islands, columns, air stand, paint) into one mesh per material added to `world.root`, plus the colliders and the two point lights. Use `makeSignTexture` for the canopy fascia and a small price board on the kiosk (`FUEL 1.89 · DIESEL 2.05 · AIR FREE`).
- `export function buildGasStation(world) { return new GasStation(world); }`.
- `atPump(point, reach = 3.5)` returns the nearest entry of `this.pumps` within `reach` of `point`, else `null`.
- `reset()` sets every slot's `car = null`, `phase = 'free'`, `timer = 0`.

- [ ] **Step 4: Hook the block in `world.js`**

Import `buildGasStation` and, in the core block loop beside the mall case, add:

```js
if (cx === -108 && cz === 0) {
  // The Solano Fuel station replaces the generic block; its service lane
  // faces the x = -81 road.
  this.gasStation = buildGasStation(this);
  continue;
}
```

- [ ] **Step 5: Expose the station**

In `game/src/main.js` → `window.__neon.debug`, add `gasStation: game.gasStation`.

- [ ] **Step 6: Run the suite**

Run: `node tools/test-npc-loot.mjs`
Expected: group 27 passes with its 9 checks; all earlier groups stay green.

- [ ] **Step 7: Commit**

```bash
git add game/src/gas-station.js game/src/world.js game/src/main.js tools/test-npc-loot.mjs
git commit -m "Build the Solano Fuel forecourt and service lane"
```

---

### Task 3: Player refuel and repair

**Files:**
- Modify: `game/src/gas-station.js` (`service`)
- Modify: `game/src/interactions.js`
- Modify: `game/src/hud.js`
- Modify: `game/src/main.js` (wiring, `hudState.vehicle.fuel`, low-fuel toast)
- Modify: `tools/test-npc-loot.mjs` (extend group 27)

**Interfaces:**
- Consumes: `quoteService` from `fuel.js`, `player.cash`, `player.driving`, `player.enterVehicle`, `world`/`vehicles` debug handles.
- Produces: `GasStation.service(player) -> { ok, quote }`, `GasStation.onToast`, `interactions.gasStation`, `hudState.vehicle.fuel`.

- [ ] **Step 1: Extend the failing E2E group**

Append to the group 27 body after the geometry checks:

```js
const player = neon?.debug?.player;
const vehicles = neon?.debug?.vehicles;
const interactions = neon?.debug?.interactions;
const hud = neon?.debug?.hud;
const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
  code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true,
}));

const car = vehicles.spawn('sedan', { x: -96.5, z: -11, yaw: -Math.PI / 2, fuel: 0.4 });
car.condition = 0.5;
player.enterVehicle(car);
neon.advance(1 / 60);
check('test 27: a car at the pump prompts SERVICE at the quoted price',
  interactions.prompt?.action === 'fuel' && interactions.prompt?.detail === '$123',
  JSON.stringify(interactions.prompt));
check('test 27: the HUD carries the fuel level', neon.state?.vehicle?.fuel === 0.4,
  JSON.stringify(neon.state?.vehicle ?? null));

player.cash = 1000;
key('keydown', 'KeyE');
neon.advance(1 / 60);
key('keyup', 'KeyE');
check('test 27: E refuels and repairs and debits the quote',
  car.fuel === 1 && car.condition === 1 && player.cash === 877,
  JSON.stringify({ fuel: car.fuel, condition: car.condition, cash: player.cash }));
neon.advance(1 / 60);
check('test 27: a fully serviced car has no service prompt', interactions.prompt?.action !== 'fuel');

key('keydown', 'KeyF');
neon.advance(1 / 60);
key('keyup', 'KeyF');
check('test 27: F still exits at a pump and does not service', player.driving === null);

const poor = vehicles.spawn('muscle', { x: -96.5, z: 11, yaw: -Math.PI / 2, fuel: 0.5 });
player.enterVehicle(poor);
player.cash = 20;
neon.advance(1 / 60);
key('keydown', 'KeyE');
neon.advance(1 / 60);
key('keyup', 'KeyE');
check('test 27: a wallet short of the quote refuses and keeps the car as it was',
  poor.fuel === 0.5 && player.cash === 20 && hud?.toast?.title === 'NOT ENOUGH CASH',
  JSON.stringify({ fuel: poor.fuel, cash: player.cash, toast: hud?.toast?.title }));

poor.fuel = 0.1;
neon.advance(1 / 60);
check('test 27: a low tank raises the LOW FUEL toast', hud?.toast?.title === 'LOW FUEL',
  JSON.stringify(hud?.toast));

// An empty tank turns throttle into nothing while the car stays drivable.
const dry = vehicles.spawn('sedan', { x: -70, z: -6, yaw: 0, fuel: 0, driver: 'ai' });
dry.controls.throttle = 1;
dry.controls.brake = 0;
const dryZ = dry.position.z;
neon.advance(1);
check('test 27: an empty car cannot accelerate',
  Math.abs(dry.speed) < 0.5 && Math.abs(dry.position.z - dryZ) < 0.5,
  JSON.stringify({ speed: dry.speed, z: dry.position.z }));
```

The group runs on the street page; clear ambient cars first inside the group before the NPC checks in Task 4.

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: the new checks fail on the missing `fuel` prompt.

- [ ] **Step 3: Implement `GasStation.service`**

Add to `gas-station.js`:

```js
service(player) {
  const car = player?.driving;
  if (!car) return { ok: false, quote: null };
  const quote = quoteService(car);
  if (quote.total <= 0) return { ok: false, quote };
  if (player.cash < quote.total) {
    this.onToast?.({ title: 'NOT ENOUGH CASH', sub: `NEED $${quote.total}`, life: 2.6 });
    return { ok: false, quote };
  }
  player.cash -= quote.total;
  car.fuel = 1;
  car.condition = 1;
  this.onToast?.({ title: 'SERVICE COMPLETE', sub: `$${quote.total} · FULL TANK · BODY REPAIRED`, life: 2.8 });
  return { ok: true, quote };
}
```

- [ ] **Step 4: Add the driving prompt in `interactions.js`**

In the `player.driving` branch, before the valet check:

```js
if (this.gasStation && Math.abs(player.driving.speed) < 0.5) {
  const pump = this.gasStation.atPump(player.position, 3.5);
  const quote = pump ? quoteService(player.driving) : null;
  if (quote && quote.total > 0) {
    this.prompt = { action: 'fuel', label: 'SERVICE', detail: `$${quote.total}` };
    if (input.wasPressed('KeyE')) {
      input.consumePressed('KeyE');
      this.gasStation.service(player);
      return true;
    }
  }
}
```

Import `quoteService` from `./fuel.js`; add `gasStation: null` handling the same way as `parking` (the field may be assigned after construction).

- [ ] **Step 5: Draw the fuel gauge in `hud.js`**

Import `fuelPct` and `LOW_FUEL`. Inside `drawVehicleCard`, in the band right of the gear box (the gear box ends at x + 52, the speed numeral starts around x + 168):

```js
if (car) {
  const fuel = Math.max(0, Math.min(1, car.fuel ?? 1));
  const fuelColor = fuel >= 0.3 ? TEAL : fuel >= LOW_FUEL ? GOLD : CORAL;
  label(ctx, `${fuelPct(fuel)}% FUEL`, x + 66, y + 70, {
    size: 9.5, color: fuelColor, spacing: '0.6px', weight: 800,
  });
  ctx.fillStyle = 'rgba(247,232,210,0.1)';
  ctx.fillRect(x + 66, y + 76, 84, 5);
  ctx.fillStyle = fuelColor;
  ctx.fillRect(x + 66, y + 76, 84 * fuel, 5);
}
```

- [ ] **Step 6: Wire it in `main.js`**

1. After `this.interactions.parking = this.parking;` add:
   ```js
   this.gasStation = this.world.gasStation;
   if (this.gasStation) {
     this.gasStation.onToast = (toast) => {
       if (!this.hud.suppressToasts) this.hud.toast = toast;
     };
   }
   this.interactions.gasStation = this.gasStation;
   ```
2. `hudState()` → `vehicle` gains `fuel: driving.fuel`.
3. In the playing tick, after `this.player.update(dt, input);`:
   ```js
   const tank = this.player.driving;
   if (!tank) this.lowFuelWarned = false;
   else if (tank.fuel > 0.35) this.lowFuelWarned = false;
   else if (tank.fuel < LOW_FUEL && !this.lowFuelWarned) {
     this.lowFuelWarned = true;
     if (!this.hud.suppressToasts) this.hud.toast = { title: 'LOW FUEL', sub: 'FIND A SOLANO FUEL STATION', life: 3 };
   }
   ```
   Import `LOW_FUEL` from `./fuel.js`.
4. In `resetCityLife`, add `this.lowFuelWarned = false;`.
5. In `window.__neon`, add `get state() { return game.lastHudState; }` so the suite can read `neon.state.vehicle.fuel`.

- [ ] **Step 7: Run the suite**

Run: `node tools/test-npc-loot.mjs`
Expected: group 27 passes with all its checks; all earlier groups stay green.

- [ ] **Step 8: Commit**

```bash
git add game/src/gas-station.js game/src/interactions.js game/src/hud.js game/src/main.js tools/test-npc-loot.mjs
git commit -m "Let the player refuel and repair at the pumps"
```

---

### Task 4: NPC refuelling

**Files:**
- Modify: `game/src/gas-station.js` (divert state machine, shot-free)
- Modify: `game/src/traffic.js`
- Modify: `game/src/main.js` (traffic wiring, reset)
- Modify: `tools/test-npc-loot.mjs` (extend group 27)

**Interfaces:**
- Consumes: `traffic.spawnLaneCar(type, axis, direction, line, along, cruise, options)`, `traffic.cars`, `traffic.removeCar`, `traffic.rng`, `LANE_OFFSET = 3.2` from `traffic.js`.
- Produces: `traffic.gasStation`; `GasStation.maybeDivert(car, ai, dt) -> boolean`, `GasStation.owns(car) -> boolean`, `GasStation.updateCar(car, dt)`, `GasStation.releaseCar(car)`; `car.ai.mode` in `'pullin' | 'pump' | 'pullout'` while station-owned, `'drive'` otherwise; `car.ai.stationCooldown` seconds.

**Pinned path values (lane x = -81, northbound lane x = -84.2):**
- Divert window: `ai.mode === 'drive' && ai.axis === 'z' && ai.line === -81 && ai.direction === 1`, `car.fuel < 0.35`, `-26 < car.position.z < -14`, a free slot, and `ai.stationCooldown <= 0`; otherwise the car keeps driving and gets `ai.stationCooldown = 20` when flagged and in the window with no free slot.
- Approach waypoints, slot 0: `(-89, -19) → (-92, -15) → (-92, -11) → (-96.5, -11)`; slot 1 uses `z = 11` for the last two points.
- Pump phase: within 1.5 m of the slot and speed < 0.5 → `mode = 'pump'`, `slot.timer = rng.range(4, 6)`, brake 1; when the timer expires set `car.fuel = 1` and `mode = 'pullout'`.
- Pull-out waypoints, slot 0: `(-104, -11) → (-111, -11) → (-113, -3) → (-113, 11) → (-104, 16) → (-92, 17) → (-84.2, 18)`; slot 1: `(-104, 11) → (-111, 11) → (-113, 13) → (-107, 17) → (-92, 17.5) → (-84.2, 18)`. Cars continue forward, never reverse.
- On merge (within 2 m of the last point): `car.setPose(-84.2, 18, 0)`, `ai.mode = 'drive'`, release the slot.
- Waypoint following per frame: desired speed 5 m/s, 2.2 m/s inside 4 m of a waypoint; steer with `clamp(atan2(sin(err), cos(err)) * 2.4, -0.5, 0.5)`; throttle/brake with the same rules as `updateCars`; `ai.stuckTime` accrues below 0.4 m/s and the car is released and removed after 12 s.

- [ ] **Step 1: Extend the failing E2E group**

Append to group 27:

```js
const traffic = neon?.debug?.traffic;

// Isolate the station: no ambient car may take a pump.
traffic.carTarget = 0;
for (const other of [...traffic.cars]) traffic.removeCar(other);

// A flagged northbound car pulls in, pumps, and rejoins.
const flagged = traffic.spawnLaneCar('sedan', 'z', 1, -81, -30, 11, { fuel: 0.2 });
let pumpSlot = null;
for (let i = 0; i < 240 && !pumpSlot; i += 1) {
  neon.advance(0.1);
  pumpSlot = station.slots.find((entry) => entry.car === flagged && entry.phase === 'pump') ?? null;
}
check('test 27: a flagged car pulls in and stops at a pump',
  Boolean(pumpSlot) && flagged.position.x < -88,
  JSON.stringify({ mode: flagged.ai.mode, x: flagged.position.x, z: flagged.position.z }));
check('test 27: the pump wait is 4-6 seconds',
  Boolean(pumpSlot) && pumpSlot.timer >= 4 && pumpSlot.timer <= 6,
  JSON.stringify(pumpSlot ? { timer: pumpSlot.timer } : null));
neon.advance(3);
check('test 27: the car is still pumping after three seconds', flagged.ai.mode === 'pump');
neon.advance(8);
check('test 27: the pump fills the NPC tank and the car rejoins the lane',
  flagged.fuel === 1 && flagged.ai.mode === 'drive' && Math.abs(flagged.position.x + 84.2) < 1.5,
  JSON.stringify({ fuel: flagged.fuel, mode: flagged.ai.mode, x: flagged.position.x, z: flagged.position.z }));

// An unflagged car never stops.
const passing = traffic.spawnLaneCar('pickup', 'z', 1, -81, -30, 11, { fuel: 1 });
neon.advance(6);
check('test 27: an unflagged car passes the station',
  passing.ai.mode === 'drive' && passing.position.z > -6 && Math.abs(passing.position.x + 84.2) < 1.5,
  JSON.stringify({ mode: passing.ai.mode, x: passing.position.x, z: passing.position.z }));

// Fill both pumps, then a third flagged car must keep rolling.
const first = traffic.spawnLaneCar('sedan', 'z', 1, -81, -32, 11, { fuel: 0.2 });
const second = traffic.spawnLaneCar('muscle', 'z', 1, -81, -44, 12, { fuel: 0.2 });
for (let i = 0; i < 400; i += 1) {
  neon.advance(0.1);
  if (station.slots.every((slot) => slot.car)) break;
}
check('test 27: both pumps can be busy at once', station.slots.every((slot) => slot.car),
  JSON.stringify(station.slots.map((slot) => Boolean(slot.car))));
const queued = traffic.spawnLaneCar('pickup', 'z', 1, -81, -30, 11, { fuel: 0.2 });
let queuedPassed = false;
for (let i = 0; i < 120 && !queuedPassed; i += 1) {
  neon.advance(0.1);
  queuedPassed = queued.position.z > -8;
}
check('test 27: a flagged car with both pumps busy keeps driving',
  queuedPassed && !station.owns(queued),
  JSON.stringify({ mode: queued.ai.mode, z: queued.position.z }));

// 60 simulated seconds: both pumps free themselves, nothing parks at the entry.
let entryStall = 0;
let worstStall = 0;
const entryCars = [first, second, queued];
for (let i = 0; i < 120; i += 1) {
  neon.advance(0.5);
  let stalled = false;
  for (const car of entryCars) {
    const distance = Math.hypot(car.position.x + 84.2, car.position.z + 18);
    if (distance < 12 && Math.abs(car.speed) < 0.3) stalled = true;
  }
  entryStall = stalled ? entryStall + 0.5 : 0;
  worstStall = Math.max(worstStall, entryStall);
}
check('test 27: the service lane never deadlocks for 60 seconds',
  worstStall <= 8 && station.slots.every((slot) => slot.car === null),
  JSON.stringify({ worstStall, slots: station.slots.map((slot) => Boolean(slot.car)) }));

// Removing a pump car frees its slot for the next car.
const doomed = traffic.spawnLaneCar('sedan', 'z', 1, -81, -30, 11, { fuel: 0.2 });
let doomedSlot = null;
for (let i = 0; i < 240 && !doomedSlot; i += 1) {
  neon.advance(0.1);
  doomedSlot = station.slots.find((entry) => entry.car === doomed) ?? null;
}
traffic.removeCar(doomed);
check('test 27: removing a pump car frees its slot',
  Boolean(doomedSlot) && doomedSlot.car === null && doomedSlot.phase === 'free',
  JSON.stringify(doomedSlot ? { car: Boolean(doomedSlot.car), phase: doomedSlot.phase } : null));
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: `flagged.ai.mode` never becomes `'pump'`.

- [ ] **Step 3: Implement the station state machine**

In `gas-station.js`, add the slot reservation fields (initialised in Task 2) and:
- `owns(car)` — `['pullin', 'pump', 'pullout'].includes(car.ai?.mode)`.
- `maybeDivert(car, ai, dt)` — decrement `ai.stationCooldown` when positive; apply the divert window; pick `this.slots.find((s) => !s.car)`; assign `slot.car = car`, `slot.phase = 'pullin'`, `ai.mode = 'pullin'`, store `ai.station = { slot, waypoints: approachFor(slot), index: 0 }`; return true.
- `updateCar(car, dt)` — if `car.removed`, `releaseCar(car)` and return. Advance the waypoint index when within 2 m (1.5 m for the last), steer/accelerate toward the current point, and run the pump timer. On the last pullout point, `setPose` onto the lane, `ai.mode = 'drive'`, `delete ai.station`, `releaseCar`.
- `releaseCar(car)` — find the slot whose `car === car`; clear `slot.car`, `slot.phase = 'free'`, `slot.timer = 0`, `car.ai.station = null`.

- [ ] **Step 4: Hook `traffic.js`**

1. `spawnLaneCar`: add `mode: 'drive'` inside the `car.ai = { ... }` literal, and after `car.controls.brake = 0;` add `car.fuel = options.fuel ?? 1;`.
2. `spawnAmbientCar`: capture the spawned car and set `car.fuel = this.rng.chance(0.22) ? this.rng.range(0.1, 0.34) : 1;` before returning it.
3. In `updateCars`, after the `offGrid || blockedZone` removal check and before `const along = ...`:
   ```js
   if (this.gasStation) {
     if (this.gasStation.owns(car)) {
       this.gasStation.updateCar(car, dt);
       continue;
     }
     this.gasStation.maybeDivert(car, ai, dt);
   }
   ```
4. In `removeCar`, after `this.vehicles.remove(car);` add `this.gasStation?.releaseCar(car);`.

- [ ] **Step 5: Wire in `main.js`**

In the same block that adopts the station (Task 3, Step 6), add `this.traffic.gasStation = this.gasStation;` and, when the station exists, `this.gasStation.traffic = this.traffic; this.gasStation.vehicles = this.vehicles;` so the station can stage its shot and read the traffic RNG. In `resetCityLife`, add `this.gasStation?.reset();`.

- [ ] **Step 6: Run the suite**

Run: `node tools/test-npc-loot.mjs`
Expected: the NPC checks pass; all earlier groups stay green.

- [ ] **Step 7: Commit**

```bash
git add game/src/gas-station.js game/src/traffic.js game/src/main.js tools/test-npc-loot.mjs
git commit -m "Send low-fuel NPC cars through the station"
```

---

### Task 5: The station shot, gallery and docs

**Files:**
- Modify: `game/src/shots.js`
- Modify: `game/src/gas-station.js` (`stageShot`)
- Modify: `game/src/main.js` (apply the shot after the fixed steps)
- Modify: `tools/capture.mjs` (gallery still)
- Modify: `tools/test-npc-loot.mjs` (new group 28)
- Modify: `README.md`, `docs/guide/{driving,city,testing,building,source-map}.md`
- Create: `docs/media/station.jpg`

**Interfaces:**
- Consumes: `SHOTS`, `gasStation.stageShot`, `vehicles.spawn`, `traffic.spawnLaneCar`, `lanePoint`.
- Produces: `SHOTS.station`, `GasStation.stageShot(spec)`, `docs/media/station.jpg`.

- [ ] **Step 1: Write the failing E2E group**

Add group 28 after 27; `shot: 'station'`:

```js
{
  name: 'test 28: the station shot',
  shot: 'station',
  body: function stationShot() {
    const results = [];
    const check = (name, ok, detail = '') => {
      results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
    };
    const neon = window.__neon;
    const station = neon?.debug?.gasStation;
    const shots = neon?.shots;
    check('test 28: the station shot is registered',
      Boolean(shots?.station) && shots.station.mode === 'playing',
      JSON.stringify(shots?.station ?? null));
    check('test 28: a car is staged at a pump', Boolean(station?.slots?.[0]?.car)
      && station.slots[0].phase === 'pump' && station.slots[0].car.fuel < 0.35,
      JSON.stringify({ phase: station?.slots?.[0]?.phase, fuel: station?.slots?.[0]?.car?.fuel }));
    const approach = neon?.debug?.traffic?.cars.find((car) => car.ai?.stationApproach);
    check('test 28: a low-fuel car is staged on the approach', Boolean(approach) && approach.fuel < 0.35,
      JSON.stringify(approach ? { fuel: approach.fuel, z: approach.position.z } : null));
    check('test 28: the shot renders draw calls', (neon?.draws ?? 0) > 0, String(neon?.draws));
    return results;
  },
},
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/test-npc-loot.mjs`
Expected: the `?shot=station` page does not reach a staged shot.

- [ ] **Step 3: Add the shot and staging**

1. `shots.js`:
   ```js
   station: {
     name: 'station',
     mode: 'playing',
     time: 2.7,
     prewarm: 70,
     player: {
       x: -84, z: 2.4, facing: -Math.PI / 2, cameraYaw: Math.PI / 2,
       cameraPitch: 0.14, distance: 6.8,
     },
     objective: START_OBJECTIVE,
     toast: false,
     station: { pump: 0, approach: 'pickup' },
   },
   ```
2. `GasStation.stageShot({ pump = 0, approach = 'pickup' })`:
   - `this.reset()`;
   - spawn the pump car with `vehicles.spawn('sedan', { x: slot.x, z: slot.z, yaw: slot.yaw, fuel: 0.22 })`, `condition = 0.58`, driver `'ai'`, set `slot.car`, `slot.phase = 'pump'`, `slot.timer = 3`, `controls.brake = 1`, `ai = { mode: 'pump' }`;
   - spawn the approach car with `traffic.spawnLaneCar(approach, 'z', 1, -81, -16, 6, { fuel: 0.24 })`, set `car.ai.stationApproach = true` and `controls.brake = 0` so it reads as rolling in at the frame;
   - place both cars with `setPose` where needed so the frozen frame is exact.
3. In `main.js`, after the existing post-step staging (`if (shot.air) ...`, etc.) add:
   ```js
   if (shot.station) this.gasStation?.stageShot(shot.station);
   ```

- [ ] **Step 4: Capture the gallery still**

Add `{ shot: 'station', file: 'station.jpg', dir: 'docs/media', quality: 87 }` to the `GALLERY` array in `tools/capture.mjs`. Run `node tools/capture.mjs`; expect `station.jpg` at 1280×720, under 256 KiB, alongside the four screenshots.

- [ ] **Step 5: Measure draw calls**

Load `?shot=station` and read `window.__neon.draws`; run the capture twice and confirm the same value. Record the number in `docs/guide/testing.md` next to the other shot measurements. Do not set a target before measuring.

- [ ] **Step 6: Update the docs**

- `README.md`: a Solano Fuel feature line, `E · SERVICE` at a pump in the controls, the fuel gauge and the $8/10% + $150 repair rule, and the station gallery image.
- `docs/guide/driving.md`: a fuel section (drain rate, empty throttle, refuel/repair, prices).
- `docs/guide/city.md`: the forecourt, kiosk, service lane and the 22% divert.
- `docs/guide/testing.md`: groups 27 and 28, the new unit test, and the real total check count from the final run.
- `docs/guide/building.md`: `docs/media/station.jpg` in the gallery table and the `?shot=station` capture line.
- `docs/guide/source-map.md`: `fuel.js` and `gas-station.js` rows.

- [ ] **Step 7: Run every check**

```bash
node --test test/fuel.test.mjs
node --test test/loot.test.mjs
node --test test/radio.test.mjs
node tools/test-npc-loot.mjs
MAKEFUN_OUTPUT_DIR=out node main.ts --check
```

Expected: 3 fuel tests, 4 loot tests, 5 radio tests pass; the E2E prints `PASS: all checks passed` with zero `not ok`; `check PASS` for the entry caps.

- [ ] **Step 8: Commit**

```bash
git add game/src/shots.js game/src/gas-station.js game/src/main.js tools/capture.mjs tools/test-npc-loot.mjs README.md docs
git commit -m "Stage the station shot and document the fuel system"
```

---

## Execution Notes

- Tasks 1–4 add checks to groups 27's body; keep each addition in the group's own step style and re-run the full suite after every task.
- The final E2E count is whatever the run prints; update README/testing from the run, never from an estimate.
- Do not merge, push or deploy; the branch `gas-station` is handed back with its commits.
