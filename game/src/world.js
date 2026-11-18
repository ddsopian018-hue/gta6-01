// Coral Bay Heat — the living simulation.
//
// This module owns everything that moves, breaks, pays out or gets you
// arrested. The player walks the pavements and drives the streets;
// traffic keeps to its lanes and hesitates at trouble; crowds stroll,
// panic and occasionally hail a cab; the police force answers the wanted
// level with cruisers that hunt, ram and shoot; and Vera's three-job
// story threads through the landmarks, with courier work and taxi fares
// filling the gaps. Time advances in fixed steps fed by one seeded
// random stream, so any run — including the staged screenshot scenes —
// is perfectly reproducible.

import {
  CAR_CLASSES, CAR_COLORS, CITY, PEDS, PED_COLORS, PLAYER, POLICE,
  PRICES, TAXI, TRAFFIC, WANTED, hRoadY, vRoadX,
} from './config.js';
import {
  buildCity, buildingAt, collideBuildings, inWater, nearbySidewalkPoint,
  onRoad, onSand, randomRoadPoint, sidewalkPoint,
} from './city.js';
import { chance, createRandom, pick, randInt, range } from './random.js';

// ---------------------------------------------------------------- tools

let entitySeq = 1;

/** Fresh unique id for a spawned entity. Reset alongside the world. */
function nextEntityId() {
  const value = entitySeq;
  entitySeq += 1;
  return value;
}

