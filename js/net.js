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

// Retraso de input del lockstep. Cada cliente envía su input para el tic
// T+NET_DELAY y la simulación de T solo avanza cuando llegó el input del rival
// de ese tic. Si la latencia/jitter de ida supera NET_DELAY*16.7 ms, el buffer
// se vacía y la simulación SE CONGELA esperando al rival (eso es lo que se siente
// como "lentitud"/tirones online). Subirlo da más colchón a costa de un pelín más
// de retraso de input — para conexiones reales a un VPS compartido conviene un
// colchón mayor que 67 ms. DEBE ser idéntico en ambos lados (ver netMaybeStart).
const NET_DELAY = 6;          // tics de retraso de input (~100 ms a 60 Hz)
const NET_MAX_CATCHUP = 8;    // máx tics simulados por frame al ponerse al día tras un stall

let net = null;               // null = sin partida online
let netResult = null;         // resultado del último duelo online (para matchEnd)
let netRank = null;           // ranking en línea: { fase, rows }
let netRematch = null;        // oferta de revancha en matchEnd: { mine, theirs, gone }
let netReplayId = null;       // id del replay publicado del último duelo online

function netActive() { return net !== null && net.fase !== 'error'; }
function netPlaying() { return net !== null && net.fase === 'jugando'; }

const NET_SERVER = 'wss://katana.igorv.org/ws';   // servidor de emparejamiento (VPS)
function netUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;                                // override explícito (?server=)
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '') return 'ws://localhost:8081';  // local / file://
  // servido desde el propio dominio del juego → mismo host
  if (h === 'katana.igorv.org') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  // cualquier OTRO origen (itch.io u otro mirror, donde el juego corre en un
  // iframe ajeno) → el online debe apuntar igual al servidor del VPS
  return NET_SERVER;
}

// base HTTP del servidor del juego (para GET /ranking), espejo de netUrl
function netHttpBase() {
  return netUrl().replace(/^ws/, 'http').replace(/\/ws$/, '');
}

// ---------------- Presencia (aviso de gente en línea) ----------------
// Mientras el jugador está en el título late al servidor para que otros
// que también miran el menú sepan que hay con quién emparejarse. Es solo
// informativo (no toca la simulación), así que el id puede salir de
// Math.random sin afectar la corriente determinista de rnd().
let netPresence = null;        // { presentes, esperando, jugando } o null
const NET_PRES_ID = 'p' + Math.floor(Math.random() * 1e12).toString(36);
let _presNextT = 0;

function pollPresence(t) {
  if (typeof fetch === 'undefined' || t < _presNextT) return;
  _presNextT = t + 5;          // un latido cada 5 s mientras estás en el título
  fetch(netHttpBase() + '/estado?id=' + NET_PRES_ID)
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(d => { netPresence = d; })
    .catch(() => { netPresence = null; });
}

function fetchNetRanking() {
  netRank = { fase: 'cargando', rows: [] };
  fetch(netHttpBase() + '/ranking')
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(rows => { netRank = { fase: 'ok', rows }; })
    .catch(() => { netRank = { fase: 'error', rows: [] }; });
}

// ---------------- Desafío diario (board del servidor) ----------------
// Envía el puntaje del torneo del día (fire-and-forget); el servidor decide
// el día en UTC y guarda el mejor por nombre. Si falla, el juego ni se entera.
function netSubmitDaily(name, score) {
  if (typeof fetch === 'undefined') return;
  fetch(netHttpBase() + '/diario', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score }),
  }).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(d => { if (d && d.top) diarioRank = { fase: 'ok', rows: d.top, day: d.day }; })
    .catch(() => {});
}

function fetchDiario() {
  diarioRank = { fase: 'cargando', rows: [] };
  fetch(netHttpBase() + '/diario')
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(d => { diarioRank = { fase: 'ok', rows: d.top || [], day: d.day }; })
    .catch(() => { diarioRank = { fase: 'error', rows: [] }; });
}

// ambos clientes simulan la misma pelea, así que ambos envían el mismo
// resultado; el servidor lo anota en el ranking cuando los dos coinciden
function netReportResult(winner) {
  if (!netPlaying()) return;
  const side = winner === p1 ? 0 : 1;
  const score = computeNetScore(winner, winner === p1 ? p2 : p1);
  netResult = { side, score, mine: side === net.side };
  // envía también los sellos (gestas) del jugador local: el servidor guardará
  // los del ganador en su entrada del ranking (cosmético, sin afectar el anti-trampa)
  netSend({ t: 'result', winner: side, score, sellos: (save.sellos || []).slice(0, 3) });
}

// ---------------- Salas privadas ----------------
// código de sala en la URL (?sala=KIRI): el mismo enlace sirve para los dos
// amigos — el primero que llega la crea, el segundo empareja
const SALA_URL = (new URLSearchParams(location.search).get('sala') || '')
  .replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8);

// código nuevo de 4 letras (sin caracteres confundibles); es meta-juego,
// no toca la simulación, así que puede salir de Math.random
function nuevaSala() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  let c = '';
  for (let i = 0; i < 4; i++) c += abc[Math.floor(Math.random() * abc.length)];
  return c;
}

// enlace compartible de la sala (para pasarlo por chat)
function salaLink(code) {
  if (!/^https?:/.test(location.protocol)) return '';
  return location.origin + location.pathname + '?sala=' + code;
}

