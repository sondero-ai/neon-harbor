// Keyboard, mouse and pointer lock. Held controls are read every frame; one-shot presses are
// queued so a tap between two frames is never lost, and mouse motion accumulates until the loop
// takes it. Movement is WASD, the mouse looks, right button aims, left fires.
const KEY_HELD = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
};

const ONESHOT = {
  KeyE: 'enter', KeyF: 'enter',
  KeyR: 'reload', KeyQ: 'swap', KeyH: 'horn',
  KeyP: 'pause', Escape: 'pause', Enter: 'confirm',
  Digit1: 'weapon1', Digit2: 'weapon2', KeyM: 'mute', KeyC: 'camera', KeyV: 'radio',
  ArrowUp: 'menuUp', ArrowDown: 'menuDown',
};

export function createInput(canvas) {
  const held = {
    forward: false, back: false, left: false, right: false, sprint: false,
    jump: false, fire: false, aim: false, handbrake: false,
  };
  const pressed = new Set();
  const mouse = { dx: 0, dy: 0, wheel: 0 };
  let locked = false;
  let allowLock = false;
  let lockCallbacks = [];

  window.addEventListener('keydown', (event) => {
    const action = ONESHOT[event.code];
    if (KEY_HELD[event.code]) {
      held[KEY_HELD[event.code]] = true;
      event.preventDefault();
    }
    if (action) {
      if (!event.repeat) pressed.add(action);
      event.preventDefault();
    }
    if (event.code === 'Space') event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    if (KEY_HELD[event.code]) held[KEY_HELD[event.code]] = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (allowLock && !locked && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
    if (!allowLock) pressed.add('confirm');
    if (event.button === 0) held.fire = true;
    if (event.button === 2) held.aim = true;
    event.preventDefault();
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) held.fire = false;
    if (event.button === 2) held.aim = false;
  });
  window.addEventListener('pointermove', (event) => {
    if (document.pointerLockElement === canvas) {
      mouse.dx += event.movementX;
      mouse.dy += event.movementY;
    }
  });
  window.addEventListener('wheel', (event) => {
    mouse.wheel += Math.sign(event.deltaY);
  }, { passive: true });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      held.fire = false;
      held.aim = false;
    }
    for (const callback of lockCallbacks) callback(locked);
  });
  window.addEventListener('blur', () => {
    for (const key of Object.keys(held)) held[key] = false;
  });

  return {
    held,
    mouse,
    get locked() { return locked; },
    lock() { canvas.requestPointerLock?.(); },
    setLockAllowed(value) { allowLock = value; },
    take(action) {
      if (!pressed.has(action)) return false;
      pressed.delete(action);
      return true;
    },
    readMouse() {
      const result = { dx: mouse.dx, dy: mouse.dy, wheel: mouse.wheel };
      mouse.dx = 0; mouse.dy = 0; mouse.wheel = 0;
      return result;
    },
    clear() { pressed.clear(); mouse.dx = 0; mouse.dy = 0; mouse.wheel = 0; },
    onLockChange(callback) { lockCallbacks.push(callback); },
  };
}
