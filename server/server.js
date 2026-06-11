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

const httpServer = http.createServer((req, res) => {
  if (req.url === '/up') { res.writeHead(200); res.end('ok'); return; }   // healthcheck
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { p = '/'; }
  if (p === '/ranking') {
    // CORS abierto: permite probar el juego desde file:// o localhost
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(topRanking(10)));
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
