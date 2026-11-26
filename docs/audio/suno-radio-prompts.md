# Suno radio prompt pack — Neon Harbor

Manual generation guide for the five in-game stations. Generate each track,
export it, and drop it into `game/audio/radio/<station>/` using the file names
below. The game falls back to its procedural loop when a file is missing, so
partial batches are fine.

## Global rules

- Use only original prompts and lyrics. Do not name real artists, bands, songs
  or labels in the style or exclude fields.
- Suno: keep the **Style** box under ~200 characters; paste the **Lyrics** box
  only for vocal tracks and leave **Instrumental** on for the rest.
- Target 2:00-2:40, a clean ending with no long fade (the game crossfades).
- Export: OGG Vorbis, 44.1 kHz stereo, 128 kbps, about -14 LUFS integrated,
  true peak -1 dB, no clipping.
- Budget: 18 tracks at ~1.9 MB each is about 34 MB, comfortably under the
  game's 48 MiB cap. Do not export WAV or 320 kbps MP3.
- Only use tracks you have the rights to use in a public repository. Check
  your Suno plan's commercial-use terms before committing; add the generation
  date and track list to `MUSIC.md`.

## Station map

| Station | Frequency | Genre | Tracks |
| --- | --- | --- | --- |
| Night Tide | 88.3 | synthwave / retrowave | Harbor Lights, Neon Coastline, Foggy Harbor Dawn |
| KNRV | 104.7 | chiptune / bitpop | Level E-1, Rainy Bitstorm, Night Arcade Dash |
| The Breakwater | 97.1 | surf rock / spy surf | Salt and Sparks, Boardwalk Chase, Midnight Undertow |
| Solano Soul | 92.1 | funk / neo-soul | Ledger Blue, Beachside Cantina, Family Cut |
| Foundry FM | 99.5 | darkwave / EBM | Rust and Rain, Foundry Floor, Graveyard Shift |
| Vega 105.1 | 105.1 | hip-hop / rap | Vega Strip Money, Ledger Season, Harbor Flow |

**Default station:** Vega 105.1, track index 0 (`01-vega-strip-money.ogg`). All
six stations now have files.

**Generated (2026-11-26):** all eighteen tracks are generated and staged as
OGG files under `game/audio/radio/` (33,973,559 bytes, about 32.4 MiB). The
section titles and file names below are the final generated versions. The Vega
tracks came out shorter than the rest (1:18-1:59); regenerate them only if you
want longer edits.

## Night Tide 88.3 — synthwave

### 1. Harbor Lights — Sable Youth (vocal, 100 BPM, A minor)

**Style:** cinematic synthwave, warm analog pads, gated reverb drums,
arpeggiated bass, shimmering lead, 100 BPM, A minor, nostalgic night drive,
original song

**Exclude:** country, acoustic folk, orchestral, rap, EDM drop, distorted
vocals

**Lyrics:**

```
[Verse]
Neon on the water, midnight on the wire
Every window burning like a low electric fire
I left the engine running by the old hotel sign
Harbor lights are calling and the city's mine

[Chorus]
Harbor lights, harbor lights
Keep me on the road tonight
Every star's a broken sign
Harbor lights, harbor lights

[Verse]
Radio is whispering from a dashboard glow
Names I don't remember and a road I used to know
If the tide keeps rising, let it rise and shine
Harbor lights are calling and the city's mine

[Chorus]
Harbor lights, harbor lights
Keep me on the road tonight
Every star's a broken sign
Harbor lights, harbor lights
```

File: `game/audio/radio/night-tide/01-harbor-lights.ogg`

### 2. Neon Coastline — Sable Youth (instrumental, 104 BPM, F# minor)

**Style:** instrumental synthwave, chrome arpeggios, punchy gated drums, wide
analog pads, 104 BPM, F# minor, coastal night drive, no vocals

**Exclude:** vocals, rap, country, acoustic, orchestral

File: `game/audio/radio/night-tide/02-neon-coastline.ogg`

### 3. Foggy Harbor Dawn — Sable Youth (instrumental, 96 BPM, D minor)

