# The city and the clock

[← README](../../README.md) · [Story](story.md) · [Driving](driving.md) · [Source map](source-map.md)

The whole harbor is built from one seed in `game/src/config.js`
(`SEED = 20261119`), so every tower, window layout and sign lands in the same
place on every load. There is no runtime random city and no downloaded map.

## The grid

Roads form a ten-line grid on each axis, giving **nine blocks each way — 81
blocks** and **100 intersections**. The original six-by-six core keeps its
exact towers, storefronts and signs; the extension grows two districts around
it. A road is 14 m wide, a block is 40 m, and the sidewalks are raised
0.15 m.

| Area | Direction | Character |
| --- | --- | --- |
| **Vega Strip and the core** | centre | the original six-by-six blocks: storefronts, downtown towers, the hotel and the plaza |
| **Old Town** | north | low brick, striped awnings, chimneys, an open market square with eight stalls, a bandstand and a pylon sign |
| **The Foundry** | east | wide shallow warehouses, steel rails and brick smokestacks with red aircraft lights |
| **The beach** | west | a wide sand slope from the city edge to the shoreline |
| **Pier 9** | west, at `z = 70` | a long deck with a ramp, lamps, warehouses and the lighthouse |

Buildings use eight facade palettes with punched, ribbon and glass window
patterns, floor bands, lit rooms with blinds and curtains, rooftop tanks and
antennas, emissive storefronts and neon boards. Landmarks include the Sunset
Hotel tower, Casa Luna on the beach, Motor Row, the Luna Plaza fountain, the
radio mast, the Vega Strip arch, **Solano Fuel**, Pier 9 and its working
lighthouse.

The beach and pier stay at the west edge of the map. The player bounds are
generous enough to include the pier; the city limits are
`x -142..358`, `z -250..250`, and the shoreline is at `x = -232`.

## Solano Mall and the lot

Block `(54, 0)` is the mall district. The building is **32 × 16 m** at
`x 38–70, z 0–16`, with 0.5 m walls, a 3.2 m main door on the Vega Strip side
and a matching lot door on the parking side. Both doors are open pedestrian
gaps; every vehicle is refused the whole footprint by `world.vehicleBlocked`,
so cruisers and civilian cars stay outside while officers and shoppers walk
in. Inside are a 6.2 m ceiling with a skylight strip, six shop bays (jewelry,
electronics, clothing, pharmacy, cafe, arcade), a vendor counter and six
food-court tables with **24 chairs**, all of them seats in the shared
registry. Three point lights and emissive troughs light the hall, and the
automatic glass doors part when the player is within 3 m.

The **26-stall parking lot** fills the back half of the block
(`z -16–0`), thirteen stalls in each of two rows around a 6 m aisle. Most
stalls hold static cars drawn as one instanced body per model plus a shared
wheel mesh; each occupied stall owns a solid collider. Occupancy follows the
clock: about 20% at night, 35% at dawn, 65% in the day and 90% at dusk, with
changes staggered over a few seconds. Five real cars wait near the entrance.
Press **E** beside a static car to steal it into a real drivable Vehicle; the
stall's instance and collider both go away until the next city reset. Stop a
car in the teal valet zone and press **E** to park it, then press **E** at the
podium to bring it back to the entrance. **F** still leaves the car
unconditionally.

Sittings extend past the mall: the Luna Plaza benches, the pier benches and
the beach loungers are all in the same `world.seats` registry, so **E** works
at any free chair, bench or lounger. Crowd shoppers reserve mall chairs for
20–60 in-game minutes and stand up when they panic, flee or die.

The mall is lit, busy and enterable at every hour. At night four shoppers and
one seated shopper remain; dusk brings thirty shoppers and seven occupied
chairs. The jewelry register on the west counter starts the one robbery each
city reset: three wanted stars, two hostile guards, a panicking crowd and a
$650–950 cash drop.

## Solano Fuel

