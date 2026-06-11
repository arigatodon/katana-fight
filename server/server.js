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
