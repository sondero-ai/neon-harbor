# Polish pass: vehicle hits, knife arm, beach, carjacking, volume, docs

Status: proposed — 2026-11-26, branch `polish-pass` after the radio branch

## Problems

1. A police cruiser that rams Rae on foot leaves her stuck inside the car.
   `police.ramCheck` applies damage and sets a small velocity, but the car
   body never pushes her out, and `moveHorizontal` then blocks every
   direction. The hit should throw her clear, damage her, and let her get up.
2. The knife model swings, but the arm does not: the hand stays at the idle
   position while the blade rotates in place.
3. The beach sand extends about 16 m west of the waterline, so a visible sand
   shelf sits where `world.collides` refuses to walk. The beach also reads
   uneven.
4. Stealing a traffic car teleports the player into an empty car: no driver
   gets out, so the carjacking has no consequence.
5. Volume is only on `M` and `-`/`=`; there is no settings control.
6. The README has grown into a manual. Detail belongs in `docs/`, and the
   screenshots and overview GIF no longer show the current build.

## Goals

- Any moving car that overlaps Rae pushes her out, applies one damage hit,
  knocks her down for ~0.9 s and then stands her up; the player can never
  remain inside a car body.
- The knife swing moves the right arm and hand into a forward stab, not just
  the blade.
- The sand mesh stops at the waterline, the beach slope is smooth, and every
  visible sand metre is walkable up to the shoreline.
- Stealing an AI car spawns its driver at the driver door; the driver flees.
- A volume slider and mute control live in the title and pause settings, show
  the percentage and persist.
- The README becomes a short landing page; the detail moves to `docs/guide/`;
  screenshots and the overview GIF are regenerated from the final build.

## 1. Vehicle hit response

- Add `Vehicle.overlapCircle(x, z, radius)` in `vehicles.js`: the car's
  oriented box against a circle, returning the penetration and the unit
  normal from the car to the point.
- Add `Player.hitByVehicle(car, damage)`:
  - push `this.position` out along the normal by `penetration + 0.02`,
  - set a knockback velocity away from the car (`4 + |speed| * 0.7`, upward
    3.2-3.6) and `knockdown = 0.9`,
  - `applyDamage(damage, car.x, car.z)`, a shake and an impact,
  - one shared `vehicleHitCooldown` (~0.9 s) so one impact never double-hits.
- In the on-foot `Player.update`, after `moveHorizontal`, test nearby cars and
  call `hitByVehicle` when overlapping or when a car is closing at speed.
  Always push out, even at low speed; only the damage/knockdown requires
  speed above ~2.5.
- While `knockdown > 0`, ignore movement/fire input, keep the knockback
  velocity with friction, tilt the humanoid to a fallen pose
  (`humanoid.group.rotation.z`), then stand up and restore control when the
  timer ends. A short 0.35 s post-hit grace prevents an instant second hit.
- Change `police.ramCheck`'s on-foot branch to call `player.hitByVehicle(car,
  18)` (or the same shared method) instead of setting its own velocity, so
  police ramming and civilian cars share one push-out path. The car-vs-car
  branch stays as it is.
- Expose `__neon.player.knockdown` and the last vehicle hit for the E2E.

## 2. Knife arm animation

- `Humanoid` gains a `melee` value (0..1 progress) applied after the walk and
  aim poses: the right shoulder rotates forward and the elbow extends into a
  stab, the torso twists slightly, and the left arm counters. At `melee = 0`
  the existing walk/aim pose is untouched.
- `Player.updateCombat` derives `humanoid.melee` from `meleeSwing` (0.28 s),
  keeping the existing blade rotation as a secondary flourish.
- The stab must read from the chase camera: shoulder forward, hand ahead of
  the chest at the peak, then a fast return.

## 3. Beach

- Set the visible sand to end at `WORLD.shorelineX` (or a 1-2 m overlap under
  the water) instead of `WORLD.beachMinX` at -248, so no sand shelf sits west
  of the walkable line.
- Flatten the beach profile: keep the 0.45 m fall from the city edge to the
  water, reduce the sine ripple to <=0.01 and widen the mesh segments enough
  that the slope reads smooth. Add a wet-sand strip (a slightly darker
  overlay) from the shoreline to a few metres inland.
- Keep `world.collides` blocking only west of the shoreline; the visible sand
  east of it must be walkable and the foam line must sit on the water edge.

## 4. Carjacking

- `Traffic.ejectDriver(car)`: spawn a pedestrian at the driver's door
  (car-local left, just outside `halfWidth`), facing the car, with the saved
  route cleared and a 6 s flee away from the car. If the crowd has no slot,
  skip silently.
- `Player.enterVehicle` calls `traffic.ejectDriver(car)` when the car had an
  AI driver and is not a police cruiser, before taking the wheel. A one-shot
  HUD toast, `CARJACKED / DRIVER BAILED`, confirms it.
- The ejected pedestrian is a normal crowd member: killable, lootable, and
  counted by the existing panic/flee systems.

## 5. Volume settings

- Add an Audio row to the title and pause menus: a range input 0-100, a mute
  toggle and a live percentage label.
- Wire it to the existing `changeVolume`/`toggleMute`/`audio.setVolume` and
  `SaveStore.saveSettings`; keep `M`, `-` and `=` in sync and update the
  slider when they change the volume.
- Persist volume and mute with the existing settings; old saves keep the
  current defaults.

## 6. README and media

- Keep `README.md` a landing page (target under ~200 lines): title, badges,
  hero, one-line pitch, Overview GIF, Play/quick start, a compact controls
  table, feature highlights, a 2x2 screenshot gallery, docs links, bounty and
  licence.
- Move the detail into `docs/guide/`: `story.md`, `city.md`, `driving.md`,
  `combat.md`, `radio.md`, `hud-audio.md`, `building.md`, `testing.md`,
  `source-map.md`. Every README claim keeps a link to its detail page.
- Regenerate the four 1280x720 screenshots after the gameplay fixes and the
  overview GIF from a short final-build recording. Prefer shots that show
  the day/night range, the knife or a carjacking, and the beach. Keep each
  screenshot <=256 KiB and the GIF <=4.5 MiB.
- `MUSIC.md` credits the radio tracks; the README links to it.

## Non-goals

- No new missions, districts or weapons beyond the fixes above.
- No physics rewrite of the vehicle simulation; the push-out is a player-side
  response.
- No separate music/SFX mix buses; one master volume is enough for this pass.

## Tests

- Vehicle hit: stage a moving car overlapping the player; assert the player
  is no longer inside the box, health dropped once, `knockdown` is set, and
  after 1 s it clears and movement resumes.
- Knife: during a swing the right shoulder angle differs from idle and
  returns after 0.3 s; a stab still kills the target.
- Beach: the sand mesh min X is the shoreline, the shoreline+0.5 m is
  walkable, the shoreline-0.5 m is blocked, and the slope is finite.
- Carjack: entering an AI car spawns a pedestrian at the driver door with a
  flee timer and leaves `car.driver === 'player'`.
- Volume: the slider changes `audio.volume`, persists in settings and syncs
  with the keyboard; mute toggles.
- README: all docs links resolve; screenshots and GIF sizes pass; the three
  existing checks stay green (140 E2E + the new checks).
