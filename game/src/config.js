// Coral Bay Heat — the single tuning sheet.
//
// Screen size, the fixed simulation step, the street grid, vehicle
// performance, prices and paint all live here so the rest of the code can
// stay free of magic numbers. The world is much wider than the viewport:
// the camera roams, the rules below never depend on pixels on screen.

export const VIEW = { width: 1280, height: 720 };

/** Seconds per simulation tick: the world always advances at 60 Hz. */
export const STEP = 1 / 60;

// Street layout. Roads and blocks alternate on a fixed pitch; east of the
// last street the promenade gives way to sand and then open water.
export const CITY = {
  roadW: 112,
  block: 248,
  pitch: 360,
  vRoads: 6,
  hRoads: 5,
  beachX: 1960,
  waterX: 2260,
  width: 2680,
  height: 1700,
  lane: 27,
};

/** X coordinate of the centre line of north–south street number i. */
export const vRoadX = (i) => i * CITY.pitch + CITY.roadW / 2;
/** Y coordinate of the centre line of east–west street number j. */
export const hRoadY = (j) => j * CITY.pitch + CITY.roadW / 2;
/** Rectangle of the block between streets i..i+1 and j..j+1. */
export const blockRect = (i, j) => ({
  x: i * CITY.pitch + CITY.roadW,
  y: j * CITY.pitch + CITY.roadW,
  w: CITY.block,
  h: CITY.block,
});

export const PLAYER = {
  radius: 10,
  walkSpeed: 168,
  runSpeed: 268,
  health: 100,
  punchRange: 30,
  punchDamage: 34,
  enterRange: 52,
};

// Vehicle catalogue. A small factory keeps the table honest: every class
// carries its footprint, pace, acceleration, steering grip, hit points
// and the badge name the HUD shows.
function vehicle(length, width, topSpeed, reverse, accel, grip, health, label) {
  return { length, width, topSpeed, reverse, accel, grip, health, label };
}

export const CAR_CLASSES = {
  sedan: vehicle(42, 21, 330, 110, 300, 5.2, 120, 'Sedan'),
  sport: vehicle(44, 21, 452, 130, 430, 5.8, 100, 'Comet'),
  coupe: vehicle(41, 20, 368, 115, 340, 5.5, 110, 'Coupe'),
  van: vehicle(50, 24, 272, 95, 230, 4.4, 170, 'Van'),
  taxi: vehicle(42, 21, 338, 110, 310, 5.2, 120, 'Taxi'),
  police: vehicle(43, 21, 428, 130, 420, 6.0, 160, 'Interceptor'),
  muscle: vehicle(44, 22, 398, 120, 385, 5.0, 135, 'Stallion'),
  truck: vehicle(56, 26, 252, 90, 205, 4.0, 230, 'Hauler'),
  super: vehicle(45, 21, 482, 135, 470, 6.3, 90, 'Vapor'),
};

// Cab work: a flagfall plus a per-distance fare, against a patience
// clock that scales with how far the passenger wants to go.
export const TAXI = {
  fareBase: 60,
  farePerMetre: 1.1,
  timeBase: 25,
  timePerMetre: 0.55,
  hailPatience: 45,
  hailCooldown: 14,
  hailRange: 780,
  pickupRadius: 52,
  dropoffRadius: 58,
};

export const TRAFFIC = { maxCars: 13, spawnGap: 620 };
export const PEDS = { max: 34 };

// Police response, indexed by wanted stars: how many cruisers roll and
// how hard each one is allowed to drive.
export const POLICE = {
  carsByStars: [0, 1, 2, 3, 4, 6],
  speedByStars: [0, 372, 396, 420, 442, 462],
  spawnDistance: 640,
  despawnDistance: 1500,
  bustRadius: 52,
  bustSeconds: 1.6,
  sightRange: 430,
};

export const WANTED = {
  decaySeconds: [0, 9, 13, 18, 24, 30],
  crimeCooldown: 1.2,
};

export const PRICES = { heal: 100, repair: 150, ammo: 50, ammoAmount: 24 };
export const SAVE_KEY = 'coral-bay-heat.save.v1';

export const PALETTE = {
  grass: '#79b657',
  grassDark: '#6aa84c',
  sidewalk: '#d8cdb4',
  curb: '#b7ab90',
  asphalt: '#43464d',
  asphaltDark: '#3a3d44',
  laneMark: '#e8e4d2',
  crosswalk: '#cfd0cc',
  sand: '#eed491',
  sandWet: '#e2c078',
  water: '#1fb2c9',
  waterDeep: '#1293b5',
  waterFoam: '#bdf0ee',
  park: '#69b455',
  pond: '#35b6cf',
  pier: '#a9805a',
  text: '#fdfdf8',
  panel: 'rgba(16, 22, 28, 0.72)',
  money: '#7be382',
  health: '#ef5350',
  healthBack: 'rgba(10, 12, 14, 0.55)',
  gold: '#ffc93c',
  marker: '#ffd94d',
  taxiYellow: '#f2b23d',
  copBlue: '#2f6fd0',
  copRed: '#ef4040',
};

/** Sun-faded pastel roofs, assigned per building while the city is built. */
export const ROOF_COLORS = [
  '#f2e3c6', '#eec9a3', '#e8b4a0', '#d9e6ee', '#f6d8dc', '#cfe3cf',
  '#f3ead8', '#e5d1f0', '#ffe9a8', '#c8e6f2', '#f0c8a8', '#dfe8da',
];

export const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#f2f2f2', '#2b2f36', '#f2b23d', '#57b26a', '#9b59c9', '#e8e0d0', '#4fb3bf', '#c94f7c'];
export const PED_COLORS = ['#ef6c6c', '#f2c14e', '#6cb2ef', '#7be382', '#e88fd0', '#f2f2f2', '#ef9a4e', '#5fd0c4', '#b48fef', '#d94f3d'];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
