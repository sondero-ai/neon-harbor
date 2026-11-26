# Implementation plan: the living city

Spec: `docs/superpowers/specs/2026-11-26-living-city-design.md`
Base: `night-final` after the `wanted-crowd-knife` branch is merged and
verified. Branch: `living-city`.

Work in this order. Every task keeps the existing 61 E2E checks green and
adds its own checks before the next task starts.

## Task 1 — Axes and the 9x9 city

1. In `game/src/config.js`, split `ROADS` into `ROADS_X` and `ROADS_Z`; keep
   the core values and add the east and south/north lines. Derive
   `BLOCK_CENTERS_X/Z` and export both. Update `WORLD.cityMin/Max`,
   `WORLD.bounds`, and any beach/pier limit that the new footprint touches.
2. Update `game/src/world.js` to generate sidewalks, buildings, street
   furniture and merged leftovers from both axes. Keep the existing
   landmarks at their coordinates; add **Old Town** and **Foundry** districts
   in the extension using the existing facade factory and the same seed.
3. Update `game/src/traffic.js` (`nearestBlock`, `tryCross`,
   `spawnSidewalkPed`, lane seeding, crosswalks) to the two axes.
4. Update the HUD minimap bake to the new bounds and aspect; keep the blips
   aligned.
5. Confirm every existing `?shot=` pose still builds and looks unchanged
   except for the larger skyline.

Measure: draw calls at `?shot=chase` (baseline 272) and a 60-frame timing
sample. Budget: <= 380 calls, frame time <= 1.3x baseline.

## Task 2 — Crowd density

1. Set `MAX_PEDS 96`, `SIDEWALK_TARGET 48`, `BEACH_TARGET 22`,
   `CAR_TARGET 18`; scale the instanced crowd capacity.
2. Seed anchors across the new blocks and both new districts; keep the
   existing panic/armed/loot behavior intact.
3. Verify no slot starvation, no popping, and the same draw-call budget.

## Task 3 — Day/night environment

1. Add `game/src/environment.js`: clock, four states, smooth boundary blends,
   HUD `HH:MM`, save round-trip, `?shot=` fixed night, `?time=HH:MM` override.
2. Collect the sky/fog/sun/moon/stars/clouds and the city light, window
   emissive, streetlight and car-light references the environment needs.
   Prefer shared material uniforms or a small set of per-state materials over
   per-object writes.
3. Start New Game at 18:00; keep the day-4 counter compatible.
4. Wire `main.js` to advance the clock in the fixed step and pass the state to
   the HUD; save and restore the time.
5. Verify the four palettes at `?time=06:00`, `12:00`, `18:00`, `23:41`, and
   that `?shot=chase` is byte-comparable in mood to the current night shot.

## Task 4 — Visible signals

1. Add `game/src/traffic-signals.js`: merged pole/housing geometry at every
   intersection, one instanced lamp set per state, driven by the shared
   `signalState(axis, elapsed)`.
2. Export `signalState` from `traffic.js` (or a small shared module) and use
   it in the car AI so the lamps and the stopping rule cannot disagree.
3. Amber for the last 1.5 s before a switch; cars stop on amber and red.
4. Night emissive strength and a small light pool; day readability.
5. Add the E2E checks: a signal exists at every intersection, and the lamps
   match `signalState` for both axes at two times.

## Task 5 — Pedestrian wall collision

1. Add `world.resolveCircle(x, z, radius)` for the building colliders (and
   the pier/lighthouse obstructions that matter).
2. Use it in `walkToward` and every direct pedestrian move; slide with the
   full-step / x-only / z-only / stop fallback.
3. Apply the same resolve to foot officers and mission enemies where their
   movement code permits; pedestrians are the hard requirement.
4. Add the E2E check: a target through a known building never ends inside the
   collider, and the pedestrian can still reach a reachable target after.

## Task 6 — Docs, screenshots, verification

1. Update `README.md`: The city (size, Old Town, Foundry), Traffic and driving
   (96 pedestrians, 18 cars), a new Times of day section, signals, collision,
   Testing, Source map.
2. Regenerate the four 1280x720 screenshots; keep the cover night, allow one
   dusk/day shot via `?time=`; each <=256 KiB.
3. Run all three checks and the frame/draw-call measurements; commit on
   `living-city` with English messages and the usual trailer.
4. Do not merge, push, deploy or submit.

## Acceptance

- 81 blocks, 96 pedestrians, 18 cars, every existing landmark and shot intact.
- Four time states from the clock, saved and restored; fixed night in shots.
- A visible red/amber/green signal at every intersection, matching the AI.
- No pedestrian can enter a building collider.
- Existing 61 checks plus the new checks pass; `main.ts --check` PASS.
- Draw calls <= 380 at the chase shot; frame time <= 1.3x baseline.
- README and screenshots match the build.

## Subagent brief (hand this to the next implementer)

> Implement the living-city plan in `D:\Proyek Penting\neon-harbor` on a new
> branch `living-city` from the merged `night-final`. Read the spec and plan
> above first. Work task by task (axes/9x9 city, crowd density, day/night,
> signals, pedestrian collision, docs/tests/screenshots), keeping the
> existing 61 E2E checks green. Preserve the murder-heat, armed-witness,
> knife, loot and mission behavior. Do not add dependencies, package files or
> test-only branches to gameplay code. Run `node --test test/loot.test.mjs`,
> `node tools/test-npc-loot.mjs` and `MAKEFUN_OUTPUT_DIR=out node main.ts
> --check`, and report draw calls and frame time. Commit in English on
> `living-city` with `Co-Authored-By: Claude Code <noreply@anthropic.com>`;
> do not merge, push, deploy or submit. Report commits, new check names,
> measurements and anything left unverified.
