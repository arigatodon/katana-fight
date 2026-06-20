'use strict';

// ============================================================
//  ACTUALIZACIÓN — física, máquina de estados, oleadas y cámara
// ============================================================

// avanza una máquina de estados de luchador (común a jugador y enemigos)
function bmStepState(p, dt) {
  if (p.state === PSTATE.DEAD) { p.deathT += dt; }
  else {
    p.stateTimer -= dt;
    switch (p.state) {
      case PSTATE.WINDUP:
        if (p.stateTimer <= 0) {
          if (p.feinting) { p.feinting = false; p.state = PSTATE.IDLE; }   // finta: amaga y cancela
          else { p.state = PSTATE.ATTACK; p.stateTimer = 0.13; p.hitDone = false; }
        }
        break;
      case PSTATE.ATTACK:
        if (p.stateTimer <= 0) { p.state = PSTATE.RECOVER; p.stateTimer = p.recover; }
        break;
      case PSTATE.GUARD:
        if (p.stateTimer <= 0) { p.state = PSTATE.IDLE; p.guardCounter = false; }
        break;
      case PSTATE.RECOVER:
      case PSTATE.HITSTUN:
        if (p.stateTimer <= 0) { p.state = PSTATE.IDLE; }
        break;
    }
  }
  if (p.invT > 0) p.invT -= dt;
  if (p.parryT > 0) p.parryT -= dt;
  if (p.parryCd > 0) p.parryCd -= dt;
  // decaimiento de imágenes falsas (espectro / señuelos del tanuki)
  if (p.afterimages && p.afterimages.length) {
    for (let i = p.afterimages.length - 1; i >= 0; i--) {
      p.afterimages[i].life -= dt;
      if (p.afterimages[i].life <= 0) p.afterimages.splice(i, 1);
    }
  }
}

// física común (gravedad, suelo, rozamiento, animación de paso)
function bmStepPhysics(p, dt) {
  p.bob += dt * (p.onGround && Math.abs(p.vx) > 30 ? 14 : 6);

  p.vy += BM_GRAV * dt;
  p.y += p.vy * dt;
  if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.onGround = true; }
  else p.onGround = false;

  p.x += p.vx * dt;

  // rozamiento: fuerte en el SUELO cuando no está en reposo (frena el empuje de
  // golpes y muerte); en reposo la IA/entrada ya fija vx cada tic. EN EL AIRE no
  // hay rozamiento → un golpe en salto conserva el impulso (tajo volador).
  if (p.state !== PSTATE.IDLE && p.onGround) p.vx *= Math.pow(0.0015, dt);

  // límites del mundo
  const w = bmWorldW();
  p.x = Math.max(20, Math.min(w - 20, p.x));
}

