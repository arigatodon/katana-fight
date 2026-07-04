'use strict';

// ============================================================
//  COMBATE — acciones, golpes, bloqueo, parry, postura, muerte
// ============================================================

function canAct(p) { return p.state === PSTATE.IDLE && roundStartTimer <= 0; }
function isVulnerable(p) { return p.state !== PSTATE.DEAD; }

// cambia la línea de kenjutsu (0 jōdan · 1 chūdan · 2 gedan); se lee en el
// rig (render.js), sin HUD. El destello es visual puro (Math.random ok).
function setKamae(p, k) {
  k = Math.max(0, Math.min(2, k));
  if (k === p.kamae) return;
  p.kamae = k;
  sfxFeint();
  if (typeof particles !== 'undefined') {
    const ky = [-70, -46, -22][k] * p.scale;
    for (let i = 0; i < 4; i++) {
      particles.push({
        x: p.x + p.facing * (14 + Math.random() * 18), y: p.y + ky + (Math.random() - 0.5) * 10,
        vx: p.facing * 40, vy: (Math.random() - 0.5) * 50,
        life: 0.22, maxLife: 0.22, color: 'rgba(220,225,235,0.8)', size: 2, gravity: false,
      });
    }
  }
}

function startAttack(p) {
  if (!canAct(p)) return;
  // el corte nace de la kamae del momento y queda fijado para todo el golpe
  p.atkKamae = p.kamae;
  const K = KAMAE[p.atkKamae];
  const fav = p.kamaeFav === p.atkKamae;
  // iaijutsu: el PRIMER corte de la ronda sale de la vaina — un desenvaine
  // más veloz que muele la postura, pero si falla (al aire o lo detienen)
  // quedas EXPOSED un instante. Cualquier acción de espada (atacar/guardar)
  // desenvaina; solo el primer corte con la hoja aún guardada es iai.
  p.iai = !!p.sheathed;
  p.sheathed = false;
  p.state = PSTATE.WINDUP;
  p.stateTimer = p.windup * K.windupMul * (fav ? 0.88 : 1) * (p.iai ? 0.6 : 1);
  p.atkDmg = p.dmg * K.dmgMul * (fav ? 1.12 : 1);
}

// iai fallido: el desenvaine al aire o cortado en seco deja al samurái
// vendido (EXPOSED) — la ejecución automática castiga el nervio perdido
function failIai(p) {
  p.iai = false;
  p.state = PSTATE.EXPOSED;
  p.stateTimer = 0.5;
  p.vx = -p.facing * 140;
  sfxBreak();
  shake = 8;
  floatText(p.x, bodyCenterY(p) - 52, '¡IAI FALLIDO!', '#ff9040', 18);
  spawnSparks(p.x, bodyCenterY(p));
}

function startFeint(p) {
  if (!canAct(p) || destino.id === 'honor') return;
  p.state = PSTATE.FEINT;
  p.stateTimer = p.feintTime;
  p.stats.feints++;
  sfxFeint();
  if (p.char.afterimage) {
    // El Espectro se desdobla: dos señuelos casi sólidos a ambos flancos del
    // cuerpo real, para que el rival no distinga cuál atacar. Determinista
    // (sin Math.random) para no divergir en el online.
    p.afterimages.push({ x: p.x - p.facing * 36, y: p.y, facing: p.facing, life: 1.2, maxLife: 1.2, bob: p.bob, aMax: 0.62 });
    p.afterimages.push({ x: p.x + p.facing * 42, y: p.y, facing: p.facing, life: 1.2, maxLife: 1.2, bob: p.bob, aMax: 0.62 });
  }
}

function startGuard(p) {
  if (!canAct(p)) return;
  p.sheathed = false;   // desenvainas para bloquear: pierdes el iai (no es corte)
  p.state = PSTATE.GUARD;
  p.guardT = 0;
}

