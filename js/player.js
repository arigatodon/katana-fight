'use strict';

// ============================================================
//  JUGADOR — estados, creación y estadísticas derivadas
// ============================================================

const PSTATE = {
  IDLE: 0, WINDUP: 1, ATTACK: 2, RECOVER: 3,
  FEINT: 4, GUARD: 5, STAGGER: 6, HITSTUN: 7,
  EXPOSED: 8, DEAD: 9,
};

// statBoost: pequeño bonus de la CPU según avanza el torneo
function makePlayer(x, facing, char, isCPU, name, virtud, statBoost) {
  const p = {
    x, y: GROUND, vx: 0, vy: 0, facing,
    char, pal: char.pal, name,
    state: PSTATE.IDLE, stateTimer: 0,
    vida: VIDA_MAX, postura: 0,
    wins: 0, isCPU,
    onGround: true, jumpsUsed: 0,
    deathT: 0, guardT: 0,
    bet: null, virtud: virtud || null,
    rasgo: rollRasgo(),
    statBoost: statBoost || 0,
    instintoUsed: false,
    // estadísticas del combate (reputación / puntaje)
    stats: { feints: 0, blocks: 0, parries: 0, hits: 0, taken: 0, perfects: 0 },
    // IA
    aiTimer: 0, aiAction: 'approach', aiReact: 0,
    bob: Math.random() * 10,
    attackHeld: false, feintHeld: false, jumpHeld: false,
    afterimages: [],
  };
  deriveAttrs(p);
  p.postura = p.posMax;
  return p;
}

// Convierte las estadísticas ocultas + virtud + apuesta en valores jugables
function deriveAttrs(p) {
  const s = Object.assign({}, p.char.stats);
  if (p.virtud && p.virtud.mod) for (const k in p.virtud.mod) s[k] = (s[k] || 0) + p.virtud.mod[k];
  if (p.rasgo && p.rasgo.id === 'cuervo') s.postura += 10;
  if (p.statBoost) for (const k in s) s[k] += p.statBoost;
  p.st = s;

  const betSpd = p.bet === 'agresivo' ? 1.15 : p.bet === 'prudente' ? 0.92 : 1;
  p.speed    = (175 + s.agilidad * 4.5) * betSpd;
  p.jumpVel  = -(430 + s.agilidad * 6.5) * (p.char.jumpMul || 1);
  p.windup   = Math.max(0.10, 0.27 - s.corte * 0.004) * (p.char.windupMul || 1) * (p.bet === 'agresivo' ? 0.82 : 1);
  p.recover  = Math.max(0.15, 0.42 - s.corte * 0.005);
  p.dmg      = (22 + s.corte * 0.9) * (p.char.dmgMul || 1);
  p.posMax   = (55 + s.postura * 2.4) * (p.bet === 'prudente' ? 1.35 : p.bet === 'desesperado' ? 0.55 : 1);
  p.posRegen = (6 + s.postura * 0.35) * (p.virtud && p.virtud.id === 'serena' ? 1.7 : 1);
  p.parryWin = (0.08 + s.reflejos * 0.0045) * (p.char.parryMul || 1);
  p.feintTime  = Math.max(0.08, 0.20 - s.engano * 0.003);
  p.feintRec   = Math.max(0.04, 0.18 - s.engano * 0.004);
  p.feintDrain = (9 + s.engano * 0.7) * (p.virtud && p.virtud.id === 'actor' ? 1.5 : 1);
  p.exposedDur = Math.max(0.7, 1.9 - s.espiritu * 0.022) * (p.virtud && p.virtud.id === 'serena' ? 0.75 : 1);
  p.staggerMul = Math.max(0.6, 1 - s.espiritu * 0.008);
  p.reach    = 86 * (p.char.reachMul || 1) * Math.max(1, p.char.scale || 1);
  p.scale    = p.char.scale || 1;
}

function bodyCenterY(p) { return p.y - 46 * p.scale; }
function oneHitMode() { return modoFinal || destino.id === 'sangre'; }