**Style:** dreamy instrumental synthwave, slow analog pads, soft arpeggio,
distant sax-like lead, 96 BPM, D minor, foggy harbor, no vocals

**Exclude:** vocals, upbeat EDM, country, acoustic

File: `game/audio/radio/night-tide/03-foggy-harbor-dawn.ogg`

## KNRV 104.7 — chiptune

### 4. Level E-1 — Pixel Sonata (instrumental, 128 BPM, E minor)

**Style:** 8-bit chiptune, NES-style square lead, fast arpeggio, punchy noise
drums, 128 BPM, E minor, arcade night, instrumental

**Exclude:** vocals, real instruments, orchestral, EDM drop

File: `game/audio/radio/knrv/01-level-e-1.ogg`

### 5. Rainy Bitstorm — Pixel Sonata (instrumental, 138 BPM, C minor)

**Style:** bitpop chiptune, Game Boy pulse leads, breakbeat noise percussion,
138 BPM, C minor, playful rain, instrumental

**Exclude:** vocals, rock guitars, orchestral, acoustic

File: `game/audio/radio/knrv/02-rainy-bitstorm.ogg`

### 6. Night Arcade Dash — Pixel Sonata (instrumental, 124 BPM, G minor)

**Style:** chiptune racing music, fast square lead, walking bass pulse, tight
noise drums, 124 BPM, G minor, night arcade, instrumental

**Exclude:** vocals, heavy guitars, orchestral, EDM

File: `game/audio/radio/knrv/03-night-arcade-dash.ogg`

## The Breakwater 97.1 — surf

### 7. Salt and Sparks — The Breakwater Trio (vocal, 140 BPM, E minor)

**Style:** surf rock, twangy reverb guitar, driving tom groove, tambourine,
140 BPM, E minor, salty pier night, original song

**Exclude:** metal, rap, country, orchestral, EDM

**Lyrics:**

```
[Verse]
Down at Pier Nine where the breakers bite
We got rust on our hands and a fire in the night
The lighthouse turns and the shadows run
We're the pier saints, we don't run

[Chorus]
Salt and sparks, salt and sparks
We ride the dark till the morning starts
Salt and sparks, salt and sparks
The harbor knows us by heart

[Verse]
Every wave is a dirty deal
Every barrel is a spinning wheel
If the tide comes in with a loaded gun
We're the pier saints, we don't run

[Chorus]
Salt and sparks, salt and sparks
We ride the dark till the morning starts
Salt and sparks, salt and sparks
The harbor knows us by heart
```

File: `game/audio/radio/breakwater/01-salt-and-sparks.ogg`

### 8. Boardwalk Chase — The Breakwater Trio (instrumental, 148 BPM, A minor)

**Style:** instrumental surf rock, tremolo guitar, fast tom groove, spring
reverb, 148 BPM, A minor, boardwalk chase, no vocals

**Exclude:** vocals, metal, country, orchestral

File: `game/audio/radio/breakwater/02-boardwalk-chase.ogg`

### 9. Midnight Undertow — The Breakwater Trio (instrumental, 132 BPM, D minor)

**Style:** spy surf instrumental, twangy baritone guitar, walking bass,
brushed drums, 132 BPM, D minor, midnight undertow, no vocals

**Exclude:** vocals, metal, rap, orchestral

File: `game/audio/radio/breakwater/03-midnight-undertow.ogg`

## Solano Soul 92.1 — funk and soul

### 10. Ledger Blue — Rae Solano (vocal, 104 BPM, B minor)

**Style:** neo-soul funk, warm Rhodes, clavinet, slap bass, tight drums,
104 BPM, B minor, smoky family business, original song

**Exclude:** rap, country, metal, orchestral, EDM

**Lyrics:**

```
[Verse]
Woke up with a ledger and a hole in my shoe
Every name a promise that I never could do
Casa Luna's burning but the coffee's still warm
Mama used to tell me that the quiet's a storm

[Chorus]
Ledger blue, ledger blue
Every line comes back to you
Sign it, burn it, tear it through
Ledger blue, ledger blue

[Verse]
Tomas on the corner with a smile and a knife
Every deal is family till it costs you your life
If the fountain's talking, then the fountain knows
Ledger blue is bleeding wherever it goes

[Chorus]
Ledger blue, ledger blue
Every line comes back to you
Sign it, burn it, tear it through
Ledger blue, ledger blue
```

