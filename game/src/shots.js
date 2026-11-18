// Screenshot scenes: four staged moments for the entry's gallery.
//
// Each scene resets the genuine simulation and arranges a tableau the
// judge should see — the title drifting over the coast, downtown life on
// foot with a cab fare hailing, a three-star pursuit in full flight, and
// the first mission's delivery. main.js then advances the world with the
// scripted controls from shotControl(), so every capture is the real
// game mid-motion, HUD and all, never a mock-up.

import { hRoadY, vRoadX } from './config.js';

const NEUTRAL = { mx: 0, my: 0, run: false, attack: false, aim: false, horn: false, interact: false };

/** How many fixed steps each scene plays before its frame is taken. */
export const SHOT_STEPS = { title: 1, foot: 150, chase: 80, mission: 70 };

function stageTitle(world) {
  world.camera.x = 1420;
  world.camera.y = 620;
  world.time = 7.5;
  world.clock = 16 * 60 + 30;
}

function stageFoot(world) {
  // Pavement corner downtown, mid-afternoon.
  world.player.x = vRoadX(2) + 74;
  world.player.y = hRoadY(2) + 64;
  world.player.angle = 0.35;
  world.clock = 15 * 60 + 20;
  world.player.money = 85;

  // The first parked car is repainted as the cab waiting at the kerb.
  const cab = world.cars.find((c) => c.kind === 'parked');
  if (cab) {
    cab.cls = 'taxi';
    cab.color = '#f2b23d';
    cab.x = vRoadX(2) + 40;
    cab.y = hRoadY(2) + 27;
    cab.angle = 0;
  }
  // The first pedestrian becomes its hailing passenger.
  const hailer = world.peds[0];
  if (hailer) {
    hailer.x = vRoadX(2) + 74;
    hailer.y = hRoadY(2) + 92;
    hailer.state = 'hail';
    hailer.t = 45;
    world.taxi = {
      phase: 'hail', ped: hailer, x: hailer.x, y: hailer.y, to: null,
      label: 'Taxi fare: pick up the passenger', fare: 0, timer: null,
    };
  }
  // A Hauler rolls through the frame so the heavy metal shows too.
  const truck = world.cars.find((c) => c.kind === 'traffic');
  if (truck) {
    truck.cls = 'truck';
    truck.color = '#8a7f70';
    truck.x = vRoadX(1) + 120;
    truck.y = hRoadY(2) - 27;
  }
}

function handPlacedCruiser(id, x, y, speed) {
  return {
    id, cls: 'police', kind: 'police', color: '#f2f2f2', x, y, angle: 0, speed,
    health: 130, wrecked: false, roadType: 'h', roadIdx: 2, dir: 1, s: 0,
    cruise: 0, shootCd: 0, officerOut: false, honkCd: 0, stolen: false,
  };
}

function stageChase(world) {
  // The Comet at speed, two cruisers already on its tail in frame; the
  // simulation's own spawner is free to add a third during the steps.
  const comet = world.comet;
  comet.x = vRoadX(1) + 10;
  comet.y = hRoadY(2) - 27;
  comet.angle = 0;
  comet.speed = 330;
  world.cars.push(handPlacedCruiser(9001, comet.x - 175, comet.y + 4, 355));
  world.cars.push(handPlacedCruiser(9002, comet.x - 315, comet.y - 22, 345));
  world.player.car = comet;
  world.player.x = comet.x;
  world.player.y = comet.y;
  world.player.money = 1240;
  world.player.weapon = 'pistol';
  world.player.ammo = 24;
  world.wanted = 3;
  world.clock = 17 * 60 + 5;
}

function stageMission(world) {
  // First job, final beat: the stolen Comet noses up to Vera's garage.
  world.startMission(0);
  const comet = world.comet;
  comet.x = 330;
  comet.y = 1152;
  comet.angle = Math.PI;
  comet.speed = 0;
  world.player.car = comet;
  world.player.x = comet.x;
  world.player.y = comet.y;
  world.player.money = 85;
  world.clock = 16 * 60 + 40;
}

const STAGERS = { title: stageTitle, foot: stageFoot, chase: stageChase, mission: stageMission };

/** Reset the world and arrange the named scene. */
export function stageShot(world, name) {
  world.reset(null);
  const stage = STAGERS[name];
  if (stage) stage(world);
}

/** Scripted control input for one step of a staged scene. */
export function shotControl(name, step) {
  if (name === 'chase') return { ...NEUTRAL, my: -1 }; // full throttle east
  if (name === 'foot' && step > 40) return { ...NEUTRAL, mx: 1 }; // stroll east
  return NEUTRAL;
}
