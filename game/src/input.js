// Reading the player: keyboard plus pointer.
//
// Two kinds of input live here. Held controls (drive, walk, run, punch)
// are polled every frame through plain booleans and an axis helper.
// One-shot commands (interact, pause, confirm, horn, mute) accumulate as
// bits in a small queue; the game loop consumes exactly the bits it cares
// about, so a horn tap can never swallow a queued pause.
//
// The object handed back to the game exposes:
//   held               — per-action booleans for continuous controls
//   keys               — short names of keys currently down ('w', 'j', …);
//                        menus delete a name once they have reacted to it
//   mouse              — pointer position in view coordinates, plus down
//   axis()             — { x, y } movement from the held direction keys
//   consumePressed(m)  — queued ACTION_* bits matching mask m, cleared
//   takeActions()      — every queued ACTION_* bit, cleared

export const ACTION_INTERACT = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_HORN = 8;
export const ACTION_MUTE = 16;

// [physical code, held-action name] pairs for the continuous controls.
const HELD_BINDINGS = [
  ['ArrowUp', 'up'], ['KeyW', 'up'],
  ['ArrowDown', 'down'], ['KeyS', 'down'],
  ['ArrowLeft', 'left'], ['KeyA', 'left'],
  ['ArrowRight', 'right'], ['KeyD', 'right'],
  ['ShiftLeft', 'run'], ['ShiftRight', 'run'],
  ['KeyJ', 'attack'],
];

// [physical code, action bit] pairs for the one-shot commands.
const TAP_BINDINGS = [
  ['KeyE', ACTION_INTERACT], ['KeyF', ACTION_INTERACT],
  ['KeyP', ACTION_PAUSE], ['Escape', ACTION_PAUSE],
  ['Enter', ACTION_CONFIRM], ['Space', ACTION_CONFIRM],
  ['KeyH', ACTION_HORN], ['KeyM', ACTION_MUTE],
];

const heldActionFor = new Map(HELD_BINDINGS);
const tapActionFor = new Map(TAP_BINDINGS);

/** Compact display name for a key code: 'w', 'arrowup', 'shift', … */
function shortName(code) {
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'shift';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  return code.toLowerCase();
}

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false, attack: false };
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let queuedBits = 0;

  // Recompute held flags from the live key set, so releasing one of two
  // keys bound to the same action (W and ArrowUp, say) keeps it held.
  const refreshHeld = () => {
    held.up = keys.has('w') || keys.has('arrowup');
    held.down = keys.has('s') || keys.has('arrowdown');
    held.left = keys.has('a') || keys.has('arrowleft');
    held.right = keys.has('d') || keys.has('arrowright');
    held.run = keys.has('shift');
    held.attack = keys.has('j');
  };

  window.addEventListener('keydown', (event) => {
    if (heldActionFor.has(event.code)) {
      if (!event.repeat) {
        keys.add(shortName(event.code));
        refreshHeld();
      }
      event.preventDefault();
      return;
    }
    const bit = tapActionFor.get(event.code);
    if (bit !== undefined) {
      if (!event.repeat) queuedBits |= bit;
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (heldActionFor.has(event.code)) {
      keys.delete(shortName(event.code));
      refreshHeld();
    }
  });

  // Losing focus mid-keypress would otherwise wedge a control on forever.
  window.addEventListener('blur', () => {
    keys.clear();
    refreshHeld();
    mouse.down = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const box = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - box.left) / box.width) * 1280;
    mouse.y = ((event.clientY - box.top) / box.height) * 720;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      queuedBits |= ACTION_CONFIRM; // clicking a menu counts as confirming
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
  });

  return {
    held,
    keys,
    mouse,
    axis() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    consumePressed(mask) {
      const taken = queuedBits & mask;
      queuedBits &= ~mask;
      return taken;
    },
    takeActions() {
      const taken = queuedBits;
      queuedBits = 0;
      return taken;
    },
  };
}
