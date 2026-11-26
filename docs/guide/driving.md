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
- **F** always enters the nearest slow car or leaves the car you are in.
  **E** does the same only when no context action (sit, steal, rob, valet,
  retrieve) owns the key. The prompt appears as `F / E · ENTER VEHICLE`,
  `F / E · EXIT VEHICLE` or a contextual `E · …` line.

The vehicle card in the HUD reports model, class, tune, a large speed
readout, condition/damage and fuel, gear, engine load and the radio line.
Condition and fuel drop in play; the card is the same data the world uses,
not a separate scripted display.

## Fuel and service

Every car carries a tank from 0 to 1. Driving burns
`FUEL_BURN_PER_METER = 0.00007` for each metre travelled, so a full tank lasts
about 14.3 km — roughly 12–16 real minutes around the harbor. An empty tank
turns the throttle into nothing: the car still rolls, steers and brakes, but
it cannot accelerate. Fuel is session state like bodywork condition; it is not
written to the save.

The vehicle card draws the tank as `NN% FUEL` plus a bar: teal from 30% up,
gold from 20% to 30%, coral below 20%. A one-shot `LOW FUEL` toast fires the
first time the tank drops under 20% and arms again after a refuel above 35%.

**Solano Fuel** is the station on block (-108, 0), on the north-west side of
the x=-81 road. Stop within 3.5 m of a nozzle at under 0.5 m/s and press
**E · SERVICE**. The prompt shows the exact quote — **$8 per 10% of the
missing tank plus $150 scaled by body damage** — and E fills the tank to 100%
and repairs the body to 100%. A wallet short of the quote refuses with
`NOT ENOUGH CASH` and changes nothing; a full, undamaged car has no prompt and
is never charged. **F** still exits without paying, so a pump never traps a
driver. A city reset restores the opening cars' tanks (0.62 and 0.88) and
leaves the save shape alone.

## Traffic

`traffic.js` keeps up to **18 cars** in the grid lanes. Cars:

- brake for the stop line at the next intersection;
- keep a following gap to anything in their lane;
- wait for pedestrians in the crosswalk;
- recycle in and out of view around the player;
- avoid the player on foot when the player is ahead in their lane;
- pull into Solano Fuel when flagged low on fuel (about 22% of ambient cars
  spawn with a tank between 0.10 and 0.34). A flagged northbound car on the
  x=-81 lane takes a free pump, waits 4–6 s, then loops around the kiosk and
  rejoins the lane; with both pumps busy it keeps driving. Unflagged cars
  never stop.

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

## The Solano Mall lot

The lot behind the mall is 32 × 16 m with **26 stalls** in two rows and a 6 m
aisle. Most occupied stalls are static cars: one instanced body per model (at
most six body draw calls) plus one shared wheel mesh. Each occupied stall also
has a solid AABB collider; emptying or stealing the car removes it, so the
player can never be trapped by an invisible body.

- Occupancy follows the clock: about 20% at night, 35% at dawn, 65% in the
  day and 90% at dusk. Changes stagger one stall at a time over a few seconds.
- Five real cars are always parked near the entrance. They are normal
  Vehicles and can be entered with **F** or **E**.
- **E · STEAL** beside a static car hides the instance, removes the collider,
  spawns a real Vehicle of that type and colour and puts Rae at the wheel. The
  stall stays empty until the next city reset.
- Stop in the teal valet zone and **E · VALET** parks the car: Rae steps out,
  the car is stored and a valet walks to the stall. **E · RETRIEVE** at the
  podium spawns it back at the entrance pad. **F** still exits without
  parking, so the valet action never traps a driver.
- The lot door on the mall's parking side is pedestrian-only; the building
  footprint refuses every vehicle.

## Getting hit

A moving car that overlaps Rae pushes her out of the bodywork, lands one
damage hit above about 2.5 m/s, and knocks her down for 0.9 s behind a shared
1.25 s cooldown. The full rules are in [combat](combat.md#vehicle-hits-and-knockdown).

## Where this lives

- `game/src/vehicles.js` — the seven classes, meshes, instanced wheels,
  arcade physics, lights, skid marks, the fuel tank and `overlapCircle`.
- `game/src/fuel.js` — the tank constants, distance drain, HUD percent and the
  service quote.
- `game/src/gas-station.js` — the Solano Fuel forecourt, pump slots, player
  service and the NPC pull-in/pump/pull-out state machine.
- `game/src/traffic.js` — lane AI, following gaps, stop lines, recycling,
  ambient spawns, low-fuel flagging, `ejectDriver` and off-grid cleanup.
- `game/src/traffic-signals.js` — the shared signal clock and lamp sets.
- `game/src/player.js` — enter/exit, driving input, vehicle contacts and
  knockdown.
- `game/src/parking.js` — the 26 stalls, static instancing, occupancy, theft
  and valet storage.
- `game/src/interactions.js` — the contextual steal/valet/retrieve/SERVICE
  prompts.
- `game/src/hud.js` — the vehicle card with the fuel gauge, carjack and valet
  toasts.
