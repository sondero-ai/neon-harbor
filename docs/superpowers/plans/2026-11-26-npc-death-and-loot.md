# NPC Death and Loot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bullets kill pedestrians, every human NPC death (pedestrian, mission enemy, police officer) drops one collectible loot item, and the city visibly reacts.

**Architecture:** `Traffic` gains its own hit test, health/death state, a fall pose inside the instanced crowd, and panic flee. `Pickups` gains a cash kind and one-shot dropped items. A pure `loot.js` module owns the roll. `main.js` wires the death callbacks. A dependency-free CDP test tool (`tools/test-npc-loot.mjs`, modeled on `tools/capture.mjs`) drives the frozen `?shot=` scenes through `window.__neon`.

**Tech Stack:** Plain ES modules, vendored three.js, Node 24 standard library. No dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-11-26-npc-death-and-loot-design.md`

## Global Constraints

- No new dependencies; the game stays static and works offline.
- `MAKEFUN_OUTPUT_DIR=out node main.ts --check` must print PASS after every task.
- The crowd is instanced; deaths must not add draw calls per pedestrian.
- Dossier text truncates at 160 KiB by design; that is not a failure.
- Docs, comments and commit messages are English; commit messages end with:
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- Work on branch `npc-loot` from `night-final`; nothing is pushed before Task 5.
- `?shot=` scenes are frozen (`shotLocked`); tests must call `traffic.update()` /
  `pickups.update()` explicitly and never depend on wall-clock time.

## Review Focus

- A pedestrian behind a wall must not be hit: `traceShot` receives the
  world-limited `maxDistance` in the fire path, and a shorter maxDistance
  misses (pinned in Task 2's test).
- A dead pedestrian must stop being targetable and stop walking; the corpse
  despawns after 8 s without errors (pinned in Task 2's test).
- The SMG crate must never drop before the SMG is owned (pinned in Task 1's
  unit tests).
- Loot must work on the pier and beach (ground height) and expire safely
  while the player walks toward it (pinned in Task 3's test).
- `window.__neon` is the only QA surface; do not read private game state any
  other way, and keep the debug handle read-compatible.

---

### Task 1: Loot table module and unit tests

**Files:**
- Create: `game/src/loot.js`
- Create: `test/loot.test.mjs`

**Interfaces:**
- Produces: `export function rollDrop(random = Math.random, { smgOwned = false, cashMin = 15, cashMax = 70 } = {})`
  returning `{ kind: 'cash' | 'pistol' | 'smg', amount: number }`.
  - Cash: `cashMin..cashMax` in steps of 5; defaults 15–70.
  - Pistol: amount 12 always.
  - SMG: amount 32 always, and only when `smgOwned === true`.
  - Weights: `smgOwned=false` → cash 60%, pistol 40%;
    `smgOwned=true` → cash 60%, pistol 30%, smg 10%.

- [x] **Step 1: Branch and write the failing tests**

```bash
git switch -c npc-loot
```

Create `test/loot.test.mjs` with `node:test` and `node:assert/strict`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollDrop } from '../game/src/loot.js';

const seq = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

test('pistol-only table: no smg outcome before the unlock', () => {
  assert.equal(rollDrop(seq(0), { smgOwned: false }).kind, 'cash');
  assert.equal(rollDrop(seq(0.59), { smgOwned: false }).kind, 'cash');
  assert.equal(rollDrop(seq(0.61), { smgOwned: false }).kind, 'pistol');
  assert.equal(rollDrop(seq(0.99), { smgOwned: false }).kind, 'pistol');
});

test('smg crate only after the unlock', () => {
  const locked = rollDrop(seq(0.95), { smgOwned: false });
  assert.deepEqual(locked, { kind: 'pistol', amount: 12 });
  assert.deepEqual(rollDrop(seq(0.95), { smgOwned: true }), { kind: 'smg', amount: 32 });
});

test('cash steps and bounds', () => {
  assert.deepEqual(rollDrop(seq(0, 0), { smgOwned: false }), { kind: 'cash', amount: 15 });
  const top = rollDrop(seq(0, 0.999), { smgOwned: false });
  assert.equal(top.kind, 'cash');
  assert.equal(top.amount, 70);
  for (let i = 0; i < 200; i += 1) {
    const drop = rollDrop(Math.random, { smgOwned: i % 2 === 0 });
    if (drop.kind !== 'cash') continue;
    assert.equal(drop.amount % 5, 0);
    assert.ok(drop.amount >= 15 && drop.amount <= 70);
  }
  const wide = rollDrop(seq(0, 0.999), { smgOwned: false, cashMin: 40, cashMax: 120 });
  assert.deepEqual(wide, { kind: 'cash', amount: 120 });
});

test('amounts are pinned', () => {
  assert.equal(rollDrop(seq(0.7), { smgOwned: true }).amount, 12);
  assert.equal(rollDrop(seq(0.95), { smgOwned: true }).amount, 32);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test test/loot.test.mjs`