Block `(-108, 0)` is the Solano Fuel station, on the north-west corner of the
x=-81 road. A **16 × 20 m canopy** on four 0.5 m columns covers two 6 m pump
islands at `z = -8` and `z = +8`; each island carries two pumps, for four
nozzles. The kiosk is **10 × 8 m** at `x = -120` with an east door, a north
service-bay roll-up door, a lit sign and a price board (`FUEL 1.89 · DIESEL
2.05 · AIR FREE`). An air/water stand sits at `(-116, 13)`. A **service lane**
runs at `x = -92` from the entry curb cut at `z -20..-16` to the exit at
`z +16..+20`, with painted entry/exit chevrons on the road at
`(-84.2, -18)` and `(-84.2, +18)`.

The canopy, kiosk, pump islands, columns and air stand are solid normal
colliders; the forecourt, pads, service lane and both curb cuts are clear for
a car. The station's two pads are real slots. About **22%** of ambient cars
spawn with a low tank; a flagged northbound car on the adjacent lane pulls
into a free pad, waits **4–6 s**, fills, then loops around the kiosk and
rejoins the lane at `(-84.2, 18)`. Both pumps can be busy at once, and a
third flagged car keeps rolling instead of queueing in the road. The station
is also its own `?shot=station` scene with a car on pad 0 and one on the
approach.

## The living clock

`environment.js` owns one clock and the palette it drives. A New Game starts
at **18:00 on day four**; the clock runs **five in-game minutes per two real
seconds** (`CLOCK_MINUTES_PER_SECOND = 2.5`), so a full day takes **9.6 real
minutes** and the HUD's `DAY n · HH:MM` line advances through it. Continue
restores the saved minute and day, and midnight rolls the day counter. The
traffic signals are separate: they keep their real-time 18 s cycle, and the
clock is a time-of-day indicator, not a signal clock.

| Period | Clock | What the palette does |
| --- | --- | --- |
| Dawn | 05:00–07:00 | rose fog, a low amber sun, windows and lamps half on |
| Day | 07:00–17:00 | pale blue sky, a high white sun, windows and neon dimmed, no lamp pools or headlight beams |
| Dusk | 17:00–19:00 | orange horizon, long shadows, windows and signs coming up |
| Night | 19:00–05:00 | the indigo-to-magenta sky, the moon and stars, full neon, lamp pools and headlights |

Each boundary gets a sixty-minute smoothstep blend. The palette is one blend
of fog colour and distance, hemisphere and ambient light, sun direction and
warmth, exposure, sky texture crossfade, star opacity, moon and sun sprites,
window emission, crown and pier neon, street-lamp colour and pools, car
headlight brightness, and water tint and sparkle. Night keeps the moon, the
magenta band of city light pollution on the horizon, cool moonlight plus warm
emissive windows, instanced pools under the streetlights and blade signs, the
scrolling water, the turning lighthouse beam and drifting clouds.

A `?shot=` capture pins the clock at **23:41** so the screenshots are
repeatable; `?time=HH:MM` overrides it for any shot or free-play load. The
daylight roadblock screenshot is the same blockade pose captured with
`?time=10:30`, so the four-image contact sheet shows both ends of the living
clock.

## The shoreline

The visible sand starts at the city edge and ends at `WORLD.shorelineX`
(`-232`). It falls 0.45 m from the city edge to the water with a ripple no
deeper than 1 cm, and the mesh is segmented finely enough that the slope
reads smooth. A darker wet-sand strip fades nine metres inland from the
waterline, and the foam line sits on the water edge itself. Every visible
sand metre east of the shoreline is walkable; `world.collides` blocks only
west of it (except on the pier deck and its ramp).

The earlier build let the sand mesh run about 16 m west of the walkable line,
so a visible sand shelf sat over water and the beach read uneven. Both are
fixed: the sand geometry stops at the shoreline and the profile is one
smooth slope.

