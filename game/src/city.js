// Building Coral Bay.
//
// Given a seed, this module lays out the whole town: which block holds
// which landmark, where every ordinary building stands, where the palms
// grow, and where the marina pier reaches into the water. It also answers
// the spatial questions the simulation asks all day — is this tarmac, is
// this the sea, what solid thing is in my way — so world logic never has
// to know how the map was drawn.

import { CITY, ROOF_COLORS, blockRect, hRoadY, vRoadX } from './config.js';
import { createRandom, pick, randInt, range } from './random.js';

// Landmark placement, as [column, row, record] triples. The record's kind
// is the key the rest of the game uses to find the place again.
const LANDMARK_PLAN = [
  [0, 0, { name: 'Coral Bay PD', short: 'POLICE', kind: 'police', color: '#dfe9f5' }],
  [1, 0, { name: 'The Palms Hotel', short: 'HOTEL', kind: 'hotel', color: '#ffe9a8' }],
  [3, 0, { name: 'First Coral Bank', short: 'BANK', kind: 'bank', color: '#e8e4da' }],
  [1, 1, { name: "Rosie's Diner", short: 'DINER', kind: 'diner', color: '#f6d8dc' }],
  [2, 2, { name: 'St. Marina Hospital', short: 'HOSPITAL', kind: 'hospital', color: '#f4f7f7' }],
  [3, 2, { name: 'Bay Armory', short: 'ARMORY', kind: 'armory', color: '#d8cfc0' }],
  [0, 2, { name: "Vera's Customs", short: 'CUSTOMS', kind: 'garage', color: '#ffd9a8' }],
  [1, 3, { name: 'Shine Auto Body', short: 'BODY SHOP', kind: 'bodyshop', color: '#cfe3cf' }],
  [4, 3, { name: 'Coral Marina', short: 'MARINA', kind: 'marina', color: '#c8e6f2' }],
];
const PARK_COLUMN = 2;
const PARK_ROW = 1;

// Footprints for an ordinary block, expressed against the block cell so
// the three layout styles read as simple inset recipes.
function ordinaryFootprints(rng, cell) {
  const style = randInt(rng, 3);
  if (style === 0) {
    return [{ x: cell.x + 30, y: cell.y + 30, w: cell.w - 60, h: cell.h - 60 }];
  }
  if (style === 1) {
    return [
      { x: cell.x + 22, y: cell.y + 26, w: cell.w - 44, h: 92 },
      { x: cell.x + 22, y: cell.y + 138, w: cell.w - 44, h: 84 },
    ];
  }
  return [
    { x: cell.x + 20, y: cell.y + 22, w: 96, h: 96 },
    { x: cell.x + 132, y: cell.y + 22, w: 96, h: 96 },
    { x: cell.x + 20, y: cell.y + 134, w: 96, h: 92 },
    { x: cell.x + 132, y: cell.y + 134, w: 96, h: 92 },
  ];
}

function plantPalms(rng) {
  const palms = [];
  // A loose colonnade down the beach.
  for (let y = 60; y < CITY.height - 40; y += 92) {
    palms.push({ x: CITY.beachX + 36 + range(rng, -8, 8), y: y + range(rng, -14, 14), s: range(rng, 0.85, 1.25) });
  }
  // A cluster inside the park block.
  const parkCell = blockRect(PARK_COLUMN, PARK_ROW);
  for (let n = 0; n < 9; n += 1) {
    palms.push({
      x: parkCell.x + 30 + rng() * (parkCell.w - 60),
      y: parkCell.y + 30 + rng() * (parkCell.h - 60),
      s: range(rng, 0.9, 1.3),
    });
  }
  // Extras dotted along block edges, where the pavement meets the grass.
  for (let n = 0; n < 26; n += 1) {
    const cell = blockRect(randInt(rng, CITY.vRoads - 1), randInt(rng, CITY.hRoads - 1));
    palms.push({ x: cell.x + 8 + rng() * (cell.w - 16), y: cell.y + 8, s: range(rng, 0.7, 1.0) });
  }
  return palms;
}

