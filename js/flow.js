'use strict';

// ============================================================
//  FLUJO — torneo arcade, rondas, apuestas, puntaje y ranking
//
//  Torneo (1 jugador): eliges tu guerrero y un don al inicio,
//  y peleas 5 duelos contra rivales al azar y un 6º contra un
//  personaje secreto. Si vences al secreto, queda desbloqueado
//  y entra a tu baraja. Destino y apuestas van al azar y se
//  muestran en pantalla: el foco está en la pelea.
// ============================================================

function pickBoss() {
  const locked = SECRET_CHARS.filter(c => !charUnlocked(c));
  return randomFrom(locked.length ? locked : SECRET_CHARS);
}

function startRun(final) {
  vsCPU = true;
  modoFinal = !!final;
  comentarioEnviado = false;     // un comentario por torneo (ui.js)
  fetchWeather();                // el clima real influirá en los destinos
  run = { fight: 0, score: 0, boss: pickBoss() };
  runOver = null;
  runUnlocked = null;
  runVirtud = null;
  chooseSel = 0;
  choosingP = 0;
  scene = 'choose';
}

function nextFight() {
  run.fight++;
  const isBoss = run.fight === RUN_FIGHTS;
  // tu guerrero se mantiene todo el torneo; el rival cambia al azar
  rivalChar = isBoss ? run.boss : randomFrom(CHARS.filter(c => c !== playerChar));
  scene = 'vs';
  vsTimer = 2.6;
}

function start2P() {
  vsCPU = false;
  modoFinal = false;
  fetchWeather();
  run = null;
  runOver = null;
  runVirtud = null;
  chooseSel = 0;
  choosingP = 0;
  scene = 'choose';
}

// ---------------- Selección de personaje ----------------
function choosePool() { return allChars().filter(charUnlocked); }

const CHOOSE_COLS = 5;
function chooseCell(i) {
  const col = i % CHOOSE_COLS, row = Math.floor(i / CHOOSE_COLS);
  return { x: W / 2 + (col - 2) * 180, y: 168 + row * 118 };
}

function confirmChoose() {
  const c = choosePool()[chooseSel];
  sfxConfirm();
  if (netActive()) { netChoose(c); return; }
  if (vsCPU) {
    playerChar = c;
    pickVirtudes();
    scene = 'virtud';
    return;
  }
  if (choosingP === 0) {        // 2 jugadores: elige J1 y luego J2
    playerChar = c;
    choosingP = 1;
    chooseSel = 0;
  } else {
    rivalChar = c;
    scene = 'vs';
    vsTimer = 2.4;
  }
}

function pickVirtudes() {
  const pool = VIRTUDES.slice();
  virtudOpts = [];
  for (let i = 0; i < 3; i++) {
    virtudOpts.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }
  virtudSel = 0;
}

function startMatch() {
  // relojes de simulación a cero: el viento y el calor de las grietas
  // dependen de ellos, y online ambos clientes deben partir iguales
  gTime = 0; windPhase = 0; timeScale = 1; slowmoTimer = 0;
  shake = 0; flashTimer = 0; darkPulse = 0;
  stage = randomFrom(STAGES);
  // torneo: el don elegido al inicio · 2 jugadores: dones al azar
  const v1 = vsCPU ? runVirtud : randomFrom(VIRTUDES);
  const cpuBoost = run ? (run.fight - 1) * 1.5 : 0;   // el torneo se endurece
  p1 = makePlayer(W * 0.25, 1, playerChar, false, 'JUGADOR 1', v1, 0);
  p2 = makePlayer(W * 0.75, -1, rivalChar, vsCPU, vsCPU ? 'CPU' : 'JUGADOR 2',
                  randomFrom(VIRTUDES), cpuBoost);
  if (netActive()) {           // online: el lado rojo es el jugador 0
    p1.name = net.side === 0 ? net.myName + ' (TÚ)' : net.foeName;
    p2.name = net.side === 1 ? net.myName + ' (TÚ)' : net.foeName;
  }
  roundNum = 0;
  matchWinner = null;
  ghostRec = null; ghostPlay = null;
  startRoundFlow();
}

