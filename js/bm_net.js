'use strict';

// ============================================================
//  RANKING del beat 'em up — envío de puntaje y tabla (HTTP)
//
//  Modo de 1 jugador: el puntaje se confía al cliente (tabla casual,
//  aparte de la del duelo). El servidor lo limita y guarda el mejor
//  por nombre. Ver server.js: POST /beatscore · GET /beatrank.
// ============================================================

let bmRankList = null;     // top recibido del servidor
let bmRankState = '';      // '' | 'loading' | 'ok' | 'error'

// misma idea que net.js: relativo si nos sirve el server; localhost en file://
function bmApiBase() {
  try { return location.protocol === 'file:' ? 'http://localhost:8081' : ''; }
  catch (e) { return ''; }
}

function bmLoadRank() {
  bmRankState = 'loading';
  fetch(bmApiBase() + '/beatrank')
    .then(r => (r.ok ? r.json() : null))
    .then(d => { if (Array.isArray(d)) { bmRankList = d; bmRankState = 'ok'; } else bmRankState = 'error'; })
    .catch(() => { bmRankState = 'error'; });
}

function bmSubmitScore(name, score, kills, stage) {
  bmRankState = 'loading';
  fetch(bmApiBase() + '/beatscore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, score: score, kills: kills, stage: stage }),
  })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { if (d && d.top) { bmRankList = d.top; bmRankState = 'ok'; } else bmRankState = 'error'; })
    .catch(() => { bmRankState = 'error'; });
}
