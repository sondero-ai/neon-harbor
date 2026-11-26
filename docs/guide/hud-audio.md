# HUD, audio and settings

[← README](../../README.md) · [Radio](radio.md) · [Combat](combat.md) · [Building](building.md)

The HUD is one Canvas 2D layer over the WebGL view. It is read-only: every
card reads live game state, and no card drives simulation. The audio layer
builds the soundscape with WebAudio oscillators and noise; the radio decks
share the same master.

## The HUD

### Left rail

- **Chapter card** — `CH.2 · STRIP HEAT`, the mission title, a one-line
  objective, a four-segment `STAGE 2/4` bar and a `NEXT:` line.
- **Vitals** — Rae's health and armor bars with hit flashes.
- **Minimap** — the baked city and district, the named street, live traffic
  and walker counts, the player arrow, alternating red/blue police and
  officer blips, mission enemies in coral and the objective marker.
- **Crew panel** — Mira Sol, Odin and Kiki with live role and status lines.
- **Dialogue box** — a drawn portrait, speaker name, role and line.

### Right rail

- **Cash card** and five wanted stars.
- **Pursuit state** — `PURSUIT · 6 UNITS`, the search status, or no active
  bolo.
- **Clock** — `DAY 4 · 18:00` with a live `DAWN / DAY / DUSK / NIGHT SHIFT`
  label.
- **Respect meter** — `STRIP RUNNER · 62/250 RESPECT`.
- **HPD response roster** — named callsigns, live roles and distances.
- **Weapon strip** — five slots: Solano 9, Kestrel SMG, the always-carried
  street knife at slot 3 with `--` ammo and a `STREET KNIFE · CQC` footer,
  plus locked rifle and RPG slots.
- **Vehicle card** — model, class, tune, a large speed readout, condition and
  damage percentages, gear, engine load and the station radio line (station,
  artist, track, `1/3`, and `ON AIR`, `SYNTH`, `OFF AIR` or `RADIO OFF`).

### Edges and overlays

- A top-centre district/street line and the `AIR 1 · SPOTLIGHT` banner with
  the helicopter's range.
- A bottom-centre objective, progress or countdown, the context prompt
  (`F / E · ENTER VEHICLE`), a dynamic crosshair (a fixed small reticle for
  the knife) and the hit marker.
- Street jobs get their own progress panel under the location line.
- Rewards and mission results arrive as toasts and a gold cash banner.
- Getting wasted or busted takes over the screen with a full-frame overlay,
  drops part of the cash on hand and returns Rae to the strip with the heat
  cleared.
- A failed mission stays on screen with a retry prompt until you take it
  again.
- The hold-Tab station wheel takes over the centre of the screen.

`hud.js` also draws the controls panel helper, the mission-complete ending
card and the dialogue portraits. Shot mode suppresses toasts and the
fresh-slot title card so the screenshots stay deterministic.

## Audio

`audio.js` builds the whole soundscape with WebAudio oscillators and noise:

- an engine hum tracking rpm, load and speed;
- a two-tone siren whose level follows the nearest cruiser or officer;
- pistol and SMG reports, impacts, explosions and the horn;
- reload clicks, pickup chimes, hurt and wasted/busted stings, and menu
  blips;
- the three procedural synthwave, chiptune and surf beds used as radio
  fallbacks.

The two-deck player in `radio.js` crossfades the local OGG tracks through the
same WebAudio master. The context is created on the first real pointer or
keyboard gesture; no third-party requests are involved.

Audio output cannot be heard in headless Chrome. The end-to-end suite asserts
the player state, the file responses and the sequencer bus instead.

## Volume and mute settings

The title and pause panels both carry an **Audio** row:

- a range input from 0 to 100, showing the live percentage;
- a Mute toggle that flips to Muted and sets `aria-pressed`;
- the row persists through `SaveStore.saveSettings` with `quality`, `volume`
  and `muted`.

The slider and **M**, **`-`** and **`=`** stay in sync: moving the slider
updates both panels and lifts an old mute so the gesture is audible; the
keyboard updates the slider and percentage. The saved volume is restored on
the next load. Old saves without settings keep the defaults (high quality,
72% volume, unmuted).

The title screenshot in [screenshots/](../../screenshots/4-title.jpg) shows
the Audio row: slider at 72%, `72%` label and the Mute button.

## Quality

The title and pause panels carry a **Quality** switch:

- **High** — shadows and full pixel ratio;
- **Low** — no shadows and a lighter pixel ratio.

It applies without a reload, persists with the settings record, and shot mode
forces high quality for reproducible screenshots.

## Where this lives

- `game/src/hud.js` — every card, panel, overlay, toast, wheel and the
  mission-ending screen.
- `game/src/audio.js` — the WebAudio engine, effects and fallback beds.
- `game/src/radio.js` — the music decks and their state.
- `game/src/main.js` — settings wiring, the Audio rows, quality, toasts and
  the title/pause state machine.
- `game/src/save.js` — the guarded save and settings records.
- `game/index.html` — the title/pause/controls markup and the Audio-row CSS.
