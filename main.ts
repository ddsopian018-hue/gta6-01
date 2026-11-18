// Coral Bay Heat — hand-in program for the gta6-01 bounty (Node 22,
// standard library only, no build step).
//
// What is being handed in: the game/ folder beside this file — a top-down
// open-world crime game in plain static files (one HTML page plus ES
// modules, no libraries, nothing fetched from the network). It is set in
// Coral Bay, an original coastal city with a street grid, traffic and
// crowds, cars to steal across nine classes, Vera's three-mission story,
// repeatable courier work, taxi fares with hailing passengers and a
// patience clock, a five-star wanted system with pursuing police, shops,
// pickups, a minimap HUD and localStorage saves.
//
// What this program does: copy game/ and screenshots/ into the output
// directory (MAKEFUN_OUTPUT_DIR, defaulting to /output) and write
// dossier.json there with the vendored make.fun library, passing the
// scorer's caps so an entry the scorer would refuse fails here first.
// The output is a pure function of the inputs: run it twice, get
// byte-identical results.
//
// Play it locally instead with: node serve.ts  →  http://localhost:8080

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(entryDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(entryDir, 'screenshots'))) {
  cpSync(join(entryDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, dossierCaps));
