'use strict';

// ============================================================
//  IA — enemigos del beat 'em up, cada tipo con su personalidad
//
//  Todos telegrafían el golpe (WINDUP visible) porque un golpe mata; la
//  gracia es leer a cada enemigo:
//   · bandido  → rushea agresivo, golpes seguidos
//   · cazadora → da brincos acercándose y ataca al caer
//   · gigante  → lento, golpe IMPARABLE (no se puede parar)
//   · monja    → finta (amaga y cancela) para que muerdas el anzuelo
//   · espectro → parpadea: dash corto con imagen falsa
//  Los JEFES yokai añaden un ataque FIRMA (bmBossSpecial).
// ============================================================

function bmUpdateAI(e, dt) {
  const pl = bmPlayer;
  if (!pl || pl.state === PSTATE.DEAD || bmRespawnT > 0) {
    if (e.state === PSTATE.IDLE) e.vx = 0;
    return;
  }
  e.atkCd -= dt;
  if (e.spCd > 0) e.spCd -= dt;

  // embestida en curso (umibōzu): mantiene la velocidad pese al rozamiento
  if (e.chargeT > 0) {
    e.vx = e.facing * 720;
    e.chargeT -= dt;
    if (e.chargeT <= 0) { e.state = PSTATE.RECOVER; e.stateTimer = 0.5; e.vx = 0; }
    return;
  }
  if (e.state !== PSTATE.IDLE) return;   // ocupado en tierra (windup/ataque/recover)

  e.facing = pl.x >= e.x ? 1 : -1;
  const dist = Math.abs(e.x - pl.x);

  // jefes: ataque firma cuando se enfría y el jugador está a media distancia
  if (e.isBoss && e.spCd <= 0 && dist < 380 && pl.onGround) { bmBossSpecial(e); return; }

  const range = e.reach + (e.isBoss ? 8 : 4);
  switch (e.char.id) {
    case 'cazadora': return bmAICazadora(e, dist, range);
    case 'espectro': return bmAIEspectro(e, dist, range);
    case 'monja':    return bmAIMonja(e, dist, range);
    case 'bandido':  return bmAIRusher(e, dist, range);
    default:         return bmAIBasic(e, dist, range);
  }
}

// acercarse y golpear (gigante, jefes en cuerpo a cuerpo, genérico)
function bmAIBasic(e, dist, range) {
  if (dist <= range && e.atkCd <= 0) {
    bmStartAttack(e, false);
    if (e.unblockable) e.attackThrust = false;
    e.atkCd = (e.isBoss ? 0.9 : 1.4) + Math.random() * 1.3;
    return;
  }
  const sep = bmSeparation(e);
  if (dist > range * 0.85) e.vx = (bmPlayer.x > e.x ? 1 : -1) * e.speed + sep;
  else e.vx = sep * 0.6;
}

// bandido: rushea rápido, golpes seguidos
function bmAIRusher(e, dist, range) {
  if (dist <= range * 1.05 && e.atkCd <= 0) {
    bmStartAttack(e, false);
    e.atkCd = 0.65 + Math.random() * 0.6;
    return;
  }
  e.vx = (bmPlayer.x > e.x ? 1 : -1) * e.speed * 1.5 + bmSeparation(e);
}

// cazadora: brinca acercándose y ataca al caer
function bmAICazadora(e, dist, range) {
  if (dist <= range && e.atkCd <= 0) {
    bmStartAttack(e, false);
    e.atkCd = 1.0 + Math.random() * 0.8;
    return;
  }
  if (e.onGround) {
    if (dist > range && Math.random() < 0.045) {       // salto hacia el jugador
      e.vy = -560; e.vx = (bmPlayer.x > e.x ? 1 : -1) * e.speed * 1.7; e.onGround = false;
      sfxJump && sfxJump();
    } else {
      e.vx = (bmPlayer.x > e.x ? 1 : -1) * e.speed + bmSeparation(e);
    }
  }
}

