'use strict';

// ============================================================
//  UPDATE — física del jugador, bucle de actualización
//  y peligros de cada escenario
// ============================================================

function updatePlayer(p, foe, isP1, dt) {
  const inp = readInput(p, isP1, foe, dt);
  // finta: toque corto (se dispara al soltar) · bloqueo: mantener pulsado
  const holdT = p.feintHoldT || 0;
  const feintTap = p.isCPU
    ? (inp.feint && !p.feintHeld)
    : (!inp.feint && p.feintHeld && holdT < 0.16);
  const guardHold = inp.guard || (inp.feint && holdT >= 0.16);
  p.feintHoldT = inp.feint ? holdT + dt : 0;

  // temporizador de estado
  if (p.stateTimer > 0 && p.state !== PSTATE.GUARD) {
    p.stateTimer -= dt;
    if (p.stateTimer <= 0) {
      switch (p.state) {
        case PSTATE.WINDUP: {
          p.state = PSTATE.ATTACK;
          p.stateTimer = 0.10;
          p.hitDone = false;
          sfxSlash();
          const cy = bodyCenterY(p);
          slashTrails.push({
            x1: p.x + p.facing * 14, y1: cy - 42,
            x2: p.x + p.facing * (p.reach + 14), y2: cy + 16,
            life: 0.22, maxLife: 0.22,
          });
          p.vx = p.facing * 200;
          break;
        }
        case PSTATE.ATTACK:
          p.state = PSTATE.RECOVER;
          p.stateTimer = p.recover;
          break;
        case PSTATE.FEINT:
          p.state = PSTATE.RECOVER;
          p.stateTimer = p.feintRec;
          resolveFeint(p, foe);
          break;
        case PSTATE.EXPOSED:
          p.state = PSTATE.IDLE;
          p.postura = p.posMax * 0.5;
          break;
        case PSTATE.RECOVER:
        case PSTATE.STAGGER:
        case PSTATE.HITSTUN:
          p.state = PSTATE.IDLE;
          break;
      }
    }
  }

  // guardia: se mantiene mientras se sostiene el botón
  if (p.state === PSTATE.GUARD) {
    p.guardT += dt;
    p.postura = Math.max(0, p.postura - dt * 2);   // mantener la guardia desgasta
    if (!guardHold && p.guardT > 0.1) p.state = PSTATE.IDLE;
    if (p.postura <= 0) checkPostureBreak(p);
  }

  // movimiento
  if (p.state === PSTATE.IDLE && roundStartTimer <= 0) {
    let mv = 0;
    if (inp.left) mv -= 1;
    if (inp.right) mv += 1;
    let spd = p.speed;
    if (destino.id === 'furia') spd *= 1.2;
    if (stage.id === 'playa' && p.y >= GROUND - 1) spd *= 0.7;   // la arena frena
    if (stage.id === 'nieve' && p.onGround) {
      p.vx += (mv * spd - p.vx) * Math.min(1, dt * 5);           // hielo: derrapa
    } else {
      p.vx = mv * spd;
    }
    if (mv !== 0) p.facing = mv;
    if (mv === 0) p.facing = foe.x > p.x ? 1 : -1;
    if (inp.jump && !p.jumpHeld) doJump(p);
    // ataque normal = corte (arriba→abajo); abajo + ataque = estocada
    if (inp.attack && !p.attackHeld) { p.attackThrust = !!inp.down; startAttack(p); }
    else if (guardHold) startGuard(p);
    else if (feintTap) startFeint(p);
  } else if (p.state === PSTATE.RECOVER || p.state === PSTATE.STAGGER || p.state === PSTATE.HITSTUN) {
    p.vx *= Math.pow(0.001, dt);
  } else if (p.state === PSTATE.GUARD) {
    let mv = 0;
    if (inp.left) mv -= 1;
    if (inp.right) mv += 1;
    p.vx = mv * p.speed * 0.3;
  } else if (p.state === PSTATE.EXPOSED) {
    p.vx *= Math.pow(0.001, dt);
  }
  if (p.slideT > 0) { p.slideT -= dt; if (p.slideT <= 0 && p.state === PSTATE.IDLE) p.vx *= 0.3; }
  p.attackHeld = inp.attack;
  p.feintHeld = inp.feint;
  p.jumpHeld = inp.jump;

  // viento (destino o tejado) y vaivén de la cubierta (barco)
  if (destino.id === 'viento' || stage.id === 'tejado' || stage.id === 'barco') {
    p.x += windForce * dt;
  }

  // física
  if (!p.onGround || p.vy < 0) p.vy += 1500 * dt;
  const prevY = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  // balneario: la baranda es plataforma — se aterriza cayendo sobre
  // ella (si el salto alcanza) y se baja a la arena apretando abajo
  if (stage.id === 'playa' && p.state !== PSTATE.DEAD && p.vy >= 0 && !inp.down &&
      p.x > BARANDA_X0 && p.x < BARANDA_X1 &&
      prevY <= BARANDA_Y + 0.5 && p.y >= BARANDA_Y) {
    p.y = BARANDA_Y;
    p.vy = 0;
    p.onGround = true;
    p.jumpsUsed = 0;
  } else if (p.y >= groundY(p.x)) {
    const wasAir = !p.onGround;
    p.y = groundY(p.x); p.vy = 0; p.onGround = true; p.jumpsUsed = 0;
    // Sapo Ronin: rebota al aterrizar
    if (wasAir && p.char.bounce && p.state !== PSTATE.DEAD) {
      p.vy = p.jumpVel * 0.45;
      p.onGround = false;
      sfxJump();
    }
  } else if (p.onGround && p.vy >= 0) {
    p.y = groundY(p.x);   // caminando sobre el suelo curvo (puente): pies en la curva
  } else p.onGround = false;

  // zonas marcadas en el editor (escenas.json): plataforma saltable,
  // vacío (caída mortal) y peligro (daño). Aditivo: solo si hay datos.
  const _def = escenasData && escenasData[stage.id];
  if (_def && _def.zonas && p.state !== PSTATE.DEAD && scene === 'fight') {
    for (const z of _def.zonas) {
      const dentro = p.x > z.x0 * W && p.x < z.x1 * W;
      if (z.tipo === 'plataforma') {
        const zy = z.y * H;
        if (p.vy >= 0 && !inp.down && dentro && prevY <= zy + 0.5 && p.y >= zy) {
          p.y = zy; p.vy = 0; p.onGround = true; p.jumpsUsed = 0;
        }
      } else if (z.tipo === 'vacio' && dentro && p.onGround) {
        fallDeath(p); return;
      } else if (z.tipo === 'peligro' && dentro && p.onGround && !p.burnCD) {
        p.burnCD = 0.8;
        p.vida = Math.max(1, p.vida - (z.dmg || 10));
        p.vy = -300; p.onGround = false;
        sfxHit();
        floatText(p.x, bodyCenterY(p), '-' + (z.dmg || 10) + ' ¡PELIGRO!', '#ff8830', 15);
      }
    }
  }

  // límites: en el puente se puede caer
  if (p.state !== PSTATE.DEAD) {
    if (stage.id === 'puente' && scene === 'fight') {
      if ((p.x < W * 0.12 || p.x > W * 0.88) && p.onGround) { fallDeath(p); return; }
      p.x = Math.max(20, Math.min(W - 20, p.x));
    } else {
      p.x = Math.max(30, Math.min(W - 30, p.x));
    }
  }

  // volcán: grietas calientes dañan
  if (stage.id === 'volcan' && p.onGround && p.state !== PSTATE.DEAD && scene === 'fight') {
    for (const c of cracks) {
      if (c.heat > 0.85 && Math.abs(p.x - c.x) < c.w / 2 && !p.burnCD) {
        p.burnCD = 0.8;
        p.vida = Math.max(1, p.vida - 10);
        p.vy = -300; p.onGround = false;
        sfxHit();
        floatText(p.x, bodyCenterY(p), '-10 ¡QUEMA!', '#ff8830', 15);
        spawnParticles(p.x, GROUND, 12, ['#ff9030', '#ffc050', '#d04010'], 220, 0.7);
      }
    }
  }
  if (p.burnCD > 0) p.burnCD -= dt;

  // regeneración de postura
  if (p.state === PSTATE.IDLE && p.postura < p.posMax) {
    p.postura = Math.min(p.posMax, p.postura + p.posRegen * dt);
  }

  // rastro fantasma del Espectro: deja copias tenues mientras se desplaza,
  // para que cueste fijar dónde está el cuerpo real. Es visual (no entra en el
  // hash de determinismo), así que usa Math.random como las partículas.
  if (p.char.afterimage && p.onGround && Math.abs(p.vx) > 50 &&
      p.state !== PSTATE.DEAD && p.afterimages.length < 14 && Math.random() < 0.55) {
    p.afterimages.push({ x: p.x, y: p.y, facing: p.facing, life: 0.4, maxLife: 0.4, bob: p.bob, aMax: 0.3 });
  }

  // rastro eléctrico (rasgo trueno)
  if (p.rasgo && p.rasgo.id === 'trueno' && Math.abs(p.vx) > 60 && Math.random() < 0.3) {
    particles.push({
      x: p.x + (Math.random() - 0.5) * 20, y: p.y - Math.random() * 60 * p.scale,
      vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60,
      life: 0.25, maxLife: 0.25, color: '#80d8ff', size: 2, gravity: false,
    });
  }

  // imágenes falsas del Espectro
  for (let i = p.afterimages.length - 1; i >= 0; i--) {
    p.afterimages[i].life -= dt;
    if (p.afterimages[i].life <= 0) p.afterimages.splice(i, 1);
  }

  if (p.state === PSTATE.DEAD) {
    p.deathT += dt;
    // chorro de sangre a presión hacia arriba mientras el cuerpo yace,
    // como en las películas de samuráis (arquea y cae por gravedad)
    if (p.bloodT > 0) {
      p.bloodT -= dt;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        particles.push({
          x: p.x + (Math.random() - 0.5) * 12,
          y: bodyCenterY(p),
          vx: (Math.random() - 0.5) * 150,
          vy: -360 - Math.random() * 320,
          life: 0.7 + Math.random() * 0.6, maxLife: 1.3,
          color: ['#c01818', '#8e0e0e', '#e03030', '#a01414'][Math.floor(Math.random() * 4)],
          size: 2.5 + Math.random() * 3.5, gravity: true,
        });
      }
    }
  }
  p.bob += dt * 4;
}

