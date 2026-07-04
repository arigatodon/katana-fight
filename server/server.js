'use strict';

// ============================================================
//  KATANA FIGHT — servidor de emparejamiento y relé
//
//  Cola simple: el primer jugador que llega espera; cuando llega
//  el segundo, se emparejan y el servidor reparte lados (0/1) y
//  una semilla compartida. A partir de ahí solo reenvía mensajes
//  entre los dos: la pelea se simula en los navegadores.
//
//  El mismo proceso sirve el juego estático (index.html + js/),
//  así un solo contenedor basta para todo el despliegue.
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8081;
const ROOT = path.join(__dirname, '..');
// Versión de la simulación/protocolo del duelo — DEBE coincidir con GAME_VER
// (js/core.js). Un cliente de otra versión (página cacheada) calcularía OTRA
// pelea en el lockstep, así que no se empareja: recibe {t:'ver'} y se cierra.
const PROTO_VER = 2;
// herramientas de edición (listar/guardar/generar) solo en local, nunca en el
// contenedor de producción
const DEV = process.env.NODE_ENV !== 'production';

// ---------------- Ranking en línea ----------------
// Cada duelo terminado suma al ranking global, guardado en disco
// (en producción /app/server/data es un volumen: sobrevive deploys).
// Ambos clientes simulan la misma pelea y reportan el resultado;
// solo se anota cuando los dos coinciden, así un cliente tramposo
// no puede inventarse victorias.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const RANK_FILE = path.join(DATA_DIR, 'ranking.json');
const MAX_SCORE = 10000;      // tope por duelo: nada legítimo supera esto

let ranking = {};             // nombre → { pts, wins, losses, streak, best }
try { ranking = JSON.parse(fs.readFileSync(RANK_FILE, 'utf8')); } catch (e) {}

function saveRanking() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(RANK_FILE, JSON.stringify(ranking));
  } catch (e) { console.error('no se pudo guardar el ranking:', e.message); }
}

function rankEntry(name) {
  return ranking[name] || (ranking[name] = { pts: 0, wins: 0, losses: 0, streak: 0, best: 0 });
}

function topRanking(n) {
  return Object.entries(ranking)
    .map(([name, r]) => ({ name, ...r }))
    // ordena por mejor racha y, a igualdad de racha, por puntos
    .sort((a, b) => (b.best - a.best) || (b.pts - a.pts))
    .slice(0, n);
}

function recordResult(ws, raw) {
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  const match = ws.match;
  if (!match || match.recorded) return;
  match.reports[ws.side] = {
    winner: m.winner === 1 ? 1 : 0,
    score: Math.max(0, Math.min(MAX_SCORE, Math.floor(+m.score) || 0)),
    // sellos (ids de gestas) del reportante: cosméticos, sin afectar el
    // anti-trampa; se guardan solo los del ganador (el cliente los mapea a kanji)
    sellos: Array.isArray(m.sellos) ? m.sellos.slice(0, 3).map(s => String(s).slice(0, 16)) : [],
  };
  const [r0, r1] = match.reports;
  if (!r0 || !r1 || r0.winner !== r1.winner) return;   // falta el otro, o discrepan
  match.recorded = true;
  const winName = match.names[r0.winner];
  const loseName = match.names[1 - r0.winner];
  const pts = Math.min(r0.score, r1.score);
  const w = rankEntry(winName);
  w.pts += pts; w.wins++; w.streak++;
  w.best = Math.max(w.best, w.streak);
  w.sellos = match.reports[r0.winner].sellos || [];   // sellos del ganador
  const l = rankEntry(loseName);
  l.losses++; l.streak = 0;
  saveRanking();
  console.log(new Date().toISOString(), `duelo anotado: ${winName} vence a ${loseName} (+${pts} pts)`);
}
// ---------------- Ranking del beat 'em up (KATANA RŌNIN) ----------------
// Modo de 1 jugador: NO hay un segundo cliente con qué verificar, así que el
// puntaje se confía al cliente. Es una tabla CASUAL aparte de la del duelo;
// solo se limita con un tope y antiabuso por IP. Guarda el mejor por nombre.
const BEAT_RANK_FILE = path.join(DATA_DIR, 'beat_ranking.json');
const MAX_BEAT_SCORE = 200000;       // tope sano para una partida completa
let beatRanking = {};                // nombre → { score, kills, stage, fecha }
try { beatRanking = JSON.parse(fs.readFileSync(BEAT_RANK_FILE, 'utf8')); } catch (e) {}
const lastBeatByIp = new Map();      // antiabuso: 1 envío por IP cada 3 s