/** Straight-line distance between two positioned things. */
function gap(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Compass bearing from one positioned thing to another. */
function bearing(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Shortest signed rotation from angle a to angle b. */
function angleDelta(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** Keep a value inside [lo, hi]. */
function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

// ---------------------------------------------------------------- story

/**
 * Vera's storyline, told in three jobs. Each job is a short chain of
 * steps; the step kinds are interpreted by advanceStory():
 *   steal        — done once the player is sitting in the target car
 *   deliverCar   — done when that car reaches the named place, intact
 *   goto         — done when the player reaches the named place
 *   pickupPerson — spawns Vera at the named place; done once she rides
 * A step may also carry setWanted (heat applied when the step begins)
 * and timer (seconds allowed before the job collapses).
 */
export const MISSIONS = [
  {
    id: 'wheels',
    name: 'First Wheels',
    pay: 500,
    intro: 'Vera: A teal Comet is sitting in the Ocean Drive lot, keys in, owner away. Bring it to my garage — clean.',
    steps: [
      { kind: 'steal', label: 'Steal the teal Comet on Ocean Drive' },
      { kind: 'deliverCar', label: 'Deliver the Comet to Vera’s Customs', at: 'garage', r: 64 },
    ],
  },
  {
    id: 'package',
    name: 'Hot Package',
    pay: 900,
    intro: 'Vera: Rosie at the diner holds a package that cannot wait. Pick it up, drop it at the marina. Expect company.',
    steps: [
      { kind: 'goto', label: 'Pick up the package behind Rosie’s Diner', at: 'diner', r: 40 },
      { kind: 'goto', label: 'Deliver the package to Coral Marina', at: 'marina', r: 58, setWanted: 2, timer: 150 },
    ],
  },
  {
    id: 'bayrun',
    name: 'The Bay Run',
    pay: 1500,
    intro: 'Vera: Last job. I am at the bank with the take. Pick me up and get me to the marina boat — whatever it takes.',
    steps: [
      { kind: 'pickupPerson', label: 'Pick Vera up at First Coral Bank', at: 'bank', r: 52 },
      { kind: 'goto', label: 'Get Vera to the marina pier', at: 'pier', r: 60, setWanted: 3, timer: 240 },
    ],
  },
];

// Shops the player can use on foot (or, for the body shop, from the
// driver's seat). tryInteract() and refreshPrompt() both read this table
// so the offer and the action can never drift apart.
const SHOP_RULES = [
  {
    place: 'hospital',
    radius: 48,
    canUse: (w) => w.player.health < 100 && w.player.money >= PRICES.heal,
    prompt: () => `E — Heal, $${PRICES.heal}`,
    apply(w) {
      w.player.money -= PRICES.heal;
      w.player.health = 100;
      return ['St. Marina Hospital', `Patched up — $${PRICES.heal}.`];
    },
  },
  {
    place: 'armory',
    radius: 48,
    canUse: (w) => w.player.weapon === 'pistol' && w.player.money >= PRICES.ammo,
    prompt: () => `E — Buy ammo, $${PRICES.ammo}`,
    apply(w) {
      w.player.money -= PRICES.ammo;
      w.player.ammo += PRICES.ammoAmount;
      return ['Bay Armory', `Ammo +${PRICES.ammoAmount} — $${PRICES.ammo}.`];
    },
  },
];

// ---------------------------------------------------------------- world

export function createWorld(seed) {
  const city = buildCity(seed);
  const rng = createRandom(seed ^ 0x9e3779b9);

  const world = {
    city,
    random: rng,
    time: 0,
    clock: 15 * 60,
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    particles: [],
    wanted: 0,
    unseen: 0,
    crimeCd: 0,
    missionIndex: 0,
    mission: null,
    courier: null,
    taxi: null,
    taxiCd: 8,
    storyDone: false,
    phase: 'play',
    phaseT: 0,
    bust: 0,
    banner: null,
    objective: null,
    nearAction: null,
    events: [],
    camera: { x: 0, y: 0 },
    stats: { earned: 0, stolen: 0, topSpeed: 0, fares: 0 },
    comet: null,
    vera: null,
  };

  let cruiserTimer = 0; // seconds until the next police spawn attempt

  // ------------------------------------------------------------ messaging

  /** Show a headline banner; sub is the smaller explanatory line. */
  function announce(title, sub, seconds = 4.5) {
    world.banner = { title, sub, t: seconds };
  }

  /** Queue a sound cue for the shell, which owns the audio engine. */
  function cue(name) {
    world.events.push(name);
  }

  /** Would any officer within rangePx of (x, y) see what happens there? */
  function officerWatching(x, y, rangePx) {
    return world.cars.some(
      (c) => c.kind === 'police' && !c.wrecked && Math.hypot(c.x - x, c.y - y) < rangePx,
    );
  }

  /** Would any standing civilian within rangePx witness the act? */
  function civilianWatching(x, y, rangePx) {
    return world.peds.some(
      (p) => p.state !== 'down' && Math.hypot(p.x - x, p.y - y) < rangePx,
    );
  }

  /**
   * Register a crime. Unwitnessed acts are free; witnessed ones raise the
   * wanted level, throttled so a single incident cannot stack stars.
   */
  function commitCrime(stars, witnessed = true) {
    if (!witnessed || world.crimeCd > 0 || world.wanted >= 5) return;
    world.wanted = Math.min(5, world.wanted + stars);
    world.crimeCd = WANTED.crimeCooldown;
    world.unseen = 0;
    cue('star');
  }
  world.addCrime = commitCrime;

  // ------------------------------------------------------------ factories

  function makeVehicle(cls, color, x, y, heading, kind) {
    const vehicle = {
      id: nextEntityId(),
      cls,
      kind,
      color,
      x,
      y,
      angle: heading,
      speed: 0,
      health: CAR_CLASSES[cls].health,
      wrecked: false,
      stolen: false,
      roadType: 'v',
      roadIdx: 0,
      dir: 1,
      s: 0,
      cruise: 0,
      shootCd: 0,
      officerOut: false,
      honkCd: 0,
    };
    world.cars.push(vehicle);
    return vehicle;
  }

  /**
   * Roll one more traffic car onto a random street, in its correct lane,
   * unless the player is too close or another car already holds the spot.
   * The fleet mix favours everyday metal, with muscle cars and Haulers in
   * the blend and a Vapor appearing only rarely.
   */
  function addTrafficCar(initial = false) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const vertical = rng() < 0.55;
      const roadIdx = vertical ? randInt(rng, CITY.vRoads) : randInt(rng, CITY.hRoads);
      const dir = rng() < 0.5 ? 1 : -1;
      const along = vertical
        ? range(rng, 90, CITY.height - 90)
        : range(rng, 90, CITY.beachX - 40);
      const lanePos = vertical
        ? { x: vRoadX(roadIdx) + (dir < 0 ? CITY.lane : -CITY.lane), y: along }
        : { x: along, y: hRoadY(roadIdx) + (dir > 0 ? CITY.lane : -CITY.lane) };
      if (!initial && world.player && gap(lanePos, world.player) < TRAFFIC.spawnGap) continue;
      if (world.cars.some((c) => Math.hypot(c.x - lanePos.x, c.y - lanePos.y) < 60)) continue;

      const cls = chance(rng, 0.04)
        ? 'super'
        : pick(rng, ['sedan', 'sedan', 'sedan', 'coupe', 'coupe', 'taxi', 'taxi', 'van', 'muscle', 'truck']);
      const heading = vertical
        ? (dir < 0 ? -Math.PI / 2 : Math.PI / 2)
        : (dir > 0 ? 0 : Math.PI);
      const car = makeVehicle(cls, cls === 'taxi' ? '#f2b23d' : pick(rng, CAR_COLORS), lanePos.x, lanePos.y, heading, 'traffic');
      car.roadType = vertical ? 'v' : 'h';
      car.roadIdx = roadIdx;
      car.dir = dir;
      car.s = along;
      car.cruise = range(rng, 148, 228);
      return car;
    }
    return null;
  }

  /** Park a row of borrowable cars along the kerbs, plus the famous Comet. */
  function parkCars() {
    for (let n = 0; n < 15; n += 1) {
      const roadIdx = randInt(rng, CITY.vRoads);
      const y = range(rng, 150, CITY.height - 150);
      if (Math.abs(y % CITY.pitch) < 90) continue; // keep the crossings clear
      const side = rng() < 0.5 ? -1 : 1;
      const x = vRoadX(roadIdx) + side * (CITY.roadW / 2 + 9);
      const cls = chance(rng, 0.06)
        ? 'super'
        : pick(rng, ['sedan', 'coupe', 'sedan', 'van', 'muscle', 'truck']);
      const parked = makeVehicle(cls, pick(rng, CAR_COLORS), x, y, 0, 'parked');
      parked.angle = rng() < 0.5 ? -Math.PI / 2 : Math.PI / 2;
    }
    // The Comet waits in the Ocean Drive lot, teal paint, nose to the bay.
    world.comet = makeVehicle('sport', '#0fbfa8', vRoadX(5) + CITY.roadW / 2 + 44, 210, 0, 'parked');
  }

  function makeWalker(x, y) {
    const walker = {
      id: nextEntityId(),
      x,
      y,
      angle: range(rng, 0, Math.PI * 2),
      color: pick(rng, PED_COLORS),
      state: 'walk',
      t: range(rng, 1, 4),
      tx: x,
      ty: y,
      downT: 0,
      follow: false,
    };
    world.peds.push(walker);
    return walker;
  }

  /** Fill the pavements with the starting crowd. */
  function scatterCrowd() {
    for (let n = 0; n < PEDS.max; n += 1) {
      const spot = sidewalkPoint(rng, randInt(rng, CITY.vRoads - 1), randInt(rng, CITY.hRoads - 1));
      makeWalker(spot.x, spot.y);
    }
  }

  function dropPickup(kind, x, y, amount = 0) {
    world.pickups.push({ id: nextEntityId(), kind, x, y, amount, t: range(rng, 0, 6), cd: 0, gone: false });
  }

  // ------------------------------------------------------------ lifecycle

  function centreCameraOnPlayer() {
    const p = world.player;
    world.camera.x = clamp(p.x - 640, 0, CITY.width - 1280);
    world.camera.y = clamp(p.y - 360, 0, CITY.height - 720);
  }

  world.reset = function reset(save) {
    entitySeq = 1;
    cruiserTimer = 0;
    world.time = 0;
    world.clock = 15 * 60;
    world.cars = [];
    world.peds = [];
    world.bullets = [];
    world.pickups = [];
    world.particles = [];
    world.wanted = 0;
    world.unseen = 0;
    world.crimeCd = 0;
    world.mission = null;
    world.courier = null;
    world.taxi = null;
    world.taxiCd = 8;
    world.phase = 'play';
    world.phaseT = 0;
    world.bust = 0;
    world.banner = null;
    world.objective = null;
    world.nearAction = null;
    world.stats = { earned: 0, stolen: 0, topSpeed: 0, fares: 0 };
    world.missionIndex = save && Number.isInteger(save.missionIndex)
      ? Math.min(save.missionIndex, MISSIONS.length)
      : 0;
    world.storyDone = world.missionIndex >= MISSIONS.length;

    const garageDoor = city.landmarks.garage.door;
    world.player = {
      x: garageDoor.x,
      y: garageDoor.y + 26,
      angle: -Math.PI / 2,
      vx: 0,
      vy: 0,
      health: 100,
      money: save && save.money ? save.money : 85,
      weapon: save && save.weapon ? save.weapon : 'fist',
      ammo: save && save.ammo ? save.ammo : 0,
      car: null,
      fireCd: 0,
      punchCd: 0,
      dead: false,
    };

    parkCars();
    for (let n = 0; n < TRAFFIC.maxCars; n += 1) addTrafficCar(true);
    scatterCrowd();
    dropPickup('pistol', city.landmarks.armory.door.x, city.landmarks.armory.door.y, 24);
    dropPickup('health', city.landmarks.hospital.door.x, city.landmarks.hospital.door.y, 45);
    world.vera = null;
    centreCameraOnPlayer();
  };

  world.saveData = function saveData() {
    const p = world.player;
    return { money: p.money, missionIndex: world.missionIndex, weapon: p.weapon, ammo: p.ammo };
  };

  /**
   * Put the player back on the street after a bust or a hospital stay.
   * Accepts the outcome name ('busted' | 'wasted') or infers it from the
   * current phase. Either way the heat is gone and the wallet is lighter.
   */
  function respawn(kind) {
    const outcome = kind || world.phase;
    const p = world.player;
    if (p.car) {
      p.car.kind = 'parked';
      p.car.speed = 0;
      p.car = null;
    }
    if (world.taxi) {
      if (world.taxi.ped.state !== 'down') releasePassenger(world.taxi.ped, 'walk');
      world.taxi = null;
      world.taxiCd = TAXI.hailCooldown;
    }
    if (outcome === 'busted') {
      p.money -= Math.max(25, Math.floor(p.money * 0.12));
      const door = city.landmarks.police.door;
      p.x = door.x;
      p.y = door.y + 20;
      p.health = Math.max(p.health, 45);
      announce('Released', 'The Coral Bay PD keeps a cut of your cash. Stay out of trouble.', 4);
    } else {
      p.money -= Math.min(p.money, 100);
      const door = city.landmarks.hospital.door;
      p.x = door.x;
      p.y = door.y + 20;
      p.health = 100;
      announce('St. Marina Hospital', 'They patched you up. The bill was $100.', 4);
    }
    world.wanted = 0;
    world.bust = 0;
    world.phase = 'play';
    world.phaseT = 0;
    centreCameraOnPlayer();
  }
  world.respawn = respawn;

  // ------------------------------------------------------------ story jobs

  /** World position a mission step points at. */
  function stepDestination(step) {
    if (step.kind === 'steal') return { x: world.comet.x, y: world.comet.y };
    if (step.at === 'pier') {
      return { x: city.pier.x + city.pier.w - 40, y: city.pier.y + city.pier.h / 2 };
    }
    const place = city.landmarks[step.at];
    return { x: place.door.x, y: place.door.y };
  }

  function startMission(index) {
    const def = MISSIONS[index];
    world.mission = { def, step: 0, timer: null };
    announce(def.name, def.intro, 6.5);
    cue('missionStart');
  }
  world.startMission = startMission;

  /** Abandon the running job, noisily (the player gets told why). */
  function failMission(why) {
    if (!world.mission) return;
    announce('Mission Failed', why, 4);
    cue('fail');
    world.mission = null;
    if (world.vera) {
      world.vera.follow = false;
      world.vera = null;
    }
  }
  world.missionFailed = failMission;

  /** Abandon the running job silently — used when the player is wasted. */
  function dropMissionQuietly() {
    world.mission = null;
    if (world.vera) {
      world.vera.follow = false;
      world.vera = null;
    }
  }

  function completeMission() {
    const def = world.mission.def;
    world.player.money += def.pay;
    world.stats.earned += def.pay;
    world.missionIndex += 1;
    world.storyDone = world.missionIndex >= MISSIONS.length;
    announce('Mission Complete', `${def.name} — $${def.pay} paid.`, 5);
    cue('missionDone');
    cue('cash');
    world.mission = null;
    if (world.vera) {
      world.vera.follow = false;
      world.vera.state = 'walk';
      world.vera = null;
    }
    if (world.storyDone) {
      world.phase = 'ending';
      world.phaseT = 0;
    }
  }

  /**
   * The objective marker when no story job is running: a live taxi fare
   * outranks everything, then Vera's garage (or her courier board once
   * the story is finished).
   */
  function idleObjective() {
    if (world.taxi) {
      world.objective = { x: world.taxi.x, y: world.taxi.y, label: world.taxi.label };
    } else if (!world.storyDone) {
      const door = city.landmarks.garage.door;
      world.objective = { x: door.x, y: door.y, label: `${MISSIONS[world.missionIndex].name} — see Vera` };
    } else if (world.courier) {
      world.objective = { x: world.courier.x, y: world.courier.y, label: world.courier.label };
    } else {
      world.objective = null;
    }
  }

  /** Advance the story state machine by one tick. */
  function advanceStory(dt) {
    const job = world.mission;
    if (!job) {
      idleObjective();
      return;
    }
    const step = job.def.steps[job.step];
    const target = stepDestination(step);
    world.objective = { x: target.x, y: target.y, label: step.label };

    if (step.timer) {
      if (job.timer === null) job.timer = step.timer;
      job.timer -= dt;
      if (job.timer <= 0) {
        failMission('Out of time.');
        return;
      }
    }

    const p = world.player;
    const arrived = Math.hypot(p.x - target.x, p.y - target.y) < (step.r || 48);

    if (step.kind === 'deliverCar' && world.comet.wrecked) {
      failMission('The Comet is a wreck. Vera is furious.');
      return;
    }

    let finished = false;
    if (step.kind === 'steal') {
      finished = p.car === world.comet;
    } else if (step.kind === 'deliverCar') {
      finished = arrived && p.car === world.comet && world.comet.health > 25;
    } else if (step.kind === 'goto') {
      finished = arrived;
    } else if (step.kind === 'pickupPerson') {
      if (arrived && p.car && !world.vera) {
        world.vera = makeWalker(target.x + 14, target.y + 10);
        world.vera.follow = true;
        announce('Vera', 'Get me to the marina. Drive like you mean it.', 3.5);
      }
      finished = Boolean(world.vera && world.vera.follow && p.car);
      if (finished) world.vera.follow = 'car';
    }

    if (!finished) return;
    job.step += 1;
    job.timer = null;
    const upcoming = job.def.steps[job.step];
    if (upcoming && upcoming.setWanted) {
      world.wanted = Math.max(world.wanted, upcoming.setWanted);
      cue('star');
    }
    if (job.step >= job.def.steps.length) completeMission();
    else cue('pickup');
  }

  // ------------------------------------------------------------ courier

  const COURIER_PLACES = ['bank', 'diner', 'hotel', 'hospital', 'marina', 'armory'];

  function offerCourier() {
    const from = pick(rng, COURIER_PLACES);
    let to = pick(rng, COURIER_PLACES);
    if (to === from) to = 'marina';
    const door = city.landmarks[from].door;
    world.courier = {
      phase: 'pickup',
      x: door.x,
      y: door.y,
      to,
      label: `Courier: pick up at ${city.landmarks[from].name}`,
    };
    announce('Courier Job', `${world.courier.label}. Pays on delivery.`, 4.5);
  }

  function tickCourier() {
    const job = world.courier;
    const p = world.player;
    const d = Math.hypot(p.x - job.x, p.y - job.y);
    if (job.phase === 'pickup' && d < 46) {
      const door = city.landmarks[job.to].door;
      job.phase = 'deliver';
      job.x = door.x;
      job.y = door.y;
      job.label = `Courier: deliver to ${city.landmarks[job.to].name}`;
      cue('pickup');
    } else if (job.phase === 'deliver' && d < 56) {
      const pay = 150 + randInt(rng, 160);
      p.money += pay;
      world.stats.earned += pay;
      announce('Courier Complete', `$${pay} paid. Vera always has another envelope.`, 3.5);
      cue('cash');
      cue('missionDone');
      world.courier = null;
    }
  }

  // ------------------------------------------------------------ taxi work

  /** A passenger starts waving from a pavement near the player's cab. */
  function hailPassenger() {
    const p = world.player;
    let spot;
    const stand = city.taxiStand;
    if (chance(rng, 0.3) && Math.hypot(stand.x - p.x, stand.y - p.y) < TAXI.hailRange) {
      spot = { x: stand.x + range(rng, -30, 30), y: stand.y + range(rng, -10, 30) };
    } else {
      spot = nearbySidewalkPoint(rng, p.x, p.y, TAXI.hailRange);
    }
    const ped = makeWalker(spot.x, spot.y);
    ped.state = 'hail';
    ped.t = TAXI.hailPatience;
    world.taxi = {
      phase: 'hail',
      ped,
      x: spot.x,
      y: spot.y,
      to: null,
      label: 'Taxi fare: pick up the passenger',
      fare: 0,
      timer: null,
    };
    cue('taxi');
  }

  /** Send a passenger back to their own life, calmly or in a panic. */
  function releasePassenger(ped, how) {
    ped.follow = false;
    if (how === 'flee') {
      ped.state = 'flee';
      ped.t = 2.5;
      ped.tx = ped.x;
      ped.ty = ped.y;
    } else {
      ped.state = 'walk';
      ped.t = 0;
    }
  }

  function closeFare() {
    world.taxi = null;
    world.taxiCd = TAXI.hailCooldown;
  }

  function tickTaxi(dt) {
    const p = world.player;
    const drivingCab = Boolean(p.car && p.car.cls === 'taxi' && !p.car.wrecked);
    const fare = world.taxi;

    if (!fare) {
      if (!drivingCab) return;
      world.taxiCd -= dt;
      if (world.taxiCd <= 0) hailPassenger();
      return;
    }

    if (fare.phase === 'hail') {
      if (fare.ped.state !== 'hail') { closeFare(); return; }
      fare.ped.t -= dt;
      if (fare.ped.t <= 0) {
        releasePassenger(fare.ped, 'walk');
        closeFare();
        return;
      }
      // Boarding is measured from the cab itself, and only a cab counts.
      const cabDistance = p.car ? Math.hypot(p.car.x - fare.x, p.car.y - fare.y) : Infinity;
      if (drivingCab && cabDistance < TAXI.pickupRadius) boardPassenger(fare);
      return;
    }

    // Phase 'ride': passenger aboard, clock running.
    if (!drivingCab || fare.ped.state === 'down') {
      if (fare.ped.state !== 'down') releasePassenger(fare.ped, 'flee');
      announce('Fare Lost', 'The passenger walked off.', 3);
      closeFare();
      return;
    }
    fare.timer -= dt;
    if (fare.timer <= 0) {
      releasePassenger(fare.ped, 'flee');
      announce('Fare Lost', 'Out of time — the passenger got out and walked.', 3.5);
      cue('fail');
      closeFare();
      return;
    }
    if (Math.hypot(p.car.x - fare.x, p.car.y - fare.y) < TAXI.dropoffRadius) {
      p.money += fare.fare;
      world.stats.earned += fare.fare;
      world.stats.fares += 1;
      releasePassenger(fare.ped, 'walk');
      announce('Fare Complete', `$${fare.fare} paid. Another passenger is out there.`, 3.5);
      cue('fare');
      cue('cash');
      closeFare();
    }
  }

  /** The hailer climbs in; choose where they want to go and price it. */
  function boardPassenger(fare) {
    const keys = Object.keys(city.landmarks);
    let destKey = 'marina';
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidate = pick(rng, keys);
      const door = city.landmarks[candidate].door;
      if (Math.hypot(door.x - fare.x, door.y - fare.y) > 420) {
        destKey = candidate;
        break;
      }
    }
    const door = city.landmarks[destKey].door;
    const trip = Math.hypot(door.x - fare.x, door.y - fare.y);
    fare.phase = 'ride';
    fare.to = destKey;
    fare.x = door.x;
    fare.y = door.y;
    fare.fare = TAXI.fareBase + Math.round((trip / 10) * TAXI.farePerMetre);
    fare.timer = TAXI.timeBase + (trip / 10) * TAXI.timePerMetre;
    fare.ped.follow = 'car';
    fare.label = `Taxi fare: ${city.landmarks[destKey].name} — $${fare.fare}`;
    announce('Passenger Aboard', `${city.landmarks[destKey].name} — beat the clock for $${fare.fare}.`, 3.5);
    cue('pickup');
  }

  // ------------------------------------------------------------ harm & fx

  /** Scatter a burst of short-lived particles (sparks, smoke, debris). */
  function spawnSparks(x, y, count, color, speed, life) {
    for (let i = 0; i < count; i += 1) {
      if (world.particles.length > 320) return;
      const a = range(rng, 0, Math.PI * 2);
      const v = range(rng, speed * 0.3, speed);
      world.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 20,
        life: range(rng, life * 0.5, life),
        max: life,
        color,
        size: range(rng, 1.5, 3.5),
      });
    }
  }
  world.burst = spawnSparks;

  function injurePlayer(amount) {
    const p = world.player;
    if (world.phase !== 'play') return;
    p.health -= amount;
    cue('hurt');
    if (p.health <= 0) {
      p.health = 0;
      p.dead = true;
      world.phase = 'wasted';
      world.phaseT = 0;
      dropMissionQuietly();
    }
  }

  /** Send everyone strolling near (x, y) running away from it. */
  function panicCrowd(x, y, radius) {
    for (const ped of world.peds) {
      if (ped.state === 'walk' && Math.hypot(ped.x - x, ped.y - y) < radius) {
        ped.state = 'flee';
        ped.t = range(rng, 1.6, 3.2);
        ped.tx = x;
        ped.ty = y;
      }
    }
  }
  world.scarePeds = panicCrowd;

  /**
   * Put a pedestrian on the ground. A punch sometimes shakes loose a
   * little cash; either way, witnesses may call it in as a crime.
   */
  function floorPed(ped, byShot) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downT = byShot ? 14 : 7;
    if (!byShot && rng() < 0.6) {
      dropPickup('cash', ped.x + range(rng, -8, 8), ped.y + range(rng, -8, 8), randInt(rng, 21) + 5);
    }
    commitCrime(1, officerWatching(ped.x, ped.y, 460) || civilianWatching(ped.x, ped.y, 210));
    panicCrowd(ped.x, ped.y, 150);
  }

  /** Apply collision or weapon damage to a vehicle; wreck it at zero. */
  function damageVehicle(car, amount, hitX, hitY) {
    if (car.wrecked) return;
    const before = car.health;
    car.health -= amount;
    if (car.health <= 55 && before > 55) cue('crash2');
    if (car.health <= 0) {
      car.health = 0;
      car.wrecked = true;
      car.speed = 0;
      spawnSparks(car.x, car.y, 16, '#565d66', 130, 0.7);
      spawnSparks(car.x, car.y, 8, '#ff9a3c', 90, 0.4);
      if (world.player.car === car) injurePlayer(6);
    } else if (hitX !== undefined) {
      spawnSparks(hitX, hitY, 4, '#ffd94d', 120, 0.25);
    }
  }

  // ------------------------------------------------------------ interaction

  function climbIn(car) {
    const p = world.player;
    if (car.kind === 'traffic') {
      // Jacking a moving car only works once it has nearly stopped; the
      // driver bails out and runs.
      if (Math.abs(car.speed) > 42) return;
      const driver = makeWalker(car.x + 14, car.y + 6);
      driver.state = 'flee';
      driver.t = 2.6;
      driver.tx = car.x;
      driver.ty = car.y;
    }
    if (!car.stolen) {
      car.stolen = true;
      world.stats.stolen += 1;
      commitCrime(1, officerWatching(car.x, car.y, 520) || civilianWatching(car.x, car.y, 220));
    }
    car.kind = 'player';
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    cue('door');
  }

  function climbOut() {
    const p = world.player;
    const car = p.car;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    p.car = null;
    // Step out on the car's left side, pushed clear of any wall.
    const sideX = car.x + Math.cos(car.angle - Math.PI / 2) * 32;
    const sideY = car.y + Math.sin(car.angle - Math.PI / 2) * 32;
    const clear = collideBuildings(city, sideX, sideY, PLAYER.radius);
    p.x = Math.min(clear.x, CITY.waterX - 12);
    p.y = clear.y;
    cue('door');
  }

  /** Nearest usable car to the player, within reach of the door handle. */
  function nearestReachableCar() {
    const p = world.player;
    let best = null;
    let bestDist = PLAYER.enterRange;
    for (const car of world.cars) {
      if (car.wrecked) continue;
      const d = gap(car, p);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  /**
   * The E key, resolved in priority order: repair at the body shop while
   * seated, get out of the car, get into the nearest car, talk to Vera
   * (story or courier), then the walk-in shops.
   */
  world.tryInteract = function tryInteract() {
    const p = world.player;
    if (world.phase !== 'play') return;

    if (p.car) {
      const shopDoor = city.landmarks.bodyshop.door;
      const spec = CAR_CLASSES[p.car.cls];
      const atShop = Math.hypot(p.car.x - shopDoor.x, p.car.y - shopDoor.y) < 62;
      if (atShop && p.car.health < spec.health && p.money >= PRICES.repair) {
        p.money -= PRICES.repair;
        p.car.health = spec.health;
        p.car.wrecked = false;
        announce('Shine Auto Body', `Repaired — $${PRICES.repair}.`, 2.5);
        cue('cash');
        return;
      }
      climbOut();
      return;
    }

    const car = nearestReachableCar();
    if (car) {
      climbIn(car);
      return;
    }

    const garageDoor = city.landmarks.garage.door;
    if (!world.mission && Math.hypot(p.x - garageDoor.x, p.y - garageDoor.y) < 58) {
      if (!world.storyDone) {
        startMission(world.missionIndex);
        return;
      }
      if (!world.courier) {
        offerCourier();
        return;
      }
    }

    for (const rule of SHOP_RULES) {
      const door = city.landmarks[rule.place].door;
      if (Math.hypot(p.x - door.x, p.y - door.y) < rule.radius && rule.canUse(world)) {
        const [title, sub] = rule.apply(world);
        announce(title, sub, 2.5);
        cue('cash');
        return;
      }
    }
  };

  /** Work out what E would do right now, for the HUD prompt line. */
  function refreshPrompt() {
    const p = world.player;
    world.nearAction = null;
    if (world.phase !== 'play') return;

    if (p.car) {
      const shopDoor = city.landmarks.bodyshop.door;
      const spec = CAR_CLASSES[p.car.cls];
      if (
        Math.hypot(p.car.x - shopDoor.x, p.car.y - shopDoor.y) < 62
        && p.car.health < spec.health
        && p.money >= PRICES.repair
      ) {
        world.nearAction = `E — Repair car, $${PRICES.repair}`;
      } else if (
        p.car.cls === 'taxi'
        && world.taxi
        && world.taxi.phase === 'hail'
        && Math.hypot(p.car.x - world.taxi.x, p.car.y - world.taxi.y) < 130
      ) {
        world.nearAction = 'Passenger hailing — pull up close';
      } else {
        world.nearAction = 'E — Get out';
      }
      return;
    }

    const car = nearestReachableCar();
    if (car) {
      world.nearAction = car === world.comet
        ? 'E — Steal the Comet'
        : `E — Drive the ${CAR_CLASSES[car.cls].label}`;
      return;
    }

    const garageDoor = city.landmarks.garage.door;
    if (!world.mission && Math.hypot(p.x - garageDoor.x, p.y - garageDoor.y) < 58) {
      world.nearAction = world.storyDone
        ? (world.courier ? null : 'E — Courier job')
        : 'E — Talk to Vera';
      return;
    }

    for (const rule of SHOP_RULES) {
      const door = city.landmarks[rule.place].door;
      if (Math.hypot(p.x - door.x, p.y - door.y) < rule.radius && rule.canUse(world)) {
        world.nearAction = rule.prompt();
      }
    }
  }

  // ------------------------------------------------------------ combat

  function launchBullet(originKind, x, y, heading, speed, damage) {
    world.bullets.push({
      id: nextEntityId(),
      from: originKind,
      x,
      y,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      life: 0.55,
      damage,
    });
    spawnSparks(x + Math.cos(heading) * 14, y + Math.sin(heading) * 14, 2, '#ffe9a8', 60, 0.12);
  }

  function playerShoot(origin) {
    const p = world.player;
    p.ammo -= 1;
    p.fireCd = 0.24;
    launchBullet('player', origin.x, origin.y, p.angle, 880, 9);
    cue('shoot');
    panicCrowd(origin.x, origin.y, 180);
    commitCrime(1, officerWatching(origin.x, origin.y, 700));
  }

  // ------------------------------------------------------------ the player

  function drivePlayerCar(dt, ctrl) {
    const p = world.player;
    const car = p.car;
    const spec = CAR_CLASSES[car.cls];
    const onBeach = onSand(car.x) && !onRoad(car.x, car.y);
    const topSpeed = spec.topSpeed * (onBeach ? 0.55 : 1);
    const throttle = -ctrl.my;

    if (throttle > 0) {
      car.speed += spec.accel * (onBeach ? 0.6 : 1) * dt * (car.speed < -5 ? 2.4 : 1);
    } else if (throttle < 0) {
      car.speed -= spec.accel * 0.85 * dt * (car.speed > 5 ? 2.4 : 1);
    }
    car.speed -= car.speed * 0.55 * dt; // rolling drag
    car.speed = clamp(car.speed, -spec.reverse, topSpeed);

    const authority = Math.min(1, Math.abs(car.speed) / 130);
    if (Math.abs(car.speed) > 3) {
      const steer = ctrl.mx * 2.35 * (ctrl.run ? 1.4 : 1) * authority * dt;
      car.angle += car.speed < 0 ? -steer : steer;
    }

    const prevX = car.x;
    const prevY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    resolveCarContacts(car, prevX, prevY, true);

    p.x = car.x;
    p.y = car.y;
    p.angle = typeof ctrl.aim === 'number' ? ctrl.aim : car.angle;
    world.stats.topSpeed = Math.max(world.stats.topSpeed, Math.abs(car.speed));

    if (ctrl.horn) {
      cue('horn');
      panicCrowd(car.x, car.y, 140);
    }
    if (ctrl.attack && p.weapon === 'pistol' && p.ammo > 0 && p.fireCd <= 0) {
      playerShoot(car);
    }
    // A faint exhaust puff while rolling at speed.
    if (Math.abs(car.speed) > 60 && rng() < 0.3) {
      world.particles.push({
        x: car.x - Math.cos(car.angle) * 18,
        y: car.y - Math.sin(car.angle) * 18,
        vx: 0,
        vy: -14,
        life: 0.4,
        max: 0.4,
        color: 'rgba(200,200,200,0.5)',
        size: 3,
      });
    }
  }

  function walkPlayer(dt, ctrl) {
    const p = world.player;
    const speed = ctrl.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const moving = ctrl.mx !== 0 || ctrl.my !== 0;
    if (moving) {
      const len = Math.hypot(ctrl.mx, ctrl.my);
      p.x += (ctrl.mx / len) * speed * dt;
      p.y += (ctrl.my / len) * speed * dt;
    }
    const clear = collideBuildings(city, p.x, p.y, PLAYER.radius);
    p.x = clamp(clear.x, 12, CITY.width - 12);
    p.y = clamp(clear.y, 12, CITY.height - 12);
    if (inWater(city, p.x, p.y)) p.x = CITY.waterX - 12;

    // Cars are solid to a walker: get eased out of their footprint.
    for (const car of world.cars) {
      const d = gap(car, p);
      if (d < 27 && d > 0) {
        p.x += ((p.x - car.x) / d) * (27 - d);
        p.y += ((p.y - car.y) / d) * (27 - d);
      }
    }

    if (typeof ctrl.aim === 'number') p.angle = ctrl.aim;
    else if (moving) p.angle = Math.atan2(ctrl.my, ctrl.mx);

    if (ctrl.attack) resolvePlayerAttack(p);
    updateBustPressure(dt, moving);
  }

  function resolvePlayerAttack(p) {
    if (p.weapon === 'pistol') {
      if (p.ammo > 0 && p.fireCd <= 0) playerShoot(p);
      return;
    }
    if (p.punchCd > 0) return;
    p.punchCd = 0.38;
    cue('punch');
    let connected = false;
    for (const ped of world.peds) {
      if (ped.state === 'down' || ped.follow) continue;
      if (gap(ped, p) >= PLAYER.punchRange + 8) continue;
      const facing = Math.cos(bearing(p, ped) - p.angle);
      if (facing > 0.2) {
        floorPed(ped, false);
        connected = true;
      }
    }
    if (!connected) {
      for (const car of world.cars) {
        if (gap(car, p) < 34) {
          damageVehicle(car, 3, p.x, p.y);
          break;
        }
      }
    }
  }

  /**
   * Standing still within arm's reach of an officer while wanted fills
   * the bust meter; keep moving (or keep away) and it drains.
   */
  function updateBustPressure(dt, moving) {
    const p = world.player;
    if (world.wanted <= 0) return;
    const cornered = officerWatching(p.x, p.y, POLICE.bustRadius);
    if (cornered && !moving) {
      world.bust += dt;
      if (world.bust >= POLICE.bustSeconds) {
        world.phase = 'busted';
        world.phaseT = 0;
        failMission('The police took you in.');
      }
    } else {
      world.bust = Math.max(0, world.bust - dt * 1.6);
    }
  }

  function tickPlayer(dt, ctrl) {
    const p = world.player;
    p.fireCd -= dt;
    p.punchCd -= dt;
    if (p.car) drivePlayerCar(dt, ctrl);
    else walkPlayer(dt, ctrl);
    refreshPrompt();
  }

  // ------------------------------------------------------------ collisions

  /**
   * Settle a moved car against the world: water and walls are hard
   * stops, other cars trade paint and momentum, and pedestrians in the
   * path of a fast car go down (slow ones just get shoved aside).
   */
  function resolveCarContacts(car, prevX, prevY, isPlayerCar) {
    if (inWater(city, car.x, car.y)) {
      car.x = prevX;
      car.y = prevY;
      car.speed *= -0.2;
    }
    const clear = collideBuildings(city, car.x, car.y, 19);
    if (clear.x !== car.x || clear.y !== car.y) {
      const impact = Math.abs(car.speed);
      car.x = clear.x;
      car.y = clear.y;
      if (impact > 110) {
        damageVehicle(car, impact * 0.055, car.x, car.y);
        if (isPlayerCar) injurePlayer(impact * 0.016);
        cue(impact > 260 ? 'crash3' : 'crash2');
      } else if (impact > 30) {
        cue('crash1');
      }
      car.speed *= -0.22;
    }
    car.x = clamp(car.x, 20, CITY.width - 20);
    car.y = clamp(car.y, 20, CITY.height - 20);

    for (const other of world.cars) {
      if (other === car) continue;
      const dx = car.x - other.x;
      const dy = car.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d >= 36 || d === 0) continue;
      const closing = Math.abs(car.speed) + Math.abs(other.speed) * 0.4;
      const push = (36 - d) / 2;
      car.x += (dx / d) * push;
      car.y += (dy / d) * push;
      if (other.kind !== 'parked') {
        other.x -= (dx / d) * push * 0.5;
        other.y -= (dy / d) * push * 0.5;
      }
      if (closing > 130) {
        damageVehicle(car, closing * 0.05, car.x, car.y);
        damageVehicle(other, closing * 0.05, other.x, other.y);
        if (isPlayerCar) injurePlayer(closing * 0.012);
        cue('crash2');
        if (other.kind === 'police' || car.kind === 'police') commitCrime(1, true);
        car.speed *= 0.45;
      } else {
        car.speed *= 0.8;
      }
    }

    for (const ped of world.peds) {
      if (ped.state === 'down' || ped.follow) continue;
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d >= 21) continue;
      if (Math.abs(car.speed) > 62) {
        ped.state = 'down';
        ped.downT = 13;
        spawnSparks(ped.x, ped.y, 5, '#e8e0d0', 70, 0.3);
        commitCrime(1, officerWatching(ped.x, ped.y, 520) || civilianWatching(ped.x, ped.y, 230));
        panicCrowd(ped.x, ped.y, 170);
        if (isPlayerCar) cue('crash1');
      } else {
        ped.x += (ped.x - car.x) * 0.2;
        ped.y += (ped.y - car.y) * 0.2;
      }
    }
  }

  // ------------------------------------------------------------ traffic

  /**
   * Look ahead along the car's lane and decide how fast it may go: match
   * the vehicle in front, stop for people, stop dead when boxed in.
   */
  function senseAhead(car) {
    const headX = car.roadType === 'v' ? 0 : car.dir;
    const headY = car.roadType === 'v' ? car.dir : 0;
    let allowed = car.cruise;
    const consider = (ox, oy, otherSpeed, gapDist, lateral) => {
      const relX = ox - car.x;
      const relY = oy - car.y;
      const forward = relX * headX + relY * headY;
      const sideways = Math.abs(relX * headY - relY * headX);
      if (forward > 0 && forward < gapDist && sideways < lateral) {
        allowed = forward < gapDist * 0.55 ? 0 : Math.min(allowed, otherSpeed);
      }
    };
    for (const other of world.cars) {
      if (other !== car) consider(other.x, other.y, Math.abs(other.speed), 56, 21);
    }
    const p = world.player;
    if (p.car) consider(p.car.x, p.car.y, Math.abs(p.car.speed), 56, 21);
    else consider(p.x, p.y, 0, 44, 17);
    for (const ped of world.peds) {
      if (ped.state !== 'down') consider(ped.x, ped.y, 0, 40, 16);
    }
    return allowed;
  }

  /** At a crossing, mostly go straight; sometimes peel off either way. */
  function chooseTurn(car, crossIdx) {
    const options = ['left', 'right'];
    let straightBlocked = false;
    if (car.roadType === 'v') {
      if ((crossIdx === 0 && car.dir < 0) || (crossIdx === CITY.hRoads - 1 && car.dir > 0)) straightBlocked = true;
    } else if ((crossIdx === 0 && car.dir < 0) || (crossIdx === CITY.vRoads - 1 && car.dir > 0)) {
      straightBlocked = true;
    }
    if (!straightBlocked) options.push('straight', 'straight', 'straight');
    const choice = pick(rng, options);
    if (choice === 'straight') return;
    if (car.roadType === 'v') {
      const crossX = vRoadX(car.roadIdx);
      car.roadType = 'h';
      car.roadIdx = crossIdx;
      car.s = crossX;
      car.dir = choice === 'right' ? -car.dir : car.dir;
    } else {
      const crossY = hRoadY(car.roadIdx);
      car.roadType = 'v';
      car.roadIdx = crossIdx;
      car.s = crossY;
      car.dir = choice === 'right' ? car.dir : -car.dir;
    }
  }

  function tickTraffic(dt) {
    for (const car of world.cars) {
      if (car.kind !== 'traffic') continue;
      const allowed = senseAhead(car);
      if (car.speed < allowed) car.speed = Math.min(allowed, car.speed + 175 * dt);
      else car.speed = Math.max(allowed, car.speed - 330 * dt);

      const prevS = car.s;
      car.s += car.speed * dt * car.dir;

      // Crossing a perpendicular street centre line is the turn moment.
      const crossings = car.roadType === 'v'
        ? Array.from({ length: CITY.hRoads }, (_, j) => hRoadY(j))
        : Array.from({ length: CITY.vRoads }, (_, i) => vRoadX(i));
      for (let idx = 0; idx < crossings.length; idx += 1) {
        const line = crossings[idx];
        if ((prevS < line && car.s >= line) || (prevS > line && car.s <= line)) {
          chooseTurn(car, idx);
          break;
        }
      }

      // Ease toward the lane centre and swing the nose to match.
      const lanePos = car.roadType === 'v'
        ? { x: vRoadX(car.roadIdx) + (car.dir < 0 ? CITY.lane : -CITY.lane), y: car.s }
        : { x: car.s, y: hRoadY(car.roadIdx) + (car.dir > 0 ? CITY.lane : -CITY.lane) };
      const ease = Math.min(1, dt * 7);
      car.x += (lanePos.x - car.x) * ease;
      car.y += (lanePos.y - car.y) * ease;
      const heading = car.roadType === 'v'
        ? (car.dir < 0 ? -Math.PI / 2 : Math.PI / 2)
        : (car.dir > 0 ? 0 : Math.PI);
      car.angle += angleDelta(car.angle, heading) * Math.min(1, dt * 6);
    }
    const rolling = world.cars.filter((c) => c.kind === 'traffic').length;
    if (rolling < TRAFFIC.maxCars && rng() < dt * 0.7) addTrafficCar(false);
  }

  // ------------------------------------------------------------ police

  function trySpawnCruiser() {
    const p = world.player;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const spot = randomRoadPoint(rng);
      const d = Math.hypot(spot.x - p.x, spot.y - p.y);
      if (d > POLICE.spawnDistance && d < 1050) {
        const cruiser = makeVehicle('police', '#f2f2f2', spot.x, spot.y, bearing(spot, p), 'police');
        cruiser.speed = 120;
        return;
      }
    }
  }

  function tickPolice(dt) {
    const p = world.player;
    const wantedLevel = world.wanted;
    const desired = POLICE.carsByStars[wantedLevel];
    const active = world.cars.filter((c) => c.kind === 'police' && !c.wrecked).length;

    cruiserTimer -= dt;
    if (wantedLevel > 0 && active < desired && cruiserTimer <= 0) {
      cruiserTimer = 1.4;
      trySpawnCruiser();
    }

    for (const cop of world.cars) {
      if (cop.kind !== 'police') continue;
      const d = gap(cop, p);

      if (wantedLevel === 0) {
        // Heat is off: cruisers roll to a stop and drift out of the world.
        if (d > 850) {
          cop.kind = 'gone';
          continue;
        }
        cop.speed = Math.max(0, cop.speed - 200 * dt);
        continue;
      }

      if (cop.wrecked) {
        // The officer is out of the wreck and shooting on foot.
        cop.shootCd -= dt;
        if (!p.car && d < 300 && d > 30 && cop.shootCd <= 0) {
          cop.shootCd = 0.95;
          launchBullet('cop', cop.x, cop.y, bearing(cop, p) + range(rng, -0.09, 0.09), 720, 5);
          cue('shoot');
        }
        continue;
      }

      // Hunt: aim where the player will be, not where they are.
      const topSpeed = Math.min(POLICE.speedByStars[wantedLevel], CAR_CLASSES.police.topSpeed + wantedLevel * 6);
      const aimX = p.car ? p.car.x + Math.cos(p.car.angle) * p.car.speed * 0.28 : p.x;
      const aimY = p.car ? p.car.y + Math.sin(p.car.angle) * p.car.speed * 0.28 : p.y;
      const desiredHeading = Math.atan2(aimY - cop.y, aimX - cop.x);
      const turn = angleDelta(cop.angle, desiredHeading);
      cop.angle += clamp(turn, -3.1 * dt, 3.1 * dt);

      const wantedSpeed = !p.car && d < 48 ? 0 : d < 90 ? topSpeed * 0.55 : topSpeed;
      if (cop.speed < wantedSpeed) cop.speed = Math.min(wantedSpeed, cop.speed + 385 * dt);
      else cop.speed = Math.max(wantedSpeed, cop.speed - 420 * dt);

      const prevX = cop.x;
      const prevY = cop.y;
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      resolveCarContacts(cop, prevX, prevY, false);
    }
    world.cars = world.cars.filter((c) => c.kind !== 'gone');
  }

  // ------------------------------------------------------------ crowds

  function tickPeds(dt) {
    for (const ped of world.peds) {
      if (ped.follow === 'car') {
        // Riding along: glued to the vehicle (or the player) until let out.
        const anchor = world.player.car || world.player;
        ped.x = anchor.x;
        ped.y = anchor.y;
        continue;
      }
      if (ped.state === 'hail') continue; // waving at the kerb, going nowhere
      if (ped.state === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) {
          ped.state = 'walk';
          ped.t = 0;
        }
        continue;
      }

      let speed = 62;
      let destX = ped.tx;
      let destY = ped.ty;
      let fleeing = false;

      if (ped.follow === true) {
        // Vera on foot, hurrying to keep up with the player.
        const target = world.player.car || world.player;
        destX = target.x;
        destY = target.y;
        speed = 216;
        if (Math.hypot(destX - ped.x, destY - ped.y) < 24) continue;
      } else if (ped.state === 'flee') {
        ped.t -= dt;
        speed = 238;
        fleeing = true;
        if (ped.t <= 0) ped.state = 'walk';
      } else {
        ped.t -= dt;
        if (ped.t <= 0 || Math.hypot(ped.tx - ped.x, ped.ty - ped.y) < 8) {
          const i = clamp(Math.floor(ped.x / CITY.pitch), 0, CITY.vRoads - 2);
          const j = clamp(Math.floor(ped.y / CITY.pitch), 0, CITY.hRoads - 2);
          const target = sidewalkPoint(rng, i, j);
          ped.tx = target.x;
          ped.ty = target.y;
          destX = target.x;
          destY = target.y;
          ped.t = range(rng, 6, 14);
        }
      }

      const dx = fleeing ? ped.x - destX : destX - ped.x;
      const dy = fleeing ? ped.y - destY : destY - ped.y;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        ped.angle = Math.atan2(dy, dx);
        ped.x += (dx / len) * speed * dt;
        ped.y += (dy / len) * speed * dt;
      }
      const clear = collideBuildings(city, ped.x, ped.y, 8);
      ped.x = Math.min(clear.x, CITY.waterX - 8);
      ped.y = clamp(clear.y, 10, CITY.height - 10);

      // A fast car nearby is worth stepping back from, quickly.
      for (const car of world.cars) {
        if (
          Math.abs(car.speed) > 90
          && Math.hypot(car.x - ped.x, car.y - ped.y) < 34
          && ped.state === 'walk'
          && !ped.follow
        ) {
          ped.state = 'flee';
          ped.t = 1.1;
          ped.tx = car.x;
          ped.ty = car.y;
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ projectiles

  function tickBullets(dt) {
    const p = world.player;
    for (const bullet of world.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0) continue;
      if (buildingAt(city, bullet.x, bullet.y, 1)) {
        spawnSparks(bullet.x, bullet.y, 2, '#ffd94d', 80, 0.15);
        bullet.life = 0;
        continue;
      }
      if (bullet.from === 'player') {
        let consumed = false;
        for (const car of world.cars) {
          if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < 21) {
            damageVehicle(car, bullet.damage, bullet.x, bullet.y);
            if (car.kind === 'police') commitCrime(1, true);
            consumed = true;
            break;
          }
        }
        if (consumed) {
          bullet.life = 0;
          continue;
        }
        for (const ped of world.peds) {
          if (ped.state !== 'down' && !ped.follow && Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 11) {
            floorPed(ped, true);
            bullet.life = 0;
            break;
          }
        }
      } else if (p.car) {
        if (Math.hypot(p.car.x - bullet.x, p.car.y - bullet.y) < 22) {
          damageVehicle(p.car, bullet.damage, bullet.x, bullet.y);
          bullet.life = 0;
        }
      } else if (Math.hypot(p.x - bullet.x, p.y - bullet.y) < 12) {
        injurePlayer(bullet.damage);
        bullet.life = 0;
      }
    }
    world.bullets = world.bullets.filter((b) => b.life > 0);
  }

  // ------------------------------------------------------------ pickups

  function tickPickups(dt) {
    const p = world.player;
    const anchorX = p.car ? p.car.x : p.x;
    const anchorY = p.car ? p.car.y : p.y;
    for (const pickup of world.pickups) {
      pickup.t += dt;
      if (pickup.cd > 0) {
        pickup.cd -= dt;
        continue;
      }
      if (Math.hypot(pickup.x - anchorX, pickup.y - anchorY) >= 24) continue;
      if (pickup.kind === 'cash') {
        p.money += pickup.amount;
        world.stats.earned += pickup.amount;
        cue('cash');
        pickup.gone = true;
      } else if (pickup.kind === 'health' && p.health < 100) {
        p.health = Math.min(100, p.health + pickup.amount);
        cue('pickup');
        pickup.cd = 20;
      } else if (pickup.kind === 'pistol' && p.weapon !== 'pistol') {
        p.weapon = 'pistol';
        p.ammo += pickup.amount;
        announce('Bay Armory', 'You picked up a pistol. The mouse aims; click to fire.', 4);
        cue('pickup');
        pickup.cd = 99999;
      }
    }
    world.pickups = world.pickups.filter((pk) => !pk.gone);
  }

  // ------------------------------------------------------------ heat & fx

  /** Wanted stars cool off while no officer has eyes on the player. */
  function tickWanted(dt) {
    world.crimeCd -= dt;
    const p = world.player;
    if (officerWatching(p.x, p.y, POLICE.sightRange)) world.unseen = 0;
    else world.unseen += dt;
    if (world.wanted > 0 && world.unseen > WANTED.decaySeconds[world.wanted]) {
      world.wanted -= 1;
      world.unseen = 0;
    }
  }

  function tickParticles(dt) {
    for (const particle of world.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - 1.6 * dt;
      particle.vy *= 1 - 1.6 * dt;
      particle.life -= dt;
    }
    world.particles = world.particles.filter((pt) => pt.life > 0);
  }

  // ------------------------------------------------------------ main step

  /**
   * Advance everything by one fixed tick. ctrl carries the shell's
   * intent: { mx, my } axes, run, attack, aim (angle or null), horn and
   * the one-shot interact flag.
   */
  world.step = function step(dt, ctrl) {
    world.time += dt;
    world.clock = (world.clock + dt) % (24 * 60);

    if (world.banner) {
      world.banner.t -= dt;
      if (world.banner.t <= 0) world.banner = null;
    }

    if (world.phase === 'busted' || world.phase === 'wasted') {
      world.phaseT += dt;
      tickParticles(dt);
      if (world.phaseT > 1.9) respawn();
      return;
    }
    if (world.phase === 'ending') {
      tickParticles(dt);
      return;
    }

    if (ctrl.interact) world.tryInteract();
    if (world.courier && !world.mission) tickCourier();
    tickTaxi(dt);
    advanceStory(dt);
    tickPlayer(dt, ctrl);
    if (world.phase !== 'play') return; // busted or wasted mid-tick

    tickTraffic(dt);
    tickPolice(dt);
    tickPeds(dt);
    tickBullets(dt);
    tickPickups(dt);
    tickWanted(dt);
    tickParticles(dt);

    // The camera trails the player, leaning into their velocity.
    const p = world.player;
    const lead = p.car ? 0.34 : 0.12;
    const velX = p.car ? Math.cos(p.car.angle) * p.car.speed : 0;
    const velY = p.car ? Math.sin(p.car.angle) * p.car.speed : 0;
    const targetX = clamp(p.x + velX * lead - 640, 0, CITY.width - 1280);
    const targetY = clamp(p.y + velY * lead - 360, 0, CITY.height - 720);
    const ease = Math.min(1, dt * 5);
    world.camera.x += (targetX - world.camera.x) * ease;
    world.camera.y += (targetY - world.camera.y) * ease;
  };

  return world;
}
