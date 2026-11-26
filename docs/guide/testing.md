# Testing and verification

[← README](../../README.md) · [Building](building.md) · [Source map](source-map.md)

All checks are dependency-free: Node's standard library for the unit tests
and the harness, and headless Chrome through the DevTools protocol for the
end-to-end suite. Run them from the repository root.

## The four commands

```bash
node --test test/loot.test.mjs     # 4 tests
node --test test/radio.test.mjs    # 5 tests
node tools/test-npc-loot.mjs       # 347 E2E checks
MAKEFUN_OUTPUT_DIR=out node main.ts --check
```

Set `CHROME` to a Chrome or Chromium executable if the default lookup misses.
`ffmpeg` is only needed for `tools/capture-media.mjs`, not for these checks.

### Loot (`test/loot.test.mjs`, 4 tests)

Pins the death-drop weights, the $5 cash steps and bounds, and the SMG gate
without a browser. The four tests are the pistol-only table, the SMG crate
after the unlock, the cash steps and bounds, and the pinned amounts.

### Radio (`test/radio.test.mjs`, 5 tests)

Checks the six-station order, the three unique tracks each, every file path
against the prompt pack, the OGG headers and the 36 MB audio budget, and that
`MUSIC.md` credits every track and the 2026-11-26 generation date. No browser.

### End to end (`tools/test-npc-loot.mjs`, 347 checks)

The harness serves `game/`, launches headless Chrome, drives the frozen
`?shot=street` and `?shot=blockade` scenes through `window.__neon`, and prints
one `ok`/`not ok` line per check. The last run printed
`PASS: all checks passed` with 347 `ok` lines. The twenty-six groups are:

1. **pedestrians** — chest hitbox, damage and death, the fall state, corpse
   cleanup, the 14 m panic radius and 6 s flee/recovery, loot pickup and the
   30-second expiry, reset, and the real `player.fireWeapon` path.
2. **pickups** — spawn rings, walk-over payout, toast, one-shot drops and
   respawn rules.
3. **player fire path** — the live weapon path, ammo, reload and hit marker.
4. **officer fire path** — officer hitboxes, damage, death and loot.
5. **mission enemy drops** — mission crew and boss deaths, the flat boss cash
   drop and the usual pedestrian/officer table.
6. **nearest-target precedence** — the nearest target wins across
   pedestrians, officers, mission crew, cars and walls.
7. **murder heat** — the 911 delay, the police-witness shortcut, officer
   deaths, mission enemies, and a silent kill with no witnesses.
8. **street knife** — slot-3 selection, 1.5 m lethal reach, the silent
   gunfire-free kill and the blade whoosh.
9. **armed witness** — the 15% armed crowd, the draw, the first shot, damage,
   the 45 m give-up and the return-fire toast.
10. **crowd density** — the 168/64/28/18 targets, all 28 beach walkers seeded,
    no two pedestrians sharing a slot, the 64-walker sidewalk fill, and a
    free slot after the fill.
11. **traffic signals** — a signal at every one of the 100 intersections, the
    green/amber/red rule at seven times, and the visible lamp sets matching
    the state at green, amber and the switch.
12. **pedestrian wall collision** — a target straight through a known
    building, the stop at the wall face, a reachable target still reached,
    forward progress along a wall, and 60 simulated seconds with no live
    walker inside a collider.
13. **living clock** — the 81 blocks, the pinned 23:41 night, all four
    periods and their sky textures, the day/night palette levels, a
    seventy-five-minute advance over thirty real seconds at 2.5 minutes per
    second, the saved minute restored by Continue and the day rollover at
    midnight.
14. **radio** — the Vega 105.1 default, six stations with three tracks each,
    the HUD reading the same state, every key and track/station wrap, `M`
    mute, the hold-Tab wheel with arrow selection and per-track clicks, the
    saved station and track restored by Continue, an old save falling back to
    Vega track 0, the procedural SYNTH fallback for a missing file, `OFF AIR`
    for a station with no fallback, auto-advance at track end, and all
    eighteen OGG files served as `audio/ogg`.
15. **vehicle hit response** — a staged moving car overlaps Rae, pushes her
    out, lands one health hit, sets `knockdown`, clears after about a second,
    and a second hit after the cooldown still lands.
16. **knife arm** — the right shoulder before, during and after a swing shows
    a forward thrust, the pose returns to idle and the stab still kills.