export function buildCity(seed) {
  const rng = createRandom(seed);
  const planByCell = new Map(LANDMARK_PLAN.map(([i, j, rec]) => [`${i},${j}`, rec]));
  const buildings = [];
  const landmarks = {};

  for (let j = 0; j < CITY.hRoads - 1; j += 1) {
    for (let i = 0; i < CITY.vRoads - 1; i += 1) {
      if (i === PARK_COLUMN && j === PARK_ROW) continue; // the park stays open
      const cell = blockRect(i, j);
      const planned = planByCell.get(`${i},${j}`);
      if (planned) {
        // Landmarks sit large in their block, with a forecourt in front
        // of the door on the south side.
        const shell = {
          x: cell.x + 34, y: cell.y + 40, w: cell.w - 68, h: cell.h - 84,
          color: planned.color, height: 26 + randInt(rng, 14),
          name: planned.short, kind: planned.kind,
        };
        buildings.push(shell);
        landmarks[planned.kind] = {
          ...planned,
          x: shell.x + shell.w / 2,
          y: shell.y + shell.h / 2,
          door: { x: shell.x + shell.w / 2, y: shell.y + shell.h + 16 },
        };
      } else {
        for (const spot of ordinaryFootprints(rng, cell)) {
          buildings.push({
            ...spot,
            color: pick(rng, ROOF_COLORS),
            height: 14 + randInt(rng, 30),
            name: null,
            kind: 'block',
            roofProps: randInt(rng, 3),
          });
        }
      }
    }
  }

  const trees = plantPalms(rng);
  const pierY = blockRect(4, 3).y + 150;
  const pier = { x: CITY.waterX - 30, y: pierY - 16, w: 300, h: 32 };
  const hotelDoor = landmarks.hotel.door;
  const taxiStand = { x: hotelDoor.x, y: hotelDoor.y + 30 };

  return { buildings, trees, landmarks, pier, taxiStand, seed };
}

/** True when (x, y) lies on any street, crossing included. */
export function onRoad(x, y) {
  if (x < 0 || y < 0 || x > CITY.width || y > CITY.height) return false;
  const onVertical = x % CITY.pitch < CITY.roadW;
  const onHorizontal = y % CITY.pitch < CITY.roadW;
  return onVertical || (onHorizontal && x <= CITY.beachX + 60);
}

/** True when (x, y) is open water. The pier deck counts as ground. */
export function inWater(city, x, y) {
  if (x < CITY.waterX) return false;
  const p = city.pier;
  const onPier = x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h;
  return !onPier;
}

/** True on the beach strip between promenade and shoreline. */
export function onSand(x) {
  return x >= CITY.beachX && x < CITY.waterX;
}

function circleHitsBuilding(b, x, y, r) {
  return x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h;
}

/** First building whose walls overlap the circle, or null. */
export function buildingAt(city, x, y, r) {
  return city.buildings.find((b) => circleHitsBuilding(b, x, y, r)) || null;
}

/**
 * Slide a circle out of every building it penetrates and return where it
 * ends up. Each building pushes along the shortest escape direction from
 * its nearest edge point.
 */
export function collideBuildings(city, x, y, r) {
  let px = x;
  let py = y;
  for (const b of city.buildings) {
    const nearX = Math.max(b.x, Math.min(px, b.x + b.w));
    const nearY = Math.max(b.y, Math.min(py, b.y + b.h));
    const dx = px - nearX;
    const dy = py - nearY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= r * r) continue;
    if (distSq === 0) { px = b.x - r; continue; }
    const dist = Math.sqrt(distSq);
    px = nearX + (dx / dist) * r;
    py = nearY + (dy / dist) * r;
  }
  return { x: px, y: py };
}

/** Somewhere on the street network, clear of the map edges. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    return { x: vRoadX(randInt(random, CITY.vRoads)), y: range(random, 80, CITY.height - 80) };
  }
  return { x: range(random, 80, CITY.beachX), y: hRoadY(randInt(random, CITY.hRoads)) };
}

/** A point on the pavement ring around block (i, j) — where people walk. */
export function sidewalkPoint(random, i, j) {
  const cell = blockRect(i, j);
  const inset = 12;
  const along = random();
  switch (randInt(random, 4)) {
    case 0: return { x: cell.x + inset + along * (cell.w - inset * 2), y: cell.y + inset };
    case 1: return { x: cell.x + inset + along * (cell.w - inset * 2), y: cell.y + cell.h - inset };
    case 2: return { x: cell.x + inset, y: cell.y + inset + along * (cell.h - inset * 2) };
    default: return { x: cell.x + cell.w - inset, y: cell.y + inset + along * (cell.h - inset * 2) };
  }
}

/**
 * Pavement near a given spot: try a few random blocks whose centres fall
 * inside the radius, otherwise fall back to the block under the spot.
 * Taxi passengers rely on this to always wait within a short drive.
 */
export function nearbySidewalkPoint(random, x, y, radius) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const i = randInt(random, CITY.vRoads - 1);
    const j = randInt(random, CITY.hRoads - 1);
    const cell = blockRect(i, j);
    const cx = cell.x + cell.w / 2;
    const cy = cell.y + cell.h / 2;
    if (Math.hypot(cx - x, cy - y) < radius) return sidewalkPoint(random, i, j);
  }
  const i = Math.max(0, Math.min(CITY.vRoads - 2, Math.floor(x / CITY.pitch)));
  const j = Math.max(0, Math.min(CITY.hRoads - 2, Math.floor(y / CITY.pitch)));
  return sidewalkPoint(random, i, j);
}
