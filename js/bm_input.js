'use strict';

// ============================================================
//  ENTRADA — teclado del beat 'em up (1 jugador) + táctil básico
// ============================================================

const bmKeys = {};
let bmTouchDir = 0, bmTouchAtk = false, bmTouchJump = false;
let bmLastTapDir = 0, bmLastTapT = -9;   // detección de doble toque para el dash
const BM_DTAP = 0.28;                    // ventana del doble toque (s)
const BM_SLIDE_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyK'];

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
