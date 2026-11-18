# Neon Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Harbor is an open-world crime game that runs in a desktop browser from
plain static files. It is set on a 1.4 km stretch of neon coast at golden hour:
ten avenues of low-rise blocks and downtown towers, a beach, a working pier and
a lighthouse on the point. Traffic and pedestrians keep the streets busy while
you play as Rae Solano, a courier for the Solano import ring.

Steal cars, run the lights, draw a wanted level, shoot it out with the police or
hide until the heat cools, and play a four-mission story that opens with a car
theft on Vega Street and ends with a last call at the pier. Money, health,
armour, weapons, the wanted stars and the minimap all sit on the canvas HUD,
and progress saves after every mission and whenever you pause.

## Play

You need Node 22 to run the local static server. The game itself is HTML, CSS,
ES modules and a WebGL canvas: no build step, no package install and no network
request once the page has loaded.

```bash
node serve.ts --port 8080
# open http://localhost:8080
```

Click the canvas to capture the mouse. Keyboard and mouse controls:

- **WASD** or the arrow keys walk; **Shift** sprints; **Space** jumps.
- **Mouse** looks around, the **left button** fires and the **right button** aims.
- **F** or **E** enters or leaves a car. On foot, **Q** or the mouse wheel
  changes weapon, **1** selects the pistol, **2** the SMG and **R** reloads.
- In a car, **W/S** drive and brake or reverse, **A/D** steer, **Space** is the
  handbrake, **H** sounds the horn, **C** changes the camera and **V** changes
  the radio station.
- **P** or **Esc** pauses; **Enter** confirms menus; **M** mutes the audio.

The opening menu offers a new game or, when a save exists, a continue. The four
missions run in order: MOTOR POOL starts the story, the next begins after the
previous one's outro, and the minimap marks the current objective. The police
respond to gunfire, carjackings and casualties, so a quiet approach is usually
cheaper than a loud one.

## How it is built

- `game/` is the entire game: `index.html` plus the ES modules under `game/src/`
  (world generation, player, seven car classes, traffic, pedestrians, police,
  missions, HUD, audio, save and the screenshot scenes). The page is
  `1280x480`-friendly but fills any desktop window.
- `game/vendor/` holds three.js r180 as its minified `three.module.min.js` and
  `three.core.min.js` builds. `three.module.js` is a one-line ES module that
  re-exports the minified module, so every game source keeps importing
  `../vendor/three.module.js`.
- `main.ts` is the make.fun entrypoint. It copies `game/` and `screenshots/`
  into `MAKEFUN_OUTPUT_DIR` (or `/output`) and writes `dossier.json` with the
  vendored make.fun library. `MAKEFUN_OUTPUT_DIR=out node main.ts` does exactly
  that; add `--check` to validate the copy against the scorer's caps (game
  entries and bytes, screenshot count and size, dossier size) and print one
  summary line.
- `screenshots/` holds four real 1280x480 renders, in cover order:
  `1-chase.jpg` (the police chase), `2-mission.jpg`, `3-street.jpg` and
  `4-start.jpg`. `shots.json` names the query each render came from, so any of
  them can be reproduced with `?shot=chase`, `?shot=mission`, `?shot=street` or
  `?shot=start` (optionally with `&seed=1`).

## Bounty

Built for [make.fun · Make GTA 6](https://make.fun/bounty/gta6-01).

## License

MIT, see [LICENSE](LICENSE).