function doJump(p) {
  if (p.char.slide) {
    // Tiburón de Tierra: el salto es un deslizamiento veloz
    if (!canAct(p) || !p.onGround) return;
    p.vx = p.facing * 640;
    p.slideT = 0.22;
    sfxJump();
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: p.x - p.facing * i * 6, y: GROUND - 6,
        vx: -p.facing * 60, vy: -30 - Math.random() * 40,
        life: 0.3, maxLife: 0.3, color: 'rgba(180,150,110,0.6)',
        size: 3 + Math.random() * 3, gravity: false,
      });
    }
    return;
  }
  const maxJumps = p.char.doubleJump ? 2 : 1;
  if (p.onGround) p.jumpsUsed = 0;
  if (p.jumpsUsed >= maxJumps) return;
  if (!p.onGround && !p.char.doubleJump) return;
  let jv = p.jumpVel;
  if (destino.id === 'lluvia') jv *= 0.7;
  if (stage.id === 'playa' && p.y >= GROUND - 1) jv *= 0.85;   // la arena hunde el impulso
  p.vy = jv;
  p.onGround = false;
  p.jumpsUsed++;
  sfxJump();
}

function applyDamage(def, att, dmgRaw) {
  // ¿desesperado? el primer golpe del que apostó mata
  let lethal = oneHitMode();
  if (att.bet === 'desesperado' && !att.desespUsed) { lethal = true; att.desespUsed = true; }

  let dmg = dmgRaw * (def.bet === 'desesperado' ? 1.8 : 1);
  if (def.rasgo && def.rasgo.id === 'sed' && def.vida < 35) dmg *= 0.6;
  if (def.state === PSTATE.EXPOSED) lethal = true;   // ejecución automática

  if (lethal || def.vida - dmg <= 0) {
    // Instinto: sobrevive una vez a un golpe letal
    if (def.virtud && def.virtud.id === 'instinto' && !def.instintoUsed) {
      def.instintoUsed = true;
      def.vida = 1;
      def.state = PSTATE.HITSTUN;
      def.stateTimer = 0.4;
      def.vx = att.facing * 420; def.vy = -200;
      flashTimer = 0.25;
      floatText(def.x, bodyCenterY(def) - 40, '¡INSTINTO!', '#80e8ff', 20);
      sfxThunder();
      return;
    }
    kill(def, att, def.state === PSTATE.EXPOSED);
    return;
  }
  def.vida -= dmg;
  def.postura = Math.max(0, def.postura - dmg * 0.35);
  // iai conectado: el desenvaine muele la postura mucho más de lo normal
  if (att.iai) {
    def.postura = Math.max(0, def.postura - dmg * 0.6);
    floatText(def.x, bodyCenterY(def) - 58, '¡IAI!', '#fff0a0', 17);
    att.iai = false;
  }
  def.state = PSTATE.HITSTUN;
  // gedan barre las piernas: derriba (más aturdimiento y vuelo alto)
  const barrida = KAMAE[att.atkKamae != null ? att.atkKamae : 1].sweep;
  def.stateTimer = barrida ? 0.5 : 0.32;
  def.vx = att.facing * (barrida ? 260 : 330);
  def.vy = barrida ? -320 : -140;
  if (barrida) def.onGround = false;
  att.stats.hits++;
  def.stats.taken += dmg;
  if (att.char.steal) {
    const robo = Math.min(def.postura, 14);
    def.postura -= robo;
    att.postura = Math.min(att.posMax, att.postura + robo);
    floatText(att.x, bodyCenterY(att) - 36, '+postura', '#e8a030', 13);
  }
  sfxHit();
  shake = 9;
  spawnBlood(def.x, bodyCenterY(def), att.facing);      // rocío en el sentido del corte
  floatText(def.x, bodyCenterY(def) - 42, '-' + Math.round(dmg), '#ff6050', 18);
  checkPostureBreak(def);
}

function checkPostureBreak(p) {
  if (p.postura > 0 || p.state === PSTATE.DEAD || p.state === PSTATE.EXPOSED) return;
  p.state = PSTATE.EXPOSED;
  p.stateTimer = p.exposedDur;
  p.vx = 0;
  sfxBreak();
  shake = 12;
  floatText(p.x, bodyCenterY(p) - 56, '¡POSTURA ROTA!', '#ffd040', 20);
  spawnSparks(p.x, bodyCenterY(p));
}

