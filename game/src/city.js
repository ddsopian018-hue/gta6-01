// The city of Coral Bay: a seeded grid of pastel blocks over a road network, with a sand
// beach and the bay to the east. Generation is pure and deterministic: the same seed builds
// the same streets, buildings, palms and parked cars every time. Everything the simulation
// and the renderer need to know about the place lives here: what is road, what is water,
// which rectangles are solid, and where the named places are.

import { CITY, ROOF_COLORS, blockRect, hRoadY, vRoadX } from './config.js';
import { createRandom, pick, randInt, range } from './random.js';

/** Named places, by block cell [i, j]. Everything else is housing, offices or shops. */
const LANDMARKS = {
  '0,0': { name: 'Coral Bay PD', short: 'POLICE', kind: 'police', color: '#dfe9f5' },
  '1,0': { name: 'The Palms Hotel', short: 'HOTEL', kind: 'hotel', color: '#ffe9a8' },
  '3,0': { name: 'First Coral Bank', short: 'BANK', kind: 'bank', color: '#e8e4da' },
  '1,1': { name: "Rosie's Diner", short: 'DINER', kind: 'diner', color: '#f6d8dc' },
  '2,2': { name: 'St. Marina Hospital', short: 'HOSPITAL', kind: 'hospital', color: '#f4f7f7' },
  '3,2': { name: 'Bay Armory', short: 'ARMORY', kind: 'armory', color: '#d8cfc0' },
  '0,2': { name: "Vera's Customs", short: 'CUSTOMS', kind: 'garage', color: '#ffd9a8' },
  '1,3': { name: 'Shine Auto Body', short: 'BODY SHOP', kind: 'bodyshop', color: '#cfe3cf' },
  '4,3': { name: 'Coral Marina', short: 'MARINA', kind: 'marina', color: '#c8e6f2' },
};
const PARK_CELL = '2,1';

export function buildCity(seed) {
  const random = createRandom(seed);
  const buildings = [];
  const trees = [];
  const landmarks = {};

  for (let i = 0; i < CITY.vRoads - 1; i += 1) {
    for (let j = 0; j < CITY.hRoads - 1; j += 1) {
      const cell = blockRect(i, j);
      const key = `${i},${j}`;
      if (key === PARK_CELL) continue; // the park is open ground
      const mark = LANDMARKS[key];
      if (mark) {
        // A landmark takes most of its block, set back behind a forecourt.
        const b = {
          x: cell.x + 34, y: cell.y + 40, w: cell.w - 68, h: cell.h - 84,
          color: mark.color, height: 26 + randInt(random, 14),
          name: mark.short, kind: mark.kind,
        };
        buildings.push(b);
        landmarks[mark.kind] = { ...mark, x: b.x + b.w / 2, y: b.y + b.h / 2, door: { x: b.x + b.w / 2, y: b.y + b.h + 16 } };
        continue;
      }
      // Ordinary blocks: one, two or four buildings with alleys between them.
      const layout = randInt(random, 3);
      const spots = layout === 0
        ? [{ x: cell.x + 30, y: cell.y + 30, w: cell.w - 60, h: cell.h - 60 }]
        : layout === 1
          ? [
            { x: cell.x + 22, y: cell.y + 26, w: cell.w - 44, h: 92 },
            { x: cell.x + 22, y: cell.y + 138, w: cell.w - 44, h: 84 },
          ]
          : [
            { x: cell.x + 20, y: cell.y + 22, w: 96, h: 96 },
            { x: cell.x + 132, y: cell.y + 22, w: 96, h: 96 },
            { x: cell.x + 20, y: cell.y + 134, w: 96, h: 92 },
            { x: cell.x + 132, y: cell.y + 134, w: 96, h: 92 },
          ];
      for (const s of spots) {
        buildings.push({
          ...s,
          color: pick(random, ROOF_COLORS),
          height: 14 + randInt(random, 30),
          name: null,
          kind: 'block',
          roofProps: randInt(random, 3), // rooftop boxes the renderer scatters
        });
      }
    }
  }

  // Palms: a row along the beach, a ring in the park, and a scatter on the sidewalks.
  for (let y = 60; y < CITY.height - 40; y += 92) trees.push({ x: CITY.beachX + 36 + range(random, -8, 8), y: y + range(random, -14, 14), s: range(random, 0.85, 1.25) });
  const park = blockRect(2, 1);
  for (let n = 0; n < 9; n += 1) trees.push({ x: park.x + 30 + random() * (park.w - 60), y: park.y + 30 + random() * (park.h - 60), s: range(random, 0.9, 1.3) });
  for (let n = 0; n < 26; n += 1) {
    const i = randInt(random, CITY.vRoads - 1);
    const j = randInt(random, CITY.hRoads - 1);
    const cell = blockRect(i, j);
    trees.push({ x: cell.x + 8 + random() * (cell.w - 16), y: cell.y + 8, s: range(random, 0.7, 1.0) });
  }

  // The marina pier: a wooden jetty reaching into the bay from the marina block's latitude.
  const marinaY = blockRect(4, 3).y + 150;
  const pier = { x: CITY.waterX - 30, y: marinaY - 16, w: 300, h: 32 };

  return { buildings, trees, landmarks, pier, seed };
}

/** Is the point on a road (either direction, including intersections)? */
export function onRoad(x, y) {
  if (x < 0 || y < 0 || x > CITY.width || y > CITY.height) return false;
  const inV = x % CITY.pitch < CITY.roadW;
  const inH = y % CITY.pitch < CITY.roadW;
  return (inV && y <= CITY.height) || (inH && x <= CITY.beachX + 60);
}

/** Is the point in the bay? Cars and people stop at the water's edge (the pier excepted). */
export function inWater(city, x, y) {
  if (x < CITY.waterX) return false;
  const p = city.pier;
  return !(x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h);
}

/** Is the point on sand? Drivable, but slow and loose. */
export function onSand(x) {
  return x >= CITY.beachX && x < CITY.waterX;
}

/** The building a circle at (x, y) with radius r touches, or null. Buildings are solid. */
export function buildingAt(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of every building it overlaps; returns the corrected position. */
export function collideBuildings(city, x, y, r) {
  let nx = x;
  let ny = y;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - cx;
    const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 === 0) { nx = b.x - r; continue; }
      const d = Math.sqrt(d2);
      nx = cx + (dx / d) * r;
      ny = cy + (dy / d) * r;
    }
  }
  return { x: nx, y: ny };
}

/** A random point on a random road, away from the edges of the map. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    const i = randInt(random, CITY.vRoads);
    return { x: vRoadX(i), y: range(random, 80, CITY.height - 80) };
  }
  const j = randInt(random, CITY.hRoads);
  return { x: range(random, 80, CITY.beachX), y: hRoadY(j) };
}

/** A point on a block's sidewalk ring: where pedestrians walk and doors open. */
export function sidewalkPoint(random, i, j) {
  const cell = blockRect(i, j);
  const inset = 12;
  const side = randInt(random, 4);
  const t = random();
  if (side === 0) return { x: cell.x + inset + t * (cell.w - inset * 2), y: cell.y + inset };
  if (side === 1) return { x: cell.x + inset + t * (cell.w - inset * 2), y: cell.y + cell.h - inset };
  if (side === 2) return { x: cell.x + inset, y: cell.y + inset + t * (cell.h - inset * 2) };
  return { x: cell.x + cell.w - inset, y: cell.y + inset + t * (cell.h - inset * 2) };
}