function netConnect(name, code) {
  netResult = null;
  net = {
    ws: null, fase: 'conectando', error: null,
    side: 0, seed: 0, myChar: null, foeChar: null,
    myName: name || 'ANÓNIMO', foeName: '???',
    code: code || null,
    tick: 0, frame: [0, 0], inputs: [new Map(), new Map()],
    rec: [[], []],            // inputs consumidos por tic (para publicar el replay)
    stallT: 0,
  };
  netReplayId = null;
  let ws;
  try { ws = new WebSocket(netUrl()); }
  catch (e) { netFail('no se pudo abrir la conexión'); return; }
  net.ws = ws;
  ws.onopen = () => {
    net.fase = 'buscando';
    // v: versión de la simulación — el servidor no empareja versiones
    // distintas (un bit de diferencia no da error, da OTRA pelea)
    const j = { t: 'join', name: net.myName, v: GAME_VER };
    if (net.code) j.code = net.code;
    netSend(j);
  };
  ws.onerror = () => { if (net && net.fase !== 'jugando') netFail('no se encontró el servidor'); };
  ws.onclose = () => {
    if (net && net.fase !== 'error') {
      if (scene === 'matchEnd') {                         // el duelo ya terminó
        if (netRematch) netRematch.gone = true;           // adiós a la revancha
        netLeave();
        return;
      }
      netFail(net.fase === 'jugando' ? 'se perdió la conexión' : 'el servidor cerró la conexión');
    }
  };
  ws.onmessage = ev => { try { netMsg(JSON.parse(ev.data)); } catch (e) {} };
}

function netSend(m) { if (net && net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(m)); }

function netMsg(m) {
  if (!net) return;
  if (m.t === 'ver') {                // el servidor habla otra versión del juego
    netFail('tu página es de otra era — recárgala (Ctrl+R) para actualizar');
    return;
  }
  if (m.t === 'match') {              // rival encontrado (o revancha): a elegir guerrero
    if (m.v != null && (m.v | 0) !== GAME_VER) {
      netFail('tu página es de otra era — recárgala (Ctrl+R) para actualizar');
      return;
    }
    net.side = m.side;
    net.seed = m.seed >>> 0;
    net.foeName = String(m.foe || '???').slice(0, 12).toUpperCase() || '???';
    net.fase = 'eligiendo';
    // reinicio completo del lockstep: en una revancha quedarían tics e
    // inputs de la partida anterior y las simulaciones divergirían
    net.myChar = null; net.foeChar = null;
    net.tick = 0; net.frame = [0, 0];
    net.inputs = [new Map(), new Map()];
    net.rec = [[], []];
    net.stallT = 0;
    netResult = null; netRematch = null; netReplayId = null;
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
  } else if (m.t === 'rematch') {     // el rival pide revancha
    if (netRematch) { netRematch.theirs = true; sfxSelect(); }
  } else if (m.t === 'replayId') {    // el lado 0 publicó el replay y comparte el id
    netReplayId = String(m.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || null;
  } else if (m.t === 'salaCaduca') {  // nadie llegó a la sala privada
    netFail('nadie llegó a la sala — vuelve a intentarlo');
  } else if (m.t === 'bye') {
    if (scene === 'matchEnd') {                   // duelo ya terminado: sin drama
      if (netRematch) netRematch.gone = true;
      netLeave();
    } else netFail('el rival se desconectó');
  }
}

// pedir revancha desde matchEnd; si el rival ya la pidió, el servidor
// re-empareja al instante con semilla nueva
function netAskRematch() {
  if (!netActive() || !netRematch || netRematch.gone || netRematch.mine) return;
  netRematch.mine = true;
  netSend({ t: 'rematch' });
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

// ---------------- Replays ----------------
// codificación RLE de los streams de input (muy repetitivos): [valor, veces, …]
function rleEncode(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

function rleDecode(rle) {
  const out = [];
  for (let i = 0; i + 1 < rle.length; i += 2) {
    for (let n = 0; n < rle[i + 1]; n++) out.push(rle[i]);
  }
  return out;
}

function replayLink(id) {
  if (!/^https?:/.test(location.protocol)) return '?replay=' + id;
  return location.origin + location.pathname + '?replay=' + id;
}

// al terminar el duelo, el lado 0 publica el replay (semilla + inputs) y
// comparte el id con el rival; es corto gracias al RLE y al determinismo
function netPublishReplay(winnerSide, score) {
  if (!net || net.side !== 0 || typeof fetch === 'undefined') return;
  const data = {
    v: GAME_VER, seed: net.seed,
    chars: [net.myChar, net.foeChar],           // por lado: 0 = yo (soy el lado 0)
    names: [net.myName, net.foeName],
    winner: winnerSide, score,
    inputs: [rleEncode(net.rec[0]), rleEncode(net.rec[1])],
  };
  fetch(netHttpBase() + '/replay', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(d => {
      if (d.ok && d.id) { netReplayId = d.id; netSend({ t: 'replayId', id: d.id }); }
    })
    .catch(() => {});
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
    net.rec[0].push(net.frame[0]);        // memoria del duelo (replay)
    net.rec[1].push(net.frame[1]);
    update(FIXED_DT);
    net.inputs[0].delete(T);
    net.inputs[1].delete(T);
    net.tick++;
    acc -= FIXED_DT;
    steps++;
  }
  return acc;
}
