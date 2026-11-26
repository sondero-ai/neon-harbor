# Radio playlists, station wheel and generated music

Status: proposed — 2026-11-26, after the living-city branch

## Problem

The radio is three procedural loops, one per station, selected by `[`/`]`.
There is no track list, no next/previous track, no station wheel and no real
music. The HUD shows a station and a hardcoded track name, but the radio is a
synth bed, not the GTA-style station experience the game promises.

## Goals

- Six stations, each with a playlist of three original tracks. Vega 105.1
  (hip-hop) is the default; all eighteen files are generated and staged.
- Station and track switching: `[`/`]` stations, `,`/`.` tracks, `T` on/off,
  `M` mute, and a hold-`Tab` radio wheel that lists stations and tracks.
- The HUD radio card shows the station, track, artist and an ON AIR state; the
  wheel is the same data, not a second source.
- Real music files load from `game/audio/radio/`, with the existing procedural
  loop as a per-station fallback when a file is missing.
- The station, track, on/off and volume persist in the save.
- Suno-generated tracks are credited in `MUSIC.md` with their licence.

## Station map

| Id | Station | Genre | Tracks |
| --- | --- | --- | --- |
| `night-tide` | Night Tide 88.3 | synthwave | Harbor Lights, Neon Coastline, Foggy Harbor Dawn |
| `knrv` | KNRV 104.7 | chiptune | Level E-1, Rainy Bitstorm, Night Arcade Dash |
| `breakwater` | The Breakwater 97.1 | surf | Salt and Sparks, Boardwalk Chase, Midnight Undertow |
| `solano-soul` | Solano Soul 92.1 | funk / neo-soul | Ledger Blue, Beachside Cantina, Family Cut |
| `foundry` | Foundry FM 99.5 | darkwave / EBM | Rust and Rain, Foundry Floor, Graveyard Shift |
| `vega` | Vega 105.1 | hip-hop / rap | Vega Strip Money, Ledger Season, Harbor Flow |

Default station: `vega`, track 0 (`Vega Strip Money`). The wheel order is
Vega, Night Tide, KNRV, The Breakwater, Solano Soul, Foundry. A station with
no playable files and no procedural fallback shows `OFF AIR` and is skipped
by the station keys.

## Data

`config.js` gains a station list; each station has `id`, `station`, `short`,
`genre`, `color`, `fallbackStyle`, and `tracks`. Each track has `title`,
`artist`, `file`, `duration`, `vocals`. Files live under
`game/audio/radio/<station>/<nn>-<slug>.ogg`; the prompt pack and file names
are in `docs/audio/suno-radio-prompts.md`.

The game must still boot with zero audio files: a station whose files are
missing or fail to load uses the existing procedural loop (`fallbackStyle`).
The fallback is silent about the failure in the HUD; it shows the track title
from the metadata and a `SYNTH` tag.

## Playback

- A `RadioPlayer` owns a two-deck crossfade (two `HTMLAudioElement`s routed
  through the existing WebAudio master, or a WebAudio buffer pair) so a
  station change and a track change both fade over ~0.8 s.
- Auto-advance at track end; wrap within the station; station switch starts
  the station's first track (or its saved track).
- Start only after the existing first-gesture audio unlock; obey master
  volume and mute.
- `T` toggles, `[`/`]` change station, `,`/`.` change track, `M` mutes. The
  wheel opens while `Tab` is held (prevented from moving focus), lists the
  six stations and their tracks, and selects with the arrow keys/Enter or a
  click.
- If a station has no playable file, the procedural sequencer for that
  station's `fallbackStyle` plays; switching files later requires no code
  change.

## HUD

- The radio card shows the station frequency/name, the current track and
  artist, the track index (`2/3`) and `ON AIR`/`RADIO OFF`.
- The wheel is a compact overlay: six station columns with colour, the
  current station highlighted, its three tracks listed, and the keys.
- The existing two radio labels (vehicle card and the small panel) read the
  same `state.radio` object; no duplicated station strings.

## Persistence and limits

- Save `radioEnabled`, `radioStation`, `radioTrack` and the volume/mute with
  the existing settings; old saves default to Vega 105.1, track 0, on.
- Audio budget: <= 36 MB total (18 tracks at 96-128 kbps OGG); the game cap
  is 48 MiB. The eighteen generated tracks total ~33 MB. The build check must
  still pass.
- No third-party network requests: all files are local static assets. If the
  README says "no network after load", update it to "no third-party network
  requests; radio files load from the same folder".

## Tests

- Config test: six stations, three unique tracks each, file names match the
  prompt pack; every declared file exists when the assets are present.
- State test: toggle, station, track, wheel selection, persistence, wrap.
- Fallback test: a station with a missing file reports the procedural
  fallback and still changes station/track without throwing.
- E2E: `__neon.radio` exposes station/track/index/enabled/playing; keys change
  them; the HUD state matches; no console errors.
- Audio itself is not auditable headless; report that as the limit.

## Documentation

- README: a Radio and music section, controls, the five stations, the wheel,
  the fallback and the `MUSIC.md` credits.
- `MUSIC.md`: track list, station, generation date, Suno plan and licence
  note; state clearly which tracks are vocal and which are instrumental.
- The Suno prompt pack lives at `docs/audio/suno-radio-prompts.md`.
