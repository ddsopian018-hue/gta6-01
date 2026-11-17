// Keyboard and mouse input. Held keys and the pointer give continuous control (steering,
// aiming); one-shot presses (interact, pause, confirm) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted twice.
//
// The loop reads three things off the object createInput returns:
//   keys           — the set of held keys by short name ('w', 'arrowup', 'shift', ...),
//                    so menus can react to a press and delete it once handled;
//   axis()         — the movement axes from the held keys, as { x, y };
//   consumePressed(mask) — the ACTION_* flags pressed since the last call for just those
//                    bits, so taking the horn never eats a queued interact or pause.

export const ACTION_INTERACT = 1;  // E or F: get in or out of a car, talk, use a marker
export const ACTION_PAUSE = 2;     // P or Escape
export const ACTION_CONFIRM = 4;   // Enter or Space: start, restart, continue
export const ACTION_HORN = 8;      // H
export const ACTION_MUTE = 16;     // M

const HELD = {
  up: new Set(['ArrowUp', 'KeyW']),
  down: new Set(['ArrowDown', 'KeyS']),
  left: new Set(['ArrowLeft', 'KeyA']),
  right: new Set(['ArrowRight', 'KeyD']),
  run: new Set(['ShiftLeft', 'ShiftRight']),
  attack: new Set(['KeyJ']),
};
const ONESHOT = new Map([
  ['KeyE', ACTION_INTERACT], ['KeyF', ACTION_INTERACT],
  ['KeyP', ACTION_PAUSE], ['Escape', ACTION_PAUSE],
  ['Enter', ACTION_CONFIRM], ['Space', ACTION_CONFIRM],
  ['KeyH', ACTION_HORN], ['KeyM', ACTION_MUTE],
]);
const ALL_HELD = new Set(Object.values(HELD).flatMap((set) => [...set]));

/** Short names the loop uses: 'w', 'arrowup', 'shift', 'j', ... */
function keyName(code) {
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'shift';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Arrow')) return code.toLowerCase();
  return code.toLowerCase();
}

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false, attack: false };
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let actions = 0;

  function setHeld(code, value) {
    for (const name of Object.keys(HELD)) {
      if (HELD[name].has(code)) held[name] = value;
    }
  }

  window.addEventListener('keydown', (event) => {
    if (ALL_HELD.has(event.code)) {
      setHeld(event.code, true);
      // A held key repeats keydown: only the first press joins the set, so a menu
      // that deletes the name after handling it does not see it again until re-pressed.
      if (!event.repeat) keys.add(keyName(event.code));
      event.preventDefault();
      return;
    }
    const flag = ONESHOT.get(event.code);
    if (flag !== undefined) {
      if (!event.repeat) actions |= flag;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (ALL_HELD.has(event.code)) {
      setHeld(event.code, false);
      keys.delete(keyName(event.code));
    }
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    for (const name of Object.keys(held)) held[name] = false;
    keys.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 1280;
    mouse.y = ((event.clientY - rect.top) / rect.height) * 720;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      actions |= ACTION_CONFIRM; // a click also confirms menus
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
  });

  return {
    held,
    keys,
    mouse,
    /** The movement axes from the held keys: x right, y down, each -1, 0 or 1. */
    axis() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** The ACTION_* flags pressed since the last call, for just the masked bits. */
    consumePressed(mask) {
      const taken = actions & mask;
      actions &= ~mask;
      return taken;
    },
    /** Every one-shot press since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