File: `game/audio/radio/solano-soul/01-ledger-blue.ogg`

### 11. Beachside Cantina — Solano Soul House Band (instrumental, 110 BPM, E minor)

**Style:** boogie funk instrumental, Rhodes chords, clavinet, slap bass,
disco drums, 110 BPM, E minor, beachside cantina, no vocals

**Exclude:** vocals, rock, country, orchestral

File: `game/audio/radio/solano-soul/02-beachside-cantina.ogg`

### 12. Family Cut — Odin (vocal, 98 BPM, G minor)

**Style:** dark neo-soul, minor Rhodes, tremolo guitar, heavy pocket drums,
98 BPM, G minor, family betrayal, original song

**Exclude:** rap, country, metal, EDM, orchestral

**Lyrics:**

```
[Verse]
Cut me a slice of the family pie
Tell me a truth and then tell me a lie
The table is set and the door is locked
Every seat empty except for the clock

[Chorus]
Family cut, family cut
Blood on the paper and the paper shut
Family cut, family cut
Nobody leaves till we split it up

[Verse]
Odin's in the back with a hammer and a grin
Says the only way out is the way we came in
Count every favor, count every scar
The family cut is the cut that goes far

[Chorus]
Family cut, family cut
Blood on the paper and the paper shut
Family cut, family cut
Nobody leaves till we split it up
```

File: `game/audio/radio/solano-soul/03-family-cut.ogg`

## Foundry FM 99.5 — darkwave and EBM

### 13. Rust and Rain — Cold Stack (vocal, 112 BPM, F minor)

**Style:** darkwave, cold analog bass, metallic percussion, distant guitar,
112 BPM, F minor, industrial harbor, moody, original song

**Exclude:** pop, country, rap, orchestral, happy EDM

**Lyrics:**

```
[Verse]
Smokestacks breathing on the edge of town
Rust and rain are the only crown
Every machine has a heart of stone
Every shift ends alone

[Chorus]
Rust and rain, rust and rain
Wash the street and come again
Rust and rain, rust and rain
Nothing here stays clean

[Verse]
The crane is a crucifix against the grey
The whistle takes another day
If you hear my footsteps on the loading floor
Don't open the door

[Chorus]
Rust and rain, rust and rain
Wash the street and come again
Rust and rain, rust and rain
Nothing here stays clean
```

File: `game/audio/radio/foundry/01-rust-and-rain.ogg`

### 14. Foundry Floor — Cold Stack (instrumental, 120 BPM, C minor)

**Style:** EBM instrumental, sequenced analog bass, industrial clanks,
machine-like drums, 120 BPM, C minor, foundry floor, no vocals

**Exclude:** vocals, rock, country, orchestral

File: `game/audio/radio/foundry/02-foundry-floor.ogg`

### 15. Graveyard Shift — Cold Stack (instrumental, 116 BPM, A minor)

**Style:** industrial darkwave instrumental, machine rhythm, detuned synth,
distant metal hits, 116 BPM, A minor, graveyard shift, no vocals

**Exclude:** vocals, pop, country, orchestral

File: `game/audio/radio/foundry/03-graveyard-shift.ogg`

## Vega 105.1 — hip-hop

### 16. Vega Strip Money — Kade Voss (vocal, 92 BPM, A minor)

**Style:** boom bap hip-hop, dusty drum breaks, vinyl crackle, upright bass,
jazz guitar loop, 92 BPM, gritty male rap vocals, original song

**Exclude:** trap, mumble rap, autotune, EDM, country, metal

**Lyrics:**