// ---------------- Bucle de actualización ----------------
function update(dt) {
  gTime += dt;
  if (slowmoTimer > 0) {
    slowmoTimer -= dt;
    if (slowmoTimer <= 0) timeScale = 1;
  }
  let sdt = dt * timeScale;
  if (destino.id === 'furia' && scene === 'fight') sdt *= 1.25;

  if (shake > 0) shake = Math.max(0, shake - dt * 40);
  if (flashTimer > 0) flashTimer -= dt;
  if (destino.id === 'temblor' && scene === 'fight' && roundStartTimer <= 0) {
    shake = Math.max(shake, 2.5 + Math.sin(gTime * 7) * 1.5);
  }
  if (destino.id === 'oscuridad') darkPulse = (Math.sin(gTime * 3.1) + Math.sin(gTime * 7.7)) * 0.5;

  // viento · el barco se mece despacio de babor a estribor
  windPhase += dt;
  const windy = destino.id === 'viento' || stage.id === 'tejado';
  windForce = windy ? Math.sin(windPhase * 0.5) * 90 + Math.sin(windPhase * 1.7) * 40
            : stage.id === 'barco' ? Math.sin(windPhase * 0.7) * 75
            : 0;

  // ambiente: pétalos
  for (const pt of petals) {
    pt.sway += dt;
    pt.x -= (pt.speed + Math.max(0, -windForce)) * dt;
    pt.x += Math.max(0, windForce) * dt * 1.5;
    pt.y += Math.sin(pt.sway) * 12 * dt + 8 * dt;
    if (pt.x < -10) { pt.x = W + 10; pt.y = Math.random() * H * 0.7; }
    if (pt.x > W + 10) { pt.x = -10; pt.y = Math.random() * H * 0.7; }
    if (pt.y > H) pt.y = -10;
  }
  // lluvia
  if (destino.id === 'lluvia') {
    for (const r of rain) {
      r.y += r.s * dt; r.x -= 60 * dt;
      if (r.y > H) { r.y = -10; r.x = Math.random() * (W + 100); }
    }
  }

  // partículas
  for (let i = particles.length - 1; i >= 0; i--) {
    const pa = particles[i];
    pa.life -= sdt;
    if (pa.life <= 0) { particles.splice(i, 1); continue; }
    if (pa.gravity) pa.vy += 900 * sdt;
    pa.x += pa.vx * sdt;
    pa.y += pa.vy * sdt;
    if (pa.gravity && pa.y > GROUND + 6) { pa.y = GROUND + 6; pa.vy *= -0.3; pa.vx *= 0.6; }
  }
  for (let i = slashTrails.length - 1; i >= 0; i--) {
    slashTrails[i].life -= sdt;
    if (slashTrails[i].life <= 0) slashTrails.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt; f.y -= 36 * dt;
    if (f.life <= 0) floaters.splice(i, 1);
  }

  if (scene === 'vs') {
    vsTimer -= dt;
    if (vsTimer <= 0) startMatch();
    return;
  }
  if (scene === 'destino') {
    roundMsgTimer -= dt;
    if (roundMsgTimer <= 0) scene = 'apuesta';
    return;
  }
  if (scene === 'apuesta') {
    updateApuesta(dt);
    return;
  }
  if (scene === 'bonus') {
    updateBonus(sdt);
    return;
  }
  if (!['fight', 'roundEnd', 'matchEnd'].includes(scene)) return;

  if (roundStartTimer > 0) roundStartTimer -= dt;

  if (scene === 'fight' || scene === 'roundEnd') {
    updatePlayer(p1, p2, true, sdt);
    updatePlayer(p2, p1, false, sdt);
    if (scene === 'fight' && roundStartTimer <= 0) {
      updateCombat();
      updateStageHazards(sdt);
      updateGhost(sdt);
    }
  }

  if (scene === 'roundEnd') {
    roundMsgTimer -= dt;
    if (roundMsgTimer <= 0) {
      if (matchWinner) finishMatch();
      else startRoundFlow();
    }
  }
}

