'use strict';

// ============================================================
//  COMBATE — acciones, golpes, bloqueo, parry, postura, muerte
// ============================================================

function canAct(p) { return p.state === PSTATE.IDLE && roundStartTimer <= 0; }
function isVulnerable(p) { return p.state !== PSTATE.DEAD; }

function startAttack(p) {
  if (!canAct(p)) return;
  p.state = PSTATE.WINDUP;
  p.stateTimer = p.windup;
}

function startFeint(p) {
  if (!canAct(p) || destino.id === 'honor') return;
  p.state = PSTATE.FEINT;
  p.stateTimer = p.feintTime;
  p.stats.feints++;
  sfxFeint();
  if (p.char.afterimage) {
    p.afterimages.push({ x: p.x, y: p.y, facing: p.facing, life: 1.4, maxLife: 1.4, bob: p.bob });
  }
}

function startGuard(p) {
  if (!canAct(p)) return;
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
  def.state = PSTATE.HITSTUN;
  def.stateTimer = 0.32;
  def.vx = att.facing * 330;
  def.vy = -140;
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

  // ¿el defensor bloquea de frente?
  const defFacing = (att.x - def.x) * def.facing > 0;
  if (def.state === PSTATE.GUARD && defFacing) {
    if (def.guardT <= def.parryWin) {
      // ¡PARRY! el atacante queda tambaleando
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
    } else {
      // bloqueo normal: sin daño, pierde postura
      const breakMul = att.char.breakMul || 1;
      def.postura -= att.dmg * 0.65 * breakMul;
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
    }
    return;
  }
  applyDamage(def, att, att.dmg);
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
