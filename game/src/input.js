// Keyboard and mouse input. Held keys and the pointer give continuous control (steering,
// aiming); one-shot presses (interact, pause, confirm) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted twice.

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

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false, attack: false };
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
    if (ALL_HELD.has(event.code)) setHeld(event.code, false);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    for (const name of Object.keys(held)) held[name] = false;
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
    mouse,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
