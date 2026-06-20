'use strict';

// ============================================================
//  IA — enemigos del beat 'em up
//
//  Se acercan al jugador, telegrafían el golpe (WINDUP visible) y
//  atacan. Como un golpe mata, el telégrafo es la clave: el jugador
//  debe golpear primero, esquivar o pegarles mientras se recuperan.
//  Para que no se amontonen, cada uno guarda distancia y ataca con
//  su propio enfriamiento aleatorio.
// ============================================================

function bmUpdateAI(e, dt) {
  if (!bmPlayer || bmPlayer.state === PSTATE.DEAD || bmRespawnT > 0) {
    // sin objetivo: se quedan quietos
    if (e.state === PSTATE.IDLE) e.vx = 0;
    return;
  }
  const pl = bmPlayer;
  e.atkCd -= dt;

  // mirar al jugador (solo si está libre para actuar)
  if (e.state === PSTATE.IDLE) {
    e.facing = pl.x >= e.x ? 1 : -1;
  }
  if (e.state !== PSTATE.IDLE) { return; }   // ocupado: deja correr el temporizador de estado

  const dist = Math.abs(e.x - pl.x);
  const range = e.reach + (e.isBoss ? 8 : 4);

  // atacar si está a tiro y enfriado
  if (dist <= range && e.atkCd <= 0) {
    bmStartAttack(e, e.char.slide || false);
    e.atkCd = (e.isBoss ? 0.9 : 1.4) + Math.random() * 1.3;
    return;
  }

  // mantener separación con otros enemigos para no apilarse
  const sep = bmSeparation(e);

  // acercarse / reposicionarse
  if (dist > range * 0.85) {
    e.vx = (pl.x > e.x ? 1 : -1) * e.speed + sep;
  } else {
    // ya está a tiro pero aún enfriando: hostiga moviéndose un poco
    e.vx = sep * 0.6 + (pl.x > e.x ? 1 : -1) * e.speed * 0.12 * Math.sin(bmTime * 3 + e.x);
  }
}

// pequeño empuje para que los enemigos no ocupen el mismo punto
function bmSeparation(e) {
  let push = 0;
  for (const o of bmEnemies) {
    if (o === e || o.state === PSTATE.DEAD) continue;
    const d = e.x - o.x;
    const ad = Math.abs(d);
    if (ad < 44 && ad > 0.001) push += (d > 0 ? 1 : -1) * (44 - ad) * 2.2;
  }
  return Math.max(-120, Math.min(120, push));
}
