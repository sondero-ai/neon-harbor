// Keyboard, mouse and pointer lock. The game reads a flat state each fixed
// step; edge-triggered keys and accumulated mouse motion are cleared by
// endFrame(). If pointer lock is unavailable the player can drag to look.

const PREVENT_SCROLL = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = new Set();
    this.mousePressed = new Set();
    this.dragging = false;
    this.lockRequested = false;
    this.allowLock = true;
    // The hold-Tab radio wheel: capture the browser's Tab focus change while
    // playing, freeze movement axes, and re-lock on release when it was locked.
    this.captureTab = false;
    this.radioWheelOpen = false;
    this.wheelLockRestore = false;
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);
    this._onWheel = this.onWheel.bind(this);
    this._onBlur = this.onBlur.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  onKeyDown(event) {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (PREVENT_SCROLL.has(event.code)) event.preventDefault();
    if (event.code === 'Tab' && this.captureTab) event.preventDefault();
    if (!event.repeat) this.pressed.add(event.code);
    this.keys.add(event.code);
  }

  onKeyUp(event) {
    this.keys.delete(event.code);
    if (event.code === 'Tab' && this.wheelLockRestore) {
      this.wheelLockRestore = false;
      this.requestLock();
    }
  }

  onMouseMove(event) {
    if (!this.locked && !this.dragging) return;
    const dx = Number.isFinite(event.movementX) ? event.movementX : 0;
    const dy = Number.isFinite(event.movementY) ? event.movementY : 0;
    if (Math.abs(dx) > 240 || Math.abs(dy) > 240) return;
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  onMouseDown(event) {
    if (event.target !== this.canvas) return;
    if (!this.buttons.has(event.button)) this.mousePressed.add(event.button);
    this.buttons.add(event.button);
    if (!this.locked && this.allowLock) {
      this.dragging = true;
      this.requestLock();
    }
    if (event.button === 1) event.preventDefault();
  }

  onMouseUp(event) {
    this.buttons.delete(event.button);
    if (this.buttons.size === 0) this.dragging = false;
  }

  onWheel(event) {
    event.preventDefault();
    this.wheel += event.deltaY;
  }

  onBlur() {
    this.keys.clear();
    this.buttons.clear();
    this.mousePressed.clear();
    this.dragging = false;
    this.pressed.clear();
    this.wheelLockRestore = false;
  }

  requestLock() {
    if (!this.allowLock || this.locked) return;
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* some browsers only allow this from a trusted gesture; drag-look still works */
    }
  }

  releaseLock() {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  wasPressed(...codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  /** Use a key press here, so a later subsystem does not also act on it. */
  consumePressed(...codes) {
    for (const code of codes) this.pressed.delete(code);
  }

  wasClicked(button = 0) {
    return this.buttons.has(button);
  }

  wasMousePressed(button = 0) {
    return this.mousePressed.has(button);
  }

  isMouseDown(button = 0) {
    return this.buttons.has(button);
  }

  consumeMouse() {
    const delta = { x: this.mouseDX, y: this.mouseDY, wheel: this.wheel };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    return delta;
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
  }

  moveAxis() {
    if (this.radioWheelOpen) return { forward: 0, strafe: 0 };
    const forward = (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    return { forward, strafe };
  }
}