Expected: FAIL — `Cannot find module .../game/src/loot.js`.

- [x] **Step 3: Implement `game/src/loot.js`**

```js
// The loot table for human NPC deaths. Pure on purpose: the unit tests pin the
// weights, the cash steps and the SMG gate without a browser.

const PISTOL_AMMO = 12;
const SMG_AMMO = 32;

export function rollDrop(random = Math.random, { smgOwned = false, cashMin = 15, cashMax = 70 } = {}) {
  const roll = random();
  if (roll < 0.6) {
    const steps = Math.max(1, Math.round((cashMax - cashMin) / 5));
    const amount = Math.min(cashMax, cashMin + Math.floor(random() * (steps + 1)) * 5);
    return { kind: 'cash', amount };
  }
  if (smgOwned && roll >= 0.9) return { kind: 'smg', amount: SMG_AMMO };
  return { kind: 'pistol', amount: PISTOL_AMMO };
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test test/loot.test.mjs`
Expected: PASS, 4 tests.

- [x] **Step 5: Syntax check and commit**

```bash
node --check game/src/loot.js
git add game/src/loot.js test/loot.test.mjs
git commit -m "Add the pure human-NPC loot table"
```

---

### Task 2: Pedestrians — hitboxes, damage, death, fall, panic, QA hooks

**Files:**
- Modify: `game/src/traffic.js` (`spawnPed`, `updatePeds`, `Crowd.write`; new `traceShot`, `applyPlayerHit`)
- Modify: `game/src/main.js` (`player.traffic`, `__neon` getters and `debug`)
- Create: `tools/test-npc-loot.mjs`

**Interfaces:**
- Produces:
  - `Traffic.prototype.traceShot(origin, direction, maxDistance)` →
    `{ type: 'ped', ped, headshot, distance, point } | null`
  - `Traffic.prototype.applyPlayerHit(target, damage)` → void
  - Ped fields on spawn: `health: 55`, `dead: false`, `deadTimer: 0`,
    `fall: 0`, `fleeTimer: 0`, `fleeFromX: 0`, `fleeFromZ: 0`
  - `Traffic.prototype.onPedDeath` (null by default) called as `onPedDeath(ped)`
  - `window.__neon.pedestrians` → `{ active, alive, dead, fleeing, near: [{ x, z, health, dead }] }`
    (`near` = within 40 m of the player, at most 10 entries)
  - `window.__neon.view` → `{ cameraYaw, cameraPitch }`
  - `window.__neon.debug` → `{ traffic, player, camera }`

- [x] **Step 1: Write the failing E2E test**

Create `tools/test-npc-loot.mjs` by copying the server + Chrome + CDP plumbing
from `tools/capture.mjs` (static server, `chromePath()`, `freePort()`,
`waitForChrome()`, WebSocket `Runtime.evaluate`), then run test 1:

1. Load `/?shot=street` at 1280x720, wait for `window.__neon`.
2. Evaluate: spawn a pedestrian 3 m in front of the player:

```js
const player = __neon.debug.player;
const ped = __neon.debug.traffic.spawnPed({
  x: player.position.x - Math.sin(player.cameraYaw) * 3,
  z: player.position.z - Math.cos(player.cameraYaw) * 3,
});
```

