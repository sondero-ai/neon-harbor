# Murder heat, reactive crowd, and the street knife

Status: implemented — 2026-11-26, branch `wanted-crowd-knife`

## Problem

Three gaps break the GTA contract the game promises:

1. Killing a civilian never raises the wanted level. `police.reportGunfire`
   only reacts when a cruiser or officer is already close, so a murder in
   front of witnesses produces no police response.
2. Panic exists but is small and short: a 9 m radius and a 4 s flee. Nothing
   in the crowd ever fights back.
3. The HUD shows a five-slot weapon strip whose third slot is a Street Knife,
   but `player.js` only maps `Digit1` and `Digit2`, `WEAPONS` has no knife
   spec, and there is no knife model, damage or animation. The slot is a lie.

## Goals

- Murder is a crime the city notices: witnessed civilian kills raise one
  wanted star, with a delayed 911 report when only civilians see it.
- The crowd reacts visibly: a wider, longer panic, and a minority of armed
  block pedestrians who return fire instead of running.
- The Street Knife is a real melee weapon: select with `3`, swing with left
  click, silent, lethal at close range, and lethal without a gunshot report.

## Non-goals

- No new weapons, gangs, factions or mission content.
- No change to the police pursuit, search, bust or decay rules beyond the
  new murder report.
- No stealth/body-hiding model; a murder is noticed by whoever is near it.
- No new meshes for the crowd; armed pedestrians reuse the instanced crowd.

## Behavior

### Murder heat

`police.reportCivilianDeath(x, z, { witnesses = 0 })` is called when a
pedestrian dies from player damage. It reports through the existing wanted
system:

- **Police witness** — any live officer within 70 m of the body, any active
  cruiser within 90 m of the player, or Air 1 within 90 m of the body:
  `addWanted(1, 'Civilian Killed')` immediately. If the player is already
  wanted, refresh `lastSeen`/`lastKnown` instead of adding a star.
- **Civilian witness, no police** — if `witnesses > 0`, queue a 911 report
  with a 3 s delay. When it fires: `addWanted(1, 'Witness Called 911')` if
  the player is not wanted, otherwise refresh the pursuit. The queue is one
  slot; a second murder refreshes the timer.
- **No witness** — no heat. A kill in an empty street stays quiet.
- **Officer death** keeps its existing `addWanted(2, 'Officer Down')`.
- **Mission enemy death** adds no civilian heat; it is gang business.

`traffic.js` passes the number of surviving pedestrians within the panic
radius to `onPedDeath(ped, { witnesses })`. `main.js` keeps the loot drop
and also calls `reportCivilianDeath`.

The knife never calls `reportGunfire`; its murders use the same witness
report, so a silent kill with no witnesses stays at zero stars.

### Crowd reaction

- Panic radius grows from 9 m to **14 m**; flee duration from 4 s to **6 s**;
  flee speed stays 1.6×. Panicking pedestrians run away from the body and
  restore their saved route when the timer ends.
- **Armed witnesses**: 15% of block-loop pedestrians carry a pistol and wear
  a dark red jacket. When an armed pedestrian witnesses a murder within 14 m,
  it stops fleeing, faces the player and opens fire after a 0.9 s draw:
  - fires every 1.2 s while the player is within 30 m and line of sight is
    clear (a world ray from the ped's chest to the player's chest),
  - 9 damage per hit with a muzzle flash, tracer and pistol audio; a miss
    still draws the tracer,
  - gives up and flees after 12 s or when the player is beyond 45 m,
  - remains a normal crowd target and drops the usual loot when killed.
- The first armed pedestrian to turn hostile raises one HUD toast,
  `ARMED WITNESS / RETURN FIRE`, so the player understands the incoming fire.
- Beach and crosswalk pedestrians are never armed.

### Street knife

- `WEAPONS.knife` is a melee spec: `damage: 60`, `range: 2.1`,
  `fireRate: 1.8`, no spread, no magazine, no reserve, no reload, no tracer.
- The knife is always owned (`this.weapons.knife = { owned: true }`), never
  saved as a consumable, and survives Continue.
- `Digit3` selects it. `selectWeapon` accepts it, `syncGunModel` hides the
  pistol/SMG and shows a small blade-and-handle group in the right hand.
- Left click swings (0.28 s cooldown animation). The swing raycasts from the
  camera through the world, police, mission and pedestrian targets with a
  2.1 m cap, takes the nearest, and applies 60 damage with no headshot
  multiplier. A hit plays the existing impact effect and a short whoosh;
  a miss is silent.
- No gunshot audio and no `reportGunfire`. Melee kills still drop loot and
  still trigger the murder heat above.
- HUD: slot 3 is active, ammo shows `--`, the crosshair is a small fixed
  dot, and `R` is a no-op while the knife is out. The weapon card reads
  `STREET KNIFE · CQC` instead of magazine/reserve numbers.

## Data and interfaces

- `traffic.spawnPed({ ..., armed })` — test/debug staging; gameplay assigns
  `armed` itself for block peds.
- `traffic.onPedDeath(ped, { witnesses })` — extended signature; the old
  single-argument callers keep working.
- `police.reportCivilianDeath(x, z, { witnesses })` — public method.
- `police.witnessReport` — one pending `{ x, z, timer }` report, ticked in
  `police.update`.
- `player.meleeSwing` — swing animation timer; `combatState.melee` and
  `combatState.weaponKey === 'knife'` drive the HUD.
- `main.js` wires `onPedDeath` to loot plus `reportCivilianDeath`, and the
  first hostile pedestrian to a one-time toast.

## Tests

The E2E tool gains three tests and keeps the existing 61 checks green:

- **Test 7 — murder heat:** a civilian kill with no police and one witness
  adds no star immediately, then one star after the 3 s 911 delay; a kill
  with an officer staged nearby adds a star immediately; a knife kill with
  no witness adds none.
- **Test 8 — street knife:** `Digit3` selects the knife, the HUD state says
  `knife` with `melee: true`, a 1.5 m stab kills a full-health pedestrian,
  a stab does not call `reportGunfire`, and a knife murder with a witness
  still queues the 911 report.
- **Test 9 — armed witness:** an armed pedestrian that sees a murder turns
  hostile, its first shot after the draw delay lowers the player's health,
  an unarmed witness in the same position only flees, and moving the player
  beyond 45 m returns the armed pedestrian to fleeing.

Test 1's panic pins change from 4 s to 6 s and the radius fixture is widened
to 14 m; the existing fall, corpse, headshot and precedence checks stay.

## Verification

```bash
node --test test/loot.test.mjs
node tools/test-npc-loot.mjs
MAKEFUN_OUTPUT_DIR=out node main.ts --check
```

README updates: controls (`3` knife, left click stab), Heat and combat
(murder heat, 911 witness, 14 m/6 s panic, armed witnesses), Testing (new
checks), and the weapon strip description.
