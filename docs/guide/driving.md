# Driving, traffic and carjacking

[← README](../../README.md) · [City](city.md) · [Combat](combat.md) · [HUD and audio](hud-audio.md)

Neon Harbor drives arcade-simple and reads on screen: the car leans into a
corner, the rear steps out under the handbrake, and the rear tires leave a
pooled skid-mark ribbon. Seven original low-poly classes share the same
geometry library.

## The garage

`vehicles.js` builds each class from merged low-poly parts. Every car has its
own proportions, paint palette, wheels, headlights, taillights, glass and
handling; bodies, trim, glass and lamps share geometries, so a car stays
around nine draw calls and its four wheels are one instanced mesh.

| Class | Type | Character |
| --- | --- | --- |
| **Fathom 400** | sedan | the default four-door street car |
| **Harbor Cab** | taxi | yellow cab, soft throttle |
| **Vela GT** | sports | quick, low, the mission car |
| **Riptide 442** | muscle | heavy and fast, the cover car |
| **Mule 9** | van | slow, tall, wide turning circle |
| **Dune Hauler** | pickup | the chop-shop delivery rotation |
| **Harbor PD Cruiser** | police | white-door livery, door decal, red/blue light bar |

## Handling

- **W/S** throttle and brake/reverse, **A/D** steer, **Space** handbrake.
- Throttle and reverse are arcade curves; steering is speed-sensitive.
- Lateral grip lets the rear step out under the handbrake, and a held
  handbrake through a corner drifts. The rear tires write a pooled skid-mark
  ribbon.
- Cars follow the ground with pitch and roll on curbs and the pier ramp,
  collide with buildings, and expose engine state (`rpm`, load, speed) for the
  audio layer.
- **Left click** or **H** sounds the horn.
- **F** or **E** enters the nearest slow car or leaves the car you are in.
  The prompt appears as `F / E · ENTER VEHICLE` or `EXIT VEHICLE`.

The vehicle card in the HUD reports model, class, tune, a large speed
readout, condition and damage percentages, gear, engine load and the radio
line. Condition drops with impacts; the card is the same data the world uses,
not a separate scripted display.

## Traffic

`traffic.js` keeps up to **18 cars** in the grid lanes. Cars:

- brake for the stop line at the next intersection;
- keep a following gap to anything in their lane;
- wait for pedestrians in the crosswalk;
- recycle in and out of view around the player;
- avoid the player on foot when the player is ahead in their lane.

A car driving along the x axis uses a **z** road line, and a car driving along
the z axis uses an **x** road line. This is the beach spawn fix: the old
mapping put z-axis cars at `x = -189` and `x = -243`, on the sand, where they
queued at traffic signals that do not exist there. Ambient cars now stay on
the road grid, and `traffic.updateCars` removes any off-grid stray (an older
spawn, or a car knocked onto the beach) on its next tick.

Every intersection has a visible signal. The lamp sets and the car rule call
the same `signalState()`: green for 7.5 s, amber for 1.5 s, red for the other
axis. A driving light and a stopping car cannot disagree.

## Carjacking

Stealing a civilian car has a consequence. When Rae enters an AI-driven car
that is not a police cruiser, `traffic.ejectDriver(car)`:

1. finds a free spot at the driver door (car-local left, just outside the
   bodywork, or the passenger side, or the rear quarter);
2. spawns a normal pedestrian there, facing the car;
3. clears its block route and sends it fleeing away from the car for six
   seconds.

The car is then Rae's (`car.driver === 'player'`), and the HUD shows a
one-shot `CARJACKED / DRIVER BAILED` toast. The ejected driver is a normal
crowd member: killable, lootable, counted by the panic and armed-witness
systems, and it drops the usual death loot. If the crowd has no free slot or
the door is blocked, the entry still works and no toast is shown.

Police cruisers do not eject a driver; stealing one reports the theft to the
police director instead.

## Getting hit

A moving car that overlaps Rae pushes her out of the bodywork, lands one
damage hit above about 2.5 m/s, and knocks her down for 0.9 s behind a shared
1.25 s cooldown. The full rules are in [combat](combat.md#vehicle-hits-and-knockdown).

## Where this lives

- `game/src/vehicles.js` — the seven classes, meshes, instanced wheels,
  arcade physics, lights, skid marks and `overlapCircle`.
- `game/src/traffic.js` — lane AI, following gaps, stop lines, recycling,
  ambient spawns, `ejectDriver` and off-grid cleanup.
- `game/src/traffic-signals.js` — the shared signal clock and lamp sets.
- `game/src/player.js` — enter/exit, driving input, vehicle contacts and
  knockdown.
- `game/src/hud.js` — the vehicle card and carjack toast.
