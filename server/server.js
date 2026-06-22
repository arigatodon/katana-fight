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
  if (p === '/beatrank') {                // tabla del beat 'em up
    res.writeHead(200, CORS_JSON);
    res.end(JSON.stringify(topBeat(10)));
    return;
  }
  if (p === '/beatscore' && req.method === 'POST') { postBeatScore(req, res); return; }
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
  a.match = b.match = { reports: [null, null], names: [a.name, b.name], recorded: false };
  const seed = Math.floor(Math.random() * 0xffffffff);
  a.send(JSON.stringify({ t: 'match', side: 0, seed, foe: b.name }));
  b.send(JSON.stringify({ t: 'match', side: 1, seed, foe: a.name }));
  const etq = modo === 'beat' ? 'co-op beat' : 'duelo';
  console.log(new Date().toISOString(), `${etq} emparejado: ${a.name} vs ${b.name} (semilla ${seed})`);
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.peer = null;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', data => {
    const raw = data.toString();
    if (!ws.peer) {
      if (raw.length > 512) return;           // el handshake es pequeño
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.t === 'join') {
        ws.name = String(m.name || '').replace(/[^\p{L}\p{N} _.-]/gu, '')
          .trim().slice(0, 12).toUpperCase() || 'ANÓNIMO';
        // dos colas separadas: el duelo 1v1 no se empareja con el co-op del beat
        const beat = m.mode === 'beat';
        ws.beat = beat;
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
    // emparejado: relé directo al rival/compañero, sin mirar el contenido
    if (ws.peer.readyState === 1) ws.peer.send(raw);
  });

  ws.on('close', () => {
    if (waiting === ws) waiting = null;
    if (waitingBeat === ws) waitingBeat = null;
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
