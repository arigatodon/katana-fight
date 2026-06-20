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

  // En co-op, el INVITADO no simula: solo interpola los snapshots del host
  // y envía su input. El host (y el modo 1 jugador) corren la simulación.
  if (bmCoop && !bmHost) { bmGuestUpdate(dt); return; }

  // ---- entrada y control de los jugadores ----
  bmConsumeTouchActions();
  for (const p of bmAllPlayers()) bmStepPlayerControl(p, dt);

  // ---- estados + física de jugadores ----
  for (const p of bmAllPlayers()) {
    bmStepState(p, dt);
    bmStepPhysics(p, dt);
  }

  // ---- enemigos ----
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
    if (e.state === PSTATE.DEAD && e.deathT > 1.2 && !e.isBoss) {
      if (e.nid != null) delete bmEnemiesById[e.nid];
      bmEnemies.splice(i, 1);
    }
  }

  // ---- jefe abatido: sangra sin parar hasta que se avanza ----
  if (bmBossDown && bmFallenBoss) bmBleed(bmFallenBoss);

  // ---- respawn de jugadores / game over ----
  for (const p of bmAllPlayers()) {
    if (p.respawnT > 0) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) bmRespawnPlayer(p);
    }
  }
  // game over: sin vidas y todos los jugadores caídos (tras su animación)
  if (bmLives <= 0 && bmAllPlayers().every(p => p.state === PSTATE.DEAD)) {
    bmGameOverPending = true;
    if (bmAllPlayers().every(p => p.deathT > 1.0)) {
      bmScene = 'gameover'; bmEndT = 1.2;
      if (typeof stopMusic === 'function') stopMusic();
    }
  }

  // ---- oleadas y avance ----
  bmUpdateWaves();

  // ---- cámara ----
  // arena fija durante una oleada; entre oleadas sigue a los jugadores vivos
  if (bmWaveActive) bmCamX = bmCamMax;
  else {
    const vivos = bmAllPlayers().filter(p => p.state !== PSTATE.DEAD);
    const ax = vivos.length ? vivos.reduce((s, p) => s + p.x, 0) / vivos.length : bmPlayer.x;
    bmCamX = Math.max(0, Math.min(bmCamMax, ax - W * 0.42));
  }

  // efectos globales (slowmo, shake) reusan los timers del duelo
  if (slowmoTimer > 0) { slowmoTimer -= dt; if (slowmoTimer <= 0) timeScale = 1; }
  if (shake > 0) shake = Math.max(0, shake - dt * 60);

  // partículas / textos / estelas (mismos arrays que el duelo)
  bmStepFx(dt);
  bmStepAmbient(dt);

  // host: transmite el estado al invitado (a ~20 Hz)
  if (bmCoop && bmHost) bmNetHostTick(dt);
}

// control de un jugador: deslizamiento en curso o movimiento sostenido.
// La dirección del LOCAL sale del teclado/táctil; la del compañero (en el host)
// llega por red en p._dir.
function bmStepPlayerControl(p, dt) {
  if (p.slideCd > 0) p.slideCd -= dt;
  if (p.slideT > 0 && p.state === PSTATE.IDLE) {
    p.slideT -= dt;
    p.vx = p.facing * BM_SLIDE_SPEED * Math.max(0.3, p.slideT / BM_SLIDE_DUR);
    if (Math.random() < 0.6) bmSlideDust(p);
  } else if (p.state === PSTATE.IDLE && p.respawnT <= 0) {
    const dir = (p === bmPlayer) ? bmMoveDir() : (p._dir || 0);
    if (dir !== 0) { p.vx = dir * p.speed; p.facing = dir; }
    else p.vx = 0;
  }
}

// acciones táctiles del jugador LOCAL (un flanco cada una); los despachadores
// las dirigen al host o al jugador local según el rol.
function bmConsumeTouchActions() {
  const pl = bmPlayer;
  if (bmTouchAtk) { bmPlayerAttack(); bmTouchAtk = false; }
  if (bmTouchJump) { bmPlayerJump(); bmTouchJump = false; }
  if (bmTouchDash) { bmPlayerSlide(bmMoveDir() || (pl && pl.facing)); bmTouchDash = false; }
  if (bmTouchParry) { bmPlayerParry(); bmTouchParry = false; }
}

// peligros de jefe (onda del kappa, picada del tengu, aplastón): mueven, crecen
// y matan al jugador. La ONDA se salta (solo golpea si estás en el suelo).
function bmStepHazards(dt) {
  for (let i = bmHazards.length - 1; i >= 0; i--) {
    const h = bmHazards[i];
    h.life -= dt;
    h.x += h.vx * dt;
    if (h.grow) h.r += h.grow * dt;
    if (h.life <= 0) { bmHazards.splice(i, 1); continue; }
    for (const pl of bmAllPlayers()) {
      if (!pl || pl.state === PSTATE.DEAD || pl.invT > 0 || pl.parryT > 0) continue;
      const cerca = Math.abs(pl.x - h.x) < h.r;
      const alcanza = h.kind === 'shock' ? pl.onGround : true;   // la onda se esquiva saltando
      if (cerca && alcanza) { bmHitPlayerByHazard(pl, h); break; }
    }
  }
}

function bmRespawnPlayer(p) {
  p.state = PSTATE.IDLE;
  p.stateTimer = 0;
  p.deathT = 0;
  p.vida = VIDA_MAX;
  p.vx = 0; p.vy = 0;
  p.invT = 2.0;
  p.y = GROUND; p.onGround = true;
  // reaparece en el borde izquierdo de la pantalla actual y empuja enemigos
  p.x = bmCamX + 90 + (p === bmMate ? 40 : 0);
  p.facing = 1;
}

// dispara oleadas, bloquea la cámara y detecta etapa superada
function bmUpdateWaves() {
  const pl = bmLeadPlayer();   // el jugador vivo más adelantado marca el avance
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
    // arena bloqueada: los jugadores quedan confinados a esta pantalla
    for (const p of bmAllPlayers()) p.x = Math.max(bmCamMax + 50, Math.min(bmCamMax + W - 60, p.x));
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
