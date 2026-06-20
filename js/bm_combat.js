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

// ---- peligros de jefe (ondas, aplastones, picadas) ----
function bmSpawnShock(x, dir, speed) {
  bmHazards.push({ x: x, y: GROUND, vx: dir * (speed || 340), r: 26, life: 1.3, maxLife: 1.3, kind: 'shock', grow: 70 });
}

// el jefe aterriza tras una picada/aplastón
function bmBossLand(e) {
  shake = 14;
  spawnParticles(e.x, GROUND, 18, ['#d8d0c0', '#b0a890'], 220, 0.5);
  if (e.special === 'slam') { bmSpawnShock(e.x, -1, 360); bmSpawnShock(e.x, 1, 360); }
  else if (e.special === 'dive') { bmHazards.push({ x: e.x, y: GROUND, vx: 0, r: 72, life: 0.32, maxLife: 0.32, kind: 'aoe' }); }
  e.special = null;
  e.state = PSTATE.RECOVER; e.stateTimer = 0.5;
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
    if (mejor) {
      pl.hitDone = true;
      // atacar a la YAMAUBA en guardia letal = te contraataca
      if (mejor.state === PSTATE.GUARD && mejor.guardCounter) bmGuardCounter(mejor);
      else bmHitEnemy(mejor, pl);
    }
  }

  // enemigos golpean al jugador (o el jugador para con parry)
  if (pl.state !== PSTATE.DEAD) {
    for (const e of bmEnemies) {
      const golpea = (e.state === PSTATE.ATTACK && !e.hitDone && bmInReach(e, pl));
      const embiste = (e.chargeT > 0 && bmInReach(e, pl));
      if (!golpea && !embiste) continue;
      if (golpea) e.hitDone = true;
      if (pl.parryT > 0 && !e.unblockable && !embiste) { bmParrySuccess(e); break; }
      if (pl.invT <= 0 && pl.parryT <= 0) { bmHitPlayer(e); break; }
    }
  }
}

// ---- parry / contraataque ----
const BM_PARRY_DUR = 0.18;   // ventana en que la parada desvía
const BM_PARRY_CD = 0.5;     // enfriamiento

function bmPlayerParry() {
  if (bmScene !== 'play' || !bmPlayer) return;
  const p = bmPlayer;
  if (p.state !== PSTATE.IDLE || p.parryT > 0 || p.parryCd > 0 || bmRespawnT > 0) return;
  p.parryT = BM_PARRY_DUR;
  p.parryCd = BM_PARRY_CD;
  p.state = PSTATE.GUARD; p.stateTimer = 0.26; p.vx = 0;
  sfxBlock && sfxBlock();
}

// parada exitosa: desvía el golpe; el común muere de la riposta, el jefe se tambalea
function bmParrySuccess(e) {
  sfxParry && sfxParry();
  bmFlash = Math.max(bmFlash, 0.12); shake = 8;
  timeScale = 0.35; slowmoTimer = 0.22;
  spawnClash((e.x + bmPlayer.x) / 2, bodyCenterY(e) - 8);
  floatText(bmPlayer.x, bodyCenterY(bmPlayer) - 52, '¡PARADA!', '#80e8ff', 22);
  bmPlayer.parryT = 0;
  if (e.isBoss) {
    if (e.hp > 1) e.hp -= 1;
    e.state = PSTATE.HITSTUN; e.stateTimer = 1.0; e.vx = -e.facing * 240;
    if (e.hp <= 0) { bmKillFighter(e, bmPlayer); bmCreditKill(e, 1000); }
  } else {
    bmKillFighter(e, bmPlayer); bmCreditKill(e, 150);
  }
}

// la yamauba en guardia contraataca a quien la golpea
function bmGuardCounter(boss) {
  boss.guardCounter = false; boss.state = PSTATE.IDLE; boss.atkCd = 0.5;
  floatText(boss.x, bodyCenterY(boss) - 52, '¡CONTRA!', '#e8404a', 20);
  sfxParry && sfxParry();
  bmPlayerDie(boss.facing);
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
  bmCreditKill(e, e.isBoss ? 1000 : 100);
  floatText(e.x, bodyCenterY(e) - 48, e.isBoss ? '¡JEFE CAÍDO!' : ('+' + Math.round((e.isBoss ? 1000 : 100) * bmMult)), '#ffd040', e.isBoss ? 20 : 15);
}

// suma puntaje con multiplicador y avanza el combo
function bmCreditKill(e, base) {
  bmKills += 1;
  bmCombo += 1;
  bmComboT = 3.2;
  bmComboBest = Math.max(bmComboBest, bmCombo);
  bmMult = 1 + Math.floor(bmCombo / 3) * 0.5;   // cada 3 muertes: +0.5x
  bmScore += Math.round(base * bmMult);
}

// muerte del jugador (golpe enemigo, embestida, onda o contra)
function bmPlayerDie(facing) {
  const pl = bmPlayer;
  if (pl.invT > 0 || pl.state === PSTATE.DEAD) return;
  bmLives -= 1;
  bmCombo = 0; bmMult = 1; bmComboT = 0;       // se pierde el combo al morir
  spawnBlood(pl.x, bodyCenterY(pl), facing, 30);
  bmKillFighter(pl, { facing: facing });
  bmFlash = 0.22;
  if (bmLives <= 0) bmGameOverPending = true;
  else bmRespawnT = 1.5;
}
function bmHitPlayer(att) { bmPlayerDie(att.facing); }
function bmHitPlayerByHazard(h) { bmPlayerDie(bmPlayer.x < h.x ? -1 : 1); }

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