Ambient traffic stays on the road grid. A car whose ai axis is `x` drives
along a z road line and a car whose axis is `z` drives along an x road line;
the old mapping spawned z-axis cars at `x = -189` and `x = -243` on the
beach, where they queued at phantom signals. `traffic.updateCars` now removes
any off-grid stray on its next tick, which also clears a car knocked onto the
sand.

## Traffic and the crowd

`traffic.js` keeps up to **18 cars** in the grid lanes and fills the blocks
with up to **168 pedestrians**:

- a **64-walker** sidewalk crowd that loops the block edges;
- **28 people** on the beach and the pier;
- up to **30 mall shoppers** at dusk, four at night, with seven chairs taken;
- **two valets** at the mall lot podium and crosswalk pedestrians.

Cars brake for the stop line, keep a following gap to anything in their lane,
wait for pedestrians in the crosswalk, and recycle in and out of view around
the player. About 22% of ambient cars carry a low tank and divert into Solano
Fuel when a pump is free; the rest never stop. The whole crowd is drawn
through nine instanced meshes (the eight body parts plus a shopping bag), so
the street stays fluid with a full crowd on screen.

Every one of the **100 intersections** has a visible signal
(`traffic-signals.js`): a pole and two heads, one colour-and-axis instanced
lamp set each, and a small night pool. The lamps and the car rule call the
same `signalState()` — green for 7.5 s, amber for 1.5 s, red for the other
axis — so a driving light and a stopping car cannot disagree. The minimap
mirrors the traffic with vehicle blips, and the HUD reports the live car and
walker counts.

Pedestrians never walk through a building. `world.resolveCircle()` pushes the
walker out of the nearest collider and `walkToward()` tries the full step,
then x-only, then z-only, then stops and lets the block loop pick another
corner. Foot officers and mission enemies use the same resolve, so a chase
around a corner slides along the wall instead of clipping through it.

## Performance

A typical 1280×720 frame in this build uses about **400 draw calls** at the
chase, **395** at the daylight roadblock, **215** in the mall interior, **348**
on the title, **406** in the Pier 9 heist still and **227** at the Solano Fuel
station; headless Chrome on the build machine averaged 5.6–7.5 ms per frame
across the shots. The pre-living-city base measured 433 draw calls and 6.7 ms
on the same harness. Static glows share one instanced billboard field
(`glow-field.js`), each car's four wheels are one instanced mesh, the static
parking bodies are six instanced meshes plus one shared wheel mesh, and the
Air 1 airframe is merged per material, so the larger city, mall, station and
crowd cost less per frame than the old six-by-six build. The four screenshots
currently report 215–400 draw calls each.

## Where this lives

- `game/src/config.js` — the seed, road lines, block centres, world bounds,
  beach and pier geometry, clock constants.
- `game/src/world.js` — city generation, districts, ground/collision/camera
  queries, beach, pier, lighthouse, ocean, sky textures, sun and moon,
  lights, signs, the merged glow field and animation.
- `game/src/world-kit.js` — the shared geometry/material helpers.
- `game/src/mall.js` — the mall shell, shops, food court, doors, register and
  the 24 seats.
- `game/src/parking.js` — the 26 stalls, instanced static cars, occupancy,
  theft and the player valet.
- `game/src/gas-station.js` — the Solano Fuel canopy, islands, kiosk, lanes,
  colliders, pump slots and the NPC pump flow.
- `game/src/fuel.js` — the tank constants, drain, percent and service quote.
- `game/src/mall-life.js`, `game/src/robbery.js` — the shopper schedule and
  the jewelry robbery.
- `game/src/interactions.js` — the contextual **E** layer.
- `game/src/environment.js` — the clock, palettes, boundary blend and
  `?time=` parsing.
- `game/src/traffic.js`, `traffic-signals.js` — cars, crowd, signals and
  collision-aware walking.
- `game/src/glow-field.js`, `geo.js` — instanced glow billboards and the
  shared mesh/facade/sign factories.
