'use strict';

// ============================================================
//  RED — emparejamiento online y lockstep de inputs
//
//  Lockstep con retraso: cada cliente envía SOLO sus botones
//  para el tic T+NET_DELAY, y la simulación avanza el tic T
//  cuando tiene los inputs de ambos lados. Con el timestep fijo
//  (main.js) y el RNG con semilla compartida (core.js), los dos
//  navegadores calculan exactamente la misma pelea.
// ============================================================

const NET_DELAY = 4;          // tics de retraso de input (~67 ms a 60 Hz)
const NET_MAX_CATCHUP = 5;    // máx tics simulados por frame al ponerse al día

let net = null;               // null = sin partida online
let netResult = null;         // resultado del último duelo online (para matchEnd)
let netRank = null;           // ranking en línea: { fase, rows }

function netActive() { return net !== null && net.fase !== 'error'; }
function netPlaying() { return net !== null && net.fase === 'jugando'; }

function netUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (location.protocol === 'https:') return 'wss://' + location.host + '/ws';
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (location.protocol === 'http:' && !local) return 'ws://' + location.host + '/ws';
  return 'ws://localhost:8081';     // desarrollo local o file:// → node server.js
}

// base HTTP del servidor del juego (para GET /ranking), espejo de netUrl
function netHttpBase() {
  return netUrl().replace(/^ws/, 'http').replace(/\/ws$/, '');
}

function fetchNetRanking() {
  netRank = { fase: 'cargando', rows: [] };
  fetch(netHttpBase() + '/ranking')
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(rows => { netRank = { fase: 'ok', rows }; })
    .catch(() => { netRank = { fase: 'error', rows: [] }; });
}

// ambos clientes simulan la misma pelea, así que ambos envían el mismo
// resultado; el servidor lo anota en el ranking cuando los dos coinciden
function netReportResult(winner) {
  if (!netPlaying()) return;
  const side = winner === p1 ? 0 : 1;
  const score = computeNetScore(winner, winner === p1 ? p2 : p1);
  netResult = { side, score, mine: side === net.side };
  netSend({ t: 'result', winner: side, score });
}

function netConnect(name) {
  netResult = null;
  net = {
    ws: null, fase: 'conectando', error: null,
    side: 0, seed: 0, myChar: null, foeChar: null,
    myName: name || 'ANÓNIMO', foeName: '???',
    tick: 0, frame: [0, 0], inputs: [new Map(), new Map()],
    stallT: 0,
  };
  let ws;
  try { ws = new WebSocket(netUrl()); }
  catch (e) { netFail('no se pudo abrir la conexión'); return; }
  net.ws = ws;
  ws.onopen = () => { net.fase = 'buscando'; netSend({ t: 'join', name: net.myName }); };
  ws.onerror = () => { if (net && net.fase !== 'jugando') netFail('no se encontró el servidor'); };
  ws.onclose = () => {
    if (net && net.fase !== 'error') {
      if (scene === 'matchEnd') { netLeave(); return; }   // el duelo ya terminó
      netFail(net.fase === 'jugando' ? 'se perdió la conexión' : 'el servidor cerró la conexión');
    }
  };
  ws.onmessage = ev => { try { netMsg(JSON.parse(ev.data)); } catch (e) {} };
}

function netSend(m) { if (net && net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(m)); }

function netMsg(m) {
  if (!net) return;
  if (m.t === 'match') {              // rival encontrado: a elegir guerrero
    net.side = m.side;
    net.seed = m.seed >>> 0;
    net.foeName = String(m.foe || '???').slice(0, 12).toUpperCase() || '???';
    net.fase = 'eligiendo';
    vsCPU = false; modoFinal = false;
    run = null; runOver = null; runVirtud = null;
    chooseSel = 0; choosingP = 0;
    scene = 'choose';
    sfxConfirm();
  } else if (m.t === 'char') {
    net.foeChar = m.id;
    netMaybeStart();
  } else if (m.t === 'i') {
    net.inputs[1 - net.side].set(m.k, m.v);
  } else if (m.t === 'bye') {
    if (scene === 'matchEnd') netLeave();         // duelo ya terminado: sin drama
    else netFail('el rival se desconectó');
  }
}

// el jugador local confirmó su guerrero (lo llama confirmChoose)
function netChoose(c) {
  net.myChar = c.id;
  netSend({ t: 'char', id: c.id });
  net.fase = 'esperando';
  scene = 'online';
  netMaybeStart();
}

function netMaybeStart() {
  if (!net || !net.myChar || !net.foeChar || net.fase === 'jugando') return;
  net.fase = 'jugando';
  net.tick = 0;
  for (let k = 0; k < NET_DELAY; k++) { net.inputs[0].set(k, 0); net.inputs[1].set(k, 0); }
  seedRng(net.seed);                  // a partir de aquí, misma pelea en ambos lados
  const byId = id => allChars().find(ch => ch.id === id);
  playerChar = byId(net.side === 0 ? net.myChar : net.foeChar);   // p1 = lado 0
  rivalChar  = byId(net.side === 0 ? net.foeChar : net.myChar);
  scene = 'vs';
  vsTimer = 2.6;
}

function netFail(msg) {
  if (!net) return;
  net.fase = 'error';
  net.error = msg;
  if (net.ws) { try { net.ws.close(); } catch (e) {} net.ws = null; }
  scene = 'online';
}

function netLeave() {
  if (net && net.ws) { try { net.ws.close(); } catch (e) {} }
  net = null;
}

function netLeave2Title() { netLeave(); scene = 'title'; }

// ---------------- Lockstep ----------------
function packLocalInput() {
  // teclas remapeables del J1 (solo cambia la lectura local;
  // los bits del protocolo son fijos para ambos clientes)
  const m = save.keymap.p1;
  let v = 0;
  if (keys[m.left] || touchState.left) v |= 1;
  if (keys[m.right] || touchState.right) v |= 2;
  if (keys[m.jump] || (keys['Space'] && keymapLibre('Space')) || touchState.jump) v |= 4;
  if (keys[m.attack] || touchState.attack) v |= 8;
  if (keys[m.feint] || touchState.feint) v |= 16;
  if (keys[m.down] || touchState.down) v |= 32;     // bajar de la baranda
  return v;
}

function unpackInput(v) {
  return {
    left: !!(v & 1), right: !!(v & 2), jump: !!(v & 4),
    attack: !!(v & 8), feint: !!(v & 16), down: !!(v & 32), guard: false,
  };
}

// avanza la simulación tantos tics como permitan dtAcc y los
// inputs recibidos del rival; devuelve el dtAcc restante
function netPump(acc, realDt) {
  const mine = net.inputs[net.side], theirs = net.inputs[1 - net.side];
  let steps = 0;
  while (acc >= FIXED_DT && steps < NET_MAX_CATCHUP) {
    const T = net.tick;
    if (!mine.has(T + NET_DELAY)) {       // muestrea y envía el input local
      const v = packLocalInput();
      mine.set(T + NET_DELAY, v);
      netSend({ t: 'i', k: T + NET_DELAY, v });
    }
    if (!theirs.has(T)) {                 // aún sin el input del rival: espera
      net.stallT += realDt;
      return Math.min(acc, FIXED_DT * 2); // no acumular un retraso enorme
    }
    net.stallT = 0;
    net.frame = [net.inputs[0].get(T), net.inputs[1].get(T)];
    update(FIXED_DT);
    net.inputs[0].delete(T);
    net.inputs[1].delete(T);
    net.tick++;
    acc -= FIXED_DT;
    steps++;
  }
  return acc;
}