3. Assert `ped` exists and `__neon.pedestrians.alive` includes it.
4. Compute the chest point (`ped.y + 1.12 * ped.scale`) and the direction from
   `__neon.debug.camera.position`; assert `traffic.traceShot(camera.position, direction, 100).ped === ped`.
5. Assert a bounded ray misses: same ray with `maxDistance = distance - 1` → `null`.
6. Call `traffic.applyPlayerHit(hit, 34)` twice; assert `ped.dead === true`
   and `__neon.pedestrians.alive` dropped by one.
7. Assert the corpse is not targetable: the same trace now returns `null`.
8. Before the kill, spawn a bystander 2 m from the victim. After the kill,
   call `traffic.update(0.5, 0)`; assert `ped.fall > 0` and
   `__neon.pedestrians.fleeing >= 1`.
9. Call `traffic.update(9, 0)`; assert the ped is no longer active.

`applyPlayerHit` must accept the trace result directly; the test passes the
object returned in step 4.

- [x] **Step 2: Run the tool to verify it fails**

Run: `node tools/test-npc-loot.mjs`
Expected: FAIL — `window.__neon.pedestrians` is undefined and
`traffic.traceShot` is not a function.

- [x] **Step 3: Add the ped fields in `spawnPed`**

In the object literal, after `motion: 0.6`, add:

```js
health: 55,
dead: false,
deadTimer: 0,
fall: 0,
fleeTimer: 0,
fleeFromX: 0,
fleeFromZ: 0,
```

- [x] **Step 4: Implement `traceShot` and `applyPlayerHit` in `Traffic`**

Add a module-local `raySphere` helper (same math as `police.js`), then:

```js
traceShot(origin, direction, maxDistance) { /* chest 0.42 at y+1.12*scale,
  head 0.22 at y+1.55*scale; nearest active, not dead; point = origin + direction*distance */ }

applyPlayerHit(target, damage) {
  const ped = target?.ped;
  if (!ped || !ped.active || ped.dead) return;
  ped.health -= damage * (target.headshot ? 1.75 : 1);
  if (this.player) {
    this.player.hitMarker = 1;
    if (this.player.effects) this.player.effects.impact(target.point, null, 'metal');
    if (this.player.audio) this.player.audio.impact(0.9);
  }
  if (ped.health > 0) return;
  ped.dead = true;
  ped.deadTimer = 8;
  ped.health = 0;
  for (const other of this.peds) {
    if (other === ped || !other.active || other.dead) continue;
    if (Math.hypot(other.x - ped.x, other.z - ped.z) < 9) {
      other.fleeTimer = 4;
      other.fleeFromX = ped.x;
      other.fleeFromZ = ped.z;
    }
  }
  this.onPedDeath?.(ped);
}
```

- [x] **Step 5: Handle dead and fleeing pedestrians in `updatePeds`**

At the top of the per-ped loop, after `if (!ped.active) continue;`:

```js
if (ped.dead) {
  ped.deadTimer -= dt;
  ped.fall = Math.min(1, ped.fall + dt / 0.45);
  ped.motion = 0;
  if (ped.deadTimer <= 0) this.despawnPed(ped);
  continue;
}
if (ped.fleeTimer > 0) {
  ped.fleeTimer -= dt;
  const dx = ped.x - ped.fleeFromX;
  const dz = ped.z - ped.fleeFromZ;
  const distance = Math.hypot(dx, dz) || 1;
  ped.target = { x: ped.x + (dx / distance) * 12, z: ped.z + (dz / distance) * 12 };
  const moving = this.walkToward(ped, ped.speed * 1.6, dt);
  ped.phase += dt * 7;
  ped.motion = damp(ped.motion, 1, 8, dt);
  ped.y = damp(ped.y, this.world.groundHeightAt(ped.x, ped.z), 15, dt);
  if (ped.fleeTimer <= 0) this.setNextCorner(ped);
  continue;
}
```

- [x] **Step 6: Add the fall pose to `Crowd.write`**

After `const scale = ped.scale;`:

