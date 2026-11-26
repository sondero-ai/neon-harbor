# Implementation plan: polish pass

Spec: `docs/superpowers/specs/2026-11-26-polish-pass-design.md`
Base: `main` after the `radio-playlists` branch is merged and deployed.
Branch: `polish-pass` for tasks 1-5; `docs-slim` for task 6 after the
gameplay work merges.

## Task 1 — Vehicle hit response

1. Add `Vehicle.overlapCircle(x, z, radius)` to `game/src/vehicles.js` using
   the car's oriented box; return `{ penetration, nx, nz }`.
2. Add `Player.hitByVehicle(car, damage)` and `vehicleHitCooldown` /
   `knockdown` state to `game/src/player.js`; push out, apply one damage hit,
   set the knockback velocity and knockdown timer, and expose the state on
   `__neon.player`.
3. In the on-foot update, test nearby cars after `moveHorizontal`; always
   push out of an overlap; damage/knock down only above the speed threshold.
4. While knocked down, ignore movement and fire input, keep the knockback
   slide, tilt the humanoid, then stand up and restore control.
5. Route `police.ramCheck`'s on-foot branch through `hitByVehicle(car, 18)`
   and drop its duplicate velocity/damage.
6. E2E: overlap a staged car with the player, assert push-out, one health
   hit, `knockdown > 0`, then clear after ~1 s; stage a second hit after the
   cooldown and assert it lands.

## Task 2 — Knife arm

1. Add `Humanoid.melee` and apply the stab pose after the walk/aim block in
   `game/src/humanoid.js`.
2. Drive it from `player.meleeSwing` in `updateCombat`; keep the blade
   rotation.
3. E2E: sample the right shoulder before, during and after a swing; assert a
   clear forward thrust and a return to the idle pose; the stab still kills.

## Task 3 — Beach

1. Change the sand mesh bounds to end at `WORLD.shorelineX` (or a small
   underwater overlap); keep the beach mesh's own `beachMinX` independent of
   the water plane if needed.
2. Smooth the profile: 0.45 m fall, ripple <=0.01, enough width segments;
   add the wet-sand strip.
3. Verify the foam line sits on the edge; the visible sand is walkable to
   the shoreline and blocked only west of it.
4. E2E: config and `groundHeightAt`/`collides` checks at shoreline +/- 0.5 m;
   a day screenshot across the beach.

## Task 4 — Carjacking

1. Add `Traffic.ejectDriver(car)` in `game/src/traffic.js`, spawning at the
   driver door and sending the ped fleeing away from the car for 6 s.
2. Call it from `Player.enterVehicle` for AI civilian cars; wire a one-shot
   HUD toast in `main.js`.
3. E2E: stage an AI car, enter it, assert a new ped at the door with
   `fleeTimer > 0`, the car driver is `player`, and the ped is still a normal
   target.

## Task 5 — Volume settings

1. Add the Audio row (range + mute + percent) to the title and pause panels
   in `game/index.html` with matching CSS.
2. Register the elements in `main.js`, wire `input`/`click`, sync with
   `changeVolume`, `toggleMute` and the keyboard, and persist via
   `SaveStore.saveSettings`.
3. E2E: set the slider to 32, assert `audio.volume === 0.32` and the saved
   settings; toggle mute; check the keyboard sync.

## Task 6 — README, docs and media (branch `docs-slim`)

1. Split the README detail into `docs/guide/` pages and cut `README.md` to
   the landing-page shape in the spec; all internal links must resolve.
2. Regenerate `screenshots/` with `node tools/capture.mjs` after the gameplay
   fixes; regenerate `docs/media/overview.gif` (and the combat still if it
   changed) with `node tools/capture-media.mjs`; verify dimensions and sizes.
3. Run all checks, including `main.ts --check`; verify the live site after
   the controller deploy.

## Acceptance

- No player can stay inside a car body; a ram hits once, throws, knocks down
  and stands up.
- The knife reads as an arm stab.
- The sand ends at the waterline and the visible beach is walkable.
- Carjacking ejects a fleeing driver.
- Volume is adjustable and persistent from the settings UI.
- README under ~200 lines, detail in `docs/guide/`, links resolve.
- Screenshots 4/4 1280x720 <=256 KiB; GIF <=4.5 MiB and current.
- Existing 140 E2E checks plus the new checks pass; `main.ts --check` PASS.
