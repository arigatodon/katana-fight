'use strict';

// ============================================================
//  FLUJO — torneo arcade, rondas, apuestas, puntaje y ranking
//
//  Torneo (1 jugador): 5 duelos contra rivales al azar y un 6º
//  contra un personaje secreto. Tu guerrero también es al azar
//  y cambia entre pelea y pelea. Si vences al secreto, queda
//  desbloqueado y entra a tu baraja.
// ============================================================

function pickBoss() {
  const locked = SECRET_CHARS.filter(c => !charUnlocked(c));
  return randomFrom(locked.length ? locked : SECRET_CHARS);
}

function startRun(final) {
  vsCPU = true;
  modoFinal = !!final;
  run = { fight: 0, score: 0, boss: pickBoss() };
  runOver = null;
  runUnlocked = null;
  nextFight();
}

function nextFight() {
  run.fight++;
  const isBoss = run.fight === RUN_FIGHTS;
  // tu guerrero es al azar y cambia entre peleas
  playerChar = randomFrom(allChars().filter(charUnlocked));
  rivalChar = isBoss ? run.boss : randomFrom(CHARS.filter(c => c !== playerChar));
  pickVirtudes();
  scene = 'virtud';
}

function start2P() {
  vsCPU = false;
  modoFinal = false;
  run = null;
  runOver = null;
  playerChar = randomFrom(allChars().filter(charUnlocked));
  rivalChar = randomFrom(allChars().filter(c => charUnlocked(c) && c !== playerChar));
  pickVirtudes();
  scene = 'virtud';
}

function pickVirtudes() {
  const pool = VIRTUDES.slice();
  virtudOpts = [];
  for (let i = 0; i < 3; i++) {
    virtudOpts.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  virtudSel = 0;
}

function startMatch() {
  stage = randomFrom(STAGES);
  const v1 = virtudOpts[virtudSel] || null;
  const cpuBoost = run ? (run.fight - 1) * 1.5 : 0;   // el torneo se endurece
  p1 = makePlayer(W * 0.25, 1, playerChar, false, 'JUGADOR 1', v1, 0);
  p2 = makePlayer(W * 0.75, -1, rivalChar, vsCPU, vsCPU ? 'CPU' : 'JUGADOR 2',
                  randomFrom(VIRTUDES), cpuBoost);
  roundNum = 0;
  matchWinner = null;
  ghostRec = null; ghostPlay = null;
  startRoundFlow();
}

function startRoundFlow() {
  roundNum++;
  destino = roundNum === 1 && Math.random() < 0.35
    ? DESTINOS[0]
    : randomFrom(DESTINOS);
  scene = 'destino';
  roundMsgTimer = 2.2;
  betSel = [0, 0];
  betDone = [false, vsCPU];
  if (vsCPU) betSel[1] = Math.floor(Math.random() * 3);
  betReveal = 0;
}

function resetRound() {
  // conserva victorias/virtud/rasgo, restaura cuerpos
  for (const [p, x, f] of [[p1, W * 0.25, 1], [p2, W * 0.75, -1]]) {
    p.x = x; p.y = GROUND; p.vx = 0; p.vy = 0; p.facing = f;
    p.state = PSTATE.IDLE; p.stateTimer = 0;
    p.vida = VIDA_MAX;
    p.bet = APUESTAS[betSel[p === p1 ? 0 : 1]].id;
    deriveAttrs(p);
    p.postura = p.posMax;
    p.onGround = true; p.jumpsUsed = 0; p.deathT = 0;
    p.desespUsed = false;
    p.feintHoldT = 0;
    p.afterimages = [];
  }
  particles = []; slashTrails = []; floaters = []; projectiles = [];
  cracks = []; bellTimer = 3 + Math.random() * 4;
  if (stage.id === 'volcan') spawnCracks();
  timeScale = 1; slowmoTimer = 0; shake = 0; flashTimer = 0;
  roundStartTimer = 2.2;
  // fantasma: reproduce la grabación de la ronda anterior
  if (ghostRec && ghostRec.frames.length > 20) {
    ghostPlay = { frames: ghostRec.frames, i: 0, pal: ghostRec.pal, scale: ghostRec.scale };
  } else ghostPlay = null;
  ghostRec = { frames: [], pal: null };
  scene = 'fight';
}

function spawnCracks() {
  cracks = [];
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    cracks.push({ x: W * (0.2 + Math.random() * 0.6), w: 50 + Math.random() * 40, heat: 0, phase: Math.random() * 10 });
  }
}

function endRound(winner, msg) {
  // guarda la grabación del ganador como fantasma de la próxima ronda
  if (ghostRec && ghostRec.frames.length > 20) snapshotGhostFor(winner);
  else ghostRec = null;
  if (winner.wins >= WIN_ROUNDS) matchWinner = winner;
  scene = 'roundEnd';
  roundMsg = msg;
  roundMsgSub = winner.name + ' gana la ronda';
  roundMsgTimer = matchWinner ? 2.6 : 2.1;
}

// ---------------- Fantasmas del Pasado ----------------
function updateGhost(dt) {
  // graba a ambos; al final de la ronda solo se conserva el ganador
  if (ghostRec) {
    ghostRec.frames.push({
      x1: p1.x, y1: p1.y, f1: p1.facing, s1: p1.state,
      x2: p2.x, y2: p2.y, f2: p2.facing, s2: p2.state,
    });
    if (ghostRec.frames.length > 60 * 30) ghostRec.frames.shift();
  }
  if (ghostPlay) {
    ghostPlay.i++;
    if (ghostPlay.i >= ghostPlay.frames.length) ghostPlay = null;
  }
}

