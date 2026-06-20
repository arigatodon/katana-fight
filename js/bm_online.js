'use strict';

// ============================================================
//  RED — CO-OP en línea del beat 'em up (KATANA RŌNIN)
//
//  A diferencia del duelo 1v1 (lockstep determinista), el beat 'em up
//  usa Math.random por todas partes y tiene muchas entidades, así que
//  el co-op es AUTORITATIVO POR HOST:
//
//   · El lado 0 (ANFITRIÓN) simula la partida entera (enemigos, IA,
//     peligros, oleadas, puntaje) y transmite SNAPSHOTS a ~20 Hz.
//   · El lado 1 (INVITADO) no simula: envía su input (dirección y
//     acciones) y RENDERIZA lo que recibe, interpolando posiciones
//     para suavizar entre snapshots.
//
//  El servidor solo empareja (cola 'beat' aparte) y reenvía mensajes;
//  ver server/server.js. El modo 1 jugador no se toca.
//  (El ranking del modo vive aparte, en bm_net.js.)
// ============================================================

let bmNet = null;            // { ws, fase, error, myChar, foeChar }
let bmNetFoe = '???';        // nombre del compañero
let bmNetError = '';         // último error (se muestra en el título)
let bmNetErrorT = 0;
let bmCamTarget = 0;         // cámara objetivo (el invitado interpola hacia ella)

// fases: conectando | buscando | eligiendo | esperando | jugando | error
function bmNetActive() { return bmNet !== null && bmNet.fase !== 'error'; }

function bmNetUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (location.protocol === 'https:') return 'wss://' + location.host + '/ws';
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (location.protocol === 'http:' && !local) return 'ws://' + location.host + '/ws';
  return 'ws://localhost:8081';     // desarrollo local o file://
}

function bmNetName() {
  return (typeof save !== 'undefined' && save && save.onlineName) || 'RŌNIN';
}

// ---------------- conexión / emparejamiento ----------------
function bmNetStart() {
  if (typeof WebSocket === 'undefined') { bmNetFail('este navegador no soporta el juego en línea'); return; }
  bmNetError = '';
  bmNet = { ws: null, fase: 'conectando', error: null, myChar: null, foeChar: null };
  let ws;
  try { ws = new WebSocket(bmNetUrl()); }
  catch (e) { bmNetFail('no se pudo abrir la conexión'); return; }
  bmNet.ws = ws;
  bmScene = 'online';
  bmChooseSel = 0;
  ws.onopen = () => { bmNet.fase = 'buscando'; bmNetSend({ t: 'join', name: bmNetName(), mode: 'beat' }); };
  ws.onerror = () => { if (bmNet && bmNet.fase !== 'jugando') bmNetFail('no se encontró el servidor'); };
  ws.onclose = () => {
    if (bmNet && bmNet.fase !== 'error') {
      bmNetFail(bmNet.fase === 'jugando' ? 'el compañero se desconectó' : 'el servidor cerró la conexión');
    }
  };
  ws.onmessage = ev => { try { bmNetMsg(JSON.parse(ev.data)); } catch (e) {} };
}

function bmNetSend(m) {
  if (bmNet && bmNet.ws && bmNet.ws.readyState === 1) bmNet.ws.send(JSON.stringify(m));
}

function bmNetMsg(m) {
  if (!bmNet) return;
  if (m.t === 'match') {                 // compañero encontrado: a elegir guerrero
    bmNetSide = m.side;
    bmNetFoe = String(m.foe || '???').slice(0, 12).toUpperCase() || '???';
    bmCoop = true;
    bmHost = (m.side === 0);
    bmNet.fase = 'eligiendo';
    bmChooseSel = 0;
    bmScene = 'choose';
    sfxConfirm && sfxConfirm();
  } else if (m.t === 'char') {
    bmNet.foeChar = m.id;
    bmNetMaybeStart();
  } else if (m.t === 'bs') {              // snapshot del host → al invitado
    bmApplySnapshot(m);
  } else if (m.t === 'bd') {              // dirección del compañero → al host
    if (bmMate) bmMate._dir = (m.d | 0);
  } else if (m.t === 'ba') {              // acción del compañero → al host
    bmNetApplyMateAction(m.a | 0);
  } else if (m.t === 'bye') {
    bmNetFail('el compañero se desconectó');
  }
}

// el local confirma su guerrero (lo llama la entrada en la escena 'choose')
function bmNetChoose(c) {
  if (!bmNet) return;
  bmNet.myChar = c.id;
  bmNetSend({ t: 'char', id: c.id });
  bmNet.fase = 'esperando';
  bmScene = 'online';
  bmNetMaybeStart();
}

