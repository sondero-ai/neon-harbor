# The living city: world, crowd, clock, signals, collision

Status: proposed — 2026-11-26, branch `living-city` (from `night-final` after
the murder-heat branch merges)

## Why

The gta6-01 judge ranked Puerto Zafiro first on breadth: a larger, sun-lit
world, 23/36 missions and many systems. Neon Harbor currently has a fixed
23:41 night, 48 pedestrians, a 6x6-block core and traffic lights that exist
only in the car AI, not in the world. This phase makes the city itself the
feature:

- more people and cars on the street;
- morning, noon, afternoon and night from a real clock;
- visible red/amber/green signals at every intersection;
- pedestrians that cannot walk through buildings;
- a world roughly twice the current playable area.

## Non-goals

- No new missions, races or save slots here; that is the content phase.
- No full module split of `world.js`/`hud.js`; only the new systems land as
  their own modules. The structural split is a later phase.
- No change to the wanted, combat, loot or mission rules.

## 1. World expansion

Keep every existing landmark, mission marker, shot pose and spawn point at
its current coordinate. Extend the grid east and south; the beach and pier
stay where they are.

- Replace the single `ROADS` axis with `ROADS_X` and `ROADS_Z`. Core stays
  `[-135, -81, -27, 27, 81, 135, 189]`; add east lines at `243`, `297`, `351`
  and south/north lines as the geometry allows, giving **9x9 blocks** (81
  blocks) instead of 6x6 (36).
- Extend `WORLD.bounds`, `cityMin/Max`, and the minimap to the new footprint.
  Keep the player inside the new bounds; the beach and pier remain at the
  west edge.
- Add two new districts in the extension with their own facades and signage:
  **Old Town** (low brick, awnings, a market square) and **Foundry** (ware,
  smokestacks, rail sheds). They are generated from the same seed and the
  same building factory, not hand-placed set dressing.
- Update `traffic.js` block lookups (`BLOCK_CENTERS`, `tryCross`), pedestrian
  anchors, the minimap bake and any `ROADS.includes` assumptions to the new
  axes.
- Performance budget: draw calls at `?shot=chase` no more than **1.4x** the
  current 272 (~380), and the local headless frame time no worse than 1.3x
  baseline. Merge static geometry per block as the current world already
  does; do not add a draw call per building.

## 2. Crowd density

- `MAX_PEDS` 48 -> **96**; `SIDEWALK_TARGET` 24 -> **48**; `BEACH_TARGET`
  11 -> **22**; `CAR_TARGET` 13 -> **18**.
- The instanced crowd capacity follows `MAX_PEDS`; verify no slot starvation
  and no visual popping at the new target.
- Spawn anchors follow the new block axes, so the extension is populated.
- Keep the existing panic, armed-witness, loot and collision behavior; the
  new density must not change their tested semantics.
- Report draw calls and a 60-frame timing sample at the new density.

## 3. Day/night clock

- Add `game/src/environment.js`: a 24-hour clock, a time rate of **1 in-game
  minute per 2 real seconds** (48 real minutes per day), persisted in the
  save, and a `HH:MM` value for the HUD.
- Four states, blended across their boundaries:
  - **dawn** 05:00-07:00, **day** 07:00-17:00, **dusk** 17:00-19:00,
    **night** 19:00-05:00.
- Each state drives: sky/fog colours, sun and moon position and colour, the
  directional/hemisphere light intensities, window emissive strength, neon
  and streetlight strength, car headlights and taillights, ocean tint, star
  visibility and cloud tint. Interpolate with smoothstep over 30-60 in-game
  minutes at each boundary.
- New Game starts at **18:00** (dusk) so the first minutes show the sunset
  and the neon night the game is known for; Continue restores the saved time.
- `?shot=` pins a fixed night time by default so every existing screenshot
  stays deterministic; add `?time=HH:MM` for a daylight or dusk shot.
- The HUD clock reads from the environment instead of the hardcoded
  `DAY 4 · 23:41`. Keep the day counter story-compatible (day 4 at start).

## 4. Visible traffic signals

- Add `game/src/traffic-signals.js`: a merged pole/housing mesh at every
  intersection plus red/amber/green lamp instances driven by the same
  two-phase cycle as `traffic.js`.
- Export one `signalState(axis, elapsed)` used by both the car AI and the
  lamps: green for the moving axis, amber for the last 1.5 s before the
  switch, red for the crossing axis. Cars stop on amber and red.
- Lamp colour changes use one instanced draw per lamp state, not one mesh per
  lamp; poles and housings merge into the static city geometry.
- At night the lamps are emissive and cast a small pool of light; during the
  day they stay readable but dimmer.
- A pedestrian signal on the crossing corners is optional; if time allows,
  reuse the same phase (walk on the green axis only).

## 5. Pedestrian wall collision

- Add a `world.resolveCircle(x, z, radius)` query that returns a pushed-out
  position for the building colliders (and the pier/lighthouse obstructions
  where relevant).
- Use it in `walkToward` and every direct pedestrian move (panic, armed
  witness, beach loop, crosswalk), so a pedestrian can never end a step
  inside a building. Slide along the wall: try the full step, then x-only,
  then z-only, then stop.
- Apply the same resolve to officers and mission enemies that move on foot
  where their movement code allows it; at minimum, no pedestrian may cross a
  building.
- Test: a pedestrian with a target through a known building must stay outside
  the collider and still reach a reachable target afterward.

## 6. Tests and docs

- New E2E checks:
  - clock wraps 24 h, starts at 18:00, and advances at the configured rate;
  - the environment exposes a palette/state that changes at a boundary;
  - every intersection has a signal, and the lamp state matches
    `signalState` for both axes at two times;
  - a pedestrian cannot enter a building collider and can slide out;
  - crowd counts reach the new targets without slot starvation.
- Existing 61 checks stay green.
- README: The city (new districts and size), Traffic and driving (density,
  signals), a new Times of day section, The city clock, and updated tests.
- Regenerate the four 1280x720 screenshots after the merge (cover still
  night; one shot may use dusk/day via `?time=`), keeping each <=256 KiB.
- Design and plan live in `docs/superpowers/`.

## Verification

```bash
node --test test/loot.test.mjs
node tools/test-npc-loot.mjs
MAKEFUN_OUTPUT_DIR=out node main.ts --check
```

Plus: draw-call and frame-time comparison, a live Playwright pass at
`?shot=chase` and a daylight shot, and a manual walk through both new
districts. The subagent commits on `living-city`; the controller merges,
deploys and verifies the live site.

## Later phases (not this branch)

- **Content:** a data-driven mission engine, 20+ missions, five street races,
  repeatable carjacking, three save slots, one branching heist.
- **Structure:** split `world.js` (2,410 lines), `hud.js` (2,026), `police.js`
  (1,654) and `missions.js` (1,496) into purpose-named modules; target
  80-120 files, each under ~500 lines, with the README source map updated.