function snapshotGhostFor(winner) {
  if (!ghostRec) return;
  const isP1 = winner === p1;
  ghostRec.frames = ghostRec.frames.map(f => isP1
    ? { x: f.x1, y: f.y1, facing: f.f1, state: f.s1 }
    : { x: f.x2, y: f.y2, facing: f.f2, state: f.s2 });
  ghostRec.pal = winner.pal;
  ghostRec.scale = winner.scale;
}

// ---------------- Apuestas (elección secreta) ----------------
function updateApuesta(dt) {
  if (betReveal > 0) {
    betReveal -= dt;
    if (betReveal <= 0) resetRound();
    return;
  }
  for (const code of keyPressQueue) {
    if (!betDone[0]) {
      if (code === 'KeyA' || code === 'ArrowLeft') { betSel[0] = (betSel[0] + 2) % 3; sfxSelect(); }
      if (code === 'KeyD' || code === 'ArrowRight') { betSel[0] = (betSel[0] + 1) % 3; sfxSelect(); }
      if (code === 'KeyF' || code === 'Enter' || code === 'Space') { betDone[0] = true; sfxConfirm(); }
    } else if (!vsCPU && !betDone[1]) {
      if (code === 'ArrowLeft') { betSel[1] = (betSel[1] + 2) % 3; sfxSelect(); }
      if (code === 'ArrowRight') { betSel[1] = (betSel[1] + 1) % 3; sfxSelect(); }
      if (code === 'KeyK' || code === 'Enter') { betDone[1] = true; sfxConfirm(); }
    }
  }
  keyPressQueue = [];
  for (const tp of tapQueue) {
    const idx = !betDone[0] ? 0 : (!vsCPU && !betDone[1] ? 1 : -1);
    if (idx < 0) break;
    for (let i = 0; i < 3; i++) {
      const bx = W / 2 + (i - 1) * 250;
      if (Math.abs(tp.x - bx) < 115 && Math.abs(tp.y - H * 0.52) < 90) {
        if (betSel[idx] === i) { betDone[idx] = true; sfxConfirm(); }
        else { betSel[idx] = i; sfxSelect(); }
      }
    }
  }
  tapQueue = [];
  if (betDone[0] && betDone[1]) betReveal = 1.4;
}

// ---------------- Puntaje y reputación ----------------
function computeScore(p, foe) {
  let s = 0;
  s += 1000;                                  // victoria
  s += p.stats.perfects * 500;                // rondas sin recibir daño
  s += p.stats.parries * 100;                 // bloqueos perfectos
  if (modoFinal) s += 800;                    // modo Golpe Final
  if (foe.wins === WIN_ROUNDS - 1) s += 400;  // remontada al límite
  s += save.streak * 150;                     // racha
  if (run && run.fight === RUN_FIGHTS) s += 2000;   // venciste al secreto
  return s;
}

function applyReputation(p) {
  const st = p.stats;
  if (st.taken === 0 && st.feints <= 1) save.rep.honor++;
  if (st.feints >= 4) save.rep.astucia++;
  if (st.hits >= 4 || p.bet === 'agresivo') save.rep.ferocidad++;
  if (st.blocks + st.parries >= 3) save.rep.disciplina++;
}

function finishMatch() {
  scene = 'matchEnd';
  const winner = matchWinner;
  if (!run) {              // duelo suelto a 2 jugadores
    pendingScore = null;
    return;
  }
  if (winner === p1) {
    save.totalWins++;
    save.streak++;
    save.bestStreak = Math.max(save.bestStreak, save.streak);
    applyReputation(p1);
    run.score += computeScore(p1, p2);
    if (run.fight === RUN_FIGHTS) {
      runOver = 'champion';
      if (!save.unlocked.includes(run.boss.id)) {
        save.unlocked.push(run.boss.id);
        runUnlocked = run.boss;
      }
    }
  } else {
    save.streak = 0;
    runOver = 'defeat';
  }
  persist();
}

// al salir de matchEnd: seguir el torneo o cerrar la partida
function continueRun() {
  if (run && !runOver) { nextFight(); return; }
  if (run) {
    pendingScore = run.score > 0 ? {
      score: run.score,
      char: 'TORNEO',
      racha: save.streak,
      titulo: currentTitle(),
    } : null;
    run = null;
    if (pendingScore && qualifiesRanking(pendingScore.score)) {
      firmaChars = save.lastFirma.split('').slice(0, 3);
      while (firmaChars.length < 3) firmaChars.push('A');
      firmaPos = 0;
      scene = 'firma';
    } else {
      pendingScore = null;
      scene = 'ranking';
    }
    return;
  }
  scene = 'title';        // 2 jugadores
}

function qualifiesRanking(score) {
  if (save.ranking.length < 10) return true;
  return score > save.ranking[save.ranking.length - 1].score;
}

function submitScore() {
  const firma = firmaChars.join('');
  save.lastFirma = firma;
  save.ranking.push({
    firma,
    score: pendingScore.score,
    char: pendingScore.char,
    fecha: new Date().toLocaleDateString('es'),
    racha: pendingScore.racha,
    titulo: pendingScore.titulo,
  });
  save.ranking.sort((a, b) => b.score - a.score);
  save.ranking = save.ranking.slice(0, 10);
  persist();
  pendingScore = null;
  scene = 'ranking';
}
