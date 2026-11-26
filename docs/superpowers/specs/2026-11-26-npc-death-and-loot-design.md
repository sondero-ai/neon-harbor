# Neon Harbor — NPC death and loot — design

Date: 2026-11-26
Status: proposed

## Intent

Shooting a person should read as a hit: they die, fall, and leave something
behind. Today bullets pass through pedestrians — they are instanced crowd
members with no hitbox — and mission enemies and police officers die without
dropping anything. The change makes combat legible and gives free-roam
shooting a reward, GTA-style.

## Goals

- Pedestrians have hitboxes (chest and head), health, death, and a visible
  fall.
- Every human NPC death can drop loot: pedestrians, mission enemies, police
  officers.
- Loot: 60% cash $15–70, 30% Solano 9 ammo +12, 10% Kestrel SMG crate (rare).
  The SMG crate only enters the table after the SMG unlock; before it, that
  share folds into pistol ammo. Every death drops exactly one item.
- Loot is collected by walking over it, announces itself in the HUD, and
  expires after 30 s if ignored.
- Pedestrians near a death panic and run.
- Heat stays witness-based through the existing `reportGunfire`: no new heat
  rules.

## Non-goals

- Ragdoll physics or persistent corpses. Bodies lie for about 8 s, then go.
- New weapons, a new economy, or changes to mission reward cash.
- Pedestrian AI beyond panic (no retaliation, no police reporting by name).
- Dropped loot persisting across save/load.

## Constraints

- The game is static: no build step, no dependencies, plain ES modules.
- The crowd is drawn as instanced meshes; a death must be per-instance with
  no extra draw calls per pedestrian.
- `MAKEFUN_OUTPUT_DIR=out node main.ts --check` must keep passing. The
  dossier text is already at its 160 KiB cap, so later sources are truncated
  there; that is by design and does not fail the check.
- Existing pieces to build on: `Pickups` (crate/health/armor rings + notice),
  `Traffic` crowd, `police.applyPlayerHit`, `missions.applyPlayerHit` and
  `missions.killEnemy`.

## Approaches

A. **Per-system hooks (chosen).** `Traffic` gains its own hit test, damage,
   death and panic; `Pickups` gains a one-shot drop; police and mission deaths
   call the same drop. Smallest diff, reuses the existing damage and death
   flow, no new abstractions.
B. **Shared humanoid damage layer** across traffic, police and missions.
   Cleaner long-term, but police and missions already have bespoke hit tests,
   death timers and rewards; refactoring them adds risk without payoff.
C. **Separate loot entity system.** Duplicates the Pickups ring/icon/glow/
   notice pipeline for no gain.

## Design

### Hit testing

- `Traffic.traceShot(origin, direction, maxDistance)` mirrors
  `police.traceShot`: chest sphere r 0.42 at `ped.y + 1.12 * ped.scale`, head
  sphere r 0.22 at `ped.y + 1.55 * ped.scale`; returns
  `{ type: 'ped', ped, headshot, distance, point }` for the nearest active
  pedestrian. Dead pedestrians are skipped.
- `Player.fireWeapon` includes `traffic.traceShot` in the nearest-target
  selection beside `police.traceShot`, `missions.traceShot` and
  `world.raycast`; a ped hit calls `traffic.applyPlayerHit(target, damage)`.
- Wiring: `main.js` assigns `this.player.traffic = this.traffic`.

### Damage and death

- Pedestrian health 55; headshot multiplier 1.75 (pistol 34: two body shots,
  one headshot at 59.5).
- On hit: impact spark/flash and the existing hit marker; on death:
  - `ped.dead = true`, `ped.deadTimer = 8`, walking stops.
  - `Crowd.write` gains a fall transform: the base matrix rotates about X to
    about -80° over 0.45 s and settles on the ground; the body lies in place.
  - After 8 s the ped despawns through the existing `crowd.hide`.
- Panic: active pedestrians within 9 m of a death switch to `mode: 'flee'`
  for 4 s, running away from the death point at about 1.6x their walk speed,
  then resume their loop.

### Loot

- `Pickups.spawnDrop({ x, z, kind, amount, label })` builds the existing
  ring/icon/glow group at ground height with `oneShot: true` and `expire: 30`;
  no respawn, removed after expiry.
- New `cash` kind: gold ring, bill-roll icon, `COLORS.cash = 0xffc95c`;
  collecting adds `amount` to `player.cash` and announces `CASH · +$40`.
- Drop table for every human NPC: 60% cash $15–70, 30% pistol ammo +12, 10%
  SMG crate (+96 the first time, otherwise +32).
- Spawn points: the pedestrian's death position; the mission enemy's death
  point in `killEnemy` (enemies $40–120, boss $150); the officer's death
  position in `police.applyPlayerHit` (same table).
- Wiring: `main.js` gives missions and police a reference to `Pickups` (or an
  `onHumanDeath` callback) so both can spawn the drop.

### HUD

- Reuse `Pickups.onPickup` and its existing notice. No new HUD panels.

### QA hook

- Extend `window.__neon` with `get pedestrians()` (active and alive counts)
  and add `cash` to `get combat()` so Playwright can assert deaths and
  pickups without reading private state.

## What is left to the builder

- Exact panic radius/speed, corpse timer and effect colors (the values above
  are defaults).
- Where the pickup notice appears: follow the current `onPickup` behavior.
- Whether enemy and officer drops get their own amount ranges (the proposal
  is above).

## Verification

- `node --check` on every changed module.
- `MAKEFUN_OUTPUT_DIR=out node main.ts --check` passes.
- Playwright, New Game: aim at a sidewalk pedestrian, kill with two body
  shots (or one headshot), see the fall, see the loot ring, walk over it and
  watch cash or ammo change with the notice; nearby pedestrians run.
- Repeat against an officer in `?shot=blockade`.
- Deploy: commit on `night-final`, rebuild `gh-pages`, verify the live URL.
