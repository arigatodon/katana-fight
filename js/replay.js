'use strict';

// ============================================================
//  REPLAY — reproducción de duelos online grabados
//
//  Gracias al lockstep determinista, un replay es solo la semilla
//  y los inputs de ambos lados: se re-simula la pelea entera en
//  local, tic a tic, igual que la vivieron los duelistas.
//  ?replay=<id> la carga del servidor y la reproduce.
//
//  La secuencia calca netMaybeStart: seedRng(semilla) → escena vs
//  → la simulación consume un input por update(), en el MISMO
//  orden que netPump. Cualquier asimetría con el online rompería
//  la reproducción.
// ============================================================

let replay = null;   // { data, inputs, tick, speed, paused, frame, playing }

function replayActive() { return replay !== null && replay.playing; }

// id en la URL (?replay=xxxx)
const REPLAY_URL = (new URLSearchParams(location.search).get('replay') || '')
  .replace(/[^a-z0-9_-]/gi, '').slice(0, 32);

// al cargar con ?replay=, pedirlo al servidor y arrancar
if (REPLAY_URL && typeof fetch !== 'undefined') {
  fetch(netHttpBase() + '/replay?id=' + REPLAY_URL)
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(d => {
      if (!d || d.ok === false) throw new Error('no encontrado');
      if (d.v !== GAME_VER) { replayFail('este replay es de otra era del juego — versión distinta'); return; }
      replayStart(d);
    })
    .catch(() => replayFail('no se encontró ese duelo (quizá ya fue barrido por el tiempo)'));
}

function replayFail(msg) {
  // reusa la pantalla online para el aviso (ENTER vuelve al título)
  net = { ws: null, fase: 'error', error: msg };
  scene = 'online';
}

function replayStart(d) {
  replay = {
    data: d,
    inputs: [rleDecode(d.inputs[0]), rleDecode(d.inputs[1])],
    tick: 0, speed: 1, paused: false, frame: [0, 0], playing: true,
  };
  // mismo arranque que netMaybeStart: a partir de aquí la simulación
  // reproduce exactamente el duelo grabado
  vsCPU = false; modoFinal = false;
  run = null; runOver = null; runVirtud = null;
  seedRng(d.seed >>> 0);
  const byId = id => allChars().find(ch => ch.id === id);
  playerChar = byId(d.chars[0]) || CHARS[0];
  rivalChar = byId(d.chars[1]) || CHARS[0];
  scene = 'vs';
  vsTimer = 2.6;
}

// avanza la reproducción; espejo de netPump pero leyendo de los arrays
function replayPump(acc) {
  if (replay.paused) return 0;
  let steps = 0;
  const maxSteps = 4 * replay.speed;      // tope de puesta al día por frame
  while (acc >= FIXED_DT && steps < maxSteps) {
    for (let s = 0; s < replay.speed; s++) replayStep();
    acc -= FIXED_DT;
    steps += replay.speed;
  }
  return acc;
}

function replayStep() {
  const T = replay.tick;
  const i0 = replay.inputs[0], i1 = replay.inputs[1];
  replay.frame = [T < i0.length ? i0[T] : 0, T < i1.length ? i1[T] : 0];
  update(FIXED_DT);
  replay.tick++;
  if (scene === 'matchEnd') replay.playing = false;   // el duelo grabado terminó
}

// salir de la reproducción (ESC o al terminar)
function replayLeave() {
  replay = null;
  scene = 'title';
}

// controles del espectador: pausa, velocidad, salir
function replayHandleKey(code) {
  if (code === 'Space' || code === 'KeyP') { replay.paused = !replay.paused; sfxSelect(); return true; }
  if (code === 'KeyV') { replay.speed = replay.speed === 1 ? 2 : 1; sfxSelect(); return true; }
  if (code === 'Escape') { sfxConfirm(); replayLeave(); return true; }
  return false;
}

// letrero del modo replay (se dibuja encima de la pelea)
function drawReplayOverlay(t) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillStyle = replay.paused ? '#e8c050' : '#9ad0e8';
  const estado = replay.paused ? '⏸ PAUSA' : `▶ ×${replay.speed}`;
  ctx.fillText(`再生 REPLAY ${estado}`, W / 2, 18);
  ctx.font = '11px "Courier New", monospace';
  ctx.fillStyle = '#998';
  ctx.fillText(TOUCH ? 'toca: pausa · mantén: salir' : 'ESPACIO pausa · V velocidad · ESC salir', W / 2, 34);
  ctx.textAlign = 'left';
}