function saveBeatRanking() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BEAT_RANK_FILE, JSON.stringify(beatRanking));
  } catch (e) { console.error('no se pudo guardar el ranking beat:', e.message); }
}

function topBeat(n) {
  return Object.entries(beatRanking)
    .map(([name, r]) => ({ name, ...r }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function postBeatScore(req, res) {
  let body = '';
  req.on('data', ch => { body += ch; if (body.length > 2048) req.destroy(); });
  req.on('end', () => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim();
    if (Date.now() - (lastBeatByIp.get(ip) || 0) < 3000) {
      res.writeHead(429, CORS_JSON); res.end(JSON.stringify({ ok: false, top: topBeat(10) })); return;
    }
    lastBeatByIp.set(ip, Date.now());
    let m; try { m = JSON.parse(body); } catch (e) { m = null; }
    const name = String((m && m.name) || '').replace(/[^\p{L}\p{N} _.-]/gu, '')
      .trim().slice(0, 12).toUpperCase() || 'RŌNIN';
    const score = Math.max(0, Math.min(MAX_BEAT_SCORE, Math.floor(+(m && m.score)) || 0));
    const kills = Math.max(0, Math.min(99999, Math.floor(+(m && m.kills)) || 0));
    const stage = Math.max(0, Math.min(5, Math.floor(+(m && m.stage)) || 0));
    if (score > 0) {
      const cur = beatRanking[name];
      if (!cur || score > cur.score) {
        beatRanking[name] = { score, kills, stage, fecha: new Date().toISOString().slice(0, 10) };
        saveBeatRanking();
        console.log(new Date().toISOString(), `beat: ${name} → ${score} pts (etapa ${stage}, ${kills} bajas)`);
      }
    }
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify({ ok: true, top: topBeat(10) }));
  });
}

// ---------------- Desafío diario (KATANA FIGHT del día) ----------------
// Torneo idéntico para todos, derivado de la fecha UTC en el cliente. El
// board es por día: { 'YYYYMMDD': { nombre → { score } } }. Como es 1 jugador,
// el score se confía al cliente (igual que el beat), con un tope sano y un
// solo registro por nombre+día (se guarda el mejor). El SERVIDOR decide el
// día en UTC — no confía en la fecha del cliente. Rota a medianoche UTC.
const DAILY_FILE = path.join(DATA_DIR, 'diario.json');
const MAX_DAILY_SCORE = 50000;       // 6 duelos con bonos; nada legítimo lo supera
const DAILY_KEEP_DAYS = 14;          // conserva ~2 semanas de historial
let diario = {};                     // día → { nombre → { score } }
try { diario = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf8')); } catch (e) {}
const lastDailyByIp = new Map();     // antiabuso: 1 envío por IP cada 3 s

function saveDiario() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DAILY_FILE, JSON.stringify(diario));
  } catch (e) { console.error('no se pudo guardar el diario:', e.message); }
}

