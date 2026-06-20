'use strict';

// ============================================================
//  COMBATE — golpes letales del beat 'em up
//
//  Filosofía del juego: un corte limpio mata. Cualquier golpe del
//  enemigo te mata (pierdes una vida); tu golpe mata de una a los
//  enemigos comunes. Los JEFES yokai son más grandes y aguantan
//  varios cortes (`hp`), pero su golpe también es letal.
// ============================================================

function bmFacingTarget(a, t) { return (t.x - a.x) * a.facing > 0; }

function bmInReach(a, t) {
  if (!bmFacingTarget(a, t)) return false;
  const dist = Math.abs(a.x - t.x);
  const vert = Math.abs(bodyCenterY(a) - bodyCenterY(t));
  return dist <= a.reach + 22 && vert <= 64 * Math.max(a.scale, t.scale);
}

// iniciar ataque (jugador o enemigo): solo desde reposo
function bmStartAttack(p, thrust) {
  if (p.state !== PSTATE.IDLE || p.state === PSTATE.DEAD) return false;
  p.state = PSTATE.WINDUP;
  p.stateTimer = p.windup;
  p.attackThrust = !!thrust;
  p.hitDone = false;
  // golpe EN MOVIMIENTO: en el aire conserva el impulso (tajo volador que
  // continúa el avance); en tierra solo frena un poco, no se clava en seco.
  if (p.onGround) p.vx *= 0.4;
  return true;
}

function bmPlayerAttack() {
  if (bmScene !== 'play' || !bmPlayer) return;
  // golpe hacia abajo en el aire = estocada descendente (visual)
  if (bmStartAttack(bmPlayer, !bmPlayer.onGround && bmDown('down'))) {
    bmPlayer.slideT = 0;   // cancelar el deslizamiento al cortar (slide → ataque)
    sfxSlash && sfxSlash();
  }
}

// ---- deslizamiento rápido (dash) ----
const BM_SLIDE_SPEED = 760;   // impulso del dash
const BM_SLIDE_DUR = 0.26;    // duración (s)
const BM_SLIDE_CD = 0.55;     // enfriamiento (s)
const BM_SLIDE_IFR = 0.20;    // invulnerabilidad inicial (esquiva)

function bmPlayerSlide(dir) {
  if (bmScene !== 'play' || !bmPlayer) return;
  const p = bmPlayer;
  if (p.state !== PSTATE.IDLE || !p.onGround || p.slideT > 0 || p.slideCd > 0 || bmRespawnT > 0) return;
  if (dir) p.facing = dir < 0 ? -1 : 1;
  p.slideT = BM_SLIDE_DUR;
  p.slideCd = BM_SLIDE_CD;
  p.invT = Math.max(p.invT, BM_SLIDE_IFR);
  p.vx = p.facing * BM_SLIDE_SPEED;
  sfxJump && sfxJump();
  bmSlideDust(p);
}

// chorro de sangre del jefe abatido: brota sin parar del cuerpo, sube y cae;
// al tocar el suelo cada gota queda como mancha permanente (bmStepFx la fija).
function bmBleed(boss) {
  const cy = bodyCenterY(boss);
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: boss.x + (Math.random() - 0.5) * 34,
      y: cy + (Math.random() - 0.5) * 24,
      vx: (Math.random() - 0.5) * 140,
      vy: -120 - Math.random() * 180,
      life: 2.2, maxLife: 2.2,
      color: ['#c01818', '#8e0e0e', '#e03030', '#a01414'][Math.floor(Math.random() * 4)],
      size: 2 + Math.random() * 3.5, gravity: true, stain: true,
    });
  }
}

// polvo del deslizamiento (solo visual → Math.random)
function bmSlideDust(p) {
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: p.x - p.facing * (4 + Math.random() * 12), y: GROUND - 4,
      vx: -p.facing * (40 + Math.random() * 90), vy: -20 - Math.random() * 50,
      life: 0.3, maxLife: 0.3, color: 'rgba(206,196,176,0.7)',
      size: 2 + Math.random() * 3, gravity: true,
    });
  }
}

