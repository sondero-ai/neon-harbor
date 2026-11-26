# Implementation plan: radio playlists and station wheel

Spec: `docs/superpowers/specs/2026-11-26-radio-playlist-design.md`
Base: `night-final` after `living-city` merges and deploys. Branch:
`radio-playlists`.

## Task 1 — Station and track data

1. Replace the three-station `RADIO` block in `game/src/config.js` with the
   six stations and their tracks from the spec, including `fallbackStyle`,
   colours and file paths. Vega 105.1 is first and the default; all eighteen
   tracks have files.
2. Add a small loader that checks a track file's availability without
   throwing when it is absent.
3. Add a Node check that every declared track has a unique path and that the
   files present are within the size budget; missing files are allowed for
   the procedural fallback.

## Task 2 — RadioPlayer

1. Add the two-deck player with a 0.8 s crossfade, auto-advance, station and
   track wrap, and the existing master volume/mute.
2. Keep the procedural sequencer as `fallbackStyle` per station; it starts
   only when no file for the station can play.
3. Start after the existing first-gesture unlock; stop cleanly on page hide.

## Task 3 — Input, state and save

1. Add the keys: `T`, `[`, `]`, `,`, `.`, and hold-`Tab` wheel; prevent the
   browser focus change while the wheel is open.
2. Expose `radio` in `__neon` with station, track, artist, index, enabled and
   playing.
3. Save and restore the station, track, on/off and volume; old saves default
   to Vega 105.1, track 0.

## Task 4 — HUD

1. Update the two radio labels to the new `state.radio` fields.
2. Draw the hold-`Tab` wheel: station colours, current highlight, three track
   titles, keys; dim the world behind it.
3. Show `SYNTH` when the procedural fallback is playing.

## Task 5 — Assets, docs, verification

1. Copy the eighteen processed OGGs from `Suno Audio/processed/` into
   `game/audio/radio/<station>/` using the names in the prompt pack; add
   `MUSIC.md` with the generated track list, date and Suno licence note.
2. Update the README radio section, controls, credits and the "no network"
   wording; keep the total game size under the 48 MiB cap.
3. Run the existing E2E plus the new radio checks; `main.ts --check` must
   pass with the audio included.
4. Commit on `radio-playlists`; do not merge, push, deploy or submit.

## Acceptance

- Six stations, three tracks each; station and track switching from the
  keyboard and the wheel; HUD matches the audio state.
- Missing files fall back to the procedural loop and never break the game.
- Persistence works across Continue; old saves load.
- Radio assets <= 36 MB; the check still passes.
- README and MUSIC.md truthful; no unlicensed track in the repo.
