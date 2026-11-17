// The simulation: Coral Bay as a living system. The player walks and drives; traffic follows
// the lanes and stops for trouble; pedestrians stroll the sidewalks and run from it; police
// answer the wanted level, chase, ram and bust; and a three-mission story (plus a repeatable
// courier job) plays out across the city's named places. Everything advances in fixed steps
// from a seeded random stream, so a run — and a staged screenshot — always plays the same.

import {
  CAR_CLASSES, CITY, PEDS, PLAYER, POLICE, PRICES, TRAFFIC, WANTED,
  hRoadY, vRoadX,
} from './config.js';
import { buildCity, buildingAt, collideBuildings, inWater, onRoad, onSand, randomRoadPoint, sidewalkPoint } from './city.js';
import { createRandom, pick, randInt, range } from './random.js';

let nextId = 1;
const id = () => { const v = nextId; nextId += 1; return v; };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** The story Vera tells, one mission at a time. Steps run in order; see runMissionStep. */
export const MISSIONS = [
  {
    id: 'wheels', name: 'First Wheels', pay: 500,
    intro: 'Vera: A teal Comet is sitting in the Ocean Drive lot, keys in, owner away. Bring it to my garage — clean.',
    steps: [
      { kind: 'steal', label: 'Steal the teal Comet on Ocean Drive' },
      { kind: 'deliverCar', label: 'Deliver the Comet to Vera\u2019s Customs', at: 'garage', r: 64 },
    ],
  },
  {
    id: 'package', name: 'Hot Package', pay: 900,
    intro: 'Vera: Rosie at the diner holds a package that cannot wait. Pick it up, drop it at the marina. Expect company.',
    steps: [
      { kind: 'goto', label: 'Pick up the package behind Rosie\u2019s Diner', at: 'diner', r: 40 },
      { kind: 'goto', label: 'Deliver the package to Coral Marina', at: 'marina', r: 58, setWanted: 2, timer: 150 },
    ],
  },
  {
    id: 'bayrun', name: 'The Bay Run', pay: 1500,
    intro: 'Vera: Last job. I am at the bank with the take. Pick me up and get me to the marina boat — whatever it takes.',
    steps: [
      { kind: 'pickupPerson', label: 'Pick Vera up at First Coral Bank', at: 'bank', r: 52 },
      { kind: 'goto', label: 'Get Vera to the marina pier', at: 'pier', r: 60, setWanted: 3, timer: 240 },
    ],
  },
];