```
[Verse]
Vega Strip money, neon in the rain
Every corner got a story, every story got a name
I ain't come here for trouble, I came here for the check
But the city keeps a tab and it's coming for my neck

[Hook]
Strip money, strip money, watch it change hands
Every bill in the harbor got a price and a plan
Strip money, strip money, keep your eyes on the road
In Neon Harbor everybody got a code

[Verse]
Sunset Hotel lobby, marble and chrome
Mira got a map and she ain't taking me home
Riptide engine running, headlights off the wall
One wrong turn and the whole strip falls

[Hook]
Strip money, strip money, watch it change hands
Every bill in the harbor got a price and a plan
Strip money, strip money, keep your eyes on the road
In Neon Harbor everybody got a code
```

File: `game/audio/radio/vega/01-vega-strip-money.ogg`

### 17. Ledger Season — Nia Vex (vocal, 140 BPM, F minor)

**Style:** dark trap, booming 808 bass, sparse hi-hats, eerie synth,
140 BPM, confident female rap vocals, original song

**Exclude:** mumble rap, autotune, EDM, rock, country

**Lyrics:**

```
[Verse]
Ledger season, everybody want a line
Mama's in the kitchen with a pistol and a sign
Tomas got a smile like a switchblade shine
I got a debt in my pocket and it ain't even mine

[Hook]
Ledger season, ledger season
Read it, sign it, find a reason
Every page a different treason
Ledger season, ledger season

[Verse]
Casa Luna candles and a fountain full of lies
Every name a favor and every favor has a price
If you see me coming, better count what you owe
Nia Vex in the harbor, everybody know

[Hook]
Ledger season, ledger season
Read it, sign it, find a reason
Every page a different treason
Ledger season, ledger season
```

File: `game/audio/radio/vega/02-ledger-season.ogg`

### 18. Harbor Flow — Marlowe (vocal, 96 BPM, D minor)

**Style:** west coast hip-hop, whiny synth lead, deep bass, laid-back drums,
96 BPM, smooth male rap vocals, original song

**Exclude:** trap, mumble rap, EDM, rock, country

**Lyrics:**

```
[Verse]
Harbor flow, low tide, chrome on the water
Rae Solano in the mirror, looking like her father
Police on the bridge, radio on the dash
Every light in the city got a story and a flash

[Hook]
Harbor flow, harbor flow
Take it slow, take it slow
Every wave already knows
Harbor flow, harbor flow

[Verse]
Pier Nine at midnight, lighthouse in the fog
Everybody's honest till they're cornered like a dog
I got one hand on the wheel and one eye on the door
Harbor flow, harbor flow, what are we waiting for

[Hook]
Harbor flow, harbor flow
Take it slow, take it slow
Every wave already knows
Harbor flow, harbor flow
```

File: `game/audio/radio/vega/03-harbor-flow.ogg`

## Optional station idents

Generate one 6-8 s ident per station if you want a DJ voice between tracks.
Use a warm, close-mic voice over a short synth bed; keep the station name
exact.

| Station | Style | Spoken line |
| --- | --- | --- |
| Night Tide 88.3 | warm female late-night radio voice, soft synth pad | "Night Tide 88.3. The city never sleeps." |
| KNRV 104.7 | bright processed radio voice, chiptune bed | "KNRV 104.7. Insert coin." |
| The Breakwater 97.1 | laid-back male voice, surf guitar bed | "The Breakwater 97.1. Salt in the air." |
| Solano Soul 92.1 | smoky female voice, Rhodes bed | "Solano Soul 92.1. Keep it in the family." |
| Foundry FM 99.5 | low industrial voice, machine hum | "Foundry FM 99.5. Clock in." |
| Vega 105.1 | confident male radio voice, boom bap bed | "Vega 105.1. Money on the strip." |

## Delivery checklist

- [ ] 18 OGG files at 96-128 kbps, 2:00-2:40, -14 LUFS, clean endings.
- [x] All eighteen files generated and staged; total audio 33,973,559 bytes.
- [ ] File names exactly as above; total audio <= 36 MB.
- [ ] A `MUSIC.md` with track list, generation date and Suno plan/licence note.
- [ ] Tell the developer which tracks are vocal and which are instrumental.
- [ ] Optional idents in `game/audio/radio/idents/`.
