# Story and free roam

[← README](../../README.md) · [City](city.md) · [Combat](combat.md) · [Driving](driving.md)

Neon Harbor is one chapter of an original crime story. You play **Rae
Solano**, a courier who comes home to settle a family debt and finds the
harbor already divided. The chapter runs five missions in order, then opens
into free roam with the same character, city and save.

## New Game and Continue

**New Game** starts Rae on the yellow line at the quiet west end of Vega
Strip, at **18:00 on day four**, in the last light. She faces west toward the
water, a parked Riptide is a short walk to the north curb, and the first story
marker is west along the Strip.

**Continue** restores the last pause or save: story and mission index, cash,
health, armor, weapons, ammo, position, camera yaw, the minute of day and the
day number, the radio station/track/on-off state, and any heat that was still
on Rae. Quality, volume and mute live in a separate settings record and also
survive a reload. The title screen says **No save yet** until a save exists.

## The five missions

Every mission has a start marker, a world objective, a dialogue script, a
completion condition and a cash reward. Finishing one sets the marker for the
next and writes the mission index through the save.

| # | Mission | What happens | Reward |
| --- | --- | --- | --- |
| 1 | **The Riptide Job** | Mira sends Rae to steal a Vela GT from the Sunset Hotel and deliver it to the Motor Row bay. | $1,200 |
| 2 | **Heat Check** | The car carried a tracker. Lose the Harbor PD and reach the safehouse clean. | $1,800 |
| 3 | **Special Delivery** | Carry the Solano ledger from Casa Luna to Tomas at Luna Plaza before the timer runs out. | $1,500 |
| 4 | **Family Cut** | Tomas' crew springs an ambush at the fountain. Fight out of the plaza and learn where Aurelio is waiting. | $2,400 |
| 5 | **Pier 9 Burning** | Clear Aurelio's enforcers from the pier, set the place on fire and escape before the deck goes up. | $6,000 |

Combat missions put real low-poly crew on the street with chest and head hit
boxes, line-of-sight checks, advancing and firing AI, death poses and a boss
health pool. The player's hitscan queries mission enemies as well as cruisers,
officers and cars. Each combat mission supplies an SMG and armor, so a new
player is never sent in with an empty pistol. Finishing the fifth mission
paints **THE HARBOR IS YOURS** and leaves free roam open.

The HUD chapter card names the chapter (`CH.2 · STRIP HEAT`), the mission
title, a one-line objective, a four-segment stage bar and a `NEXT:` line. Mira
Sol and the crew speak through the portrait dialogue box; mission results and
rewards arrive as toasts and a gold cash banner.

## Failure is a state, not a reload

A downed or busted player, a missed delivery window or a wrecked mission car
sets the failure panel, returns the objective marker to the mission start and
offers **Enter** or a walk back into the marker. Retrying resets the mission,
heals Rae, clears the heat and rebuilds the setup. The active mission index is
written in the save, so Continue re-offers the job from its start marker.

## Free roam

Free roam is always live around the story:

- **Cash stashes** — six gold stashes around the harbor; walk over one to
  collect it. They respawn so the loop keeps paying.
- **Chop-shop delivery** — a marked Vela GT, Riptide or Dune Hauler appears in
  rotation; drive it to Motor Row for a delivery fee.
- **Heat Run** — step into the red ring and hold three wanted stars for
  forty-two seconds.
- **Safehouse** — the teal ring at `(-71.5, 36.6)` on Vega Strip heals Rae,
  recharges armor, clears heat and writes the save.

The safehouse is the save point. Every completed mission, cash pickup,
delivery, heat run and safehouse visit writes progress through `save.js`.
Settings (quality, volume, mute) live in their own storage key; the save
carries cash, health, armor, wanted stars, mission index, story-complete flag,
weapons, ammo, camera yaw, position, the minute of day and the day number.

## Where this lives

- `game/src/missions.js` — mission definitions, markers, dialogue, objectives,
  timers, enemies, rewards, failure and retry, pier fire and staging.
- `game/src/activities.js` — stashes, hot-car delivery, Heat Run and the
  safehouse.
- `game/src/save.js` — the guarded localStorage save and settings record.
- `game/src/hud.js` — chapter card, dialogue, objective, rewards and failure
  screens.

For the combat rules behind the missions, see [combat](combat.md). For the
vehicles used in the Riptide Job and the delivery loop, see
[driving](driving.md).
