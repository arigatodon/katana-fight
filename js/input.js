'use strict';

// ============================================================
//  ENTRADA — teclado y controles táctiles
// ============================================================

const keys = {};
let keyPressQueue = [];   // pulsaciones discretas (para los menús)
let tapQueue = [];        // toques discretos (para los menús)

window.addEventListener('keydown', e => {
  if (e.target && (e.target.id === 'nameInput' || e.target.id === 'commentInput')) return;   // escribiendo
  initAudio();
  if (!e.repeat) keyPressQueue.push(e.code);
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const touchState = { left: false, right: false, jump: false, attack: false, feint: false, down: false };

const TBTN = [
  { id: 'left',   x: 85,      y: H - 65,  r: 46, label: '◀' },
  { id: 'right',  x: 200,     y: H - 65,  r: 46, label: '▶' },
  { id: 'jump',   x: 142,     y: H - 168, r: 36, label: '▲' },
  { id: 'down',   x: 40,      y: H - 172, r: 30, label: '▼' },   // bajar de la baranda (balneario)
  { id: 'attack', x: W - 85,  y: H - 75,  r: 52, label: '斬' },
  { id: 'feint',  x: W - 205, y: H - 58,  r: 42, label: '謀' },
];

function canvasPos(t) {
  const r = cvs.getBoundingClientRect();
  return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
}

function updateTouches(e) {
  e.preventDefault();
  initAudio();
  for (const k in touchState) touchState[k] = false;
  for (const t of e.touches) {
    const p = canvasPos(t);
    for (const b of TBTN) {
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 14) touchState[b.id] = true;
    }
  }
}

cvs.addEventListener('touchstart', e => {
  updateTouches(e);
  for (const t of e.changedTouches) tapQueue.push(canvasPos(t));
}, { passive: false });
cvs.addEventListener('touchmove', updateTouches, { passive: false });
cvs.addEventListener('touchend', updateTouches, { passive: false });
cvs.addEventListener('touchcancel', updateTouches, { passive: false });
cvs.addEventListener('mousedown', e => {
  initAudio();
  tapQueue.push(canvasPos(e));
});

// lectura por jugador durante el combate
function readInput(p, isP1, foe, dt) {
  if (netPlaying()) return unpackInput(net.frame[isP1 ? 0 : 1]);
  if (p.isCPU) return updateAI(p, foe, dt);
  if (isP1) {
    return {
      left:   keys['KeyA'] || touchState.left,
      right:  keys['KeyD'] || touchState.right,
      jump:   keys['KeyW'] || keys['Space'] || touchState.jump,
      down:   keys['KeyS'] || touchState.down,
      attack: keys['KeyF'] || touchState.attack,
      feint:  keys['KeyG'] || touchState.feint,
      guard:  false,
    };
  }
  return {
    left: keys['ArrowLeft'], right: keys['ArrowRight'],
    jump: keys['ArrowUp'],
    down: keys['ArrowDown'],
    attack: keys['KeyK'],
    feint: keys['KeyL'],
    guard: false,
  };
}
