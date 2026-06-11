'use strict';

// ============================================================
//  IA — comportamiento de la CPU
// ============================================================

function updateAI(p, foe, dt) {
  const out = { left: false, right: false, jump: false, down: false, attack: false, feint: false, guard: false };
  if (p.state === PSTATE.DEAD || roundStartTimer > 0) return out;
  const dist = Math.abs(p.x - foe.x);
  const dirToFoe = foe.x > p.x ? 1 : -1;
  const agresiva = p.bet === 'agresivo' || p.bet === 'desesperado';

  // reacción al windup del rival: bloquear, saltar o contraatacar
  if (foe.state === PSTATE.WINDUP && dist < p.reach * 1.7 && p.aiReact <= 0) {
    p.aiReact = 0.45;
    const roll = Math.random();
    const refl = p.st.reflejos / 40;
    if (roll < 0.30 + refl * 0.35) {
      p.aiGuardHold = 0.25 + Math.random() * 0.3;     // intenta bloquear / parry
    } else if (roll < 0.62) {
      out.jump = true;                                 // esquiva saltando
    } else if (roll < 0.85) {
      out.attack = true;                               // apuesta por el clash
    }
    // si no: se come el corte — la CPU no es perfecta
  }
  p.aiReact -= dt;

  // mantiene la guardia un instante si decidió bloquear
  if (p.aiGuardHold > 0) {
    p.aiGuardHold -= dt;
    out.guard = true;
    return out;
  }

  // rival expuesto: ¡a ejecutar!
  if (foe.state === PSTATE.EXPOSED) {
    if (dist < p.reach * 0.95) { out.attack = true; return out; }
    if (dirToFoe > 0) out.right = true; else out.left = true;
    return out;
  }

  p.aiTimer -= dt;
  if (p.aiTimer <= 0) {
    p.aiTimer = 0.22 + Math.random() * 0.45;
    const r = Math.random();
    const engano = p.st.engano / 40;
    if (dist > p.reach * 1.6) {
      p.aiAction = r < (agresiva ? 0.85 : 0.7) ? 'approach' : (r < 0.9 ? 'wait' : 'retreat');
    } else if (dist > p.reach * 0.9) {
      if (r < 0.30 + (agresiva ? 0.15 : 0)) p.aiAction = 'strike';
      else if (r < 0.45 + engano * 0.3 && destino.id !== 'honor') p.aiAction = 'feint';
      else if (r < 0.65) p.aiAction = 'approach';
      else if (r < 0.85) p.aiAction = 'retreat';
      else p.aiAction = 'guard';
    } else {
      p.aiAction = r < 0.55 ? 'strike' : (r < 0.75 ? 'retreat' : 'feint');
    }
    // postura baja: retrocede y recupera
    if (p.postura < p.posMax * 0.25 && Math.random() < 0.6) p.aiAction = 'retreat';
    // volcán: no te quedes sobre una grieta
    if (stage.id === 'volcan') {
      for (const c of cracks) {
        if (Math.abs(p.x - c.x) < c.w * 0.6 && c.heat > 0.5) p.aiAction = dirToFoe > 0 ? 'approach' : 'retreat';
      }
    }
    // puente: no retrocedas hacia el borde
    if (stage.id === 'puente' && p.aiAction === 'retreat') {
      const nx = p.x - dirToFoe * 40;
      if (nx < W * 0.16 || nx > W * 0.84) p.aiAction = 'guard';
    }
  }

  // balneario: persigue el nivel del rival (subir a la baranda / bajar)
  if (stage.id === 'playa') {
    if (foe.y < p.y - 30 && dist < 150 && p.aiAction === 'approach') out.jump = true;
    if (foe.y > p.y + 30) out.down = true;
  }

  switch (p.aiAction) {
    case 'approach': if (dirToFoe > 0) out.right = true; else out.left = true; break;
    case 'retreat':  if (dirToFoe > 0) out.left = true; else out.right = true; break;
    case 'strike':
      if (dist < p.reach * 1.05) { out.attack = true; p.aiAction = 'wait'; }
      else { if (dirToFoe > 0) out.right = true; else out.left = true; }
      break;
    case 'feint':
      if (dist < p.reach * 1.5) { out.feint = true; p.aiAction = 'wait'; }
      else { if (dirToFoe > 0) out.right = true; else out.left = true; }
      break;
    case 'guard': out.guard = true; break;
    case 'wait': break;
  }
  return out;
}
