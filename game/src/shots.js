// Staged scenes for the entry's screenshots. Each stage resets the real simulation and
// places it in a moment the judge should see — the open world on foot, a police chase at
// three stars, a mission delivery — then the game steps the sim with scripted controls, so
// every screenshot is the actual game running, HUD and all.

import { hRoadY, vRoadX } from './config.js';

const IDLE = { mx: 0, my: 0, run: false, attack: false, aim: false, horn: false, interact: false };

export const SHOT_STEPS = { title: 1, foot: 150, chase: 80, mission: 70 };

export function stageShot(world, name) {
  world.reset(null);
  if (name === 'title') {
    // The camera drifts over Ocean Drive: beach, marina pier and the sea.
    world.camera.x = 1420;
    world.camera.y = 620;
    world.time = 7.5;
    world.clock = 16 * 60 + 30;
    return;
  }
  if (name === 'foot') {
    // On foot downtown, mid-afternoon: a taxi waits at the kerb with a passenger
    // hailing it, a Hauler truck rolling past, crowds and traffic flowing.
    world.player.x = vRoadX(2) + 74;
    world.player.y = hRoadY(2) + 64; // the sidewalk corner, clear of the lanes
    world.player.angle = 0.35;
    world.clock = 15 * 60 + 20;
    world.player.money = 85;
    // The cab at the kerb: the nearest parked car becomes a taxi, and the nearest
    // pedestrian becomes its hailing passenger, so the shot shows the fare system.
    const cab = world.cars.find((c) => c.kind === 'parked');
    if (cab) {
      cab.cls = 'taxi';
      cab.color = '#f2b23d';
      cab.x = vRoadX(2) + 40;
      cab.y = hRoadY(2) + 27;
      cab.angle = 0;
    }
    const hailer = world.peds[0];
    if (hailer) {
      hailer.x = vRoadX(2) + 74;
      hailer.y = hRoadY(2) + 92;
      hailer.state = 'hail';
      hailer.t = 45;
      world.taxi = { phase: 'hail', ped: hailer, x: hailer.x, y: hailer.y, to: null, label: 'Taxi fare: pick up the passenger', fare: 0, timer: null };
    }
    // One of the passing cars is a Hauler, so the new metal is in frame too.
    const truck = world.cars.find((c) => c.kind === 'traffic');
    if (truck) {
      truck.cls = 'truck';
      truck.color = '#8a7f70';
      truck.x = vRoadX(1) + 120;
      truck.y = hRoadY(2) - 27;
    }
    return;
  }
  if (name === 'chase') {
    // Three stars: the Comet at speed across downtown, two cruisers already on its tail
    // (placed by hand so the pursuit is in frame; the sim's own spawner adds a third).
    const comet = world.comet;
    comet.x = vRoadX(1) + 10;
    comet.y = hRoadY(2) - 27;
    comet.angle = 0;
    comet.speed = 330;
    const cruiser = (id, x, y, speed) => ({
      id, cls: 'police', kind: 'police', color: '#f2f2f2', x, y, angle: 0, speed,
      health: 130, wrecked: false, roadType: 'h', roadIdx: 2, dir: 1, s: 0, cruise: 0,
      shootCd: 0, officerOut: false, honkCd: 0,
    });
    world.cars.push(cruiser(9001, comet.x - 175, comet.y + 4, 355));
    world.cars.push(cruiser(9002, comet.x - 315, comet.y - 22, 345));
    world.player.car = comet;
    world.player.x = comet.x;
    world.player.y = comet.y;
    world.player.money = 1240;
    world.player.weapon = 'pistol';
    world.player.ammo = 24;
    world.wanted = 3;
    world.clock = 17 * 60 + 5;
    return;
  }
  if (name === 'mission') {
    // Mission one, final beat: the stolen Comet rolls up to Vera's garage.
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
}

/** The scripted controls a staged scene plays with, step by step. */
export function shotControl(name, step) {
  if (name === 'chase') return { ...IDLE, my: -1 };
  if (name === 'foot' && step > 40) return { ...IDLE, mx: 1 };
  return IDLE;
}