```js
const fall = ped.fall ?? 0;
this._euler.set(-fall * 1.45, ped.yaw, 0);
this._quaternion.setFromEuler(this._euler);
this._position.set(ped.x, ped.y + 0.12 * fall, ped.z);
```

(The rest of `write` already composes from `this._base`.)

- [x] **Step 7: Wire and expose the QA hooks in `main.js`**

After `this.traffic = new Traffic(...)`:

```js
this.player.traffic = this.traffic;
```

In the `window.__neon` object add:

```js
get pedestrians() {
  const peds = game.traffic.peds.filter((ped) => ped.active);
  return {
    active: peds.length,
    alive: peds.filter((ped) => !ped.dead).length,
    dead: peds.filter((ped) => ped.dead).length,
    fleeing: peds.filter((ped) => ped.fleeTimer > 0).length,
    near: peds
      .map((ped) => ({ ped, d: Math.hypot(ped.x - game.player.position.x, ped.z - game.player.position.z) }))
      .filter(({ d }) => d < 40)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map(({ ped }) => ({ x: Math.round(ped.x * 10) / 10, z: Math.round(ped.z * 10) / 10, health: ped.health, dead: ped.dead })),
  };
},
get view() {
  return { cameraYaw: game.player.cameraYaw, cameraPitch: game.player.cameraPitch };
},
debug: {
  traffic: game.traffic,
  player: game.player,
  camera: game.camera,
},
```

- [x] **Step 8: Run the tool to verify it passes**

Run: `node tools/test-npc-loot.mjs`
Expected: every assertion prints `ok`, exit code 0.

- [x] **Step 9: Syntax check, entry check, commit**

```bash
node --check game/src/traffic.js
node --check game/src/main.js
MAKEFUN_OUTPUT_DIR=out node main.ts --check
git add game/src/traffic.js game/src/main.js tools/test-npc-loot.mjs
git commit -m "Let bullets kill pedestrians and the crowd react"
```

---

### Task 3: Pickups — cash kind, one-shot drops, expiry, amount-aware collect

**Files:**
- Modify: `game/src/pickups.js`
- Modify: `game/src/main.js` (`__neon.loot`, `__neon.combat.cash`, `debug.pickups`)
- Modify: `tools/test-npc-loot.mjs`

**Interfaces:**
- Produces:
  - `Pickups.prototype.spawnDrop({ x, z, kind, amount, label, expire = 30 })` → item
    (one-shot: no respawn, removed at expiry)
  - `Pickups.prototype.spawnDeathLoot(x, z, { smgOwned = false, cashMin, cashMax } = {})`
  - `window.__neon.loot` → `{ count, items: [{ kind, amount, x, z }] }` for live one-shot drops
  - `window.__neon.combat.cash`
- Consumes: `rollDrop` (Task 1), `__neon.combat` (existing getter).

- [x] **Step 1: Extend the tool with the failing pickup test**

Add test 2 to `tools/test-npc-loot.mjs` (same `?shot=street` page):

1. `const p = __neon.debug.player; const pk = __neon.debug.pickups;`
2. `pk.spawnDrop({ x: p.position.x, z: p.position.z, kind: 'cash', amount: 40 });`
3. `pk.update(0.016, p);` → `__neon.combat.cash` rose by 40 and `__neon.loot.count` is 0.
4. `pk.spawnDrop({ x: p.position.x, z: p.position.z, kind: 'pistol', amount: 12 });`
   `pk.update(0.016, p);` → pistol reserve rose by 12.
5. `pk.spawnDrop({ x: p.position.x + 40, z: p.position.z, kind: 'cash', amount: 25, expire: 30 });`
   `pk.update(31, p);` → `__neon.loot.count` is 0 with `p` still 40 m away.
6. `for (let i = 0; i < 20; i += 1) pk.spawnDeathLoot(p.position.x + 30 + i, p.position.z, { smgOwned: false });`
   → no item has `kind === 'smg'`.
7. `pk.spawnDrop({ x: -210, z: 20, kind: 'cash', amount: 25 });` → the new item's
   `y` equals `__neon.debug.world.groundHeightAt(-210, 20)` (pier test).