function bmNetMaybeStart() {
  if (!bmNet || !bmNet.myChar || !bmNet.foeChar || bmNet.fase === 'jugando') return;
  bmNet.fase = 'jugando';
  bmNetResetSync();
  bmStartCoop(bmNet.myChar, bmNet.foeChar, bmNetSide);   // arranca igual en ambos lados
}

function bmNetFail(msg) {
  if (bmNet && bmNet.ws) { try { bmNet.ws.close(); } catch (e) {} }
  bmNet = null;
  bmCoop = false; bmHost = false; bmMate = null;
  bmNetError = msg || '';
  bmNetErrorT = 5;
  bmScene = 'title';
  if (typeof stopMusic === 'function') stopMusic();
}

// salir del co-op (volver al título sin error)
function bmNetLeave() {
  if (bmNet && bmNet.ws) { try { bmNet.ws.close(); } catch (e) {} }
  bmNet = null;
  bmCoop = false; bmHost = false; bmMate = null;
}

// ---------------- input del invitado → host ----------------
let bmNetLastDir = 0;
function bmNetSendAction(a) { bmNetSend({ t: 'ba', a: a }); }   // 0 cortar · 1 saltar · 2 dash · 3 parar

function bmNetGuestSendDir() {
  const d = bmMoveDir();
  if (d !== bmNetLastDir) { bmNetLastDir = d; bmNetSend({ t: 'bd', d: d }); }
}

// el host aplica una acción recibida del compañero a bmMate
function bmNetApplyMateAction(a) {
  if (!bmMate) return;
  switch (a) {
    case 0: bmDoAttack(bmMate); break;
    case 1: bmDoJump(bmMate); break;
    case 2: bmDoSlide(bmMate, bmMate._dir || bmMate.facing); break;
    case 3: bmDoParry(bmMate); break;
  }
}

// ---------------- host: construir y transmitir snapshot ----------------
let bmSnapAcc = 0;
const BM_SNAP_EVERY = 3;     // un snapshot cada 3 tics (~20 Hz)

function bmNetResetSync() {
  bmSnapAcc = 0;
  bmNetLastDir = 0;
  bmCamTarget = 0;
  bmEnemiesById = {};
}

function bmNetHostTick(dt) {
  // fuerza el envío en transiciones terminales (win/gameover): tras ellas el
  // host deja de simular, así que este sería el último snapshot que las anuncia.
  const terminal = (bmScene === 'win' || bmScene === 'gameover');
  if (++bmSnapAcc < BM_SNAP_EVERY && !terminal) return;
  bmSnapAcc = 0;
  bmNetSend(bmBuildSnapshot());
}

function bmEncFighter(p) {
  return {
    s: p.side, x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx),
    fc: p.facing, st: p.state, tmr: +(p.stateTimer || 0).toFixed(2),
    dt: +(p.deathT || 0).toFixed(2), inv: p.invT > 0 ? 1 : 0,
    thr: p.attackThrust ? 1 : 0, og: p.onGround ? 1 : 0, sl: p.slideT > 0 ? 1 : 0,
  };
}

function bmEncEnemy(e) {
  return {
    n: e.nid, c: e.char.id, x: Math.round(e.x), y: Math.round(e.y),
    fc: e.facing, st: e.state, dt: +(e.deathT || 0).toFixed(2),
    bo: e.isBoss ? 1 : 0, hp: e.hp, mh: e.maxHp, sc: +(e.scale || 1).toFixed(2),
    thr: e.attackThrust ? 1 : 0, og: e.onGround ? 1 : 0,
  };
}

function bmBuildSnapshot() {
  return {
    t: 'bs',
    cam: Math.round(bmCamX), st: bmStageIdx,
    wv: bmWaveActive ? 1 : 0, bd: bmBossDown ? 1 : 0,
    lv: bmLives, sco: bmScore, ki: bmKills, cb: bmCombo, ml: +bmMult.toFixed(2),
    win: bmScene === 'win' ? 1 : 0, over: bmScene === 'gameover' ? 1 : 0,
    bn: bmBannerT > 0 ? [bmBanner, bmBannerSub, +bmBannerT.toFixed(2)] : null,
    bl: (bmBossDown && bmFallenBoss) ? [Math.round(bmFallenBoss.x), Math.round(bodyCenterY(bmFallenBoss))] : null,
    pl: bmAllPlayers().map(bmEncFighter),
    en: bmEnemies.map(bmEncEnemy),
    hz: bmHazards.map(h => ({ k: h.kind, x: Math.round(h.x), r: Math.round(h.r) })),
  };
}

// ---------------- invitado: aplicar snapshot e interpolar ----------------
function bmApplyFighterState(f, d) {
  f.tx = d.x; f.ty = d.y;                  // posición objetivo (se interpola)
  if (f.x == null) { f.x = d.x; f.y = d.y; }
  f.vx = d.vx || 0; f.facing = d.fc; f.state = d.st;
  f.deathT = d.dt || 0; f.onGround = !!d.og;
  if ('tmr' in d) f.stateTimer = d.tmr;
  if ('thr' in d) f.attackThrust = !!d.thr;
  if ('inv' in d) f.invT = d.inv ? 0.1 : 0;
  if ('sl' in d) f.slideT = d.sl ? 0.1 : 0;
}

