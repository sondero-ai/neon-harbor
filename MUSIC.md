# Neon Harbor — radio music credits

The in-game radio plays eighteen original tracks generated with Suno on
**2026-11-26**. The prompt pack and per-track lyrics live in
`docs/audio/suno-radio-prompts.md`; the playable files are OGG Vorbis copies
under `game/audio/radio/<station>/` and total 33,973,559 bytes (about 32.4
MiB). They were exported at roughly 82-95 kbps, 44.1 kHz stereo, and are not
re-encoded by the game.

**Licence note:** these tracks were generated on a Suno account. Before
publishing this repository or a build publicly, the operator must confirm that
the Suno plan's commercial-use terms cover every track here. If a track cannot
be published, delete its OGG: Night Tide 88.3, KNRV 104.7 and The Breakwater
97.1 fall back to their procedural SYNTH loops, while Vega 105.1, Solano Soul
92.1 and Foundry FM 99.5 show OFF AIR until a playable file is present.

## Track list

| # | Station | Track | Artist | Vocal | Length | File |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Vega 105.1 | Vega Strip Money | Kade Voss | vocal | 1:59 | `audio/radio/vega/01-vega-strip-money.ogg` |
| 2 | Vega 105.1 | Ledger Season | Nia Vex | vocal | 1:18 | `audio/radio/vega/02-ledger-season.ogg` |
| 3 | Vega 105.1 | Harbor Flow | Marlowe | vocal | 1:21 | `audio/radio/vega/03-harbor-flow.ogg` |
| 4 | Night Tide 88.3 | Harbor Lights | Sable Youth | vocal | 3:06 | `audio/radio/night-tide/01-harbor-lights.ogg` |
| 5 | Night Tide 88.3 | Neon Coastline | Sable Youth | instrumental | 3:54 | `audio/radio/night-tide/02-neon-coastline.ogg` |
| 6 | Night Tide 88.3 | Foggy Harbor Dawn | Sable Youth | instrumental | 3:50 | `audio/radio/night-tide/03-foggy-harbor-dawn.ogg` |
| 7 | KNRV 104.7 | Level E-1 | Pixel Sonata | instrumental | 2:33 | `audio/radio/knrv/01-level-e-1.ogg` |
| 8 | KNRV 104.7 | Rainy Bitstorm | Pixel Sonata | instrumental | 2:48 | `audio/radio/knrv/02-rainy-bitstorm.ogg` |
| 9 | KNRV 104.7 | Night Arcade Dash | Pixel Sonata | instrumental | 2:12 | `audio/radio/knrv/03-night-arcade-dash.ogg` |
| 10 | The Breakwater 97.1 | Salt and Sparks | The Breakwater Trio | vocal | 2:48 | `audio/radio/breakwater/01-salt-and-sparks.ogg` |
| 11 | The Breakwater 97.1 | Boardwalk Chase | The Breakwater Trio | instrumental | 2:58 | `audio/radio/breakwater/02-boardwalk-chase.ogg` |
| 12 | The Breakwater 97.1 | Midnight Undertow | The Breakwater Trio | instrumental | 2:45 | `audio/radio/breakwater/03-midnight-undertow.ogg` |
| 13 | Solano Soul 92.1 | Ledger Blue | Rae Solano | vocal | 2:33 | `audio/radio/solano-soul/01-ledger-blue.ogg` |
| 14 | Solano Soul 92.1 | Beachside Cantina | Solano Soul House Band | instrumental | 3:37 | `audio/radio/solano-soul/02-beachside-cantina.ogg` |
| 15 | Solano Soul 92.1 | Family Cut | Odin | vocal | 2:19 | `audio/radio/solano-soul/03-family-cut.ogg` |
| 16 | Foundry FM 99.5 | Rust and Rain | Cold Stack | vocal | 3:25 | `audio/radio/foundry/01-rust-and-rain.ogg` |
| 17 | Foundry FM 99.5 | Foundry Floor | Cold Stack | instrumental | 3:39 | `audio/radio/foundry/02-foundry-floor.ogg` |
| 18 | Foundry FM 99.5 | Graveyard Shift | Cold Stack | instrumental | 3:39 | `audio/radio/foundry/03-graveyard-shift.ogg` |

Eight tracks are vocal and ten are instrumental. The station ids, track
titles and file names in `game/src/config.js` are the source of truth; the
Node test `test/radio.test.mjs` checks every path against the prompt pack and
the files on disk.
