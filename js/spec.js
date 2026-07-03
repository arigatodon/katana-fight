'use strict';

// ============================================================
//  ESPECTADOR — mirar un duelo en línea EN VIVO
//
//  Mismo truco que el replay: al mirón le llegan la semilla y los
//  streams de input de ambos lados (lo ya jugado de golpe, lo nuevo
//  en directo) y su navegador re-simula la pelea entera. La
//  reproducción reusa la maquinaria de replay con `live: true`:
//  si el input de un tic aún no llegó, la simulación ESPERA — jamás
//  rellena con ceros, que sería divergir del duelo real. Es de solo
//  lectura: el servidor descarta todo lo que un mirón envíe.
// ============================================================

let spec = null;   // { ws, fase: conectando|esperando|error, error, seed, names, chars, i }

function specActive() { return spec !== null; }

function specConnect() {
  specLeave();
  spec = { ws: null, fase: 'conectando', error: null,
           seed: 0, names: ['???', '???'], chars: [null, null], i: [[], []] };
  let ws;
  try { ws = new WebSocket(netUrl()); }
  catch (e) { specFail('no se pudo abrir la conexión'); return; }
  spec.ws = ws;
  ws.onopen = () => { spec.fase = 'esperando'; ws.send('{"t":"watch"}'); };
  ws.onerror = () => specFail('no se encontró el servidor');
  ws.onclose = () => { if (spec && spec.ws === ws && spec.fase !== 'error') specEnd(); };
  ws.onmessage = ev => { try { specMsg(JSON.parse(ev.data)); } catch (e) {} };
  scene = 'mirar';
}

// los huecos del stream del servidor (tics de arranque nunca enviados) valen 0
function specInts(a) { return Array.isArray(a) ? a.map(v => v | 0) : []; }

function specMsg(m) {
  if (!spec) return;
  if (m.t === 'watch') {            // el duelo (o su revancha): pasado + datos
    spec.seed = m.seed >>> 0;
    spec.names = [String((m.names && m.names[0]) || '???').slice(0, 12),
                  String((m.names && m.names[1]) || '???').slice(0, 12)];
    spec.chars = [(m.chars && m.chars[0]) || null, (m.chars && m.chars[1]) || null];
    spec.i = [specInts(m.i && m.i[0]), specInts(m.i && m.i[1])];
    replay = null;                  // revancha: reproducción nueva desde cero
    spec.fase = 'esperando';
    scene = 'mirar';
    specMaybeStart();
  } else if (m.t === 'charw') {     // un duelista eligió guerrero
    if (m.s === 0 || m.s === 1) spec.chars[m.s] = m.id;
    specMaybeStart();
  } else if (m.t === 'iw') {        // input en directo de un lado
    if ((m.s === 0 || m.s === 1) && Number.isInteger(m.k) && m.k >= 0 && m.k < 200000) {
      spec.i[m.s][m.k] = m.v | 0;   // spec.i ES replay.inputs (misma referencia)
    }
  } else if (m.t === 'nadaw') {
    specFail('ahora mismo no hay ningún duelo que mirar');
  } else if (m.t === 'byew') {      // los duelistas se fueron
    specEnd();
  }
}

// arranca la re-simulación cuando ya se conocen semilla y ambos guerreros;
// calca replayStart/netMaybeStart para reproducir exactamente la misma pelea
function specMaybeStart() {
  if (!spec || replay || !spec.chars[0] || !spec.chars[1]) return;
  // los primeros NET_DELAY tics nunca viajan por la red: el lockstep los
  // pre-siembra a 0 en ambos clientes (netMaybeStart) — aquí igual, o el
  // mirón de un duelo recién empezado esperaría esos inputs para siempre
  for (let k = 0; k < NET_DELAY; k++) {
    if (spec.i[0][k] == null) spec.i[0][k] = 0;
    if (spec.i[1][k] == null) spec.i[1][k] = 0;
  }
  vsCPU = false; modoFinal = false;
  run = null; runOver = null; runVirtud = null;
  seedRng(spec.seed);
  const byId = id => allChars().find(ch => ch.id === id);
  playerChar = byId(spec.chars[0]) || CHARS[0];
  rivalChar = byId(spec.chars[1]) || CHARS[0];
  replay = { data: { names: spec.names }, inputs: spec.i, tick: 0, speed: 1,
             paused: false, frame: [0, 0], playing: true, live: true };
  scene = 'vs';
  vsTimer = 2.6;
}

function specFail(msg) {
  if (!spec) return;
  spec.fase = 'error';
  spec.error = msg;
  if (spec.ws) { try { spec.ws.close(); } catch (e) {} spec.ws = null; }
  scene = 'mirar';
}

// el directo se cortó (byew o socket cerrado). Lo ya recibido llega hasta
// donde llegó el duelo: se termina de ver como un replay normal — y si el
// duelo quedó a medias, abortAtEnd avisará al agotarse el stream.
function specEnd() {
  if (!spec) return;
  if (spec.ws) { try { spec.ws.close(); } catch (e) {} spec.ws = null; }
  if (replay) {
    replay.live = false;
    replay.abortAtEnd = true;
  } else {
    spec.fase = 'error';
    spec.error = 'los duelistas se retiraron';
    scene = 'mirar';
  }
}

// el stream se agotó sin llegar al final del duelo (lo llama replayStep)
function specAbort() {
  replay = null;
  if (!spec) spec = { ws: null };
  spec.fase = 'error';
  spec.error = 'los duelistas se retiraron a mitad del duelo';
  scene = 'mirar';
}

function specLeave() {
  if (spec && spec.ws) { try { spec.ws.close(); } catch (e) {} spec.ws = null; }
  spec = null;
}

// pantalla de espera / error del mirón (escena 'mirar')
function drawMirar(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText('MIRAR EL DUELO', 30, H * 0.18, '#e8c050');

  const pulse = 1 + Math.sin(t * 3) * 0.06;
  ctx.save();
  ctx.translate(W / 2, H * 0.48);
  ctx.scale(pulse, pulse);
  ctx.textAlign = 'center';
  ctx.font = 'bold 96px serif';
  ctx.shadowColor = '#b03030';
  ctx.shadowBlur = 35;
  ctx.fillStyle = spec && spec.fase === 'error' ? '#886' : '#fff';
  ctx.fillText('観', 0, 30);
  ctx.restore();

  let msg = '';
  if (!spec || spec.fase === 'error') msg = (spec && spec.error) || 'sin conexión';
  else if (spec.fase === 'conectando') msg = 'forjando la conexión…';
  else if (spec.names[0] !== '???') msg = `${spec.names[0]} y ${spec.names[1]} eligen guerrero…`;
  else msg = 'buscando el duelo…';
  const searching = spec && spec.fase !== 'error';
  const dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
  drawCenterText(msg + (searching ? ' ' + dots : ''), 18, H * 0.68,
                 searching ? '#c0b8a8' : '#ff8a7a', 'transparent');
  if (Math.sin(t * 4) > -0.3) {
    drawCenterText(
      searching ? (TOUCH ? 'toca para cancelar' : 'ESC para cancelar')
                : (TOUCH ? 'toca para volver' : 'ENTER para volver'),
      13, H * 0.88, '#776', 'transparent');
  }
}
