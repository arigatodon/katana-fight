'use strict';

// ============================================================
//  IA — comportamiento de la CPU
// ============================================================

function updateAI(p, foe, dt) {
  const out = { left: false, right: false, jump: false, down: false, attack: false, feint: false, guard: false };
  if (p.state === PSTATE.DEAD || roundStartTimer > 0) return out;
  // dojo: el muñeco hace lo que pidió el jugador (salvo en modo LIBRE)
  if (modoDojo && DOJO_MODOS[dojoModo].id !== 'libre') return dojoAI(p, foe, dt);
  const dist = Math.abs(p.x - foe.x);
  const dirToFoe = foe.x > p.x ? 1 : -1;
  const agresiva = p.bet === 'agresivo' || p.bet === 'desesperado';

  // memoria de la kamae del rival (los jefes castigan la kamae plantada)
  if (p.aiFoeKamae !== foe.kamae) { p.aiFoeKamae = foe.kamae; p.aiFoeKamaeT = 0; }
  else p.aiFoeKamaeT = (p.aiFoeKamaeT || 0) + dt;

  // cadena del estilo: si su corte tocó, decide UNA vez por corte si sigue con
  // el siguiente eslabón (la agresiva casi siempre), tras un respiro breve
  if (puedeEncadenar(p)) {
    if (p.aiChainSerial !== p.chainSerial) {
      p.aiChainSerial = p.chainSerial;
      p.aiChainGo = Math.random() < (agresiva ? 0.85 : 0.45 + p.st.corte / 80);
      p.aiChainWait = 0.02 + Math.random() * 0.1;
    }
    p.aiChainWait -= dt;
    if (p.aiChainGo && p.aiChainWait <= 0) { out.attack = true; return out; }
  }
  // kaeshi: el estilo que devuelve tras parar aprovecha la ventana
  if (p.estilo.kaeshi && p.kaeshiT > 0 && canAct(p) && dist < p.reach * 1.1 &&
      Math.random() < 0.25 + p.st.reflejos / 120) {
    out.attack = true;
    return out;
  }

  // reacción al windup del rival: bloquear, neutralizar, saltar o contraatacar
  if (foe.state === PSTATE.WINDUP && dist < p.reach * 1.7 && p.aiReact <= 0) {
    p.aiReact = 0.45;
    const linea = foe.atkKamae != null ? foe.atkKamae : foe.kamae;   // línea del corte que viene
    const roll = Math.random();
    const refl = p.st.reflejos / 40;
    if (roll < 0.30 + refl * 0.35) {
      p.aiGuardHold = 0.25 + Math.random() * 0.3;     // bloquear / parry EN la línea del corte
      p.aiKamae = linea;
    } else if (roll < 0.45 + refl * 0.25) {
      p.aiKamae = KAMAE[linea].neutraliza;             // la kamae que desvía ese corte
    } else if (roll < 0.68) {
      out.jump = true;                                 // esquiva saltando
    } else if (roll < 0.88) {
      out.attack = true;                               // apuesta por el clash
    }
    // si no: se come el corte — la CPU no es perfecta
  }
  p.aiReact -= dt;
  out.kamae = p.aiKamae;

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
    // kamae: jefe castiga la línea plantada; si no, la que contrarresta el
    // corte del rival, la línea favorita del personaje, o variar porque sí
    const jefe = p.char.secret || p.statBoost >= 6;
    const rk = Math.random();
    if (jefe && p.aiFoeKamaeT > 2.2 && foe.state !== PSTATE.GUARD) {
      // el rival lleva rato clavado en una kamae: corta por una línea que
      // esa kamae NO neutraliza
      const libres = [0, 1, 2].filter(L => KAMAE[L].neutraliza !== foe.kamae);
      p.aiKamae = libres[Math.floor(Math.random() * libres.length)];
      p.aiAction = 'strike';
      p.aiFoeKamaeT = 0;
      out.kamae = p.aiKamae;
      return sigueAccion(p, foe, out, dist, dirToFoe);
    }
    if (rk < 0.40 + p.st.reflejos / 160) p.aiKamae = KAMAE[foe.kamae].neutraliza;
    else if (rk < 0.68 && p.kamaeFav != null) p.aiKamae = p.kamaeFav;
    else if (rk < 0.82) p.aiKamae = Math.floor(Math.random() * 3);
    // rival escudado: el corte alto rompe guardias
    if (foe.state === PSTATE.GUARD && r < 0.5) p.aiKamae = 0;
    out.kamae = p.aiKamae;
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

  return sigueAccion(p, foe, out, dist, dirToFoe);
}

// ejecuta la acción decidida (movimiento/golpe/finta/guardia) sobre `out`
function sigueAccion(p, foe, out, dist, dirToFoe) {
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
