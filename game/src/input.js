// Keyboard and mouse input. Movement is WASD or arrows; the mouse aims the ship's nose
// (firing is automatic, at the nearest enemy). Enter/Space confirms, P pauses, M mutes,
// R restarts, 1/2/3 pick an upgrade card. All handlers are removed by destroy().
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';

const KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, inside: false };
  let clicked = false;

  function key(e) {
    if (KEYS[e.code]) {
      held.add(KEYS[e.code]);
      e.preventDefault();
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space') { pressed.add(ACTION_CONFIRM); e.preventDefault(); }
    if (e.code === 'KeyP') pressed.add(ACTION_PAUSE);
    if (e.code === 'KeyM') pressed.add(ACTION_MUTE);
    if (e.code === 'KeyR') pressed.add(ACTION_RESTART);
    if (e.code === 'Digit1') pressed.add('pick1');
    if (e.code === 'Digit2') pressed.add('pick2');
    if (e.code === 'Digit3') pressed.add('pick3');
  }
  function keyup(e) {
    if (KEYS[e.code]) held.delete(KEYS[e.code]);
  }
  function mousemove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
    mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    mouse.inside = true;
  }
  function mousedown(e) {
    mousemove(e);
    clicked = true;
  }
  function blur() {
    held.clear();
  }

  window.addEventListener('keydown', key);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);
  canvas.addEventListener('mousemove', mousemove);
  canvas.addEventListener('mousedown', mousedown);

  return {
    /** Movement vector from the held keys, normalised. */
    move() {
      let x = 0;
      let y = 0;
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) y -= 1;
      if (held.has('down')) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    mouse,
    /** True once when the canvas was clicked since the last call. */
    takeClick() {
      const c = clicked;
      clicked = false;
      return c;
    },
    /** True once when the named action key was pressed since the last call. */
    take(name) {
      const hit = pressed.has(name);
      pressed.delete(name);
      return hit;
    },
    destroy() {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('mousemove', mousemove);
      canvas.removeEventListener('mousedown', mousedown);
    },
  };
}
