// Coral Bay Heat — the shell around the simulation.
//
// This module boots the canvas, owns the screen state machine (title,
// how-to, play, pause, and the busted / wasted / ending beats), drives
// the world at a fixed step from requestAnimationFrame, persists
// progress to localStorage, and translates the world's sound cues into
// calls on the synthesised audio engine. It also implements screenshot
// mode: ?shot=<scene>&seed=<n> stages a scene, steps it with scripted
// controls, and flags document.body.dataset.ready when the frame is
// safe to capture.

import { CAR_CLASSES, SAVE_KEY, STEP, VIEW } from './config.js';
import {
  ACTION_CONFIRM, ACTION_HORN, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import {
  SCREEN_BUSTED, SCREEN_ENDING, SCREEN_HOW, SCREEN_PAUSE, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WASTED, render,
} from './render.js';
import { SHOT_STEPS, shotControl, stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const query = new URLSearchParams(location.search);
const shotName = query.get('shot');
const shotSeed = Number(query.get('seed') || 1) || 1;

const world = createWorld(shotSeed);
const input = createInput(canvas);
const audio = createAudio();

let screen = SCREEN_TITLE;
let menuSel = 0;
let deathTimer = 0;

// ------------------------------------------------------------ save games

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // storage blocked: play without persistence
  }
}

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
  } catch {
    // Same story: the session simply will not persist.
  }
}

// ------------------------------------------------------------ title menu

function menuEntries() {
  return readSave()
    ? ['CONTINUE', 'NEW GAME', 'HOW TO PLAY']
    : ['NEW GAME', 'HOW TO PLAY'];
}

function beginRun(fresh) {
  world.reset(fresh ? null : readSave());
  screen = SCREEN_PLAY;
  audio.unlock();
}

// ------------------------------------------------------------ sound cues

// The world speaks in cue names; a few carry a numeric suffix (crash1,
// crash2, crash3) that becomes the impact strength for the audio engine.
const CUE_HANDLERS = {
  shoot: () => audio.shoot(),
  punch: () => audio.punch(),
  hurt: () => audio.hurt(),
  pickup: () => audio.pickup(),
  cash: () => audio.cash(),
  horn: () => audio.horn(),
  taxi: () => audio.taxi(),
  fare: () => audio.fare(),
  door: () => audio.door(),
  missionStart: () => audio.missionStart(),
  missionDone: () => { audio.missionDone(); writeSave(); },
  fail: () => audio.fail(),
  star: () => audio.star(),
};

function playCues() {
  for (const cueName of world.events) {
    if (cueName.startsWith('crash')) {
      audio.crash(Number(cueName.slice(5)) || 1);
    } else if (CUE_HANDLERS[cueName]) {
      CUE_HANDLERS[cueName]();
    }
  }
  world.events.length = 0;
}

// ------------------------------------------------------------ controls

/** Per-frame continuous control, sampled from the input device state. */
function sampleControl() {
  const axes = input.axis();
  const p = world.player;
  const viewX = p.x - world.camera.x;
  const viewY = p.y - world.camera.y;
  return {
    mx: axes.x,
    my: axes.y,
    run: input.keys.has('shift'),
    attack: input.mouse.down || input.keys.has('j'),
    aim: input.mouse.down ? Math.atan2(input.mouse.y - viewY, input.mouse.x - viewX) : null,
    horn: (input.consumePressed(ACTION_HORN) & ACTION_HORN) !== 0,
    interact: false, // interact is edge-polled separately, below
  };
}

/**
 * Edge-triggered commands, handled once per frame outside the control
 * struct so a single press can drive menus, pauses and interactions
 * without ever being double-counted by the fixed-step loop.
 */