// ---------------- Peligros del escenario ----------------
function updateStageHazards(dt) {
  // templo: campanas que distraen (pulso visual + sonido)
  if (stage.id === 'templo') {
    bellTimer -= dt;
    if (bellTimer <= 0) {
      bellTimer = 4 + rnd() * 5;
      sfxBell();
      flashTimer = Math.max(flashTimer, 0.08);
      darkPulse = 0.5;
    }
  }
  // mercado: los espectadores lanzan objetos
  if (stage.id === 'mercado' && rnd() < dt * 0.35) {
    const fromLeft = rnd() < 0.5;
    projectiles.push({
      x: fromLeft ? -10 : W + 10,
      y: GROUND - 180 - rnd() * 120,
      vx: (fromLeft ? 1 : -1) * (180 + rnd() * 120),
      vy: -60 + rnd() * 60,
      rot: 0, kind: Math.floor(rnd() * 3),
    });
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.vy += 600 * dt;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    pr.rot += dt * 8;
    if (pr.y > GROUND || pr.x < -30 || pr.x > W + 30) {
      if (pr.y > GROUND) spawnParticles(pr.x, GROUND, 6, ['#b09060', '#806040'], 120, 0.4);
      projectiles.splice(i, 1);
      continue;
    }
    for (const p of [p1, p2]) {
      if (p.state === PSTATE.DEAD || p.state === PSTATE.HITSTUN) continue;
      if (Math.abs(pr.x - p.x) < 18 && Math.abs(pr.y - bodyCenterY(p)) < 40 * p.scale) {
        p.state = PSTATE.HITSTUN;
        p.stateTimer = 0.3;
        p.vx = Math.sign(pr.vx) * 200;
        sfxBlock();
        floatText(p.x, bodyCenterY(p) - 40, '¡UF!', '#e8c050', 14);
        projectiles.splice(i, 1);
        break;
      }
    }
  }
  // volcán: las grietas laten
  if (stage.id === 'volcan') {
    for (const c of cracks) c.heat = (Math.sin(gTime * 1.3 + c.phase) + 1) / 2;
  }
}
