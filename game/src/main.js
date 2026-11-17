// Coral Bay Heat — boot and game loop. Owns the screens (title, how-to, pause, the busted
// and wasted beats, the ending), the fixed-step simulation loop, the save in localStorage,
// and the wiring that turns simulation events into synthesised sound. The ?shot= mode stages
// a scene for the entry's screenshots and signals readiness on document.body.dataset.

import { CAR_CLASSES, STEP, VIEW } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import {
  SCREEN_BUSTED, SCREEN_ENDING, SCREEN_HOW, SCREEN_PAUSE, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_WASTED, render,
} from './render.js';
import { SHOT_STEPS, shotControl, stageShot } from './shots.js';

const SAVE_KEY = 'coral-bay-heat.save.v1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') || 1) || 1;

const world = createWorld(shotSeed);
const input = createInput(canvas);
const audio = createAudio();

let screen = SCREEN_TITLE;
let menuSel = 0;
let deathT = 0;

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
  } catch {
    // Private mode and friends: the game simply will not persist.
  }
}

function menuItems() {
  return loadSave() ? ['CONTINUE', 'NEW GAME', 'HOW TO PLAY'] : ['NEW GAME', 'HOW TO PLAY'];
}

function startGame(fresh) {
  world.reset(fresh ? null : loadSave());
  screen = SCREEN_PLAY;
  audio.unlock();
}

function drainEvents() {
  for (const ev of world.events) {
    if (ev === 'shoot') audio.shoot();
    else if (ev === 'punch') audio.punch();
    else if (ev === 'hurt') audio.hurt();
    else if (ev === 'pickup') audio.pickup();
    else if (ev === 'cash') audio.cash();
    else if (ev === 'horn') audio.horn();
    else if (ev === 'taxi') audio.taxi();
    else if (ev === 'fare') audio.fare();
    else if (ev === 'door') audio.door();
    else if (ev === 'missionStart') audio.missionStart();
    else if (ev === 'missionDone') { audio.missionDone(); persist(); }
    else if (ev === 'fail') audio.fail();
    else if (ev === 'star') audio.star();
    else if (ev.startsWith('crash')) audio.crash(Number(ev.slice(5)) || 1);
  }
  world.events.length = 0;
}

function frameControl() {
  const ax = input.axis();
  const p = world.player;
  const px = p.x - world.camera.x;
  const py = p.y - world.camera.y;
  return {
    mx: ax.x,
    my: ax.y,
    run: input.keys.has('shift'),
    attack: input.mouse.down || input.keys.has('j'),
    aim: input.mouse.down ? Math.atan2(input.mouse.y - py, input.mouse.x - px) : null,
    horn: (input.consumePressed(8) & 8) !== 0,
    interact: false,
  };
}

// Interact and pause are edge-triggered, so they are polled outside the control struct.
function pollEdges() {
  const pressed = input.consumePressed(1 | 2 | 4);
  if (screen === SCREEN_PLAY) {
    if (pressed & 2) { screen = SCREEN_PAUSE; return; }
    if (pressed & 1) world.tryInteract();
    return;
  }
  if (screen === SCREEN_PAUSE) {
    if (pressed & (2 | 4)) screen = SCREEN_PLAY;
    return;
  }
  if (screen === SCREEN_TITLE) {
    if (input.keys.has('arrowup') || input.keys.has('w')) { menuSel = Math.max(0, menuSel - 1); input.keys.delete('arrowup'); input.keys.delete('w'); }
    if (input.keys.has('arrowdown') || input.keys.has('s')) { menuSel = Math.min(menuItems().length - 1, menuSel + 1); input.keys.delete('arrowdown'); input.keys.delete('s'); }
    if (pressed & 4) {
      const item = menuItems()[menuSel];
      if (item === 'HOW TO PLAY') screen = SCREEN_HOW;
      else startGame(item === 'NEW GAME');
    }
    return;
  }
  if (screen === SCREEN_HOW) {
    if (pressed & 4) screen = SCREEN_TITLE;
    return;
  }
  if (screen === SCREEN_ENDING) {
    if (pressed & 4) { screen = SCREEN_PLAY; world.phase = 'play'; }
  }
}

let last = performance.now();
let acc = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;

  if (input.consumePressed(16)) audio.toggleMute();

  if (screen === SCREEN_PLAY || screen === SCREEN_PAUSE) pollEdges();
  else if (screen !== SCREEN_BUSTED && screen !== SCREEN_WASTED) pollEdges();

  while (acc >= STEP) {
    acc -= STEP;
    if (screen === SCREEN_PLAY) {
      world.step(STEP, frameControl());
      drainEvents();
      if (world.phase === 'busted') { screen = SCREEN_BUSTED; deathT = 2.6; persist(); }
      else if (world.phase === 'wasted') { screen = SCREEN_WASTED; deathT = 2.6; persist(); }
      else if (world.phase === 'ending') { screen = SCREEN_ENDING; persist(); }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      deathT -= STEP;
      world.time += STEP;
      if (deathT <= 0) {
        world.respawn(screen === SCREEN_BUSTED ? 'busted' : 'wasted');
        screen = SCREEN_PLAY;
      }
    } else {
      // Title, how-to, pause, ending: the city idles behind the screen.
      world.time += STEP;
      if (screen === SCREEN_TITLE) {
        world.camera.x = 1420 + Math.sin(world.time * 0.05) * 120;
        world.camera.y = 620 + Math.cos(world.time * 0.04) * 60;
      }
    }
  }

  const p = world.player;
  audio.siren(screen === SCREEN_PLAY && world.wanted > 0);
  // The engine note scales to the car being driven: a Hauler never sounds like a Vapor.
  audio.engine(p.car ? Math.abs(p.car.speed) / CAR_CLASSES[p.car.cls].topSpeed : 0, Boolean(p.car));
  render(ctx, world, screen, { menu: menuItems(), menuSel, muted: audio.muted });
}

// ------------------------------------------------------------- screenshot mode

if (shotName && SHOT_STEPS[shotName]) {
  stageShot(world, shotName);
  const total = SHOT_STEPS[shotName];
  let stepped = 0;
  const shotLoop = () => {
    if (shotName === 'title') {
      render(ctx, world, SCREEN_TITLE, { menu: ['NEW GAME', 'HOW TO PLAY'], menuSel: 0, muted: false });
    } else {
      while (stepped < total) {
        world.step(STEP, shotControl(shotName, stepped));
        world.events.length = 0;
        stepped += 1;
      }
      render(ctx, world, SCREEN_PLAY, { muted: false });
    }
    document.body.dataset.ready = '1';
  };
  requestAnimationFrame(shotLoop);
} else {
  world.reset(loadSave());
  world.camera.x = 1420;
  world.camera.y = 620;
  requestAnimationFrame(loop);
}
