# Refactor Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the nine overlong modules into one-responsibility files without changing behavior, verified by the existing 379-check E2E suite, so future feature work has smaller, safer files.

**Architecture:** Mechanical extraction only. Pure data and rendering/geometry builders move first; simulation code and orchestration move last. `game/src/world.js`, `hud.js`, `traffic.js`, `player.js` and `vehicles.js` are classes, so their private builders move to modules as functions that take the instance (`buildBlock(world, ...)`) while the public methods stay as thin wrappers; the test harness moves group entries verbatim into imported modules. No behavior, balance, save-shape, API or draw-order change.

**Tech Stack:** Static ES modules, vendored three.js r180, Node v24.14.1, no build step or dependencies. E2E: `tools/test-npc-loot.mjs` over frozen `?shot=` pages.

**Spec:** This is structural work; behavior is specified by the shipped game and the design doc's section 12 (`docs/superpowers/specs/2026-11-26-mall-district-design.md`). The refactor is the wave the operator approved on 2026-11-27 after the mall and gas-station waves.

## Rollback Anchor

- Annotated tag **`pre-refactor`** at `cfa3bf9` is pushed to `origin`. It is the last build with the live gas station and 379 green checks.
- One branch per stage (`refactor/<stage>`), fast-forward merge to `main` only after the stage's checks and review. Never force-push `main`, never rewrite pushed history.
- Whole-wave revert **before** merging: `git switch main && git reset --hard pre-refactor` locally (do not push the reset).
- Whole-wave revert **after** a stage is pushed: restore the tree in a new commit, never a force-push:
  ```bash
  git switch main
  git restore --source=pre-refactor -- .
  git commit -m "Revert the refactor wave to pre-refactor"
  ```
- Live-site revert: redeploy `gh-pages` from the tag (`git worktree add <dir> pre-refactor`, copy `game/.`, commit, push) — the last live publish before the wave is `7adf5db`.
- Do **not** deploy during the wave. The live site stays on `7adf5db`; deploy once at the end after the final green run and live check. One bad stage is then never user-facing.
- If a stage fails review twice, delete its branch and continue from the last merged stage; the wave can stop at any stage boundary.

## Global Constraints