// espectro: parpadea (dash corto) dejando una imagen falsa
function bmAIEspectro(e, dist, range) {
  if (dist <= range && e.atkCd <= 0) {
    bmStartAttack(e, false);
    e.atkCd = 1.1 + Math.random() * 0.8;
    return;
  }
  if (dist > range && e.atkCd > 0.35 && Math.random() < 0.03) {
    e.afterimages.push({ x: e.x, y: e.y, facing: e.facing, life: 0.5, maxLife: 0.5, bob: e.bob, aMax: 0.5 });
    e.x += (bmPlayer.x > e.x ? 1 : -1) * Math.min(Math.max(0, dist - range * 0.8), 130);
  }
  e.vx = (bmPlayer.x > e.x ? 1 : -1) * e.speed * 0.8 + bmSeparation(e);
}

// monja: finta (amaga y cancela) para baitear tu parry/dash, luego golpea
function bmAIMonja(e, dist, range) {
  if (dist <= range && e.atkCd <= 0) {
    if (!e.feintNext && Math.random() < 0.5) {
      e.state = PSTATE.WINDUP; e.stateTimer = 0.24; e.feinting = true; e.feintNext = true;
      e.hitDone = false; e.vx = 0; e.atkCd = 0.55;
      sfxFeint && sfxFeint();
    } else {
      bmStartAttack(e, false); e.feintNext = false; e.atkCd = 1.2 + Math.random();
    }
    return;
  }
  e.vx = (bmPlayer.x > e.x ? 1 : -1) * e.speed + bmSeparation(e);
}

// ---- ataque FIRMA de cada jefe yokai ----
function bmBossSpecial(e) {
  const pl = bmPlayer;
  e.spCd = 3 + Math.random() * 2.5;
  const dir = pl.x > e.x ? 1 : -1;
  e.facing = dir;
  switch (e.char.id) {
    case 'gallina':  // TENGU: salto altísimo y caída en picada
      e.vy = -860; e.vx = dir * 280; e.onGround = false; e.special = 'dive';
      floatText(e.x, bodyCenterY(e) - 60, '¡TENGU!', '#e8c050', 18); sfxJump && sfxJump();
      break;
    case 'sapo':     // KAPPA: salto y aplastón con onda de choque
      e.vy = -660; e.vx = dir * 120; e.onGround = false; e.special = 'slam';
      sfxJump && sfxJump();
      break;
    case 'tiburon':  // UMIBOZU: embestida deslizándose
      e.chargeT = 0.6; e.vx = dir * 720;
      floatText(e.x, bodyCenterY(e) - 60, '¡EMBISTE!', '#c0e8f8', 16); sfxSlash && sfxSlash();
      break;
    case 'abuela':   // YAMAUBA: guardia letal — si la atacas, contraataca
      e.state = PSTATE.GUARD; e.stateTimer = 1.0; e.guardCounter = true; e.vx = 0;
      floatText(e.x, bodyCenterY(e) - 60, '¡GUARDIA!', '#e8c8d8', 16); sfxBlock && sfxBlock();
      break;
    case 'mapache':  // TANUKI: señuelos que confunden + golpe
      bmTanukiClones(e); bmStartAttack(e, false); e.atkCd = 1.8;
      break;
    default:
      bmStartAttack(e, false);
  }
}

// TANUKI: dos imágenes falsas a los flancos (visual, como el espectro del duelo)
function bmTanukiClones(e) {
  e.afterimages.push({ x: e.x - e.facing * 70, y: e.y, facing: e.facing, life: 1.4, maxLife: 1.4, bob: e.bob, aMax: 0.7 });
  e.afterimages.push({ x: e.x + e.facing * 80, y: e.y, facing: e.facing, life: 1.4, maxLife: 1.4, bob: e.bob, aMax: 0.7 });
  floatText(e.x, bodyCenterY(e) - 60, '¡SEÑUELOS!', '#e8a030', 16);
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
