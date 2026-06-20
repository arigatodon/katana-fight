'use strict';

// ============================================================
//  ENTRADA — teclado del beat 'em up (1 jugador) + táctil básico
// ============================================================

const bmKeys = {};
let bmTouchDir = 0, bmTouchAtk = false, bmTouchJump = false, bmTouchDash = false, bmTouchParry = false;
const BM_PARRY_KEYS = ['KeyL', 'KeyK'];
let bmLastTapDir = 0, bmLastTapT = -9;   // detección de doble toque para el dash
const BM_DTAP = 0.28;                    // ventana del doble toque (s)
const BM_SLIDE_KEYS = ['ShiftLeft', 'ShiftRight'];

// acciones lógicas → varias teclas posibles
const BM_BIND = {
  left:   ['ArrowLeft', 'KeyA'],
  right:  ['ArrowRight', 'KeyD'],
  jump:   ['ArrowUp', 'KeyW', 'Space'],
  down:   ['ArrowDown', 'KeyS'],
  attack: ['KeyF', 'KeyJ', 'KeyZ', 'Enter'],
};

function bmDown(action) {
  for (const k of BM_BIND[action]) if (bmKeys[k]) return true;
  return false;
}

addEventListener('keydown', e => {
  if (typeof initAudio === 'function') initAudio();
  const prev = bmKeys[e.code];
  bmKeys[e.code] = true;
  // evita el scroll de la página con flechas/espacio
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();

  if (prev) return;   // solo el primer flanco

  // ---- menús ----
  if (bmScene === 'title') {
    if (BM_BIND.attack.includes(e.code) || e.code === 'Space') { bmScene = 'choose'; sfxConfirm && sfxConfirm(); }
    return;
  }
  if (bmScene === 'choose') {
    if (bmDownCode(e.code, 'left'))  { bmChooseSel = (bmChooseSel + BM_PLAYABLE.length - 1) % BM_PLAYABLE.length; sfxSelect && sfxSelect(); }
    if (bmDownCode(e.code, 'right')) { bmChooseSel = (bmChooseSel + 1) % BM_PLAYABLE.length; sfxSelect && sfxSelect(); }
    if (BM_BIND.attack.includes(e.code)) { sfxConfirm && sfxConfirm(); bmStartGame(BM_PLAYABLE[bmChooseSel]); }
    return;
  }
  if (bmScene === 'gameover' || bmScene === 'win') {
    if (bmEndT <= 0 && (BM_BIND.attack.includes(e.code) || e.code === 'Space')) { bmScene = 'title'; sfxConfirm && sfxConfirm(); }
    return;
  }

  // ---- juego ----
  if (bmScene === 'play') {
    if (BM_BIND.attack.includes(e.code)) bmPlayerAttack();
    if (BM_BIND.jump.includes(e.code)) bmPlayerJump();
    if (BM_SLIDE_KEYS.includes(e.code)) bmPlayerSlide(bmMoveDir() || (bmPlayer && bmPlayer.facing));
    if (BM_PARRY_KEYS.includes(e.code)) bmPlayerParry();
    // doble toque de ← / → = deslizamiento rápido en esa dirección
    if (BM_BIND.left.includes(e.code) || BM_BIND.right.includes(e.code)) {
      const dir = BM_BIND.right.includes(e.code) ? 1 : -1;
      if (bmLastTapDir === dir && (bmTime - bmLastTapT) < BM_DTAP) { bmPlayerSlide(dir); bmLastTapDir = 0; }
      else { bmLastTapDir = dir; bmLastTapT = bmTime; }
    }
  }
});

addEventListener('keyup', e => { bmKeys[e.code] = false; });

function bmDownCode(code, action) { return BM_BIND[action].includes(code); }

// dirección horizontal sostenida (-1, 0, 1) combinando teclado y táctil
function bmMoveDir() {
  let d = 0;
  if (bmDown('left')) d -= 1;
  if (bmDown('right')) d += 1;
  return d || bmTouchDir;
}

// ============================================================
//  CONTROLES TÁCTILES (celular): botones en pantalla
// ============================================================
const BM_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// botones (coordenadas del lienzo 960x540)
const BM_TBTN = [
  { id: 'left',   x: 78,      y: H - 62,  r: 46, label: '◀' },
  { id: 'right',  x: 196,     y: H - 62,  r: 46, label: '▶' },
  { id: 'dash',   x: 120,     y: H - 156, r: 38, label: '»' },
  { id: 'parry',  x: W - 300, y: H - 58,  r: 40, label: '受' },
  { id: 'jump',   x: W - 196, y: H - 130, r: 42, label: '▲' },
  { id: 'attack', x: W - 78,  y: H - 72,  r: 56, label: '斬' },
];
const bmTouch = { left: false, right: false, jump: false, attack: false, dash: false, parry: false };

function bmCanvasPos(t) {
  const r = cvs.getBoundingClientRect();
  return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
}

function bmApplyTouches(e) {
  e.preventDefault();
  if (typeof initAudio === 'function') initAudio();
  const prev = { jump: bmTouch.jump, attack: bmTouch.attack, dash: bmTouch.dash, parry: bmTouch.parry };
  for (const k in bmTouch) bmTouch[k] = false;
  for (const t of e.touches) {
    const p = bmCanvasPos(t);
    for (const btn of BM_TBTN) {
      if (Math.hypot(p.x - btn.x, p.y - btn.y) < btn.r + 14) bmTouch[btn.id] = true;
    }
  }
  bmTouchDir = (bmTouch.right ? 1 : 0) - (bmTouch.left ? 1 : 0);
  // acciones por flanco (al apretar): no se repiten mientras se mantienen
  if (bmTouch.attack && !prev.attack) bmTouchAtk = true;
  if (bmTouch.jump && !prev.jump) bmTouchJump = true;
  if (bmTouch.dash && !prev.dash) bmTouchDash = true;
  if (bmTouch.parry && !prev.parry) bmTouchParry = true;
}

if (BM_TOUCH) {
  cvs.addEventListener('touchstart', e => {
    // en los menús, un toque actúa como confirmar/elegir
    if (bmScene !== 'play') {
      for (const t of e.changedTouches) bmMenuTap(bmCanvasPos(t));
    }
    bmApplyTouches(e);
  }, { passive: false });
  cvs.addEventListener('touchmove', bmApplyTouches, { passive: false });
  cvs.addEventListener('touchend', bmApplyTouches, { passive: false });
  cvs.addEventListener('touchcancel', bmApplyTouches, { passive: false });
}

// navegación de menús por toque
function bmMenuTap(p) {
  if (typeof initAudio === 'function') initAudio();
  if (bmScene === 'title') { bmScene = 'choose'; sfxConfirm && sfxConfirm(); return; }
  if (bmScene === 'choose') {
    const zona = p.x < W / 3 ? 0 : p.x < 2 * W / 3 ? 1 : 2;   // toca un guerrero = elígelo
    bmChooseSel = zona; sfxConfirm && sfxConfirm(); bmStartGame(BM_PLAYABLE[zona]); return;
  }
  if ((bmScene === 'gameover' || bmScene === 'win') && bmEndT <= 0) {
    bmScene = 'title'; sfxConfirm && sfxConfirm();
  }
}
