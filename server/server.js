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
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8081;
const ROOT = path.join(__dirname, '..');

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
    .sort((a, b) => b.pts - a.pts)
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
  const l = rankEntry(loseName);
  l.losses++; l.streak = 0;
  saveRanking();
  console.log(new Date().toISOString(), `duelo anotado: ${winName} vence a ${loseName} (+${pts} pts)`);
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

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
    jugando: Math.floor(enDuelo / 2),                // duelos en curso
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
let waiting = null;

function pair(a, b) {
  a.peer = b;
  b.peer = a;
  a.side = 0;
  b.side = 1;
  a.match = b.match = { reports: [null, null], names: [a.name, b.name], recorded: false };
  const seed = Math.floor(Math.random() * 0xffffffff);
  a.send(JSON.stringify({ t: 'match', side: 0, seed, foe: b.name }));
  b.send(JSON.stringify({ t: 'match', side: 1, seed, foe: a.name }));
  console.log(new Date().toISOString(), `duelo emparejado: ${a.name} vs ${b.name} (semilla ${seed})`);
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.peer = null;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', data => {
    const raw = data.toString();
    if (raw.length > 512) return;            // nada legítimo es tan grande
    if (!ws.peer) {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.t === 'join') {
        ws.name = String(m.name || '').replace(/[^\p{L}\p{N} _.-]/gu, '')
          .trim().slice(0, 12).toUpperCase() || 'ANÓNIMO';
        if (waiting && waiting !== ws && waiting.readyState === 1) {
          const w = waiting;
          waiting = null;
          pair(w, ws);
        } else {
          waiting = ws;
        }
      }
      return;
    }
    // resultado del duelo: lo anota el servidor, no se reenvía
    if (raw.startsWith('{"t":"result"')) { recordResult(ws, raw); return; }
    // emparejado: relé directo al rival, sin mirar el contenido
    if (ws.peer.readyState === 1) ws.peer.send(raw);
  });

  ws.on('close', () => {
    if (waiting === ws) waiting = null;
    if (ws.peer) {
      if (ws.peer.readyState === 1) ws.peer.send(JSON.stringify({ t: 'bye' }));
      ws.peer.peer = null;
      ws.peer = null;
    }
  });

  ws.on('error', () => {});
});

// latido: expulsa conexiones muertas (móviles que pierden señal, etc.)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

httpServer.listen(PORT, () => {
  console.log(`KATANA FIGHT — juego y emparejamiento escuchando en el puerto ${PORT}`);
});