- [x] **Step 2: Run the tool to verify it fails**

Run: `node tools/test-npc-loot.mjs`
Expected: FAIL — `pk.spawnDrop` is not a function.

- [x] **Step 3: Add the cash colour and icon**

In `COLORS` add `cash: 0xffc95c`. In `buildIcon`, before the weapon branch, add:

```js
if (kind === 'cash') {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.16), materials.gold);
    bill.position.set(0, i * 0.05, 0);
    bill.rotation.y = (i - 1) * 0.18;
    group.add(bill);
  }
  return group;
}
```

- [x] **Step 4: Extend `addItem` and `update` for one-shot drops**

In `addItem`, the pushed item gains:

```js
oneShot: spec.oneShot === true,
expire: spec.expire ?? 0,
age: 0,
amount: spec.amount,
```

In `update`, before the collected branch:

```js
if (item.oneShot) {
  item.age += dt;
  if (item.expire > 0 && item.age >= item.expire) {
    item.group.removeFromParent();
    item.removed = true;
    continue;
  }
}
```

`removed` items are filtered out of the `__neon.loot` getter and skipped
everywhere (`if (item.removed) continue;` at the top of the loop). In
`collect`, one-shot items must not schedule a respawn
(`item.respawn = item.oneShot ? 0 : RESPAWN;`), and the collected branch of
`update` must `continue` for one-shot items so they never come back.

- [x] **Step 5: Make `collect` amount-aware**

Replace the smg/pistol branches and add cash:

```js
} else if (item.kind === 'cash') {
  player.cash += item.amount ?? 0;
  message = `CASH · +$${item.amount ?? 0}`;
} else if (item.kind === 'smg') {
  const first = !player.weapons.smg.owned;
  player.grantWeapon('smg', item.amount ?? 96);
  message = first ? 'KESTREL SMG · 32 / 96' : `KESTREL SMG · +${item.amount ?? 32} AMMO`;
} else if (item.kind === 'pistol') {
  player.grantWeapon('pistol', item.amount ?? 48);
  message = `SOLANO 9 · AMMO +${item.amount ?? 48}`;
}
```

- [x] **Step 6: Add `spawnDrop` and `spawnDeathLoot`**

```js
spawnDrop(spec) {
  this.addItem({ ...spec, oneShot: true, expire: spec.expire ?? 30 });
}

spawnDeathLoot(x, z, { smgOwned = false, cashMin = 15, cashMax = 70 } = {}) {
  const drop = rollDrop(Math.random, { smgOwned, cashMin, cashMax });
  const label = drop.kind === 'cash' ? 'CASH' : drop.kind === 'smg' ? 'KESTREL SMG' : 'SOLANO 9';
  this.spawnDrop({ x, z, ...drop, label });
}
```

Import `rollDrop` from `./loot.js`.

- [x] **Step 7: Expose the loot and cash state in `main.js`**

Add to `__neon`:

```js
get loot() {
  const items = game.pickups.items.filter((item) => item.oneShot && !item.collected && !item.removed);
  return {
    count: items.length,
    items: items.map((item) => ({ kind: item.kind, amount: item.amount, x: item.x, z: item.z })),
  };
},
```

Add `cash: game.player.cash` to `get combat()`, and `pickups: game.pickups`,
`world: game.world` to `debug`.

- [x] **Step 8: Run the tool to verify it passes**

Run: `node tools/test-npc-loot.mjs`
Expected: PASS, exit code 0.

- [x] **Step 9: Syntax check, entry check, commit**

```bash
node --check game/src/pickups.js
node --check game/src/main.js
MAKEFUN_OUTPUT_DIR=out node main.ts --check
git add game/src/pickups.js game/src/main.js tools/test-npc-loot.mjs
git commit -m "Let human NPC deaths drop cash and ammunition"
```

---

### Task 4: Wire deaths and the real fire path