function startRoundFlow() {
  roundNum++;
  // clima real (solo local): online no se consume rnd() en la condición,
  // así ambos clientes sacan el destino de la misma corriente del RNG
  destinoPorClima = false;
  if (!netActive() && clima && rnd() < 0.45) {
    destino = DESTINOS.find(d => d.id === clima.destinoId) || DESTINOS[0];
    destinoPorClima = true;
  } else {
    destino = roundNum === 1 && rnd() < 0.35
      ? DESTINOS[0]
      : randomFrom(DESTINOS);
  }
  scene = 'destino';
  roundMsgTimer = 2.2;
  // la suerte reparte las apuestas: al azar pero visibles en pantalla
  betSel = [Math.floor(rnd() * 3), Math.floor(rnd() * 3)];
  betReveal = 1.8;
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
  cracks = []; bellTimer = 3 + rnd() * 4;
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
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    cracks.push({ x: W * (0.2 + rnd() * 0.6), w: 50 + rnd() * 40, heat: 0, phase: rnd() * 10 });
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

// ---------------- Apuestas (al azar, solo se revelan) ----------------
function updateApuesta(dt) {
  betReveal -= dt;
  if (betReveal <= 0) resetRound();
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

// puntaje de un duelo online: solo términos que ambos clientes calculan
// igual (nada de rachas ni torneo locales) — el servidor exige que coincidan
function computeNetScore(p, foe) {
  let s = 1000;                               // victoria
  s += p.stats.perfects * 500;                // rondas sin recibir daño
  s += p.stats.parries * 100;                 // bloqueos perfectos
  if (foe.wins === WIN_ROUNDS - 1) s += 400;  // remontada al límite
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
  if (netActive()) {       // online: el resultado va al ranking del servidor
    netReportResult(winner);
    pendingScore = null;
    return;
  }
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
  if (run) { enterApoyo(); return; }   // torneo terminado: gracias + donar/comentar
  scene = 'title';        // 2 jugadores
}

// cierre del torneo (desde la pantalla de apoyo): puntaje, firma y ranking
function finishRunScore() {
  if (run) {
    pendingScore = run.score > 0 ? {
      score: run.score,
      cat: modoFinal ? 'final' : 'torneo',   // cada modo tiene su tabla
      racha: save.streak,
      titulo: currentTitle(),
    } : null;
    run = null;
    if (pendingScore && qualifiesRanking(pendingScore.score, pendingScore.cat)) {
      firmaChars = save.lastFirma.split('').slice(0, 3);
      while (firmaChars.length < 3) firmaChars.push('A');
      firmaPos = 0;
      scene = 'firma';
    } else {
      rankTab = pendingScore ? RANK_TABS.findIndex(tb => tb.id === pendingScore.cat) : 0;
      pendingScore = null;
      scene = 'ranking';
    }
    return;
  }
  scene = 'title';
}

function qualifiesRanking(score, cat) {
  const tabla = save.rankings[cat];
  if (tabla.length < 10) return true;
  return score > tabla[tabla.length - 1].score;
}

function submitScore() {
  const firma = firmaChars.join('');
  save.lastFirma = firma;
  const tabla = save.rankings[pendingScore.cat];
  tabla.push({
    firma,
    score: pendingScore.score,
    fecha: new Date().toLocaleDateString('es'),
    racha: pendingScore.racha,
    titulo: pendingScore.titulo,
  });
  tabla.sort((a, b) => b.score - a.score);
  save.rankings[pendingScore.cat] = tabla.slice(0, 10);
  persist();
  rankTab = RANK_TABS.findIndex(tb => tb.id === pendingScore.cat);
  pendingScore = null;
  scene = 'ranking';
}