- **No behavior change.** No feature, balance, bug fix or naming change in a refactor commit. A bug found while moving is recorded as a TODO and fixed later on its own branch, unless it blocks the move.
- Baseline: **3 fuel + 4 loot + 5 radio unit tests, 379 E2E `ok` lines, `main.ts --check` PASS**, tag `pre-refactor`.
- After every stage: `node --test test/fuel.test.mjs`, `node --test test/loot.test.mjs`, `node --test test/radio.test.mjs`, `node tools/test-npc-loot.mjs` (379 ok, exit 0), `MAKEFUN_OUTPUT_DIR=out node main.ts --check` (PASS).
- After stages that touch world or HUD rendering: `node tools/capture.mjs` must report the same draw calls as the baseline — **400** chase, **395** roadblock, **215** mall, **350** title, **406** heist, **251** station — and 4 screenshots + 2 gallery stills under 256 KiB. A changed count means a merge/order change; stop and fix before merging.
- Files move verbatim where possible; import paths and `this` receivers are the only edits. Keep public method names and signatures unchanged.
- One module per commit inside a stage; run the full verification after every commit, not only at the end.
- The code-review skill reviews each stage's diff before merge. Findings are fixed inside the stage.
- English code, comments, docs and commit messages; commit trailer `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- No new dependencies, no build step, no `package.json`.

## Review Focus

1. **A moved function that used `this` now runs with the wrong receiver** — the E2E suite fails; every extracted function takes the instance as its first parameter and calls `instance.member`, never a bare `this`.
2. **A dropped or duplicated test group** — the E2E `ok` count must stay exactly 379; the runner prints one line per check.
3. **An import cycle introduced by a split** (e.g. `world/city.js` importing `world.js` for a helper) — the page fails to load; keep helpers in leaf modules and import only downward.
4. **A changed draw order or merged-mesh order** that alters a screenshot or draw call — the capture numbers must match exactly.
5. **A public API renamed while moving** (`world.collides`, `player.enterVehicle`, `traffic.spawnPed`, `hud.update`, `mission.stageShot`) — tests, main and debug hooks break; keep every public signature.

---

## Module Map (target)

| Current | Target | Notes |
| --- | --- | --- |
| `tools/test-npc-loot.mjs` 3821 | runner ~450 + `tools/e2e/groups/*.mjs` 7 files | groups 1–28, four per file |
| `game/src/world.js` 3071 | `world.js` + `world/shared.js`, `sky.js`, `ground.js`, `city.js`, `landmarks.js`, `pier.js`, `props.js`, `query.js` | builders become `fn(world, ...)` |
| `game/src/hud.js` 2278 | `hud.js` + `hud/panels.js` (mission/vitals/state/objective/crew/police/weapon), `hud/cards.js` (vehicle/radio/toast/dialogue/reward/failure/ending), `hud/minimap.js`, `hud/prompts.js` (crosshair/damage/down/wheel/prompt), `hud/draw-utils.js` | draw fns take `(ctx, state, helpers)` |
| `game/src/main.js` 1739 | `main.js` + `main-menu.js` (screens/pause/quality), `main-radio.js` (controls/wheel), `main-hud-state.js` (hudState/respect/crew), `main-shots.js` (applyShot/staging) | optional final stage |
| `game/src/police.js` 1710 | `police.js` + `police-units.js` (cruiser + officer classes), `police-air.js` (Air unit) | units move whole |
| `game/src/missions.js` 1505 | `missions.js` + `missions-data.js` (STORY + heist arrays), `missions-actor.js` (enemy class + materials), `missions-shots.js` (staged shots/drama) | data first, shots last |
| `game/src/traffic.js` 1261 | `traffic.js` + `traffic-crowd.js` (Crowd renderer), `traffic-peds.js` (pedestrian methods), `traffic-cars.js` (lane car methods) | peds/cars as `fn(traffic, ...)` |
| `game/src/player.js` 1203 | `player.js` + `player-controls.js` (move/vehicle/camera), `player-combat.js` (weapons/combat) | keep `Player` public API |
| `game/src/vehicles.js` 1145 | `vehicles.js` + `vehicle-geometry.js` (builders/textures), `vehicle-fleet.js` (Vehicles class) | `Vehicle` physics stays |

Files left alone: `audio`, `geo`, `effects`, `parking`, `activities`, `config`, `mall`, `gas-station`, `shots`, `save`, `input`, `interactions`, `environment`, `traffic-signals`, `humanoid`, `pickups`, `radio`, `mall-life`, `robbery`, `fuel`, `world-kit` — cohesive and under ~650 lines.

---

### Stage 1: Split the E2E harness (`refactor/test-harness`)

**Files:**
- Create: `tools/e2e/groups/01-movement.mjs`, `02-combat.mjs`, `03-crowd.mjs`, `04-vehicles.mjs`, `05-world.mjs`, `06-city-life.mjs`, `07-mall-station.mjs`
- Modify: `tools/test-npc-loot.mjs` — keep the server, CDP client, runner, reporting and boot; replace the inline `TESTS` array with imports.

**Interfaces:**
- Produces: each group file exports `export const groups = [ ...entries... ]`; the runner builds `const TESTS = [...groups01, ...]`.
- Group entries keep the exact `{ name, shot, body }` shape; the bodies move verbatim.

- [ ] **Step 1: Record the baseline counts and group order**

```bash
cd "D:/Proyek Penting/neon-harbor"
grep -c "^    name: 'test " tools/test-npc-loot.mjs   # 28 groups
node tools/test-npc-loot.mjs > /tmp/e2e-baseline.log; echo $?; grep -c '^ok - ' /tmp/e2e-baseline.log
```
Expected: 28, exit 0, 379 ok.

- [ ] **Step 2: Cut the array at group boundaries**

The inline `const TESTS = [` starts after the harness helpers and ends at `];` before `async function main()`. Cut each `{ name: 'test ...', ... },` block verbatim into the seven group files, four per file in order 1–28. Move the whole block, including its `body: function name() { ... }`; do not rewrite a body, rename a check or change an indent inside it.

- [ ] **Step 3: Wire the runner**

At the top of `tools/test-npc-loot.mjs`:
```js
import { groups as g01 } from './e2e/groups/01-movement.mjs';
// ... through g07
const TESTS = [...g01, ...g02, ...g03, ...g04, ...g05, ...g06, ...g07];
```
Delete the inline array. Keep every other runner line unchanged.

- [ ] **Step 4: Verify**

```bash
node --test test/fuel.test.mjs && node --test test/loot.test.mjs && node --test test/radio.test.mjs
node tools/test-npc-loot.mjs > /tmp/e2e-stage1.log; echo $?
grep -c '^ok - ' /tmp/e2e-stage1.log; grep -c '^not ok - ' /tmp/e2e-stage1.log
diff <(grep -o "test [0-9]*:" /tmp/e2e-baseline.log | sort -u) <(grep -o "test [0-9]*:" /tmp/e2e-stage1.log | sort -u)
```
Expected: units pass; exit 0; **379** ok; 0 not ok; the diff is empty (same 28 group prefixes). Then `MAKEFUN_OUTPUT_DIR=out node main.ts --check` PASS.

- [ ] **Step 5: Review, commit, merge**

Run the code-review skill on the branch diff. Fix findings inside the stage. Commit, then:
```bash
git switch main && git merge --ff-only refactor/test-harness
```
Expected: main still at 379 ok; the runner is roughly 400–600 lines and each group file roughly 400–600.

### Stage 2: Split `world.js` (`refactor/world-modules`)

**Files:** create `game/src/world/shared.js`, `sky.js`, `ground.js`, `city.js`, `landmarks.js`, `pier.js`, `props.js`, `query.js`; modify `game/src/world.js`.

`shared.js` is an accepted extra: it holds the constants and helpers used by two or more world modules (`ROAD_HALF`, `BLOCK_HALF`, `DECK`, `WATER_Y`, `SUN_DIR`, `UP`, `CORE_SET`, `clamp`, `lerp`, `districtForBlock`, `segmentHit`) so no module imports `world.js` or duplicates them.

**Pattern (pinned):**
- Every builder becomes `export function buildX(world, ...args) { ... }` and replaces `this.` with `world.`.
- `World` keeps the public methods (`collides`, `resolveCircle`, `groundHeightAt`, `raycast`, `lineBlocked`, `clipCamera`, `vehicleBlocked`, `onBlock`, `onPierDeck`, `onRamp`, `focusAt`, `setObjectiveMarker`, `applyEnvironment`, `update`) as thin wrappers over the query/sky modules; constructor calls only the module builders.
- Modules import only leaf helpers (`geom.js`, `world-kit.js`, `random.js`, `config.js`, `world-kit`), never `world.js`.

- [ ] **Step 1: Extract the leaf modules first** — `world/query.js` (pure collision/height/ray functions) and `world/sky.js` (sky textures, lights, environment), because other builders call `world.groundHeightAt`/`collides` only through the instance.
- [ ] **Step 2: Extract the builders in this order** — `ground.js` (ground, markings, beach, ocean), `city.js` (city/blocks/towers/storefronts/roofs/market), `landmarks.js` (hotel, casa, motor row, radio block, plaza), `pier.js` (pier, lighthouse, boats), `props.js` (beach dressing, vegetation, streetlights, pools, signs, billboards). Clouds live with the sky pass in `sky.js`.
- [ ] **Step 3: Run the full verification after each extraction; the E2E suite loads the world in every group.**

```bash
node tools/test-npc-loot.mjs > /tmp/e2e-world-N.log; echo $?; grep -c '^ok - ' /tmp/e2e-world-N.log
node tools/capture.mjs
```
Expected: 379 ok, exit 0; draw calls exactly **400/395/215/350/406/251**; media sizes under cap.

- [ ] **Step 4: Review, commit per module, merge**

Code-review the stage, fix findings, commit each module separately, then ff-merge after the final green run.

### Stage 3: Split `hud.js` (`refactor/hud-modules`)

**Files:** create `game/src/hud/draw-utils.js` (chamferPath, drawPanel, starPath, label, cashString, timerString, truncateText, wrapText, speaker helpers, portraits, icons), `hud/panels.js`, `hud/cards.js`, `hud/minimap.js`, `hud/prompts.js`; modify `game/src/hud.js`.

**Pattern:** each draw method becomes `export function drawX(ctx, state, helpers)`; `Hud.draw` calls the module functions in the same order. `helpers` carries `world`, `width`, `height`, `last*` fields and the shared draw utilities, so no module imports `hud.js`.

- [ ] **Step 1: Extract `draw-utils.js`** and update `hud.js` imports.
- [ ] **Step 2: Extract the minimap first** (`buildMinimap` stays on the Hud instance; `drawMinimap` moves), then panels, cards, prompts.
- [ ] **Step 3: Verify after each extraction** — 379 ok, `main.ts --check` PASS, `node tools/capture.mjs` draw calls unchanged; inspect `3-mission.jpg` and `4-title.jpg` at full resolution and 300 px for any layout shift.
- [ ] **Step 4: Review, commit per module, merge.**

### Stage 4: Split `missions.js` and `police.js` (`refactor/sim-data`)

**Files:** create `missions-data.js` (STORY, PIER_HEIST_CRATES, PIER_HEIST_SPAWNS), `missions-actor.js` (enemy class + materials), `missions-shots.js` (prepareShot, stageShot, stageMissionShot, stageHeistShot, stageShotDrama), `police-units.js` (cruiser + officer classes), `police-air.js` (Air class + decal); modify `missions.js`, `police.js`.

- [ ] **Step 1: Missions data and actor first** (verbatim moves; the actor class keeps its constructor/methods, imports materials from `missions-actor.js`).
- [ ] **Step 2: Police units and air** (move each class whole; `Police` keeps the state machine and imports the classes).
- [ ] **Step 3: Mission shot staging last** (functions take `missions`; `missions.stageShot(name)` remains a wrapper).
- [ ] **Step 4: Verify and review** — 379 ok, check PASS, capture numbers unchanged. Commit per module; merge.

### Stage 5: Split `traffic.js`, `player.js`, `vehicles.js` (`refactor/sim-core`)

**Files:** create `traffic-crowd.js`, `traffic-peds.js`, `traffic-cars.js`, `player-controls.js`, `player-combat.js`, `vehicle-geometry.js`, `vehicle-fleet.js`; modify the three source files.

- [ ] **Step 1: `vehicle-geometry.js` first** (pure builders/textures; `Vehicle` keeps physics; `Vehicles` moves whole to `vehicle-fleet.js`).
- [ ] **Step 2: `traffic-crowd.js`** (the Crowd renderer class), then `traffic-cars.js` (spawn/update/eject), then `traffic-peds.js` (spawn/update/armed/crossing).
- [ ] **Step 3: `player-combat.js`** (weapons, fire, melee, damage, heal), then `player-controls.js` (update, driving, vehicle enter/exit, movement, camera).
- [ ] **Step 4: Verify after every module** — 379 ok, check PASS, capture numbers unchanged, and the AI station/deadlock checks in group 27 specifically green.
- [ ] **Step 5: Review, commit per module, merge.**

### Stage 6 (optional, go/no-go after Stage 5): Split `main.js` (`refactor/main-modules`)

Only if Stage 5 is clean and `main.js` still exceeds ~900 lines. Create `main-menu.js` (screen bindings, pause/controls/quality), `main-radio.js` (radio controls/wheel/toasts), `main-hud-state.js` (hudState/respect/crew), `main-shots.js` (applyShot, applyStageShot, staging). `Game` keeps the boot, tick, frame and public debug surface, delegating to functions that take `game`.

- [ ] **Step 1: HUD state and radio** (pure reads/controls; lowest risk).
- [ ] **Step 2: Menu and shot staging** (DOM and staged scenes).
- [ ] **Step 3: Verify** — 379 ok, check PASS, capture numbers unchanged, and the four screenshots inspected; live-freeze test: `?shot=station` and `?shot=chase` load with zero console errors.
- [ ] **Step 4: Review, commit, merge.**

---

## Final Gate

- [ ] `node --test test/fuel.test.mjs` 3/3, `test/loot.test.mjs` 4/4, `test/radio.test.mjs` 5/5.
- [ ] `node tools/test-npc-loot.mjs` — **379 ok**, 0 not ok, exit 0.
- [ ] `MAKEFUN_OUTPUT_DIR=out node main.ts --check` — PASS.
- [ ] `node tools/capture.mjs` — exact draw calls 400/395/215/350/406/251, all media under cap, clean console.
- [ ] Code-review the whole wave diff against `pre-refactor`; no behavior changes in the diff.
- [ ] Merge to `main`, push, deploy `gh-pages` once from the merged tree, poll the Pages build to `built`, and verify live: `fuel.js`/`gas-station.js` 200, `?shot=station` state (2 pumps, staged car), live service debit, and a `?shot=chase` screenshot.
- [ ] Update `docs/guide/source-map.md` and `README.md` only if file paths changed for humans; no count changes should be needed (379 stays).