export function createWorld(seed) {
  const city = buildCity(seed);
  const random = createRandom(seed ^ 0x9e3779b9);

  const world = {
    city,
    random,
    time: 0,
    clock: 15 * 60, // 15:00, the golden afternoon
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
    mission: null,       // { def, step, timer } while a mission runs
    courier: null,       // { phase, x, y, label } for the repeatable job
    storyDone: false,
    phase: 'play',       // play | busted | wasted | ending
    phaseT: 0,
    bust: 0,
    banner: null,        // { title, sub, t }
    objective: null,     // { x, y, label } the HUD marker
    nearAction: null,    // { label } what E would do right now
    events: [],          // sound cues for the caller: 'shoot', 'cash', ...
    camera: { x: 0, y: 0 },
    stats: { earned: 0, stolen: 0, topSpeed: 0 },
    comet: null,
    vera: null,
  };

  function banner(title, sub, seconds = 4.5) {
    world.banner = { title, sub, t: seconds };
  }

  function emit(name) { world.events.push(name); }

  function addCrime(stars, witnessed = true) {
    if (!witnessed || world.crimeCd > 0 || world.wanted >= 5) return;
    world.wanted = Math.min(5, world.wanted + stars);
    world.crimeCd = WANTED.crimeCooldown;
    world.unseen = 0;
    emit('star');
  }
  world.addCrime = addCrime;
  world.startMission = startMission;

  function anyCopNear(x, y, rangePx) {
    return world.cars.some((c) => c.kind === 'police' && !c.wrecked && Math.hypot(c.x - x, c.y - y) < rangePx);
  }
  function anyPedNear(x, y, rangePx) {
    return world.peds.some((p) => p.state !== 'down' && Math.hypot(p.x - x, p.y - y) < rangePx);
  }

  function spawnCar(cls, color, x, y, angle, kind) {
    const car = {
      id: id(), cls, kind, color, x, y, angle, speed: 0,
      health: CAR_CLASSES[cls].health, wrecked: false,
      roadType: 'v', roadIdx: 0, dir: 1, s: 0, cruise: 0,
      shootCd: 0, officerOut: false, honkCd: 0,
    };
    world.cars.push(car);
    return car;
  }

  function spawnTraffic(initial = false) {
    for (let tries = 0; tries < 10; tries += 1) {
      const vertical = random() < 0.55;
      const roadIdx = vertical ? randInt(random, CITY.vRoads) : randInt(random, CITY.hRoads);
      const dir = random() < 0.5 ? 1 : -1;
      const s = vertical ? range(random, 90, CITY.height - 90) : range(random, 90, CITY.beachX - 40);
      const lane = vertical
        ? { x: vRoadX(roadIdx) + (dir < 0 ? CITY.lane : -CITY.lane), y: s }
        : { x: s, y: hRoadY(roadIdx) + (dir > 0 ? CITY.lane : -CITY.lane) };
      if (!initial && Math.hypot(lane.x - world.player.x, lane.y - world.player.y) < TRAFFIC.spawnGap) continue;
      if (world.cars.some((c) => Math.hypot(c.x - lane.x, c.y - lane.y) < 60)) continue;
      const cls = pick(random, ['sedan', 'sedan', 'coupe', 'taxi', 'van']);
      const car = spawnCar(cls, pick(random, ['#d94f3d', '#3d7bd9', '#f2f2f2', '#2b2f36', '#f2b23d', '#57b26a', '#9b59c9', '#e8e0d0', '#4fb3bf', '#c94f7c']), lane.x, lane.y, 0, 'traffic');
      if (cls === 'taxi') car.color = '#f2b23d';
      car.roadType = vertical ? 'v' : 'h';
      car.roadIdx = roadIdx;
      car.dir = dir;
      car.s = s;
      car.cruise = range(random, 148, 228);
      car.angle = vertical ? (dir < 0 ? -Math.PI / 2 : Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      return car;
    }
    return null;
  }

  function spawnParked() {
    // Cars parked nose-in along the curbs, ready to be borrowed.
    for (let n = 0; n < 15; n += 1) {
      const i = randInt(random, CITY.vRoads);
      const y = range(random, 150, CITY.height - 150);
      if (Math.abs((y % CITY.pitch)) < 90) continue; // keep intersections clear
      const side = random() < 0.5 ? -1 : 1;
      const x = vRoadX(i) + side * (CITY.roadW / 2 + 9); // in the parking bay, clear of the lanes
      const cls = pick(random, ['sedan', 'coupe', 'sedan', 'van']);
      spawnCar(cls, pick(random, ['#d94f3d', '#3d7bd9', '#f2f2f2', '#2b2f36', '#57b26a', '#e8e0d0']), x, y, side > 0 ? Math.PI : 0, 'parked')
        .angle = random() < 0.5 ? -Math.PI / 2 : Math.PI / 2;
    }
    // The Comet: a teal sports car in the Ocean Drive lot, east side, facing the bay.
    const comet = spawnCar('sport', '#0fbfa8', vRoadX(5) + CITY.roadW / 2 + 44, 210, 0, 'parked');
    comet.angle = 0;
    world.comet = comet;
  }

  function spawnPed(x, y) {
    const ped = {
      id: id(), x, y, angle: range(random, 0, Math.PI * 2),
      color: pick(random, ['#ef6c6c', '#f2c14e', '#6cb2ef', '#7be382', '#e88fd0', '#f2f2f2', '#ef9a4e', '#5fd0c4', '#b48fef']),
      state: 'walk', t: range(random, 1, 4), tx: x, ty: y, downT: 0, follow: false,
    };
    world.peds.push(ped);
    return ped;
  }

  function scatterPeds() {
    for (let n = 0; n < PEDS.max; n += 1) {
      const p = sidewalkPoint(random, randInt(random, CITY.vRoads - 1), randInt(random, CITY.hRoads - 1));
      spawnPed(p.x, p.y);
    }
  }

  function addPickup(kind, x, y, amount = 0) {
    world.pickups.push({ id: id(), kind, x, y, amount, t: range(random, 0, 6) });
  }

  world.reset = function reset(save) {
    nextId = 1;
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
    world.phase = 'play';
    world.phaseT = 0;
    world.bust = 0;
    world.banner = null;
    world.objective = null;
    world.stats = { earned: 0, stolen: 0, topSpeed: 0 };
    world.missionIndex = save && Number.isInteger(save.missionIndex) ? Math.min(save.missionIndex, MISSIONS.length) : 0;
    world.storyDone = world.missionIndex >= MISSIONS.length;
    const garage = city.landmarks.garage.door;
    world.player = {
      x: garage.x, y: garage.y + 26, angle: -Math.PI / 2, vx: 0, vy: 0,
      health: 100, money: save && save.money ? save.money : 85,
      weapon: save && save.weapon ? save.weapon : 'fist', ammo: save && save.ammo ? save.ammo : 0,
      car: null, fireCd: 0, punchCd: 0, dead: false,
    };
    spawnParked();
    for (let n = 0; n < TRAFFIC.maxCars; n += 1) spawnTraffic(true);
    scatterPeds();
    addPickup('pistol', city.landmarks.armory.door.x, city.landmarks.armory.door.y, 24);
    addPickup('health', city.landmarks.hospital.door.x, city.landmarks.hospital.door.y, 45);
    world.vera = null;
    snapCamera();
  };

  world.saveData = function saveData() {
    const p = world.player;
    return { money: p.money, missionIndex: world.missionIndex, weapon: p.weapon, ammo: p.ammo };
  };

  function snapCamera() {
    const p = world.player;
    world.camera.x = Math.max(0, Math.min(CITY.width - 1280, p.x - 640));
    world.camera.y = Math.max(0, Math.min(CITY.height - 720, p.y - 360));
  }

  // ------------------------------------------------------------- missions

  function stepTarget(step) {
    if (step.kind === 'steal') return { x: world.comet.x, y: world.comet.y };
    if (step.at === 'pier') return { x: city.pier.x + city.pier.w - 40, y: city.pier.y + city.pier.h / 2 };
    const lm = city.landmarks[step.at];
    return { x: lm.door.x, y: lm.door.y };
  }

  function startMission(index) {
    const def = MISSIONS[index];
    world.mission = { def, step: 0, timer: null };
    banner(def.name, def.intro, 6.5);
    emit('missionStart');
  }

  function startCourier() {
    const spots = ['bank', 'diner', 'hotel', 'hospital', 'marina', 'armory'];
    const from = pick(random, spots);
    let to = pick(random, spots);
    if (to === from) to = 'marina';
    const a = city.landmarks[from].door;
    world.courier = { phase: 'pickup', x: a.x, y: a.y, to, label: `Courier: pick up at ${city.landmarks[from].name}` };
    banner('Courier Job', world.courier.label + '. Pays on delivery.', 4.5);
  }

  function missionFailed(why) {
    if (!world.mission) return;
    banner('Mission Failed', why, 4);
    emit('fail');
    world.mission = null;
    if (world.vera) { world.vera.follow = false; world.vera = null; }
  }
  world.missionFailed = missionFailed;

  function missionComplete() {
    const def = world.mission.def;
    world.player.money += def.pay;
    world.stats.earned += def.pay;
    world.missionIndex += 1;
    world.storyDone = world.missionIndex >= MISSIONS.length;
    banner('Mission Complete', `${def.name} — $${def.pay} paid.`, 5);
    emit('missionDone');
    emit('cash');
    world.mission = null;
    if (world.vera) { world.vera.follow = false; world.vera.state = 'walk'; world.vera = null; }
    if (world.storyDone) {
      world.phase = 'ending';
      world.phaseT = 0;
    }
  }

  function runMissionStep(dt) {
    const m = world.mission;
    if (!m) {
      // No story mission: the garage offers the next one; after the story, courier work.
      if (!world.storyDone) {
        const g = city.landmarks.garage.door;
        world.objective = { x: g.x, y: g.y, label: `${MISSIONS[world.missionIndex].name} — see Vera` };
      } else if (world.courier) {
        world.objective = { x: world.courier.x, y: world.courier.y, label: world.courier.label };
      } else {
        world.objective = null;
      }
      return;
    }
    const step = m.def.steps[m.step];
    const target = stepTarget(step);
    world.objective = { x: target.x, y: target.y, label: step.label };
    if (step.timer) {
      if (m.timer === null) m.timer = step.timer;
      m.timer -= dt;
      if (m.timer <= 0) { missionFailed('Out of time.'); return; }
    }
    const p = world.player;
    const near = Math.hypot(p.x - target.x, p.y - target.y) < (step.r || 48);
    if (step.kind === 'deliverCar' && world.comet.wrecked) {
      missionFailed('The Comet is a wreck. Vera is furious.');
      return;
    }
    let done = false;
    if (step.kind === 'steal') done = p.car === world.comet;
    else if (step.kind === 'deliverCar') done = near && p.car === world.comet && world.comet.health > 25;
    else if (step.kind === 'goto') done = near;
    else if (step.kind === 'pickupPerson') {
      if (near && p.car && !world.vera) {
        world.vera = spawnPed(target.x + 14, target.y + 10);
        world.vera.follow = true;
        banner('Vera', 'Get me to the marina. Drive like you mean it.', 3.5);
      }
      done = !!(world.vera && world.vera.follow && p.car);
      if (done) world.vera.follow = 'car';
    }
    if (done) {
      m.step += 1;
      m.timer = null;
      const next = m.def.steps[m.step];
      if (next && next.setWanted) {
        world.wanted = Math.max(world.wanted, next.setWanted);
        emit('star');
      }
      if (m.step >= m.def.steps.length) missionComplete();
      else emit('pickup');
    }
  }

  // ------------------------------------------------------------- actors

  function hurtPlayer(amount) {
    const p = world.player;
    if (world.phase !== 'play') return;
    p.health -= amount;
    emit('hurt');
    if (p.health <= 0) {
      p.health = 0;
      world.phase = 'wasted';
      world.phaseT = 0;
      missionFailedSilent();
    }
  }

  function missionFailedSilent() {
    world.mission = null;
    if (world.vera) { world.vera.follow = false; world.vera = null; }
  }

  function knockPed(ped, byShot) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downT = byShot ? 14 : 7;
    if (!byShot && random() < 0.6) addPickup('cash', ped.x + range(random, -8, 8), ped.y + range(random, -8, 8), randInt(random, 21) + 5);
    addCrime(1, anyCopNear(ped.x, ped.y, 460) || anyPedNear(ped.x, ped.y, 210));
    scarePeds(ped.x, ped.y, 150);
  }

  function scarePeds(x, y, r) {
    for (const ped of world.peds) {
      if (ped.state === 'walk' && Math.hypot(ped.x - x, ped.y - y) < r) {
        ped.state = 'flee';
        ped.t = range(random, 1.6, 3.2);
        ped.tx = x;
        ped.ty = y;
      }
    }
  }
  world.scarePeds = scarePeds;

  function damageCar(car, amount, causeX, causeY) {
    if (car.wrecked) return;
    car.health -= amount;
    if (car.health <= 55 && car.health + amount > 55) emit('crash2');
    if (car.health <= 0) {
      car.health = 0;
      car.wrecked = true;
      car.speed = 0;
      burst(car.x, car.y, 16, '#565d66', 130, 0.7);
      burst(car.x, car.y, 8, '#ff9a3c', 90, 0.4);
      if (world.player.car === car) hurtPlayer(6);
    } else if (causeX !== undefined) {
      burst(causeX, causeY, 4, '#ffd94d', 120, 0.25);
    }
  }

  function burst(x, y, n, color, speed, life) {
    for (let i = 0; i < n; i += 1) {
      if (world.particles.length > 320) return;
      const a = range(random, 0, Math.PI * 2);
      const v = range(random, speed * 0.3, speed);
      world.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20,
        life: range(random, life * 0.5, life), max: life, color, size: range(random, 1.5, 3.5),
      });
    }
  }
  world.burst = burst;

  // ------------------------------------------------------------- driving

  function enterCar(car) {
    const p = world.player;
    if (car.kind === 'traffic') {
      if (Math.abs(car.speed) > 42) return; // too fast to jack
      const driver = spawnPed(car.x + 14, car.y + 6);
      driver.state = 'flee';
      driver.t = 2.6;
      driver.tx = car.x;
      driver.ty = car.y;
    }
    if (!car.stolen) {
      car.stolen = true;
      world.stats.stolen += 1;
      addCrime(1, anyCopNear(car.x, car.y, 520) || anyPedNear(car.x, car.y, 220));
    }
    car.kind = 'player';
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    emit('door');
  }

  function exitCar() {
    const p = world.player;
    const car = p.car;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    p.car = null;
    const sx = car.x + Math.cos(car.angle - Math.PI / 2) * 32;
    const sy = car.y + Math.sin(car.angle - Math.PI / 2) * 32;
    const fixed = collideBuildings(city, sx, sy, PLAYER.radius);
    p.x = Math.min(fixed.x, CITY.waterX - 12);
    p.y = fixed.y;
    emit('door');
  }

  world.tryInteract = function tryInteract() {
    const p = world.player;
    if (world.phase !== 'play') return;
    if (p.car) {
      const bs = city.landmarks.bodyshop.door;
      const spec = CAR_CLASSES[p.car.cls];
      if (Math.hypot(p.car.x - bs.x, p.car.y - bs.y) < 62 && p.car.health < spec.health && p.money >= PRICES.repair) {
        p.money -= PRICES.repair;
        p.car.health = spec.health;
        p.car.wrecked = false;
        banner('Shine Auto Body', `Repaired — $${PRICES.repair}.`, 2.5);
        emit('cash');
        return;
      }
      exitCar();
      return;
    }
    let best = null;
    let bestD = PLAYER.enterRange;
    for (const car of world.cars) {
      if (car.wrecked) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) { enterCar(best); return; }
    const g = city.landmarks.garage.door;
    if (!world.mission && Math.hypot(p.x - g.x, p.y - g.y) < 58) {
      if (!world.storyDone) { startMission(world.missionIndex); return; }
      if (!world.courier) { startCourier(); return; }
    }
    const h = city.landmarks.hospital.door;
    if (Math.hypot(p.x - h.x, p.y - h.y) < 48 && p.health < 100 && p.money >= PRICES.heal) {
      p.money -= PRICES.heal;
      p.health = 100;
      banner('St. Marina Hospital', `Patched up — $${PRICES.heal}.`, 2.5);
      emit('cash');
      return;
    }
    const a = city.landmarks.armory.door;
    if (Math.hypot(p.x - a.x, p.y - a.y) < 48 && p.weapon === 'pistol' && p.money >= PRICES.ammo) {
      p.money -= PRICES.ammo;
      p.ammo += PRICES.ammoAmount;
      banner('Bay Armory', `Ammo +${PRICES.ammoAmount} — $${PRICES.ammo}.`, 2.5);
      emit('cash');
    }
  };

  function computeNearAction() {
    const p = world.player;
    world.nearAction = null;
    if (world.phase !== 'play') return;
    if (p.car) {
      const bs = city.landmarks.bodyshop.door;
      if (Math.hypot(p.car.x - bs.x, p.car.y - bs.y) < 62 && p.car.health < CAR_CLASSES[p.car.cls].health && p.money >= PRICES.repair) {
        world.nearAction = `E — Repair car, $${PRICES.repair}`;
      } else world.nearAction = 'E — Get out';
      return;
    }
    let best = null;
    let bestD = PLAYER.enterRange;
    for (const car of world.cars) {
      if (car.wrecked) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) {
      world.nearAction = best === world.comet ? 'E — Steal the Comet' : `E — Drive the ${CAR_CLASSES[best.cls].label}`;
      return;
    }
    const g = city.landmarks.garage.door;
    if (!world.mission && Math.hypot(p.x - g.x, p.y - g.y) < 58) {
      world.nearAction = world.storyDone ? (world.courier ? null : 'E — Courier job') : 'E — Talk to Vera';
      return;
    }
    const h = city.landmarks.hospital.door;
    if (Math.hypot(p.x - h.x, p.y - h.y) < 48 && p.health < 100 && p.money >= PRICES.heal) world.nearAction = `E — Heal, $${PRICES.heal}`;
    const a = city.landmarks.armory.door;
    if (Math.hypot(p.x - a.x, p.y - a.y) < 48 && p.weapon === 'pistol' && p.money >= PRICES.ammo) world.nearAction = `E — Buy ammo, $${PRICES.ammo}`;
  }

  function fireBullet(from, x, y, angle, speed, damage) {
    world.bullets.push({
      id: id(), from, x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.55, damage,
    });
    burst(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14, 2, '#ffe9a8', 60, 0.12);
  }

  function shoot(p, origin) {
    p.ammo -= 1;
    p.fireCd = 0.24;
    fireBullet('player', origin.x, origin.y, p.angle, 880, 9);
    emit('shoot');
    scarePeds(origin.x, origin.y, 180);
    addCrime(1, anyCopNear(origin.x, origin.y, 700));
  }

  function updatePlayer(dt, ctrl) {
    const p = world.player;
    p.fireCd -= dt;
    p.punchCd -= dt;
    if (p.car) {
      const car = p.car;
      const spec = CAR_CLASSES[car.cls];
      const sand = onSand(car.x) && !onRoad(car.x, car.y);
      const top = spec.topSpeed * (sand ? 0.55 : 1);
      const throttle = -ctrl.my;
      if (throttle > 0) car.speed += spec.accel * (sand ? 0.6 : 1) * dt * (car.speed < -5 ? 2.4 : 1);
      else if (throttle < 0) car.speed -= spec.accel * 0.85 * dt * (car.speed > 5 ? 2.4 : 1);
      car.speed -= car.speed * 0.55 * dt;
      car.speed = Math.max(-spec.reverse, Math.min(top, car.speed));
      const steerAuthority = Math.min(1, Math.abs(car.speed) / 130);
      if (Math.abs(car.speed) > 3) {
        car.angle += ctrl.mx * 2.35 * (ctrl.run ? 1.4 : 1) * steerAuthority * dt * (car.speed < 0 ? -1 : 1);
      }
      const ox = car.x;
      const oy = car.y;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      collideCarWorld(car, ox, oy, true);
      p.x = car.x;
      p.y = car.y;
      p.angle = typeof ctrl.aim === 'number' ? ctrl.aim : car.angle;
      world.stats.topSpeed = Math.max(world.stats.topSpeed, Math.abs(car.speed));
      if (ctrl.horn) { emit('horn'); scarePeds(car.x, car.y, 140); }
      if (ctrl.attack && p.weapon === 'pistol' && p.ammo > 0 && p.fireCd <= 0) shoot(p, car);
      if (Math.abs(car.speed) > 60 && random() < 0.3) {
        world.particles.push({ x: car.x - Math.cos(car.angle) * 18, y: car.y - Math.sin(car.angle) * 18, vx: 0, vy: -14, life: 0.4, max: 0.4, color: 'rgba(200,200,200,0.5)', size: 3 });
      }
    } else {
      const speed = ctrl.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const mx = ctrl.mx;
      const my = ctrl.my;
      const len = Math.hypot(mx, my) || 1;
      const moving = mx !== 0 || my !== 0;
      p.x += (mx / len) * speed * (moving ? 1 : 0) * dt;
      p.y += (my / len) * speed * (moving ? 1 : 0) * dt;
      const fixed = collideBuildings(city, p.x, p.y, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      p.x = Math.max(12, Math.min(p.x, CITY.width - 12));
      p.y = Math.max(12, Math.min(p.y, CITY.height - 12));
      if (inWater(city, p.x, p.y)) p.x = CITY.waterX - 12;
      for (const car of world.cars) {
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (d < 27 && d > 0) {
          p.x += ((p.x - car.x) / d) * (27 - d);
          p.y += ((p.y - car.y) / d) * (27 - d);
        }
      }
      if (typeof ctrl.aim === 'number') p.angle = ctrl.aim;
      else if (moving) p.angle = Math.atan2(my, mx);
      if (ctrl.attack) {
        if (p.weapon === 'pistol') {
          if (p.ammo > 0 && p.fireCd <= 0) shoot(p, p);
        } else if (p.punchCd <= 0) {
          p.punchCd = 0.38;
          emit('punch');
          let hit = false;
          for (const ped of world.peds) {
            if (ped.state === 'down' || ped.follow) continue;
            const d = Math.hypot(ped.x - p.x, ped.y - p.y);
            if (d < PLAYER.punchRange + 8) {
              const dot = Math.cos(angleTo(p, ped) - p.angle);
              if (dot > 0.2) { knockPed(ped, false); hit = true; }
            }
          }
          if (!hit) {
            for (const car of world.cars) {
              if (Math.hypot(car.x - p.x, car.y - p.y) < 34) { damageCar(car, 3, p.x, p.y); break; }
            }
          }
        }
      }
      // The bust: a cop close by while you are standing around is bad news.
      if (world.wanted > 0) {
        const nearCop = anyCopNear(p.x, p.y, POLICE.bustRadius);
        if (nearCop && !moving) {
          world.bust += dt;
          if (world.bust >= POLICE.bustSeconds) {
            world.phase = 'busted';
            world.phaseT = 0;
            missionFailed('The police took you in.');
            return;
          }
        } else world.bust = Math.max(0, world.bust - dt * 1.6);
      }
    }
    computeNearAction();
  }

  function collideCarWorld(car, ox, oy, isPlayer) {
    // Buildings and the bay are hard stops; other cars are heavy; pedestrians are not.
    if (inWater(city, car.x, car.y)) {
      car.x = ox;
      car.y = oy;
      car.speed *= -0.2;
    }
    const fixed = collideBuildings(city, car.x, car.y, 19);
    if (fixed.x !== car.x || fixed.y !== car.y) {
      const impact = Math.abs(car.speed);
      car.x = fixed.x;
      car.y = fixed.y;
      if (impact > 110) {
        damageCar(car, impact * 0.055, car.x, car.y);
        if (isPlayer) hurtPlayer(impact * 0.016);
        emit(impact > 260 ? 'crash3' : 'crash2');
      } else if (impact > 30) emit('crash1');
      car.speed *= -0.22;
    }
    car.x = Math.max(20, Math.min(car.x, CITY.width - 20));
    car.y = Math.max(20, Math.min(car.y, CITY.height - 20));
    for (const other of world.cars) {
      if (other === car) continue;
      const dx = car.x - other.x;
      const dy = car.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d < 36 && d > 0) {
        const rel = Math.abs(car.speed) + Math.abs(other.speed) * 0.4;
        const push = (36 - d) / 2;
        car.x += (dx / d) * push;
        car.y += (dy / d) * push;
        if (other.kind !== 'parked') {
          other.x -= (dx / d) * push * 0.5;
          other.y -= (dy / d) * push * 0.5;
        }
        if (rel > 130) {
          damageCar(car, rel * 0.05, car.x, car.y);
          damageCar(other, rel * 0.05, other.x, other.y);
          if (isPlayer) hurtPlayer(rel * 0.012);
          emit('crash2');
          if (other.kind === 'police' || car.kind === 'police') addCrime(1, true);
          car.speed *= 0.45;
        } else car.speed *= 0.8;
      }
    }
    for (const ped of world.peds) {
      if (ped.state === 'down' || ped.follow) continue;
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d < 21) {
        if (Math.abs(car.speed) > 62) {
          ped.state = 'down';
          ped.downT = 13;
          burst(ped.x, ped.y, 5, '#e8e0d0', 70, 0.3);
          addCrime(1, anyCopNear(ped.x, ped.y, 520) || anyPedNear(ped.x, ped.y, 230));
          scarePeds(ped.x, ped.y, 170);
          if (isPlayer) emit('crash1');
        } else {
          ped.x += (ped.x - car.x) * 0.2;
          ped.y += (ped.y - car.y) * 0.2;
        }
      }
    }
  }

  // ------------------------------------------------------------- traffic

  function trafficObstacle(car) {
    const hx = car.roadType === 'v' ? 0 : car.dir;
    const hy = car.roadType === 'v' ? car.dir : 0;
    let want = car.cruise;
    const test = (ox, oy, ospeed, gap, lat) => {
      const rx = ox - car.x;
      const ry = oy - car.y;
      const fwd = rx * hx + ry * hy;
      const side = Math.abs(rx * hy - ry * hx);
      if (fwd > 0 && fwd < gap && side < lat) want = fwd < gap * 0.55 ? 0 : Math.min(want, ospeed);
    };
    for (const other of world.cars) {
      if (other === car) continue;
      test(other.x, other.y, Math.abs(other.speed), 56, 21);
    }
    if (world.player.car) test(world.player.car.x, world.player.car.y, Math.abs(world.player.car.speed), 56, 21);
    else test(world.player.x, world.player.y, 0, 44, 17);
    for (const ped of world.peds) {
      if (ped.state !== 'down') test(ped.x, ped.y, 0, 40, 16);
    }
    return want;
  }

  function decideTurn(car, crossIdx) {
    const options = [];
    let canStraight = true;
    if (car.roadType === 'v') {
      if ((crossIdx === 0 && car.dir < 0) || (crossIdx === CITY.hRoads - 1 && car.dir > 0)) canStraight = false;
    } else if ((crossIdx === 0 && car.dir < 0) || (crossIdx === CITY.vRoads - 1 && car.dir > 0)) canStraight = false;
    if (canStraight) options.push('straight', 'straight', 'straight');
    options.push('left', 'right');
    const choice = pick(random, options);
    if (choice === 'straight') return;
    if (car.roadType === 'v') {
      const x = vRoadX(car.roadIdx);
      car.roadType = 'h';
      car.roadIdx = crossIdx;
      car.s = x;
      car.dir = choice === 'right' ? -car.dir : car.dir;
    } else {
      const y = hRoadY(car.roadIdx);
      car.roadType = 'v';
      car.roadIdx = crossIdx;
      car.s = y;
      car.dir = choice === 'right' ? car.dir : -car.dir;
    }
  }

  function updateTraffic(dt) {
    for (const car of world.cars) {
      if (car.kind !== 'traffic') continue;
      const want = trafficObstacle(car);
      if (car.speed < want) car.speed = Math.min(want, car.speed + 175 * dt);
      else car.speed = Math.max(want, car.speed - 330 * dt);
      const prevS = car.s;
      car.s += car.speed * dt * car.dir;
      const crosses = car.roadType === 'v'
        ? Array.from({ length: CITY.hRoads }, (_, j) => hRoadY(j))
        : Array.from({ length: CITY.vRoads }, (_, i) => vRoadX(i));
      for (let idx = 0; idx < crosses.length; idx += 1) {
        const c = crosses[idx];
        if ((prevS < c && car.s >= c) || (prevS > c && car.s <= c)) { decideTurn(car, idx); break; }
      }
      const lane = car.roadType === 'v'
        ? { x: vRoadX(car.roadIdx) + (car.dir < 0 ? CITY.lane : -CITY.lane), y: car.s }
        : { x: car.s, y: hRoadY(car.roadIdx) + (car.dir > 0 ? CITY.lane : -CITY.lane) };
      const k = Math.min(1, dt * 7);
      car.x += (lane.x - car.x) * k;
      car.y += (lane.y - car.y) * k;
      const targetAngle = car.roadType === 'v' ? (car.dir < 0 ? -Math.PI / 2 : Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      car.angle += wrapAngle(targetAngle - car.angle) * Math.min(1, dt * 6);
    }
    const trafficCount = world.cars.filter((c) => c.kind === 'traffic').length;
    if (trafficCount < TRAFFIC.maxCars && random() < dt * 0.7) spawnTraffic(false);
  }

  // ------------------------------------------------------------- police

  let copSpawnCd = 0;

  function updatePolice(dt) {
    const p = world.player;
    const target = POLICE.carsByStars[world.wanted];
    const active = world.cars.filter((c) => c.kind === 'police' && !c.wrecked);
    copSpawnCd -= dt;
    if (world.wanted > 0 && active.length < target && copSpawnCd <= 0) {
      copSpawnCd = 1.4;
      for (let tries = 0; tries < 8; tries += 1) {
        const spot = randomRoadPoint(random);
        const d = Math.hypot(spot.x - p.x, spot.y - p.y);
        if (d > POLICE.spawnDistance && d < 1050) {
          const cop = spawnCar('police', '#f2f2f2', spot.x, spot.y, angleTo(spot, p), 'police');
          cop.speed = 120;
          break;
        }
      }
    }
    for (const cop of world.cars) {
      if (cop.kind !== 'police') continue;
      const d = Math.hypot(p.x - cop.x, p.y - cop.y);
      if (world.wanted === 0) {
        if (d > 850) { cop.kind = 'gone'; continue; }
        cop.speed = Math.max(0, cop.speed - 200 * dt);
        continue;
      }
      if (cop.wrecked) {
        cop.shootCd -= dt;
        if (!p.car && d < 300 && d > 30 && cop.shootCd <= 0) {
          cop.shootCd = 0.95;
          fireBullet('cop', cop.x, cop.y, angleTo(cop, p) + range(random, -0.09, 0.09), 720, 5);
          emit('shoot');
        }
        continue;
      }
      const top = Math.min(POLICE.speedByStars[world.wanted], CAR_CLASSES.police.topSpeed + world.wanted * 6);
      const tx = p.car ? p.car.x + Math.cos(p.car.angle) * p.car.speed * 0.28 : p.x;
      const ty = p.car ? p.car.y + Math.sin(p.car.angle) * p.car.speed * 0.28 : p.y;
      const desired = Math.atan2(ty - cop.y, tx - cop.x);
      const turn = wrapAngle(desired - cop.angle);
      cop.angle += Math.max(-3.1 * dt, Math.min(3.1 * dt, turn));
      const wantSpeed = !p.car && d < 48 ? 0 : d < 90 ? top * 0.55 : top;
      if (cop.speed < wantSpeed) cop.speed = Math.min(wantSpeed, cop.speed + 385 * dt);
      else cop.speed = Math.max(wantSpeed, cop.speed - 420 * dt);
      const ox = cop.x;
      const oy = cop.y;
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      collideCarWorld(cop, ox, oy, false);
    }
    world.cars = world.cars.filter((c) => c.kind !== 'gone');
  }

  // ------------------------------------------------------------- the rest

  function updatePeds(dt) {
    for (const ped of world.peds) {
      if (ped.follow === 'car') {
        const anchor = world.player.car || world.player;
        ped.x = anchor.x;
        ped.y = anchor.y;
        continue;
      }
      if (ped.state === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) { ped.state = 'walk'; ped.t = 0; }
        continue;
      }
      let speed = 62;
      if (ped.follow === true) {
        const target = world.player.car || world.player;
        ped.tx = target.x;
        ped.ty = target.y;
        speed = 216;
        if (Math.hypot(target.x - ped.x, target.y - ped.y) < 24) continue;
      } else if (ped.state === 'flee') {
        ped.t -= dt;
        speed = 238;
        if (ped.t <= 0) ped.state = 'walk';
      } else {
        ped.t -= dt;
        if (ped.t <= 0 || Math.hypot(ped.tx - ped.x, ped.ty - ped.y) < 8) {
          const i = Math.max(0, Math.min(CITY.vRoads - 2, Math.floor(ped.x / CITY.pitch)));
          const j = Math.max(0, Math.min(CITY.hRoads - 2, Math.floor(ped.y / CITY.pitch)));
          const target = sidewalkPoint(random, i, j);
          ped.tx = target.x;
          ped.ty = target.y;
          ped.t = range(random, 6, 14);
        }
      }
      const dx = ped.state === 'flee' ? ped.x - ped.tx : ped.tx - ped.x;
      const dy = ped.state === 'flee' ? ped.y - ped.ty : ped.ty - ped.y;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        ped.angle = Math.atan2(dy, dx);
        ped.x += (dx / len) * speed * dt;
        ped.y += (dy / len) * speed * dt;
      }
      const fixed = collideBuildings(city, ped.x, ped.y, 8);
      ped.x = Math.min(fixed.x, CITY.waterX - 8);
      ped.y = Math.max(10, Math.min(fixed.y, CITY.height - 10));
      // Dodge traffic: a fast car close by is worth running from.
      for (const car of world.cars) {
        if (Math.abs(car.speed) > 90 && Math.hypot(car.x - ped.x, car.y - ped.y) < 34 && ped.state === 'walk' && !ped.follow) {
          ped.state = 'flee';
          ped.t = 1.1;
          ped.tx = car.x;
          ped.ty = car.y;
          break;
        }
      }
    }
  }

  function updateBullets(dt) {
    const p = world.player;
    for (const b of world.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (buildingAt(city, b.x, b.y, 1)) {
        burst(b.x, b.y, 2, '#ffd94d', 80, 0.15);
        b.life = 0;
        continue;
      }
      if (b.from === 'player') {
        for (const car of world.cars) {
          if (Math.hypot(car.x - b.x, car.y - b.y) < 21) {
            damageCar(car, b.damage, b.x, b.y);
            if (car.kind === 'police') addCrime(1, true);
            b.life = 0;
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const ped of world.peds) {
          if (ped.state !== 'down' && !ped.follow && Math.hypot(ped.x - b.x, ped.y - b.y) < 11) {
            knockPed(ped, true);
            b.life = 0;
            break;
          }
        }
      } else if (p.car) {
        if (Math.hypot(p.car.x - b.x, p.car.y - b.y) < 22) {
          damageCar(p.car, b.damage, b.x, b.y);
          b.life = 0;
        }
      } else if (Math.hypot(p.x - b.x, p.y - b.y) < 12) {
        hurtPlayer(b.damage);
        b.life = 0;
      }
    }
    world.bullets = world.bullets.filter((b) => b.life > 0);
  }

  function updatePickups(dt) {
    const p = world.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    for (const pk of world.pickups) {
      pk.t += dt;
      if (pk.cd && pk.cd > 0) { pk.cd -= dt; continue; }
      if (Math.hypot(pk.x - px, pk.y - py) < 24) {
        if (pk.kind === 'cash') {
          p.money += pk.amount;
          world.stats.earned += pk.amount;
          emit('cash');
          pk.gone = true;
        } else if (pk.kind === 'health' && p.health < 100) {
          p.health = Math.min(100, p.health + pk.amount);
          emit('pickup');
          pk.cd = 20;
        } else if (pk.kind === 'pistol' && p.weapon !== 'pistol') {
          p.weapon = 'pistol';
          p.ammo += pk.amount;
          banner('Bay Armory', 'You picked up a pistol. The mouse aims; click to fire.', 4);
          emit('pickup');
          pk.cd = 99999;
        }
      }
    }
    world.pickups = world.pickups.filter((pk) => !pk.gone);
  }

  function updateWanted(dt) {
    world.crimeCd -= dt;
    const p = world.player;
    const seen = anyCopNear(p.x, p.y, POLICE.sightRange);
    if (seen) world.unseen = 0;
    else world.unseen += dt;
    if (world.wanted > 0 && world.unseen > WANTED.decaySeconds[world.wanted]) {
      world.wanted -= 1;
      world.unseen = 0;
    }
  }

  function updateParticles(dt) {
    for (const pt of world.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= (1 - 1.6 * dt);
      pt.vy *= (1 - 1.6 * dt);
      pt.life -= dt;
    }
    world.particles = world.particles.filter((pt) => pt.life > 0);
  }

  function respawn() {
    const p = world.player;
    if (p.car) { p.car.kind = 'parked'; p.car.speed = 0; p.car = null; }
    if (world.phase === 'busted') {
      p.money -= Math.max(25, Math.floor(p.money * 0.12));
      const door = city.landmarks.police.door;
      p.x = door.x;
      p.y = door.y + 20;
      p.health = Math.max(p.health, 45);
      banner('Released', 'The Coral Bay PD keeps a cut of your cash. Stay out of trouble.', 4);
    } else {
      p.money -= Math.min(p.money, 100);
      const door = city.landmarks.hospital.door;
      p.x = door.x;
      p.y = door.y + 20;
      p.health = 100;
      banner('St. Marina Hospital', 'They patched you up. The bill was $100.', 4);
    }
    world.wanted = 0;
    world.bust = 0;
    world.phase = 'play';
    snapCamera();
  }

  /**
   * Advance the whole city by one fixed step. ctrl is the caller's intent:
   * { mx, my } movement axes, run, attack held, aim angle, horn, and interact (one-shot).
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
      updateParticles(dt);
      if (world.phaseT > 1.9) respawn();
      return;
    }
    if (world.phase === 'ending') {
      updateParticles(dt);
      return;
    }
    if (ctrl.interact) world.tryInteract();
    if (world.courier && !world.mission) runCourier();
    runMissionStep(dt);
    updatePlayer(dt, ctrl);
    if (world.phase !== 'play') return; // busted or wasted mid-step
    updateTraffic(dt);
    updatePolice(dt);
    updatePeds(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateWanted(dt);
    updateParticles(dt);
    // Camera: follow with a look of where the player is heading.
    const p = world.player;
    const lead = p.car ? 0.34 : 0.12;
    const vx = p.car ? Math.cos(p.car.angle) * p.car.speed : 0;
    const vy = p.car ? Math.sin(p.car.angle) * p.car.speed : 0;
    const tx = Math.max(0, Math.min(CITY.width - 1280, p.x + vx * lead - 640));
    const ty = Math.max(0, Math.min(CITY.height - 720, p.y + vy * lead - 360));
    world.camera.x += (tx - world.camera.x) * Math.min(1, dt * 5);
    world.camera.y += (ty - world.camera.y) * Math.min(1, dt * 5);
  };

  function runCourier() {
    const c = world.courier;
    const p = world.player;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (c.phase === 'pickup' && d < 46) {
      const dest = city.landmarks[c.to].door;
      c.phase = 'deliver';
      c.x = dest.x;
      c.y = dest.y;
      c.label = `Courier: deliver to ${city.landmarks[c.to].name}`;
      emit('pickup');
    } else if (c.phase === 'deliver' && d < 56) {
      const pay = 150 + randInt(random, 160);
      p.money += pay;
      world.stats.earned += pay;
      banner('Courier Complete', `$${pay} paid. Vera always has another envelope.`, 3.5);
      emit('cash');
      emit('missionDone');
      world.courier = null;
    }
  }

  return world;
}
