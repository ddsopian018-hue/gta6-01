// Coral Bay Heat: every tuning number, colour and city dimension in one place.
// The view is a fixed 1280x720 logical area; the renderer scales it to the window and the
// camera moves over a much larger city, so no rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** City geometry: a grid of roads and blocks, a sand beach, then the bay itself. */
export const CITY = {
  roadW: 112,          // width of every road, in world pixels
  block: 248,          // block size between roads
  pitch: 360,          // roadW + block: the grid pitch
  vRoads: 6,           // vertical roads, west to east
  hRoads: 5,           // horizontal roads, north to south
  beachX: 1960,        // where the sand starts (east edge of the last road is 1912)
  waterX: 2260,        // where the bay starts
  width: 2680,         // world width: land, beach and a strip of water
  height: 1700,        // world height
  lane: 27,            // traffic lane offset from a road's centre line
};

/** Centre line of vertical road i / horizontal road j. */
export const vRoadX = (i) => i * CITY.pitch + CITY.roadW / 2;
export const hRoadY = (j) => j * CITY.pitch + CITY.roadW / 2;
/** The block cell (i, j) as a rectangle: x, y of its top-left corner and its size. */
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
  enterRange: 52,      // how close to a car door the player must be to get in
};

export const CAR_CLASSES = {
  sedan:  { length: 42, width: 21, topSpeed: 330, reverse: 110, accel: 300, grip: 5.2, health: 120, label: 'Sedan' },
  sport:  { length: 44, width: 21, topSpeed: 452, reverse: 130, accel: 430, grip: 5.8, health: 100, label: 'Comet' },
  coupe:  { length: 41, width: 20, topSpeed: 368, reverse: 115, accel: 340, grip: 5.5, health: 110, label: 'Coupe' },
  van:    { length: 50, width: 24, topSpeed: 272, reverse: 95,  accel: 230, grip: 4.4, health: 170, label: 'Van' },
  taxi:   { length: 42, width: 21, topSpeed: 338, reverse: 110, accel: 310, grip: 5.2, health: 120, label: 'Taxi' },
  police: { length: 43, width: 21, topSpeed: 428, reverse: 130, accel: 420, grip: 6.0, health: 160, label: 'Interceptor' },
  // New metal on the streets: a muscle car, a heavy truck and a supercar, each with
  // its own feel — the truck is slow and nearly unkillable, the Vapor is the fastest
  // thing in the bay and shatters if you look at it wrong.
  muscle: { length: 44, width: 22, topSpeed: 398, reverse: 120, accel: 385, grip: 5.0, health: 135, label: 'Stallion' },
  truck:  { length: 56, width: 26, topSpeed: 252, reverse: 90,  accel: 205, grip: 4.0, health: 230, label: 'Hauler' },
  super:  { length: 45, width: 21, topSpeed: 482, reverse: 135, accel: 470, grip: 6.3, health: 90,  label: 'Vapor' },
};

/** Taxi fares: passengers hail a cab, pay by the trip, and lose patience on a clock. */
export const TAXI = {
  fareBase: 60,        // flat pickup fee, in dollars
  farePerMetre: 1.1,   // dollars per 10 world pixels of trip
  timeBase: 25,        // seconds of patience before the trip length is counted
  timePerMetre: 0.55,  // extra seconds of patience per 10 world pixels of trip
  hailPatience: 45,    // seconds a hailer waits at the kerb before giving up
  hailCooldown: 14,    // seconds after a fare ends before the next hail
  hailRange: 780,      // a hailer spawns this close to the player
  pickupRadius: 52,    // how close the cab must pull up to take the passenger
  dropoffRadius: 58,   // how close to the destination counts as arrived
};

export const TRAFFIC = { maxCars: 13, spawnGap: 620 };
export const PEDS = { max: 34 };
export const POLICE = {
  // How many interceptor cars answer each wanted level, and how fast they may drive.
  carsByStars: [0, 1, 2, 3, 4, 6],
  speedByStars: [0, 372, 396, 420, 442, 462],
  spawnDistance: 640,
  despawnDistance: 1500,
  bustRadius: 52,      // a cop this close to a slow player on foot starts the bust
  bustSeconds: 1.6,
  sightRange: 430,     // a cop this close counts as seeing the player for wanted decay
};

export const WANTED = {
  // Seconds with no cop seeing the player before one star falls off, per current star count.
  decaySeconds: [0, 9, 13, 18, 24, 30],
  crimeCooldown: 1.2,  // one crime cannot raise the level twice inside this window
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
  taxiYellow: '#f2b23d', // the cab's paint and the hailer's beacon
  copBlue: '#2f6fd0',
  copRed: '#ef4040',
};

/** Building roof colours: sun-bleached pastels, picked per building from the city seed. */
export const ROOF_COLORS = [
  '#f2e3c6', '#eec9a3', '#e8b4a0', '#d9e6ee', '#f6d8dc', '#cfe3cf',
  '#f3ead8', '#e5d1f0', '#ffe9a8', '#c8e6f2', '#f0c8a8', '#dfe8da',
];

export const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#f2f2f2', '#2b2f36', '#f2b23d', '#57b26a', '#9b59c9', '#e8e0d0', '#4fb3bf', '#c94f7c'];
export const PED_COLORS = ['#ef6c6c', '#f2c14e', '#6cb2ef', '#7be382', '#e88fd0', '#f2f2f2', '#ef9a4e', '#5fd0c4', '#b48fef', '#d94f3d'];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