function handleEdges() {
  const pressed = input.consumePressed(ACTION_INTERACT | ACTION_PAUSE | ACTION_CONFIRM);

  if (screen === SCREEN_PLAY) {
    if (pressed & ACTION_PAUSE) { screen = SCREEN_PAUSE; return; }
    if (pressed & ACTION_INTERACT) world.tryInteract();
    return;
  }
  if (screen === SCREEN_PAUSE) {
    if (pressed & (ACTION_PAUSE | ACTION_CONFIRM)) screen = SCREEN_PLAY;
    return;
  }
  if (screen === SCREEN_TITLE) {
    const entries = menuEntries();
    if (input.keys.has('arrowup') || input.keys.has('w')) {
      menuSel = Math.max(0, menuSel - 1);
      input.keys.delete('arrowup');
      input.keys.delete('w');
    }
    if (input.keys.has('arrowdown') || input.keys.has('s')) {
      menuSel = Math.min(entries.length - 1, menuSel + 1);
      input.keys.delete('arrowdown');
      input.keys.delete('s');
    }
    if (pressed & ACTION_CONFIRM) {
      const chosen = entries[menuSel];
      if (chosen === 'HOW TO PLAY') screen = SCREEN_HOW;
      else beginRun(chosen === 'NEW GAME');
    }
    return;
  }
  if (screen === SCREEN_HOW) {
    if (pressed & ACTION_CONFIRM) screen = SCREEN_TITLE;
    return;
  }
  if (screen === SCREEN_ENDING) {
    if (pressed & ACTION_CONFIRM) {
      screen = SCREEN_PLAY;
      world.phase = 'play';
    }
  }
}

// ------------------------------------------------------------ main loop

let lastStamp = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = (now - lastStamp) / 1000;
  lastStamp = now;
  if (elapsed > 0.25) elapsed = 0.25;
  accumulator += elapsed;

  if (input.consumePressed(ACTION_MUTE)) audio.toggleMute();
  handleEdges();

  while (accumulator >= STEP) {
    accumulator -= STEP;
    if (screen === SCREEN_PLAY) {
      world.step(STEP, sampleControl());
      playCues();
      if (world.phase === 'busted') { screen = SCREEN_BUSTED; deathTimer = 2.6; writeSave(); }
      else if (world.phase === 'wasted') { screen = SCREEN_WASTED; deathTimer = 2.6; writeSave(); }
      else if (world.phase === 'ending') { screen = SCREEN_ENDING; writeSave(); }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      // The verdict screen lingers, then the world puts the player back.
      deathTimer -= STEP;
      world.time += STEP;
      if (deathTimer <= 0) {
        world.respawn(screen === SCREEN_BUSTED ? 'busted' : 'wasted');
        screen = SCREEN_PLAY;
      }
    } else {
      // Menus and pause: time passes, the city idles, nothing simulates.
      world.time += STEP;
      if (screen === SCREEN_TITLE) {
        world.camera.x = 1420 + Math.sin(world.time * 0.05) * 120;
        world.camera.y = 620 + Math.cos(world.time * 0.04) * 60;
      }
    }
  }

  const p = world.player;
  audio.siren(screen === SCREEN_PLAY && world.wanted > 0);
  const speedRatio = p.car ? Math.abs(p.car.speed) / CAR_CLASSES[p.car.cls].topSpeed : 0;
  audio.engine(speedRatio, Boolean(p.car));
  render(ctx, world, screen, { menu: menuEntries(), menuSel, muted: audio.muted });
}

// ------------------------------------------------------------ entry modes

if (shotName && SHOT_STEPS[shotName]) {
  // Screenshot mode: stage, step the scripted scene, render once, signal.
  stageShot(world, shotName);
  const totalSteps = SHOT_STEPS[shotName];
  const captureFrame = () => {
    if (shotName === 'title') {
      render(ctx, world, SCREEN_TITLE, { menu: ['NEW GAME', 'HOW TO PLAY'], menuSel: 0, muted: false });
    } else {
      for (let stepIndex = 0; stepIndex < totalSteps; stepIndex += 1) {
        world.step(STEP, shotControl(shotName, stepIndex));
        world.events.length = 0;
      }
      render(ctx, world, SCREEN_PLAY, { muted: false });
    }
    document.body.dataset.ready = '1';
  };
  requestAnimationFrame(captureFrame);
} else {
  world.reset(readSave());
  world.camera.x = 1420;
  world.camera.y = 620;
  requestAnimationFrame(frame);
}