function bmPlayerJump() {
  if (bmScene !== 'play' || !bmPlayer) return;
  const p = bmPlayer;
  if (p.onGround && (p.state === PSTATE.IDLE)) {
    p.vy = p.jumpVel * 0.82;
    p.onGround = false;
    sfxJump && sfxJump();
  }
}

// ---- resolución de golpes (llamado cada tic) ----
function bmResolveHits() {
  const pl = bmPlayer;
  if (!pl) return;

  // jugador golpea enemigos: un golpe alcanza a UN solo enemigo (el más cercano
  // en rango), no atraviesa a varios.
  if (pl.state === PSTATE.ATTACK && !pl.hitDone) {
    let mejor = null, mejorD = Infinity;
    for (const e of bmEnemies) {
      if (e.state === PSTATE.DEAD) continue;
      if (!bmInReach(pl, e)) continue;
      const d = Math.abs(pl.x - e.x);
      if (d < mejorD) { mejorD = d; mejor = e; }
    }
    if (mejor) { pl.hitDone = true; bmHitEnemy(mejor, pl); }
  }

  // enemigos golpean al jugador
  if (pl.state !== PSTATE.DEAD && pl.invT <= 0) {
    for (const e of bmEnemies) {
      if (e.state === PSTATE.ATTACK && !e.hitDone && bmInReach(e, pl)) {
        e.hitDone = true;
        bmHitPlayer(e);
        break;
      }
    }
  }
}

function bmHitEnemy(e, att) {
  spawnBlood(e.x, bodyCenterY(e), att.facing, e.isBoss ? 14 : 22);
  sfxHit && sfxHit();
  shake = 8;
  if (e.isBoss && e.hp > 1) {
    e.hp -= 1;
    e.state = PSTATE.HITSTUN;
    e.stateTimer = 0.22;
    e.vx = att.facing * 160;
    e.invT = 0.05;
    floatText(e.x, bodyCenterY(e) - 50, '¡' + e.hp + '!', '#ffd040', 18);
    return;
  }
  bmKillFighter(e, att);
  bmScore += e.isBoss ? 1000 : 100;
  bmKills += 1;
  floatText(e.x, bodyCenterY(e) - 48, e.isBoss ? '¡JEFE CAÍDO!' : '+100', '#ffd040', e.isBoss ? 20 : 15);
}

function bmHitPlayer(att) {
  const pl = bmPlayer;
  if (pl.invT > 0 || pl.state === PSTATE.DEAD) return;
  bmLives -= 1;
  spawnBlood(pl.x, bodyCenterY(pl), att.facing, 30);
  bmKillFighter(pl, att);
  bmFlash = 0.22;
  if (bmLives <= 0) {
    bmGameOverPending = true;
  } else {
    bmRespawnT = 1.5;
  }
}

// muerte con cámara lenta y sangre (estilo del duelo)
function bmKillFighter(victim, killer) {
  if (victim.state === PSTATE.DEAD) return;
  victim.state = PSTATE.DEAD;
  victim.stateTimer = 0;
  victim.vida = 0;
  victim.deathT = 0;
  victim.vx = killer.facing * 220;
  victim.vy = -200;
  victim.bloodT = 1.4;
  sfxKill && sfxKill();
  if (victim === bmPlayer) {
    // muerte del jugador: cámara lenta dramática
    shake = 16; timeScale = 0.18; slowmoTimer = 1.0; bmFlash = Math.max(bmFlash, 0.12);
  } else if (victim.isBoss) {
    // JEFE abatido: NADA de freeze/gris. El cuerpo queda manando sangre que se
    // acumula en el suelo hasta que el jugador AVANZA a la siguiente etapa.
    shake = 14;
    bmBossDown = true;
    bmFallenBoss = victim;
  } else {
    shake = 9;   // enemigo común: solo sacudida, sin frenar el ritmo
  }
  spawnParticles(victim.x, bodyCenterY(victim), 36, ['#c01818', '#901010', '#e03030'], 360, 1.1);
  spawnBlood(victim.x, bodyCenterY(victim), killer.facing, 30);
  slashTrails.push({
    x1: victim.x - killer.facing * 70, y1: bodyCenterY(victim) - 50,
    x2: victim.x + killer.facing * 70, y2: bodyCenterY(victim) + 40,
    life: 0.8, maxLife: 0.8,
  });
}