function utcDay() {                   // 'YYYYMMDD' del día UTC actual (lo fija el server)
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function topDiario(day, n) {
  const d = diario[day] || {};
  return Object.entries(d)
    .map(([name, r]) => ({ name, score: r.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function postDiario(req, res) {
  let body = '';
  req.on('data', ch => { body += ch; if (body.length > 1024) req.destroy(); });
  req.on('end', () => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim();
    const day = utcDay();            // el server manda: nada de fechas del cliente
    if (Date.now() - (lastDailyByIp.get(ip) || 0) < 3000) {
      res.writeHead(429, CORS_JSON); res.end(JSON.stringify({ ok: false, day, top: topDiario(day, 10) })); return;
    }
    lastDailyByIp.set(ip, Date.now());
    let m; try { m = JSON.parse(body); } catch (e) { m = null; }
    const name = String((m && m.name) || '').replace(/[^\p{L}\p{N} _.-]/gu, '')
      .trim().slice(0, 12).toUpperCase() || 'ANÓNIMO';
    const score = Math.max(0, Math.min(MAX_DAILY_SCORE, Math.floor(+(m && m.score)) || 0));
    if (score > 0) {
      diario[day] = diario[day] || {};
      const cur = diario[day][name];
      if (!cur || score > cur.score) {   // un registro por nombre+día: el mejor
        diario[day][name] = { score };
        // poda: conserva solo los últimos días
        const dias = Object.keys(diario).sort();
        while (dias.length > DAILY_KEEP_DAYS) delete diario[dias.shift()];
        saveDiario();
        console.log(new Date().toISOString(), `diario ${day}: ${name} → ${score} pts`);
      }
    }
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify({ ok: true, day, top: topDiario(day, 10) }));
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ---------------- Replays de duelos ----------------
// El lockstep determinista hace los replays casi gratis: semilla + inputs de
// ambos lados (RLE) pesan unos KB y re-simulan la pelea entera. El lado 0
// publica al terminar; ?replay=<id> la reproduce. Se guardan los últimos
// MAX_REPLAYS en disco (volumen katana_data) con un índice de metadatos.
const REPLAY_DIR = path.join(DATA_DIR, 'replays');
const REPLAY_INDEX = path.join(REPLAY_DIR, 'index.json');
const MAX_REPLAYS = 100;
const MAX_REPLAY_BYTES = 65536;      // un duelo largo en RLE queda muy por debajo
let replays = [];                    // metadatos, el más reciente al final
try { replays = JSON.parse(fs.readFileSync(REPLAY_INDEX, 'utf8')); } catch (e) {}
const lastReplayByIp = new Map();    // antiabuso: 1 publicación por IP cada 10 s

function saveReplayIndex() {
  try {
    fs.mkdirSync(REPLAY_DIR, { recursive: true });
    fs.writeFileSync(REPLAY_INDEX, JSON.stringify(replays));
  } catch (e) { console.error('no se pudo guardar el índice de replays:', e.message); }
}

const cleanId = s => String(s || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);

function postReplay(req, res) {
  let body = '';
  req.on('data', ch => { body += ch; if (body.length > MAX_REPLAY_BYTES) req.destroy(); });
  req.on('end', () => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim();
    if (Date.now() - (lastReplayByIp.get(ip) || 0) < 10000) {
      res.writeHead(429, CORS_JSON); res.end('{"ok":false}'); return;
    }
    let m; try { m = JSON.parse(body); } catch (e) { m = null; }
    const rleOk = a => Array.isArray(a) && a.length <= 40000 && a.length % 2 === 0 &&
      a.every(n => Number.isInteger(n) && n >= 0 && n <= 100000);
    if (!m || !Number.isInteger(m.v) || !Array.isArray(m.chars) || !Array.isArray(m.names) ||
        !Array.isArray(m.inputs) || m.inputs.length !== 2 || !rleOk(m.inputs[0]) || !rleOk(m.inputs[1])) {
      res.writeHead(400, CORS_JSON); res.end('{"ok":false}'); return;
    }
    lastReplayByIp.set(ip, Date.now());
    if (lastReplayByIp.size > 1000) lastReplayByIp.clear();
    const limpiaNombre = s => String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '')
      .trim().slice(0, 12).toUpperCase() || 'ANÓNIMO';
    const id = Math.floor(Math.random() * 36 ** 8).toString(36).padStart(8, '0');
    const data = {
      v: m.v | 0, seed: m.seed >>> 0,
      chars: [cleanId(m.chars[0]), cleanId(m.chars[1])],
      names: [limpiaNombre(m.names[0]), limpiaNombre(m.names[1])],
      winner: m.winner === 1 ? 1 : 0,
      score: Math.max(0, Math.min(MAX_SCORE, Math.floor(+m.score) || 0)),
      inputs: m.inputs,
    };
    try {
      fs.mkdirSync(REPLAY_DIR, { recursive: true });
      fs.writeFileSync(path.join(REPLAY_DIR, id + '.json'), JSON.stringify(data));
    } catch (e) { res.writeHead(500, CORS_JSON); res.end('{"ok":false}'); return; }
    replays.push({ id, v: data.v, names: data.names, chars: data.chars,
                   winner: data.winner, score: data.score,
                   fecha: new Date().toISOString().slice(0, 10) });
    while (replays.length > MAX_REPLAYS) {
      const viejo = replays.shift();
      try { fs.unlinkSync(path.join(REPLAY_DIR, viejo.id + '.json')); } catch (e) {}
    }
    saveReplayIndex();
    console.log(new Date().toISOString(), `replay guardado: ${data.names[0]} vs ${data.names[1]} (${id})`);
    res.writeHead(200, CORS_JSON); res.end(JSON.stringify({ ok: true, id }));
  });
}

// ---------------- Comentarios de los jugadores ----------------
// Al terminar un torneo el juego ofrece dejar un comentario o
// sugerencia; se guardan en disco y se publican en GET /comentarios
// (una página HTML simple con el estilo del juego).
const COMMENTS_FILE = path.join(DATA_DIR, 'comentarios.json');
const MAX_COMMENTS = 500;
let comentarios = [];
try { comentarios = JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8')); } catch (e) {}
const lastCommentByIp = new Map();    // antiabuso: 1 comentario por IP cada 30 s

function saveComments() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comentarios));
  } catch (e) { console.error('no se pudieron guardar los comentarios:', e.message); }
}

const CORS_JSON = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function postComment(req, res) {
  let body = '';
  req.on('data', ch => { body += ch; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim();
    if (Date.now() - (lastCommentByIp.get(ip) || 0) < 30000) {
      res.writeHead(429, CORS_JSON); res.end('{"ok":false}'); return;
    }
    let m;
    try { m = JSON.parse(body); } catch (e) { m = null; }
    const text = String((m && m.text) || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 280);
    if (!text) { res.writeHead(400, CORS_JSON); res.end('{"ok":false}'); return; }
    const name = String((m && m.name) || '').replace(/[^\p{L}\p{N} _.-]/gu, '')
      .trim().slice(0, 12).toUpperCase() || 'ANÓNIMO';
    comentarios.push({ name, text, fecha: new Date().toISOString() });
    if (comentarios.length > MAX_COMMENTS) comentarios = comentarios.slice(-MAX_COMMENTS);
    lastCommentByIp.set(ip, Date.now());
    if (lastCommentByIp.size > 1000) lastCommentByIp.clear();
    saveComments();
    console.log(new Date().toISOString(), `comentario de ${name}: ${text.slice(0, 60)}`);
    res.writeHead(200, CORS_JSON); res.end('{"ok":true}');
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function commentsPage() {
  const items = comentarios.slice().reverse().map(c => {
    const fecha = new Date(c.fecha).toLocaleDateString('es-CL',
      { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `    <li><span class="meta">${fecha} · ${escapeHtml(c.name)}</span><p>${escapeHtml(c.text)}</p></li>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KATANA FIGHT — comentarios</title>
<style>
  body { background: #0a0a12; color: #e8e0d0; font-family: 'Courier New', monospace;
         max-width: 720px; margin: 0 auto; padding: 24px 16px 60px; }
  h1 { color: #e8c050; font-size: 24px; text-align: center; }
  h1 .kanji { color: #b03030; }
  .sub { text-align: center; color: #998; font-size: 13px; margin-bottom: 30px; }
  a { color: #9ad0e8; }
  ul { list-style: none; padding: 0; }
  li { border-left: 3px solid #b03030; background: rgba(255,255,255,0.04);
       padding: 10px 14px; margin-bottom: 14px; }
  .meta { color: #998; font-size: 12px; }
  p { margin: 6px 0 0; white-space: pre-wrap; word-break: break-word; }
  .vacio { color: #776; text-align: center; margin-top: 60px; }
</style>
</head>
<body>
<h1><span class="kanji">声</span> KATANA FIGHT — comentarios</h1>
<div class="sub">lo que dejan los duelistas al terminar su torneo · <a href="/">volver al juego</a></div>
${comentarios.length ? `<ul>\n${items}\n</ul>` : '<div class="vacio">aún nadie ha dejado un mensaje…</div>'}
</body>
</html>`;
}

// ---------------- Presencia en el título ----------------
// Quien está en el menú de título "late" por HTTP (GET /estado) para
// que otros sepan que hay con quién emparejarse, ANTES de entrar al
// online. Mapa id→últimoVisto con caducidad corta; los que ya entraron
// al duelo no laten (están en el WS: esperando o jugando) y se cuentan
// aparte. Es solo informativo: no toca la simulación.
const PRESENCE_TTL = 12000;          // ms sin latido => fuera de la lista
const presence = new Map();          // id efímero → timestamp del último latido

function estado(id) {
  const limite = Date.now() - PRESENCE_TTL;
  for (const [k, t] of presence) if (t < limite) presence.delete(k);
  if (presence.size > 5000) presence.clear();        // antiabuso
  if (id) presence.set(id, Date.now());
  let enDuelo = 0;
  for (const ws of wss.clients) if (ws.peer && ws.readyState === 1) enDuelo++;
  return {
    presentes: presence.size,                        // mirando el título (incluye al que pregunta)
    esperando: (waiting && waiting.readyState === 1) ? 1 : 0,
    jugando: Math.floor(enDuelo / 2),                // partidas en curso (duelo + co-op)
    duelos: duels.size,                              // duelos 1v1 que se pueden mirar en vivo
  };
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/up') { res.writeHead(200); res.end('ok'); return; }   // healthcheck
  if (req.method === 'OPTIONS') {     // preflight CORS (desarrollo desde file://)
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { p = '/'; }
  if (p === '/ranking') {
    // CORS abierto: permite probar el juego desde file:// o localhost
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify(topRanking(10)));
    return;
  }
  if (p === '/beatrank') {                // tabla del beat 'em up
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify(topBeat(10)));
    return;
  }
  if (p === '/beatscore' && req.method === 'POST') { postBeatScore(req, res); return; }
  if (p === '/diario' && req.method === 'POST') { postDiario(req, res); return; }
  if (p === '/diario') {                  // board del día (GET)
    const day = utcDay();
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify({ day, top: topDiario(day, 10) }));
    return;
  }
  if (p === '/replay' && req.method === 'POST') { postReplay(req, res); return; }
  if (p === '/replay') {                  // GET /replay?id=xxxx → el replay entero
    let id = '';
    try { id = new URL(req.url, 'http://x').searchParams.get('id') || ''; } catch (e) {}
    id = cleanId(id);
    fs.readFile(path.join(REPLAY_DIR, id + '.json'), (err, data) => {
      if (err) { res.writeHead(404, CORS_JSON); res.end('{"ok":false}'); return; }
      res.writeHead(200, CORS_JSON); res.end(data);
    });
    return;
  }
  if (p === '/replays') {                 // los duelos grabados más recientes
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify(replays.slice(-10).reverse()));
    return;
  }
  if (p === '/estado') {                 // presencia: ¿hay con quién emparejarse?
    let id = '';
    try { id = new URL(req.url, 'http://x').searchParams.get('id') || ''; } catch (e) {}
    id = id.replace(/[^a-z0-9]/gi, '').slice(0, 24);
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify(estado(id)));
    return;
  }
  if (p === '/comentarios') {
    if (req.method === 'POST') { postComment(req, res); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(commentsPage());
    return;
  }
  // ---- Editor de escenarios (herramienta de desarrollo, solo en local) ----
  if (p.startsWith('/api/') && !DEV) { res.writeHead(404); res.end(); return; }
  if (p === '/api/assets') {            // lista los PNG disponibles para el editor
    const list = sub => {
      try {
        return fs.readdirSync(path.join(ROOT, 'assets', sub))
          .filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();
      } catch (e) { return []; }
    };
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify({ bg: list('bg'), props: list('props') }));
    return;
  }
  if (p === '/api/escena' && req.method === 'POST') {   // guarda escenas.json
    let body = '';
    req.on('data', ch => { body += ch; if (body.length > 4_000_000) req.destroy(); });
    req.on('end', () => {
      try { JSON.parse(body); } catch (e) { res.writeHead(400, CORS_JSON); res.end('{"ok":false}'); return; }
      try {
        fs.writeFileSync(path.join(ROOT, 'escenas.json'), body);
        console.log(new Date().toISOString(), 'escenas.json guardado por el editor');
        res.writeHead(200, CORS_JSON); res.end('{"ok":true}');
      } catch (e) { res.writeHead(500, CORS_JSON); res.end('{"ok":false}'); }
    });
    return;
  }
  if (p === '/api/generar' && req.method === 'POST') {   // crea un fondo/elemento con Nano Banana
    let body = '';
    req.on('data', ch => { body += ch; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch (e) { res.writeHead(400, CORS_JSON); res.end('{"ok":false}'); return; }
      const tipo = m.tipo === 'bg' ? 'bg' : 'prop';
      const id = String(m.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32).toLowerCase();
      const desc = String(m.desc || '').slice(0, 400);
      if (!id || !desc) { res.writeHead(400, CORS_JSON); res.end('{"ok":false,"log":"id y descripción requeridos"}'); return; }
      const py = spawn('python3', [path.join(ROOT, 'tools', 'generar_uno.py'), tipo, id, desc], { cwd: ROOT });
      let out = '', done = false;
      const finish = (ok, log) => { if (done) return; done = true; clearTimeout(to); res.writeHead(200, CORS_JSON); res.end(JSON.stringify({ ok, id, tipo, log: (log || out).trim().slice(-600) })); };
      const to = setTimeout(() => { try { py.kill(); } catch (e) {} finish(false, out + '\n(tiempo agotado)'); }, 150000);
      py.stdout.on('data', d => out += d);
      py.stderr.on('data', d => out += d);
      py.on('error', e => finish(false, 'no se pudo ejecutar python3: ' + e.message));
      py.on('close', () => finish(/(^|\n)OK /.test(out), out));
      console.log(new Date().toISOString(), `generando ${tipo} "${id}"`);
    });
    return;
  }
  // ---- Editor de rig de personajes (rig_editor.html, solo en local) ----
  if (p === '/api/parts') {             // lista personajes y sus piezas disponibles
    const base = path.join(ROOT, 'assets', 'parts');
    const out = {};
    try {
      for (const id of fs.readdirSync(base)) {
        const dir = path.join(base, id);
        if (!fs.statSync(dir).isDirectory()) continue;
        out[id] = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
      }
    } catch (e) {}
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify(out));
    return;
  }
  if (p === '/api/rig' && req.method === 'POST') {     // guarda rigs.json
    let body = '';
    req.on('data', ch => { body += ch; if (body.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      try { JSON.parse(body); } catch (e) { res.writeHead(400, CORS_JSON); res.end('{"ok":false}'); return; }
      try {
        fs.writeFileSync(path.join(ROOT, 'rigs.json'), body);
        console.log(new Date().toISOString(), 'rigs.json guardado por el editor de rig');
        res.writeHead(200, CORS_JSON); res.end('{"ok":true}');
      } catch (e) { res.writeHead(500, CORS_JSON); res.end('{"ok":false}'); }
    });
    return;
  }
  if (p === '/api/chars' && req.method === 'POST') {     // guarda chars.json (ficha de juego)
    let body = '';
    req.on('data', ch => { body += ch; if (body.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      try { JSON.parse(body); } catch (e) { res.writeHead(400, CORS_JSON); res.end('{"ok":false}'); return; }
      try {
        fs.writeFileSync(path.join(ROOT, 'chars.json'), body);
        console.log(new Date().toISOString(), 'chars.json guardado por el editor de personajes');
        res.writeHead(200, CORS_JSON); res.end('{"ok":true}');
      } catch (e) { res.writeHead(500, CORS_JSON); res.end('{"ok":false}'); }
    });
    return;
  }
  if (p === '/api/generar-parte' && req.method === 'POST') {   // genera UNA pieza con Nano Banana
    let body = '';
    req.on('data', ch => { body += ch; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch (e) { res.writeHead(400, CORS_JSON); res.end('{"ok":false}'); return; }
      const id = String(m.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32).toLowerCase();
      const part = ['torso', 'pierna', 'brazos'].includes(m.part) ? m.part : '';
      const desc = String(m.desc || '').slice(0, 400);
      if (!id || !part) { res.writeHead(400, CORS_JSON); res.end('{"ok":false,"log":"id y parte requeridos"}'); return; }
      const args = [path.join(ROOT, 'tools', 'generar_parte.py'), id, part];
      if (desc) args.push(desc);
      const py = spawn('python3', args, { cwd: ROOT });
      let out = '', done = false;
      const finish = (ok, log) => { if (done) return; done = true; clearTimeout(to); res.writeHead(200, CORS_JSON); res.end(JSON.stringify({ ok, id, part, log: (log || out).trim().slice(-600) })); };
      const to = setTimeout(() => { try { py.kill(); } catch (e) {} finish(false, out + '\n(tiempo agotado)'); }, 150000);
      py.stdout.on('data', d => out += d);
      py.stderr.on('data', d => out += d);
      py.on('error', e => finish(false, 'no se pudo ejecutar python3: ' + e.message));
      py.on('close', () => finish(/(^|\n)OK /.test(out), out));
      console.log(new Date().toISOString(), `generando parte ${part} de "${id}"`);
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) || p.startsWith('/server') || p.includes('/.')) {
    res.writeHead(404); res.end(); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('no encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer });   // acepta /ws y cualquier ruta
let waiting = null;          // cola del DUELO 1v1
let waitingBeat = null;      // cola del CO-OP del beat 'em up (KATANA RŌNIN)

// Salas privadas: join{code} empareja SOLO contra ese código, saltándose la
// cola pública. La unión es simétrica (no hay "crear" ni "unirse": el primero
// que llega espera, el segundo empareja), así el mismo enlace ?sala=XXXX
// sirve para los dos amigos. Caducan solas si nadie llega.
const rooms = new Map();             // código → { ws, t, beat }
const ROOM_TTL = 10 * 60 * 1000;     // 10 min esperando y la sala caduca

function joinRoom(ws, code, beat) {
  ws.roomCode = code;
  const room = rooms.get(code);
  if (room && room.ws !== ws && room.ws.readyState === 1 && room.beat === beat) {
    rooms.delete(code);
    pair(room.ws, ws, beat ? 'beat' : 'duelo');
    console.log(new Date().toISOString(), `sala privada ${code} completa`);
  } else {
    rooms.set(code, { ws, t: Date.now(), beat });
  }
}

// ---------------- Espectadores en vivo ----------------
// El lockstep hace el "modo mirón" casi gratis: el servidor guarda, por
// duelo, la semilla, los guerreros elegidos y los inputs ya jugados; al
// mirón se le manda ese pasado de golpe y el directo a continuación, y su
// navegador re-simula la pelea igual que un replay. Es de SOLO lectura:
// cualquier mensaje que envíe un mirón se descarta sin mirarlo, y el relé
// jamás espera por ellos (send no bloquea a los duelistas).
const duels = new Set();             // duelos 1v1 en curso (mirables)
const MAX_WATCHERS = 20;             // mirones por duelo
const MAX_SPEC_TICKS = 72000;        // ~20 min; más allá el duelo deja de aceptar mirones

function watchSnapshot(d) {
  return JSON.stringify({ t: 'watch', v: PROTO_VER, seed: d.seed, names: d.names, chars: d.chars, i: d.i });
}

function toWatchers(d, msg) {
  for (const w of d.watchers) if (w.readyState === 1) w.send(msg);
}

// duelo nuevo (o revancha: los mirones se quedan y reciben el duelo fresco)
function registerDuel(a, b, seed) {
  const prev = a.duel;
  const d = {
    seed, names: [a.name, b.name], chars: [null, null],
    i: [[], []],                     // input de cada lado, indexado por tic
    watchers: prev ? prev.watchers : new Set(),
  };
  if (prev) duels.delete(prev);
  if (b.duel) duels.delete(b.duel);
  a.duel = b.duel = d;
  duels.add(d);
  for (const w of d.watchers) {
    w.watching = d;
    if (w.readyState === 1) w.send(watchSnapshot(d));
  }
}

function specJoin(ws) {
  let target = null;
  for (const d of duels) if (d.watchers.size < MAX_WATCHERS) { target = d; break; }
  if (!target) { ws.send('{"t":"nadaw"}'); return; }
  ws.watching = target;
  target.watchers.add(ws);
  ws.send(watchSnapshot(target));
  console.log(new Date().toISOString(),
    `mirón viendo: ${target.names[0]} vs ${target.names[1]} (${target.watchers.size} mirando)`);
}

// un duelista se fue: se avisa a los mirones y el duelo deja de ser mirable
function dropDuel(d) {
  if (!d) return;
  duels.delete(d);
  for (const w of d.watchers) {
    if (w.readyState === 1) { w.send('{"t":"byew"}'); w.close(); }
    w.watching = null;
  }
  d.watchers.clear();
}

// El co-op del beat 'em up es autoritativo por host: el lado 0 (anfitrión)
// simula la partida y transmite snapshots; el lado 1 (invitado) solo envía su
// input. Esos snapshots pesan más que el input del duelo, así que el relé
// admite mensajes mayores para los emparejados (el handshake sigue acotado).
const RELAY_MAX = 16384;

function pair(a, b, modo) {
  a.peer = b;
  b.peer = a;
  a.side = 0;
  b.side = 1;
  a.rematch = b.rematch = false;
  a.match = b.match = { reports: [null, null], names: [a.name, b.name], recorded: false };
  const seed = Math.floor(Math.random() * 0xffffffff);
  a.send(JSON.stringify({ t: 'match', v: PROTO_VER, side: 0, seed, foe: b.name }));
  b.send(JSON.stringify({ t: 'match', v: PROTO_VER, side: 1, seed, foe: a.name }));
  if (modo !== 'beat') registerDuel(a, b, seed);   // el duelo 1v1 se puede mirar
  const etq = modo === 'beat' ? 'co-op beat' : 'duelo';
  console.log(new Date().toISOString(), `${etq} emparejado: ${a.name} vs ${b.name} (semilla ${seed})`);
}

// Revancha: ambos jugadores siguen conectados tras el duelo; cuando los dos
// la piden, el servidor reusa el par (mismos lados) con semilla NUEVA y un
// registro de resultado limpio. Si solo la pide uno, se avisa al rival.
function askRematch(ws) {
  const peer = ws.peer;
  if (!peer) return;
  ws.rematch = true;
  if (!peer.rematch) {
    if (peer.readyState === 1) peer.send('{"t":"rematch"}');
    return;
  }
  ws.rematch = peer.rematch = false;
  const a = ws.side === 0 ? ws : peer;
  const b = a === ws ? peer : ws;
  a.match = b.match = { reports: [null, null], names: [a.name, b.name], recorded: false };
  const seed = Math.floor(Math.random() * 0xffffffff);
  a.send(JSON.stringify({ t: 'match', v: PROTO_VER, side: 0, seed, foe: b.name }));
  b.send(JSON.stringify({ t: 'match', v: PROTO_VER, side: 1, seed, foe: a.name }));
  if (!a.beat) registerDuel(a, b, seed);   // los mirones siguen viendo la revancha
  console.log(new Date().toISOString(), `revancha: ${a.name} vs ${b.name} (semilla ${seed})`);
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.peer = null;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', data => {
    if (ws.watching) return;                  // los mirones son de SOLO lectura
    const raw = data.toString();
    if (!ws.peer) {
      if (raw.length > 512) return;           // el handshake es pequeño
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.t === 'watch') { specJoin(ws); return; }   // mirón: ver un duelo en curso
      if (m.t === 'join') {
        // versión del duelo: cliente viejo → aviso y fuera (el co-op del beat
        // es autoritativo por host y tolera versiones; no se le exige)
        if (m.mode !== 'beat' && (m.v | 0) !== PROTO_VER) {
          ws.send('{"t":"ver"}');
          ws.close();
          return;
        }
        ws.name = String(m.name || '').replace(/[^\p{L}\p{N} _.-]/gu, '')
          .trim().slice(0, 12).toUpperCase() || 'ANÓNIMO';
        // dos colas separadas: el duelo 1v1 no se empareja con el co-op del beat
        const beat = m.mode === 'beat';
        ws.beat = beat;
        // sala privada: con código no se pisa la cola pública
        const code = String(m.code || '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8);
        if (code) { joinRoom(ws, code, beat); return; }
        if (beat) {
          if (waitingBeat && waitingBeat !== ws && waitingBeat.readyState === 1) {
            const w = waitingBeat; waitingBeat = null; pair(w, ws, 'beat');
          } else { waitingBeat = ws; }
        } else {
          if (waiting && waiting !== ws && waiting.readyState === 1) {
            const w = waiting; waiting = null; pair(w, ws, 'duelo');
          } else { waiting = ws; }
        }
      }
      return;
    }
    if (raw.length > RELAY_MAX) return;        // los snapshots del co-op caben de sobra
    // resultado del duelo: lo anota el servidor, no se reenvía
    if (raw.startsWith('{"t":"result"')) { recordResult(ws, raw); return; }
    // petición de revancha: el servidor la gestiona (no es un relé ciego)
    if (raw.startsWith('{"t":"rematch"')) { askRematch(ws); return; }
    // duelo con mirones: guarda y retransmite lo que reconstruye la pelea
    const d = ws.duel;
    if (d) {
      if (raw.startsWith('{"t":"i"')) {
        let m; try { m = JSON.parse(raw); } catch (e) { m = null; }
        if (m && Number.isInteger(m.k) && m.k >= 0) {
          if (m.k < MAX_SPEC_TICKS) d.i[ws.side][m.k] = m.v | 0;
          else duels.delete(d);              // duelo eterno: sin mirones nuevos
          if (d.watchers.size) toWatchers(d, JSON.stringify({ t: 'iw', s: ws.side, k: m.k, v: m.v | 0 }));
        }
      } else if (raw.startsWith('{"t":"char"')) {
        let m; try { m = JSON.parse(raw); } catch (e) { m = null; }
        if (m) {
          d.chars[ws.side] = cleanId(m.id);
          if (d.watchers.size) toWatchers(d, JSON.stringify({ t: 'charw', s: ws.side, id: d.chars[ws.side] }));
        }
      }
    }
    // emparejado: relé directo al rival/compañero, sin mirar el contenido
    if (ws.peer.readyState === 1) ws.peer.send(raw);
  });

  ws.on('close', () => {
    if (waiting === ws) waiting = null;
    if (waitingBeat === ws) waitingBeat = null;
    const room = ws.roomCode && rooms.get(ws.roomCode);
    if (room && room.ws === ws) rooms.delete(ws.roomCode);
    if (ws.watching) {                       // un mirón se va: nadie lo nota
      ws.watching.watchers.delete(ws);
      ws.watching = null;
    }
    if (ws.duel) {                           // un duelista se va: adiós al duelo mirable
      dropDuel(ws.duel);
      if (ws.peer) ws.peer.duel = null;
      ws.duel = null;
    }
    if (ws.peer) {
      if (ws.peer.readyState === 1) ws.peer.send(JSON.stringify({ t: 'bye' }));
      ws.peer.peer = null;
      ws.peer = null;
    }
  });

  ws.on('error', () => {});
});

// latido: expulsa conexiones muertas (móviles que pierden señal, etc.)
// y caduca las salas privadas donde nadie llegó
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  const limite = Date.now() - ROOM_TTL;
  for (const [code, room] of rooms) {
    if (room.t < limite || room.ws.readyState !== 1) {
      rooms.delete(code);
      if (room.ws.readyState === 1) {
        room.ws.send('{"t":"salaCaduca"}');
        room.ws.close();
      }
    }
  }
}, 30000);

httpServer.listen(PORT, () => {
  console.log(`KATANA FIGHT — juego y emparejamiento escuchando en el puerto ${PORT}`);
});