**Files:**
- Modify: `game/src/player.js` (`fireWeapon` target selection)
- Modify: `game/src/police.js` (officer death callback)
- Modify: `game/src/missions.js` (`killEnemy` callback)
- Modify: `game/src/main.js` (callbacks and refs)
- Modify: `tools/test-npc-loot.mjs`

**Interfaces:**
- Consumes: `traffic.traceShot`, `traffic.applyPlayerHit` (Task 2);
  `pickups.spawnDeathLoot` (Task 3).
- Produces:
  - `player.traffic` (set in main)
  - `Police.prototype.onHumanDeath(x, z, opts)` — null by default
  - `Missions.prototype.onHumanDeath(x, z, opts)` — null by default
  - `Traffic.prototype.onPedDeath(ped)` — null by default

- [x] **Step 1: Extend the tool with the failing fire-path and officer tests**

Test 3 (on `?shot=street`):

1. Spawn a pedestrian 3 m along the current aim direction
   (`x = p.position.x - Math.sin(p.cameraYaw) * 3`, same for `z` with cos).
2. Set `p.cameraYaw = Math.atan2(-(ped.x - p.position.x), -(ped.z - p.position.z))`,
   `p.cameraPitch = -0.27`, `p.fireCooldown = 0`, then call
   `p.updateView(__neon.debug.camera, 1 / 60, true)` so the frozen shot's
   camera matches the new aim.
3. Call `p.fireWeapon(__neon.debug.camera)`.
4. Assert the ped's `health` dropped or it is dead; set `p.fireCooldown = 0`
   and call it again; assert `ped.dead === true` and `__neon.loot.count >= 1`.

Test 4 (reload `?shot=blockade`):

1. `const officer = __neon.debug.police.officers.find((o) => !o.dead);`
2. `__neon.debug.police.applyPlayerHit({ officer, headshot: false }, 500);`
3. Assert `officer.dead === true` and `__neon.loot.count` rose.

- [x] **Step 2: Run the tool to verify it fails**

Run: `node tools/test-npc-loot.mjs`
Expected: FAIL — the ped survives `fireWeapon`, and no loot appears after the
officer death.

- [x] **Step 3: Include pedestrians in `fireWeapon`**

In `Player`'s constructor add `this.traffic = null;`. In `fireWeapon`:

```js
const policeTarget = this.police ? this.police.traceShot(origin, direction, maxDistance) : null;
const missionTarget = this.missions ? this.missions.traceShot(origin, direction, maxDistance) : null;
const pedTarget = this.traffic ? this.traffic.traceShot(origin, direction, maxDistance) : null;
let target = policeTarget;
if (missionTarget && (!target || missionTarget.distance < target.distance)) target = missionTarget;
if (pedTarget && (!target || pedTarget.distance < target.distance)) target = pedTarget;
```

In the target branch, after the police/mission hit handling:

```js
} else if (target.type === 'ped' && this.traffic) {
  this.traffic.applyPlayerHit(target, spec.damage);
}
```

`maxDistance` is already `worldHit.distance` (world-limited), so a ped behind a
wall is not hit.

- [x] **Step 4: Call the human-death hook from police and missions**

`police.js`: in the constructor add `this.onHumanDeath = null;`. In the
`officer.health <= 0` branch, after `this.addWanted(2, 'Officer Down');`:

```js
this.onHumanDeath?.(officer.x, officer.z);
```

`missions.js`: in the constructor add `this.onHumanDeath = null;`. In
`killEnemy`, after `enemy.dead = true; ...`:

```js
this.onHumanDeath?.(enemy.x, enemy.z, enemy.boss ? { cashMin: 150, cashMax: 150 } : { cashMin: 40, cashMax: 120 });
```

- [x] **Step 5: Wire the callbacks in `main.js`**

After `this.pickups = new Pickups(...)` and after the traffic assignment:

```js
const lootFrom = (x, z, opts = {}) => this.pickups.spawnDeathLoot(x, z, {
  ...opts,
  smgOwned: this.player.weapons.smg.owned,
});
this.traffic.onPedDeath = (ped) => lootFrom(ped.x, ped.z);
this.police.onHumanDeath = lootFrom;
this.missions.onHumanDeath = lootFrom;
```

