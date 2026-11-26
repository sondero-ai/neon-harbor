# Implementation plan: murder heat, reactive crowd, street knife

Branch: `wanted-crowd-knife` from `night-final` at `2e94828`.
Spec: `docs/superpowers/specs/2026-11-26-murder-heat-crowd-knife-design.md`.

## Task 1 — Murder heat

1. Add `reportCivilianDeath(x, z, { witnesses })` and the pending
   `witnessReport` timer to `game/src/police.js`; tick it in `update`.
2. Pass the panicking-witness count from `traffic.applyPlayerHit` to
   `onPedDeath(ped, { witnesses })`.
3. Wire `main.js`'s `onPedDeath` to loot plus `reportCivilianDeath`.
4. Keep officer death at +2 stars and mission enemy deaths heat-free.

Verify: a witness-only kill stays at zero immediately, then reaches one star
after 3 s; a staged officer near the body makes it one star immediately.

## Task 2 — Crowd panic and armed witnesses

1. Widen panic to 14 m and the flee timer to 6 s in `traffic.js`.
2. Add `armed` to the pedestrian record and spawn options; 15% of `loop`
   pedestrians are armed with a dark red jacket. Never arm beach or cross
   walkers.
3. On a witnessed murder, armed pedestrians within 14 m become hostile
   after a 0.9 s draw; unarmed ones flee as today.
4. Hostile behavior in `updatePeds`: face the player, fire every 1.2 s with
   line-of-sight and range checks, 9 damage, muzzle/tracer/audio, give up
   after 12 s or beyond 45 m and flee.
5. Add `onArmedHostile` (or equivalent) so `main.js` shows a one-time
   `ARMED WITNESS / RETURN FIRE` toast.
6. Update test 1's panic timer pins from 4 s to 6 s.

Verify: an armed staged witness turns hostile, fires and damages the player;
an unarmed witness only flees; distance ends the hostility.

## Task 3 — Street knife

1. Add `WEAPONS.knife` to `game/src/config.js` (melee, damage 60, range 2.1,
   fireRate 1.8, no ammo).
2. Add the always-owned knife slot to `player.js` init, reset and save load;
   map `Digit3`; accept the knife in `selectWeapon`.
3. Build a small blade/handle model, show it only when the knife is active,
   and animate the 0.28 s swing.
4. Add the melee branch to `fireWeapon` (or a `meleeAttack` called from it):
   nearest target within 2.1 m, 60 damage, no headshot, no gunfire report,
   impact/whoosh, hit marker.
5. Guard `combatState`, reload and HUD weapon card for melee (ammo `--`,
   no reload, CQC label, fixed small crosshair).

Verify: `Digit3` selects the knife; one 1.5 m stab kills a pedestrian; no
gunshot heat; switching back to 1/2 restores the guns.

## Task 4 — Tests, docs, verification

1. Add E2E tests 7 (murder heat), 8 (knife), 9 (armed witness).
2. Update README controls, Heat and combat, weapon strip and Testing.
3. Run all three checks; commit on `wanted-crowd-knife` with the usual
   trailer. Do not merge, push or deploy.

## Acceptance

- Existing 61 E2E checks still pass (panic pins updated to the new 6 s).
- New checks cover heat, knife and armed retaliation.
- `main.ts --check` passes with the same caps.
- README claims match the code and the tests.