17. **beach** — the sand mesh min X is the shoreline, the shoreline +0.5 m is
    walkable, the shoreline −0.5 m is blocked, the slope is finite, and all
    28 beach walkers stand on visible sand.
18. **carjacking** — entering an AI car spawns a pedestrian at the driver
    door with a flee timer, leaves `car.driver === 'player'` and the ejected
    driver is a normal lootable target.
19. **volume settings** — the slider changes `audio.volume`, persists in the
    saved settings, syncs with the keyboard and mute toggle, and clamps 0–100.
20. **ambient cars stay on the road grid** — a z-axis car spawns on an x road,
    an x-axis car on a z road, and an off-grid beach car is removed by
    `updateCars`.
21. **pier is pedestrian-only** — the shack, five benches, four barrels,
    twelve crates and the railings are solid; the deck and ramp refuse every
    vehicle; sand refuses AI cars but not the player; a sedan cannot reach the
    deck; a blocked cruiser force-dismounts its officers; the heist positions
    and shot cruisers stay clear; 50 pier wander targets land on open planks.
22. **seats and the contextual E layer** — plaza, pier and beach seats; E sits
    and stands, a movement key stands the player and then walks, the prompt
    reads SIT, and a car squeezed against a building wall never leaves the
    player inside either body.
23. **the Solano Mall shell and interior** — bounds, floor, walkable hall,
    wall push-out, both doors walkable, the mall wall squeeze, vehicle blocking,
    24 mall seats registered, and the minimap label/footprint.
24. **the parking lot, theft and valet** — 26 stalls in bounds, 20/90/65%
    occupancy at night/dusk/day within one stall, the stall in front of the
    lot door stays clear and the door stays walkable at 90%, a static car
    steals into a real Vehicle and loses its collider, and the valet parks and
    returns a car while F still exits.
25. **mall life follows the clock** — 30 shoppers at dusk, 4 at 02:00, at
    least four seated with no shared chair, all chairs inside the mall, and no
    stale occupant after the shrink.
26. **the mall robbery** — the ROB prompt, one robbery per reset, three wanted
    stars, two armed hostile guards inside, the $650–950 counter drop, a
    fleeing crowd, no cruiser inside the mall, a second E doing nothing and a
    guard death dropping loot.

Audio output itself cannot be heard headless; the radio and volume checks
assert the player state, the file responses, the sequencer bus and the saved
settings.

### Entry check (`main.ts --check`)

The last run printed:

```text
check PASS: game 62/993 entries, 33.82 MiB/48.00 MiB; screenshots 4/4, largest 184.9 KiB/256.0 KiB; dossier 1.01 MiB/1.50 MiB, text 160.0 KiB/160.0 KiB
```

The caps are 993 game entries, 48 MiB of game files, 3–4 screenshots at
256 KiB each, and a 1.5 MiB dossier with its text cut at 160 KiB. See
[building](building.md#entry-build) for what the check reads.

## Media verification

After `node tools/capture.mjs` and `node tools/capture-media.mjs`, verify the
assets independently:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
  -of csv=p=0 screenshots/1-cover.jpg
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,nb_frames,duration \
  -of default=nw=1 docs/media/overview.gif
```

The current files:

- `screenshots/1-cover.jpg` — 1280×720, 184.9 KiB
- `screenshots/2-street.jpg` — 1280×720, 175.8 KiB
- `screenshots/3-mission.jpg` — 1280×720, 145.4 KiB
- `screenshots/4-title.jpg` — 1280×720, 145.2 KiB
- `docs/media/overview.gif` — 640×360, 36 frames, 3.25 s, 2.88 MiB
- `docs/media/combat.jpg` — 1280×720, 169.2 KiB
- `docs/media/heist.jpg` — 1280×720, 144.0 KiB

All four screenshots are under the 256 KiB cap; the GIF is under 4.5 MiB.
The title screenshot shows the Audio row. Inspect each screenshot at full
resolution and at 300 px; check for clipped text, overlaps and legibility.

## What is not verified

- Audio output is not audible in headless Chrome; state and file delivery are
  tested, not the mix.
- The frame timing and draw-call numbers are from the build machine's
  headless Chrome, not a phone or a low-end GPU.
- The GIF records the opening walk only; it does not drive, fight or cross
  the day/night range. The screenshots and the combat still cover those.