function bmUpdate(dt) {
  bmTime += dt;
  if (bmBannerT > 0) bmBannerT -= dt;
  if (bmFlash > 0) bmFlash -= dt;
  bmArrowPulse += dt;

  if (bmScene !== 'play') return;

  // ---- entrada del jugador ----
  const pl = bmPlayer;
  if (pl.slideCd > 0) pl.slideCd -= dt;
  if (pl.slideT > 0 && pl.state === PSTATE.IDLE) {
    // deslizamiento rápido en curso: impulso que decae, ignora el movimiento normal
    pl.slideT -= dt;
    pl.vx = pl.facing * BM_SLIDE_SPEED * Math.max(0.3, pl.slideT / BM_SLIDE_DUR);
    if (Math.random() < 0.6) bmSlideDust(pl);
  } else if (pl.state === PSTATE.IDLE && bmRespawnT <= 0) {
    const dir = bmMoveDir();
    if (dir !== 0) { pl.vx = dir * pl.speed; pl.facing = dir; }
    else pl.vx = 0;
  }
  if (bmTouchAtk) { bmPlayerAttack(); bmTouchAtk = false; }
  if (bmTouchJump) { bmPlayerJump(); bmTouchJump = false; }
  if (bmTouchDash) { bmPlayerSlide(bmMoveDir() || pl.facing); bmTouchDash = false; }
  if (bmTouchParry) { bmPlayerParry(); bmTouchParry = false; }

  // ---- estados + física ----
  bmStepState(pl, dt);
  bmStepPhysics(pl, dt);
  for (const e of bmEnemies) {
    bmUpdateAI(e, dt);
    bmStepState(e, dt);
    const wasAir = !e.onGround;
    bmStepPhysics(e, dt);
    if (e.special && wasAir && e.onGround) bmBossLand(e);   // picada/aplastón aterriza
  }

  // ---- golpes / peligros ----
  bmResolveHits();
  bmStepHazards(dt);

  // ---- combo: decae si pasa el tiempo sin matar ----
  if (bmComboT > 0) { bmComboT -= dt; if (bmComboT <= 0) { bmCombo = 0; bmMult = 1; } }

  // ---- limpiar muertos (tras la animación de caída) ----
  // el JEFE caído NO se borra: queda en el suelo manando sangre.
  for (let i = bmEnemies.length - 1; i >= 0; i--) {
    const e = bmEnemies[i];
    if (e.state === PSTATE.DEAD && e.deathT > 1.2 && !e.isBoss) bmEnemies.splice(i, 1);
  }

  // ---- jefe abatido: sangra sin parar hasta que se avanza ----
  if (bmBossDown && bmFallenBoss) bmBleed(bmFallenBoss);

  // ---- respawn del jugador / game over ----
  if (bmRespawnT > 0) {
    bmRespawnT -= dt;
    if (bmRespawnT <= 0) {
      if (bmGameOverPending) { bmScene = 'gameover'; bmEndT = 1.2; if (typeof stopMusic === 'function') stopMusic(); }
      else bmRespawnPlayer();
    }
  } else if (pl.state === PSTATE.DEAD && bmGameOverPending) {
    // murió sin respawn programado (última vida): espera la animación
    if (pl.deathT > 1.0) { bmScene = 'gameover'; bmEndT = 1.2; if (typeof stopMusic === 'function') stopMusic(); }
  }

  // ---- oleadas y avance ----
  bmUpdateWaves();

  // ---- cámara ----
  // arena fija durante una oleada; libre (sigue al jugador) entre oleadas
  if (bmWaveActive) bmCamX = bmCamMax;
  else bmCamX = Math.max(0, Math.min(bmCamMax, pl.x - W * 0.42));

  // efectos globales (slowmo, shake) reusan los timers del duelo
  if (slowmoTimer > 0) { slowmoTimer -= dt; if (slowmoTimer <= 0) timeScale = 1; }
  if (shake > 0) shake = Math.max(0, shake - dt * 60);

  // partículas / textos / estelas (mismos arrays que el duelo)
  bmStepFx(dt);
  bmStepAmbient(dt);
}

// peligros de jefe (onda del kappa, picada del tengu, aplastón): mueven, crecen
// y matan al jugador. La ONDA se salta (solo golpea si estás en el suelo).
function bmStepHazards(dt) {
  const pl = bmPlayer;
  for (let i = bmHazards.length - 1; i >= 0; i--) {
    const h = bmHazards[i];
    h.life -= dt;
    h.x += h.vx * dt;
    if (h.grow) h.r += h.grow * dt;
    if (h.life <= 0) { bmHazards.splice(i, 1); continue; }
    if (!pl || pl.state === PSTATE.DEAD || pl.invT > 0 || pl.parryT > 0) continue;
    const cerca = Math.abs(pl.x - h.x) < h.r;
    const alcanza = h.kind === 'shock' ? pl.onGround : true;   // la onda se esquiva saltando
    if (cerca && alcanza) { bmHitPlayerByHazard(h); break; }
  }
}

function bmRespawnPlayer() {
  const pl = bmPlayer;
  pl.state = PSTATE.IDLE;
  pl.stateTimer = 0;
  pl.deathT = 0;
  pl.vida = VIDA_MAX;
  pl.vx = 0; pl.vy = 0;
  pl.invT = 2.0;
  pl.y = GROUND; pl.onGround = true;
  // reaparece en el borde izquierdo de la pantalla actual y empuja enemigos
  pl.x = bmCamX + 90;
  pl.facing = 1;
}