Also add `police: game.police, missions: game.missions` to `__neon.debug` so
test 4 can reach the officer list.

- [x] **Step 6: Run the tool to verify it passes**

Run: `node tools/test-npc-loot.mjs`
Expected: PASS, exit code 0, all four tests.

- [x] **Step 7: Syntax check, entry check, commit**

```bash
node --check game/src/player.js
node --check game/src/police.js
node --check game/src/missions.js
node --check game/src/main.js
MAKEFUN_OUTPUT_DIR=out node main.ts --check
git add game/src/player.js game/src/police.js game/src/missions.js game/src/main.js tools/test-npc-loot.mjs
git commit -m "Let every human NPC death feed the loot table"
```

---

### Task 5: Documentation, deploy, and live verification

**Files:**
- Modify: `README.md` (intro feature list, "Heat and combat", "Testing", "Source map")
- Modify: `D:\Proyek Penting\Airdrop Farm\AGENTS.md` (game feature baseline + docs standard)
- Deploy: merge `npc-loot` into `night-final`, rebuild `gh-pages`

- [x] **Step 1: Update the README**

- Opening description: add one line that bullets can drop pedestrians and that
  every human NPC death leaves cash or ammo.
- "Heat and combat": document pedestrian hitboxes, health 55, headshots ×1.75,
  the fall and 8 s corpse, panic flee, and the loot table with the SMG gate
  (cash 60%, pistol ammo 30%, SMG ammo crate 10% only after the SMG unlock).
- Add a "Testing" subsection (after "Build the entry") with:
  `node --test test/loot.test.mjs` and `node tools/test-npc-loot.mjs`,
  plus what each covers.
- "Source map": add `game/src/loot.js` and `tools/test-npc-loot.mjs`.

- [x] **Step 2: Update the project `AGENTS.md`**

Add a "Game feature baseline" section (for future entries) listing the systems
a new game should ship from day one: layered HUD, combat with hitboxes/health/
death/loot, reactive crowd, pickups and economy, deterministic screenshot
shots, a `window.__neon` QA surface, and a dependency-free E2E tool. Add a
"Documentation standard" line: README feature sections, design doc in
`docs/superpowers/specs/`, plan in `docs/superpowers/plans/`, test commands in
the README. Keep the file under 200 lines.

- [x] **Step 3: Run the full local verification**

```bash
node --test test/loot.test.mjs
node tools/test-npc-loot.mjs
MAKEFUN_OUTPUT_DIR=out node main.ts --check
```

Expected: tests PASS; E2E prints all `ok`; check PASS.

- [x] **Step 4: Commit the documentation**

```bash
git add README.md docs/
git commit -m "Document NPC death, loot, and the game test tools"
```

- [x] **Step 5: Merge and deploy**

```bash
git switch night-final
git merge --ff-only npc-loot
git push origin night-final
# rebuild gh-pages from the merged tree in a scratch worktree
git worktree add "$TEMP/neon-harbor-ghp3" gh-pages
cd "$TEMP/neon-harbor-ghp3"
git rm -rf .
cp -r "D:/Proyek Penting/neon-harbor/game/." .
touch .nojekyll
git add -A
git commit -m "Publish NPC death and loot"
git push origin gh-pages
```

Wait for the Pages build (`GET /repos/sondero-ai/neon-harbor/pages/builds`
until `built`). The Actions workflow will also trigger and fail with the
known billing lock; that is expected and does not block the legacy Pages
build.

- [x] **Step 6: Verify the live site**

- `curl -s https://sondero-ai.github.io/neon-harbor/src/loot.js` shows the
  module.
- Playwright on `https://sondero-ai.github.io/neon-harbor/?shot=street`:
  `window.__neon.debug.traffic.traceShot` exists and the E2E steps from
  Task 4 pass against the live URL.
- Take one screenshot of a dead pedestrian with its loot ring.

- [x] **Step 7: Update the hosting memory**

Update `~/.claude/projects/.../memory/neon-harbor-hosting.md` with the new
commit, the NPC/loot feature and the new test commands.
