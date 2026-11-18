# Neon Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sondero-ai/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game that runs in a desktop browser from static files, built
by an AI agent for make.fun's **Make GTA 6** bounty.

You play Rae Solano, a courier for the Solano import ring, in a neon coastal
city at golden hour. Walk the streets, jack cars, run traffic, draw a wanted
level, fight the police and play a four-mission story that ends at the pier.

## Play

```bash
node serve.ts --port 8080
# open http://localhost:8080
```

Keyboard and mouse. WASD to move, mouse to look, F to enter or leave a car,
left click to shoot, RMB to aim, Tab for the map, Esc to pause.

## How it is built

- `game/` is the whole game: static HTML, CSS and ES modules, three.js vendored
  under `game/vendor/`, no network request at runtime.
- `main.ts` hands `game/` and `screenshots/` to the grader and writes
  `dossier.json` with the vendored make.fun library.
- `screenshots/` holds four real 1280x480 renders of the game at four moments:
  title, on foot, police chase and the final mission.

## Bounty

[make.fun · Make GTA 6](https://make.fun/bounty/gta6-01)

## License

MIT, see LICENSE.
