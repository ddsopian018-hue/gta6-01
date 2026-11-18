# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ddsopian018-hue/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ddsopian018-hue/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Coral Bay Heat** is a top-down open-world crime game written in vanilla JavaScript and drawn on a single canvas — no engine, no libraries, no build step, nothing loaded from the network. The setting is Coral Bay, an original sun-soaked coastal city: a full street grid with lane-following traffic, pavement crowds, a beach and a marina pier, and named places including Vera's Customs, First Coral Bank, St. Marina Hospital, Bay Armory, Coral Bay PD and The Palms Hotel.

You arrive with empty pockets and one contact. Vera runs the customs garage, and her three jobs — lift the teal Comet from the Ocean Drive lot, move a package that cannot wait, then drive Vera herself to her boat — form the story. Around it the city keeps turning: steal any car you can reach across nine classes (the Stallion muscle car, the Hauler truck and the rare Vapor supercar among them), take repeatable courier envelopes, or work a cab — passengers hail from the kerb, the fare grows with the trip, and patience runs out. Crime feeds a five-star wanted system: cruisers spawn, pursue, ram and shoot, officers fight on foot from wrecks, and standing still in reach of one gets you busted. Cash buys healing, repairs and ammunition; pickups litter the landmarks; progress saves itself to localStorage. The HUD carries a live minimap, the day rolls through a full clock, and every sound — engine, siren, gunfire — is synthesised with WebAudio.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

Hand it in (copies `game/` and `screenshots/` to the output dir and writes `dossier.json`):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=0njr0f8w&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