function kill(victim, killer, ejecucion) {
  if (victim.state === PSTATE.DEAD) return;
  victim.state = PSTATE.DEAD;
  victim.stateTimer = 0;
  victim.vida = 0;
  victim.vx = killer.facing * 200;
  victim.vy = -180;
  victim.bloodT = 1.5;            // chorro de sangre mientras yace (estilo samurái)
  killer.wins++;
  if (killer.vida >= VIDA_MAX) killer.stats.perfects++;
  sfxKill();
  shake = 18;
  timeScale = 0.15;
  slowmoTimer = 1.0;
  flashTimer = 0.12;
  spawnParticles(victim.x, bodyCenterY(victim), 40, ['#c01818', '#901010', '#e03030'], 380, 1.2);
  spawnBlood(victim.x, bodyCenterY(victim), killer.facing, 34);   // gran corte: sangre a chorro
  slashTrails.push({
    x1: victim.x - killer.facing * 70, y1: bodyCenterY(victim) - 50,
    x2: victim.x + killer.facing * 70, y2: bodyCenterY(victim) + 40,
    life: 0.8, maxLife: 0.8,
  });
  endRound(killer, ejecucion ? '¡EJECUCIÓN!' : '¡CORTE LIMPIO!');
}

// puente: caer implica derrota
function fallDeath(victim) {
  if (victim.state === PSTATE.DEAD) return;
  const killer = victim === p1 ? p2 : p1;
  victim.state = PSTATE.DEAD;
  victim.vida = 0;
  killer.wins++;
  sfxKill();
  shake = 10;
  endRound(killer, '¡AL VACÍO!');
}

// ---------------- Resolución de golpes ----------------
function tryHit(att, def) {
  if (att.state !== PSTATE.ATTACK || !isVulnerable(def)) return;
  if (att.hitDone) return;
  const dist = Math.abs(att.x - def.x);
  const facingTarget = (def.x - att.x) * att.facing > 0;
  if (!facingTarget) return;
  const heightDiff = Math.abs(bodyCenterY(att) - bodyCenterY(def));
  if (dist > att.reach + 16 || heightDiff > 58 * Math.max(att.scale, def.scale)) return;
  att.hitDone = true;

  // línea del corte y su regla (matriz KAMAE en data.js)
  const K = KAMAE[att.atkKamae != null ? att.atkKamae : 1];
  const dmgCorte = att.atkDmg || att.dmg;
  const defFacing = (att.x - def.x) * def.facing > 0;

  // ¿el defensor bloquea de frente?
  if (def.state === PSTATE.GUARD && defFacing) {
    const enLinea = def.kamae === att.atkKamae;   // la guardia solo cubre SU línea
    if (enLinea && def.guardT <= def.parryWin) {
      // ¡PARRY! (solo en la línea correcta) el atacante queda tambaleando
      att.state = PSTATE.STAGGER;
      att.stateTimer = 0.85 * att.staggerMul;
      att.vx = -att.facing * 300;
      def.postura = Math.min(def.posMax, def.postura + 12);
      def.stats.parries++;
      sfxParry();
      flashTimer = 0.15;
      timeScale = 0.3; slowmoTimer = 0.22;
      shake = 8;
      spawnClash((att.x + def.x) / 2, bodyCenterY(def) - 8);
      floatText(def.x, bodyCenterY(def) - 52, '¡PARRY!', '#80e8ff', 22);
      if (att.iai) failIai(att);   // iai leído y desviado: doblemente castigado
      return;
    }
    if (K.vsGuardia === 'pierde') {
      // gedan contra guardia: cualquier línea lo para y el atacante queda vendido
      att.state = PSTATE.STAGGER;
      att.stateTimer = 0.55 * att.staggerMul;
      att.vx = -att.facing * 260;
      def.stats.blocks++;
      sfxBlock();
      shake = 5;
      spawnSparks((att.x + def.x) / 2, def.y - 16 * def.scale);
      floatText(def.x, bodyCenterY(def) - 46, '¡BARRIDO PARADO!', '#9ad0e8', 15);
      if (att.iai) failIai(att);
      return;
    }
    if (!enLinea) {
      // la guardia estaba en otra línea: el corte entra por el hueco
      applyDamage(def, att, dmgCorte);
      return;
    }
    // bloqueo en línea: sin daño, pierde postura — jōdan la muele (rompe guardia)
    const breakMul = (att.char.breakMul || 1) * (K.breakMul || 1);
    def.postura -= dmgCorte * 0.65 * breakMul;
    // iai contra la guardia: no es corte limpio ni te cortan — muele la
    // guardia aún más, pero no te deja vendido (presionaste, no fallaste)
    if (att.iai) { def.postura -= dmgCorte * 0.5; att.iai = false; }
    def.stats.blocks++;
    def.vx = att.facing * 200;
    sfxBlock();
    shake = 5;
    spawnSparks((att.x + def.x) / 2, bodyCenterY(def) - 8);
    if (att.char.steal) {
      const robo = Math.min(Math.max(0, def.postura), 8);
      def.postura -= robo;
      att.postura = Math.min(att.posMax, att.postura + robo);
    }
    checkPostureBreak(def);
    return;
  }

  // sin guardia: la kamae que contrarresta esta línea (triángulo de data.js)
  // desvía el corte de pie y deja al atacante vendido
  if (def.state === PSTATE.IDLE && defFacing && def.kamae === K.neutraliza && roundStartTimer <= 0) {
    att.state = PSTATE.STAGGER;
    att.stateTimer = 0.5 * att.staggerMul;
    att.vx = -att.facing * 240;
    def.postura = Math.max(0, def.postura - 4);
    sfxClash();
    shake = 6;
    timeScale = 0.5; slowmoTimer = 0.12;
    spawnClash((att.x + def.x) / 2, bodyCenterY(def) + (K.sweep ? 24 : -8));
    floatText(def.x, bodyCenterY(def) - 48, '¡NEUTRALIZADO!', '#b0e8a0', 17);
    if (att.iai) failIai(att);
    return;
  }
  applyDamage(def, att, dmgCorte);
}