function bmApplySnapshot(s) {
  if (bmScene !== 'play') return;          // aún no arrancó (o ya terminó)

  // cambio de etapa: recarga el mundo (recrea jugadores y limpia enemigos)
  if (s.st !== bmStageIdx) bmLoadStage(s.st);

  bmLives = s.lv; bmScore = s.sco; bmKills = s.ki; bmCombo = s.cb; bmMult = s.ml;
  bmWaveActive = !!s.wv; bmBossDown = !!s.bd;
  bmCamTarget = s.cam;
  if (s.bn) { bmBanner = s.bn[0]; bmBannerSub = s.bn[1]; bmBannerT = s.bn[2]; }

  // jugadores (por lado): el mío es el que coincide con bmNetSide
  for (const ps of s.pl) {
    const local = ps.s === bmNetSide;
    let p = local ? bmPlayer : bmMate;
    if (!p) {
      p = bmPlayablePlayer(local ? bmPlayerCharId : bmMateCharId, ps.s, ps.x);
      if (local) bmPlayer = p; else bmMate = p;
    }
    bmApplyFighterState(p, ps);
  }

  // enemigos (por nid): reusa el objeto si ya existe, crea uno si es nuevo
  const seen = new Set();
  for (const es of s.en) {
    seen.add(es.n);
    let e = bmEnemiesById[es.n];
    if (!e) {
      e = bmFakeFighter(es.c, es.x, es.fc, es.sc);
      e.nid = es.n; e.x = es.x; e.y = es.y;
      bmEnemiesById[es.n] = e;
      bmEnemies.push(e);
    }
    e.isBoss = !!es.bo; e.hp = es.hp; e.maxHp = es.mh; e.scale = es.sc;
    bmApplyFighterState(e, es);
  }
  // baja a los que ya no están en el snapshot
  for (let i = bmEnemies.length - 1; i >= 0; i--) {
    const e = bmEnemies[i];
    if (e.nid != null && !seen.has(e.nid)) { delete bmEnemiesById[e.nid]; bmEnemies.splice(i, 1); }
  }

  // peligros (sin interpolar: viven poco)
  bmHazards = s.hz.map(h => ({ kind: h.k, x: h.x, r: h.r, life: 1, maxLife: 1, vx: 0 }));

  // sangre del jefe abatido (visual; el invitado la genera al ritmo del snapshot)
  if (s.bl) bmGuestBleed(s.bl[0], s.bl[1]);

  // fin de partida
  if (s.win && bmScene !== 'win') { bmScene = 'win'; bmEndT = 1.4; if (typeof stopMusic === 'function') stopMusic(); }
  else if (s.over && bmScene !== 'gameover') { bmScene = 'gameover'; bmEndT = 1.2; if (typeof stopMusic === 'function') stopMusic(); }
}

// bucle del invitado: envía input, interpola y avanza efectos visuales
function bmGuestUpdate(dt) {
  bmConsumeTouchActions();          // acciones táctiles del local (se envían al host)
  bmNetGuestSendDir();              // cambios de dirección sostenida

  // interpolación exponencial hacia la posición objetivo del snapshot
  const a = 1 - Math.exp(-dt * 22);
  for (const f of bmEnemies.concat(bmAllPlayers())) {
    if (f.tx == null) continue;
    f.x += (f.tx - f.x) * a;
    f.y += (f.ty - f.y) * a;
    f.bob += dt * (f.onGround && Math.abs(f.vx) > 30 ? 14 : 6);
    if (f.invT > 0) f.invT -= dt;
  }
  bmCamX += (bmCamTarget - bmCamX) * a;

  // efectos puramente visuales (mismos arrays/timers que el host)
  if (slowmoTimer > 0) { slowmoTimer -= dt; if (slowmoTimer <= 0) timeScale = 1; }
  if (shake > 0) shake = Math.max(0, shake - dt * 60);
  bmStepFx(dt);
  bmStepAmbient(dt);
}

// chorro de sangre del jefe abatido en el invitado (solo visual → Math.random)
function bmGuestBleed(x, cy) {
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 34, y: cy + (Math.random() - 0.5) * 24,
      vx: (Math.random() - 0.5) * 140, vy: -120 - Math.random() * 180,
      life: 2.2, maxLife: 2.2,
      color: ['#c01818', '#8e0e0e', '#e03030', '#a01414'][Math.floor(Math.random() * 4)],
      size: 2 + Math.random() * 3.5, gravity: true, stain: true,
    });
  }
}
