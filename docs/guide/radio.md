# The radio

[← README](../../README.md) · [HUD and audio](hud-audio.md) · [Music credits](../../MUSIC.md) · [City](city.md)

Six stations, eighteen original tracks, all local OGG files under
`game/audio/radio/`. There are no third-party network requests and no
streaming service. Vega 105.1 is the default.

## Stations

| Station | Genre | Tracks |
| --- | --- | --- |
| Vega 105.1 | hip-hop / rap | Vega Strip Money, Ledger Season, Harbor Flow |
| Night Tide 88.3 | synthwave | Harbor Lights, Neon Coastline, Foggy Harbor Dawn |
| KNRV 104.7 | chiptune | Level E-1, Rainy Bitstorm, Night Arcade Dash |
| The Breakwater 97.1 | surf rock | Salt and Sparks, Boardwalk Chase, Midnight Undertow |
| Solano Soul 92.1 | funk / neo-soul | Ledger Blue, Beachside Cantina, Family Cut |
| Foundry FM 99.5 | darkwave / EBM | Rust and Rain, Foundry Floor, Graveyard Shift |

The station ids, track titles, artists, durations and file paths live in
`RADIO` in `game/src/config.js`. That object is the source of truth; the HUD,
the wheel, the save and the tests read it, not a second list.

## Controls

- **T** switches the radio on or off.
- **`[`** and **`]`** change station.
- **`,`** and **`.`** change track.
- **M** mutes.
- Hold **Tab** for the station wheel: the arrows pick a station and track,
  **Enter** tunes it, or click a track.
- **`-`** and **`=`** trim the master volume.

Station and track changes crossfade over **0.8 s**. A track auto-advances at
its end and wraps within its station. Switching stations starts track 1 of
that station. A station with no playable file and no procedural fallback is
marked OFF AIR and skipped by the station keys when possible.

## The HUD card and wheel

The vehicle/radio card reports the station, the track and artist, `1/3` and
one of these states:

- **ON AIR** — a real OGG file is playing;
- **SYNTH** — the station's procedural bed is playing instead of a file;
- **OFF AIR** — neither a file nor a fallback is available;
- **RADIO OFF** — the player switched the radio off.

The hold-**Tab** wheel shows all six stations and their three tracks in one
overlay, with the current station and track marked. It reads the same
`RadioPlayer.state` as the card.

## Files and fallbacks

The procedural fallback exists for Night Tide 88.3 (synthwave), KNRV 104.7
(chiptune) and The Breakwater 97.1 (surf). Vega 105.1, Solano Soul 92.1 and
Foundry FM 99.5 have no fallback and show OFF AIR if their files are missing.
The fallback is deliberate: the game must boot with zero audio files, so a
missing or failed file never breaks the page.

The player is a two-deck `HTMLAudioElement` pair routed through the existing
WebAudio master. Master volume and mute therefore apply to music and effects
together. The radio starts only after the first pointer or keyboard gesture
unlocks WebAudio, and never in deterministic `?shot=` mode.

## Persistence

The station, track and on/off state persist with the save, alongside the
story, cash, position, clock and heat. Volume and mute persist in the
separate settings record with quality. Continue restores the saved station
and track; an old save with no radio fields falls back to Vega track 0.

## Music credits and licence

The eighteen tracks were generated with **Suno on 2026-11-26**. [MUSIC.md](../../MUSIC.md)
lists every track, artist, duration and whether it is vocal, plus the licence
note the operator must confirm before publishing. The prompts and lyrics are
in [docs/audio/suno-radio-prompts.md](../audio/suno-radio-prompts.md).

Do not delete a file without updating `config.js` and `MUSIC.md`; the radio
test checks every path against the prompt pack and the OGG headers, and each
station's track list against the credits.

## Where this lives

- `game/src/radio.js` — the two-deck player: crossfade, auto-advance,
  station/track wrap, master volume and mute, missing-file fallback and OFF
  AIR.
- `game/src/config.js` — the `RADIO` station and track data.
- `game/src/audio.js` — the three procedural beds used as fallbacks.
- `game/src/hud.js` — the radio card and the hold-Tab wheel.
- `game/src/main-radio.js` — the radio keys and wheel focus; `main.js` keeps
  the save wiring.
- `test/radio.test.mjs` — the station order, track data, file checks, budget
  and credits.
