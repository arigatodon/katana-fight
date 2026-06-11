'use strict';

// ============================================================
//  MAIN — despachador de escenas y bucle principal
// ============================================================

function draw(t) {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  switch (scene) {
    case 'title':   drawTitle(t); break;
    case 'nombre':  drawNombre(t); break;
    case 'online':  drawOnline(t); break;
    case 'choose':  drawChoose(t); break;
    case 'virtud':  drawVirtud(t); break;
    case 'vs':      drawVS(t); break;
    case 'destino': drawDestinoScene(t); break;
    case 'apuesta': drawApuesta(t); break;
    case 'firma':   drawFirma(t); break;
    case 'ranking': drawRanking(t); break;
    case 'fight':
    case 'roundEnd':
      drawFight(t);
      break;
    case 'matchEnd':
      drawFight(t);
      drawMatchEnd(t);
      break;
  }
  // online: aviso si la simulación espera los inputs del rival
  if (netPlaying() && net.stallT > 0.3) {
    drawCenterText('esperando al rival…', 14, H * 0.08, '#c0b8a8', 'transparent');
  }
  ctx.restore();
}

// timestep fijo: la simulación avanza en tics de 1/60 s, idénticos
// en cualquier pantalla — requisito para el futuro modo online
const FIXED_DT = 1 / 60;
let dtAcc = 0;

function loop(ts) {
  const t = ts / 1000;
  const frameDt = Math.min(0.1, t - lastTime || FIXED_DT);
  dtAcc += frameDt;
  lastTime = t;
  handleMenus();
  if (netPlaying()) {
    dtAcc = netPump(dtAcc, frameDt);   // online: avanza solo con inputs de ambos
  } else {
    while (dtAcc >= FIXED_DT) {
      update(FIXED_DT);
      dtAcc -= FIXED_DT;
    }
  }
  draw(t);
  keyPressQueue.length = 0;
  tapQueue.length = 0;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
