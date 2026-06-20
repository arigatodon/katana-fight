'use strict';

// ============================================================
//  BUCLE PRINCIPAL — timestep fijo (1/60) y despacho por escena
// ============================================================

const BM_FIXED_DT = 1 / 60;
let bmLast = 0, bmAcc = 0;

function bmTick(dt) {
  // temporizadores de pantallas de transición
  if (bmEndT > 0) bmEndT -= dt;

  if (bmScene === 'title' || bmScene === 'choose' || bmScene === 'gameover' || bmScene === 'win') {
    bmTime += dt;
    if (bmFlash > 0) bmFlash -= dt;
    return;
  }
  // 'play'
  bmUpdate(dt);
}

function bmFrame(now) {
  requestAnimationFrame(bmFrame);
  if (!bmLast) bmLast = now;
  let real = (now - bmLast) / 1000;
  bmLast = now;
  if (real > 0.25) real = 0.25;            // evita saltos tras pestaña inactiva
  bmAcc += real * (slowmoTimer > 0 ? timeScale : 1);
  let steps = 0;
  while (bmAcc >= BM_FIXED_DT && steps < 5) {
    bmTick(BM_FIXED_DT);
    bmAcc -= BM_FIXED_DT;
    steps++;
  }
  bmDraw();
}

function bmBoot() {
  BM_VIEW_W; // no-op de referencia
  requestAnimationFrame(bmFrame);
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', bmBoot);
else bmBoot();
