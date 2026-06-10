'use strict';

// ============================================================
//  MAIN — despachador de escenas y bucle principal
// ============================================================

function draw(t) {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  switch (scene) {
    case 'title':   drawTitle(t); break;
    case 'virtud':  drawVirtud(t); break;
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
  ctx.restore();
}

function loop(ts) {
  const t = ts / 1000;
  const dt = Math.min(0.033, t - lastTime || 0.016);
  lastTime = t;
  handleMenus();
  update(dt);
  draw(t);
  keyPressQueue.length = 0;
  tapQueue.length = 0;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