function updateCombat() {
  const dist = Math.abs(p1.x - p2.x);
  // choque de aceros: ambos atacando de frente
  const bothSwing =
    (p1.state === PSTATE.ATTACK || p1.state === PSTATE.WINDUP) &&
    (p2.state === PSTATE.ATTACK || p2.state === PSTATE.WINDUP);
  const facingEachOther = p1.x < p2.x ? (p1.facing === 1 && p2.facing === -1) : (p1.facing === -1 && p2.facing === 1);
  if (bothSwing && facingEachOther && dist < Math.max(p1.reach, p2.reach) * 1.6 &&
      (p1.state === PSTATE.ATTACK || p2.state === PSTATE.ATTACK)) {
    sfxClash();
    spawnClash((p1.x + p2.x) / 2, (bodyCenterY(p1) + bodyCenterY(p2)) / 2 - 6);
    shake = 10; timeScale = 0.35; slowmoTimer = 0.18;
    for (const p of [p1, p2]) {
      p.state = PSTATE.STAGGER;
      p.stateTimer = 0.32 * p.staggerMul;
      p.vx = (p.x < (p === p1 ? p2 : p1).x ? -1 : 1) * 360;
      p.vy = -120;
    }
    return;
  }
  tryHit(p1, p2);
  tryHit(p2, p1);
}

// reacción a la finta: si el rival mordió el anzuelo (guardia o ataque), pierde postura
function resolveFeint(f, foe) {
  if (scene !== 'fight' || !foe || foe.state === PSTATE.DEAD) return;
  const d = Math.abs(f.x - foe.x);
  if (d < f.reach * 1.8 && (foe.state === PSTATE.GUARD || foe.state === PSTATE.WINDUP)) {
    foe.postura = Math.max(0, foe.postura - f.feintDrain);
    floatText(foe.x, bodyCenterY(foe) - 40, '¡ENGAÑADO!', '#d080e0', 16);
    sfxFeint();
    checkPostureBreak(foe);
  }
}