// dispara oleadas, bloquea la cámara y detecta etapa superada
function bmUpdateWaves() {
  const pl = bmPlayer;
  if (!bmWaveActive) {
    // todas las oleadas (incluido el jefe) ya despachadas
    if (bmWaveIdx >= bmStage.waves.length) {
      if (bmBossDown) {
        // jefe abatido: cámara libre; avanza caminando al borde para pasar de etapa
        bmCamMax = bmWorldW() - W;
        if (pl.x >= bmWorldW() - 60) bmStageClear();
      } else {
        bmStageClear();
      }
      return;
    }
    const wave = bmStage.waves[bmWaveIdx];
    if (pl.x >= wave.at * bmWorldW()) {
      bmSpawnWave(wave);
      bmWaveActive = true;
      // bloquea la cámara en la pantalla actual
      bmCamMax = Math.max(0, Math.min(bmWorldW() - W, pl.x - W * 0.42));
    } else {
      // entre oleadas: cámara libre hasta donde haya enemigos por venir
      bmCamMax = bmWorldW() - W;
    }
  } else {
    // oleada activa: ¿quedan vivos?
    const alive = bmEnemies.some(e => e.state !== PSTATE.DEAD);
    // arena bloqueada: el jugador queda confinado a esta pantalla
    pl.x = Math.max(bmCamMax + 50, Math.min(bmCamMax + W - 60, pl.x));
    if (!alive) {
      bmWaveActive = false;
      bmWaveIdx += 1;
      if (bmWaveIdx >= bmStage.waves.length) {
        // jefe caído: no se pasa de etapa aún; hay que avanzar a pie
        if (bmBossDown) { bmBanner = '¡YOKAI ABATIDO!'; bmBannerSub = '→  avanza'; bmBannerT = 3; }
        else bmStageClear();
      } else { bmBanner = 'AVANZA'; bmBannerSub = '→'; bmBannerT = 1.4; }
    }
  }
}

function bmSpawnWave(wave) {
  if (wave.boss) {
    const boss = bmMakeFighter(bmStage.boss, bmCamX + W - 80, -1, true);
    boss.x = Math.min(bmWorldW() - 40, bmCamX + W - 60);
    bmEnemies.push(boss);
    bmBanner = '¡JEFE!';
    bmBannerSub = boss.char.name + '  ' + boss.char.kanji;
    bmBannerT = 2.6;
    sfxBreak && sfxBreak();
    return;
  }
  const list = wave.enemies;
  list.forEach((id, k) => {
    // alterna lados: aparecen entrando por los bordes de la pantalla
    const fromRight = k % 2 === 0;
    const x = fromRight ? bmCamX + W + 30 + k * 26 : bmCamX - 30 - k * 26;
    const f = fromRight ? -1 : 1;
    bmEnemies.push(bmMakeFighter(id, Math.max(20, Math.min(bmWorldW() - 20, x)), f));
  });
}

function bmStageClear() {
  if (bmStageIdx + 1 >= BM_STAGES.length) {
    bmScene = 'win';
    bmEndT = 1.4;
    if (typeof stopMusic === 'function') stopMusic();
  } else {
    // sin pantalla gris: carga directa de la siguiente etapa (su banner anuncia)
    bmLoadStage(bmStageIdx + 1);
    bmScene = 'play';
  }
}

// avanza partículas, textos y estelas (idéntico al duelo, sin tocar 1v1)
function bmStepFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    if (p.gravity) p.vy += 900 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    // sangre del jefe: al tocar el suelo queda como mancha permanente
    if (p.stain && p.y >= GROUND - 2 && p.vy > 0) {
      bmStains.push({ x: p.x, y: GROUND - Math.random() * 4, r: p.size * (0.9 + Math.random()), c: p.color });
      if (bmStains.length > 900) bmStains.shift();
      particles.splice(i, 1);
    }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt; f.y -= 30 * dt;
    if (f.life <= 0) floaters.splice(i, 1);
  }
  for (let i = slashTrails.length - 1; i >= 0; i--) {
    slashTrails[i].life -= dt;
    if (slashTrails[i].life <= 0) slashTrails.splice(i, 1);
  }
}
