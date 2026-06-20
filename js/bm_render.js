'use strict';

// ============================================================
//  DIBUJO — mundo con scroll, luchadores, HUD y menús
// ============================================================

// caché de fondos largos (assets/bm_bg/{id}.png)
const bmBg = {};
function bmLoadBg(id) {
  if (bmBg[id]) return;
  const o = { ready: false, worldW: 0, img: new Image() };
  o.img.onload = () => {
    o.ready = true;
    // la banda viene a 540 de alto: su ancho natural ES el ancho del mundo
    // (se dibuja 1:1, sin estirar). Si por algo no fuese 540, se ajusta.
    o.worldW = Math.round(o.img.naturalWidth * (H / o.img.naturalHeight));
  };
  o.img.src = 'assets/bm_bg/' + id + '.png';
  bmBg[id] = o;
}

// ---------------- ambiente animado del escenario ----------------
//  Reutiliza las imágenes y animaciones de escena.js (assets/props/): aves,
//  grullas, pétalos de sakura, hojas, olas, koi, nieve y nubes. Cada etapa del
//  beat 'em up tiene su propia lista de capas (cielo = detrás, frente = delante).
const BM_CAPAS = {
  calle: [
    { id: 'nube',    capa: 'cielo', anim: 'deriva', y: 0.12, h: 0.12, vx: 10, alpha: 0.9 },
    { id: 'pajaros', capa: 'cielo', anim: 'vuela',  y: 0.20, h: 0.09, vx: 50 },
    { id: 'nube',    capa: 'cielo', anim: 'deriva', y: 0.27, h: 0.08, vx: 6,  alpha: 0.6 },
  ],
  bambu: [
    { id: 'pajaros', capa: 'cielo',  anim: 'vuela', y: 0.15, h: 0.08, vx: 44 },
    { id: 'hojas',   capa: 'frente', anim: 'cae',   x: 0.55, h: 0.30, vy: 26, sway: 60, copias: 2, spin: 0.4 },
    { id: 'sakura',  capa: 'frente', anim: 'cae',   x: 0.30, h: 0.24, vy: 20, sway: 50, copias: 2 },
  ],
  rio: [
    { id: 'nube',     capa: 'cielo',  anim: 'deriva', y: 0.12, h: 0.12, vx: 12, alpha: 0.9 },
    { id: 'grulla',   capa: 'cielo',  anim: 'vuela',  y: 0.20, h: 0.12, vx: 42, flip: true },
    { id: 'koi',      capa: 'frente', anim: 'koi',    x: 0.70, h: 0.26, yBase: 1.04, height: 0.30, period: 6, jump: 1.6 },
    { id: 'ola_baja', capa: 'frente', anim: 'olas',   x: 0.14, y: 0.99, h: 0.20, amp: 7, speed: 1.1, sway: 12 },
  ],
  costa: [
    { id: 'nube',     capa: 'cielo',  anim: 'deriva', y: 0.10, h: 0.12, vx: 10, alpha: 0.9 },
    { id: 'grulla',   capa: 'cielo',  anim: 'vuela',  y: 0.18, h: 0.12, vx: 40, flip: true },
    { id: 'pajaros',  capa: 'cielo',  anim: 'vuela',  y: 0.26, h: 0.08, vx: 62 },
    { id: 'ola_alta', capa: 'frente', anim: 'olas',   x: 0.85, y: 0.94, h: 0.36, amp: 10, speed: 0.9, sway: 16 },
    { id: 'ola_baja', capa: 'frente', anim: 'olas',   x: 0.12, y: 0.99, h: 0.22, amp: 8,  speed: 1.1, sway: 12, phase: 1.2 },
  ],
  monte: [
    { id: 'nube',         capa: 'cielo',  anim: 'deriva', y: 0.10, h: 0.10, vx: 14, alpha: 0.8 },
    { id: 'nieve_rafaga', capa: 'frente', anim: 'cae',    x: 0.5,  h: 0.40, vy: 55, sway: 90, copias: 2, alpha: 0.85 },
  ],
};

// init/step quedan como no-op: las animaciones de escena.js son por tiempo (gTime)
function bmInitAmbient(id) {}
function bmStepAmbient(dt) {}

// dibuja la capa pedida usando animar() de escena.js (espacio de pantalla).
// Sincroniza gTime con el reloj del beat 'em up para que las animaciones corran.
function bmDrawCapas(capa) {
  if (!bmStage || typeof animar !== 'function') return;
  const prevG = gTime;
  gTime = bmTime;
  const list = BM_CAPAS[bmStage.id] || [];
  for (const e of list) if (e.capa === capa) animar(e);
  gTime = prevG;
}

// peligros de jefe: onda de choque, aoe de picada
function bmDrawHazards() {
  for (const h of bmHazards) {
    const a = Math.max(0, h.life / h.maxLife);
    if (h.kind === 'shock') {
      ctx.strokeStyle = `rgba(200,160,80,${a * 0.8})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(h.x, GROUND - 6, h.r, h.r * 0.4, 0, Math.PI, Math.PI * 2); ctx.stroke();
    } else if (h.kind === 'aoe') {
      ctx.fillStyle = `rgba(230,90,60,${a * 0.45})`;
      ctx.beginPath(); ctx.ellipse(h.x, GROUND - 4, h.r, h.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function bmDraw() {
  ctx.clearRect(0, 0, W, H);
  if (typeof bmSyncNameInput === 'function') bmSyncNameInput();
  if (bmScene === 'title') return bmDrawTitle();
  if (bmScene === 'choose') return bmDrawChoose();
  if (bmScene === 'ranking') return bmDrawRanking();
  if (bmScene === 'online') return bmDrawOnline();

  // sacudida de pantalla
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  bmDrawWorld();
  ctx.restore();

  bmDrawHud();

  if (bmScene === 'gameover') bmDrawEnd('DERROTA', '一  ' + bmStage.kanji + '  一', '#c03030');
  if (bmScene === 'win') bmDrawEnd('¡LEYENDA!', 'Has vencido a los cinco yokai', '#e8c050');

  // controles táctiles (celular) durante el juego
  if (BM_TOUCH && bmScene === 'play') bmDrawTouch();

  // destello
  if (bmFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, bmFlash * 3.2)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // viñeta
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.98);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function bmDrawWorld() {
  ctx.save();
  ctx.translate(-Math.round(bmCamX), 0);

  bmDrawBg();

  // capa de adorno DETRÁS de la acción (aves, grullas, nubes), en espacio de
  // pantalla: anulamos el translate de cámara para que floten fijas al cielo
  ctx.save(); ctx.translate(Math.round(bmCamX), 0); bmDrawCapas('cielo'); ctx.restore();

  // manchas de sangre acumuladas en el suelo (jefe abatido)
  for (const s of bmStains) {
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r, s.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // peligros de jefe (ondas, aplastón) sobre el suelo
  bmDrawHazards();

  // estelas de corte (mundo)
  for (const s of slashTrails) {
    const a = s.life / s.maxLife;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.9})`;
    ctx.lineWidth = 3 + a * 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 16 * a;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    ctx.restore();
  }

  // luchadores ordenados por profundidad (más abajo = más al frente)
  const jugadores = bmAllPlayers();
  const all = bmEnemies.concat(jugadores).filter(Boolean).sort((a, b) => a.y - b.y);
  for (const f of all) {
    const esJugador = jugadores.includes(f);
    // parpadeo de invulnerabilidad de un jugador
    if (esJugador && f.invT > 0 && Math.floor(bmTime * 20) % 2 === 0 && f.state !== PSTATE.DEAD) continue;
    drawSamurai(f);
    // co-op: etiqueta con el nombre sobre cada jugador (J1 verde / J2 azul)
    if (esJugador && bmCoop && f.state !== PSTATE.DEAD) bmDrawNameTag(f);
  }

  // partículas (sangre, chispas)
  for (const pa of particles) {
    ctx.globalAlpha = Math.max(0, pa.life / pa.maxLife);
    ctx.fillStyle = pa.color;
    ctx.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
  }
  ctx.globalAlpha = 1;

  // textos flotantes (mundo)
  ctx.textAlign = 'center';
  for (const fl of floaters) {
    ctx.globalAlpha = Math.max(0, fl.life / fl.maxLife);
    ctx.font = `bold ${fl.size}px "Courier New", monospace`;
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.txt, fl.x, fl.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  // capa de adorno DELANTE de la acción (olas, koi, pétalos, nieve), pantalla
  ctx.save(); ctx.translate(Math.round(bmCamX), 0); bmDrawCapas('frente'); ctx.restore();

  // barreras visuales cuando la oleada bloquea el avance
  if (bmWaveActive) bmDrawBarriers();

  ctx.restore();
}

function bmDrawBg() {
  const o = bmStage && bmBg[bmStage.id];
  const w = bmWorldW();
  if (o && o.ready) {
    ctx.drawImage(o.img, 0, 0, w, H);
  } else {
    // respaldo: cielo + suelo lisos mientras carga / si falta el arte
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#cdb98f'); g.addColorStop(0.6, '#9fb0bd'); g.addColorStop(1, '#5d6f7c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, H);
    ctx.fillStyle = '#3a3026'; ctx.fillRect(0, GROUND, w, H - GROUND);
  }
}

// flechas/postes que indican que no se puede pasar hasta limpiar la oleada
function bmDrawBarriers() {
  const rx = bmCamMax + W - 8;
  ctx.save();
  ctx.globalAlpha = 0.5 + Math.sin(bmArrowPulse * 5) * 0.2;
  ctx.fillStyle = '#c03030';
  ctx.font = 'bold 34px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('✕', rx - 24, GROUND - 40);
  ctx.restore();
  ctx.textAlign = 'left';
}

// etiqueta de nombre sobre un jugador en co-op (verde = tú · azul = compañero)
function bmDrawNameTag(f) {
  const local = (f === bmPlayer);
  const txt = local ? 'TÚ' : (bmNetFoe || 'ALIADO');
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.fillStyle = local ? '#7ad06a' : '#6ab0e8';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  ctx.fillText(txt, f.x, bodyCenterY(f) - 56 * (f.scale || 1));
  ctx.restore();
  ctx.textAlign = 'left';
}

// ---------------- HUD ----------------
function bmDrawHud() {
  if (!bmStage) return;   // defensa: el HUD necesita una etapa cargada
  // vidas (katanas) — en co-op la bolsa es compartida (bmLivesMax)
  ctx.save();
  for (let i = 0; i < bmLivesMax; i++) {
    ctx.globalAlpha = i < bmLives ? 1 : 0.22;
    bmDrawLifeIcon(20 + i * 26, 26);
  }
  ctx.globalAlpha = 1;
  if (bmCoop) {
    ctx.fillStyle = '#9ad0e8';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillText('CO-OP', 20 + bmLivesMax * 26 + 4, 30);
  }

  // puntaje
  ctx.fillStyle = '#e8e0d0';
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('武 ' + bmScore, W - 16, 30);
  ctx.textAlign = 'left';

  // combo: racha de muertes + multiplicador
  if (bmCombo >= 2) {
    const a = Math.min(1, bmComboT / 0.6);             // se desvanece al expirar
    const pop = 1 + Math.max(0, bmComboT - 3.0) * 0.6; // brinco al sumar
    ctx.save();
    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.55 + 0.45 * a;
    ctx.fillStyle = bmMult >= 2.5 ? '#e8404a' : '#e8c050';
    ctx.font = `bold ${Math.round(20 * pop)}px "Courier New", monospace`;
    ctx.fillText(bmCombo + '  COMBO', W - 16, 54);
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText('x' + bmMult.toFixed(1), W - 16, 72);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // nombre de etapa
  ctx.fillStyle = 'rgba(232,224,208,0.8)';
  ctx.font = '13px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ETAPA ' + (bmStageIdx + 1) + '/' + BM_STAGES.length + ' · ' + bmStage.name, W / 2, 22);
  ctx.textAlign = 'left';
  ctx.restore();

  // barra de vida del jefe
  const boss = bmEnemies.find(e => e.isBoss && e.state !== PSTATE.DEAD);
  if (boss) bmDrawBossBar(boss);

  // banner de etapa / aviso de avance
  if (bmBannerT > 0) bmDrawBanner();

  // jefe abatido: aviso persistente de que hay que avanzar
  if (bmBossDown) {
    ctx.save();
    ctx.globalAlpha = 0.55 + Math.sin(bmArrowPulse * 5) * 0.35;
    ctx.fillStyle = '#e8c050';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('AVANZA  →', W - 24, H * 0.5);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

function bmDrawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(7, -7); ctx.stroke();   // hoja
  ctx.strokeStyle = '#8c2424'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(-4, 4); ctx.stroke(); // empuñadura
  ctx.restore();
}

function bmDrawBossBar(boss) {
  const w = 360, x = (W - w) / 2, y = H - 30;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 2, y - 2, w + 4, 14);
  ctx.fillStyle = '#3a1414'; ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = '#c03030'; ctx.fillRect(x, y, w * Math.max(0, boss.hp / boss.maxHp), 10);
  ctx.strokeStyle = '#e8c050'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, 10);
  ctx.fillStyle = '#e8c050'; ctx.font = 'bold 13px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(boss.char.name + '  ' + boss.char.kanji, W / 2, y - 6);
  ctx.textAlign = 'left';
}

function bmDrawTouch() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of BM_TBTN) {
    const on = bmTouch[b.id];
    ctx.globalAlpha = on ? 0.6 : 0.24;
    ctx.fillStyle = on ? '#e8c050' : '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = on ? 0.9 : 0.5;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#10101a';
    ctx.font = `bold ${Math.round(b.r * 0.7)}px sans-serif`;
    ctx.fillText(b.label, b.x, b.y + 1);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
}

function bmDrawBanner() {
  const a = Math.min(1, bmBannerT, (2.6 - bmBannerT) * 3 + 0.3);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.textAlign = 'center';
  ctx.fillStyle = bmBanner === '¡JEFE!' ? '#e8404a' : '#f0e8d8';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 10;
  ctx.font = 'bold 44px "Courier New", monospace';
  ctx.fillText(bmBanner, W / 2, H * 0.4);
  ctx.font = '18px "Courier New", monospace';
  ctx.fillStyle = '#d8cfbf';
  ctx.fillText(bmBannerSub, W / 2, H * 0.4 + 32);
  ctx.restore();
  ctx.textAlign = 'left';
}

// ---------------- pantallas ----------------
function bmFakeFighter(charId, x, facing, sc) {
  const ch = bmChar(charId);
  return {
    x, y: GROUND, vx: 0, vy: 0, facing, char: ch, pal: ch.pal,
    state: PSTATE.IDLE, stateTimer: 0, scale: (ch.scale || 1) * (sc || 1),
    onGround: true, bob: x, deathT: 0, afterimages: [], attackThrust: false,
  };
}

function bmCenterText(txt, size, y, color, glow) {
  ctx.textAlign = 'center';
  ctx.font = `bold ${size}px "Courier New", monospace`;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
  ctx.fillStyle = color || '#e8e0d0';
  ctx.fillText(txt, W / 2, y);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
}

function bmBackdrop() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1418'); g.addColorStop(1, '#2a2028');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function bmDrawTitle() {
  bmBackdrop();
  bmCenterText('KATANA RŌNIN', 52, H * 0.30, '#e8c050', '#b03030');
  bmCenterText('一  el camino del filo  一', 18, H * 0.30 + 38, '#c0b8a8');
  ctx.globalAlpha = 0.7 + Math.sin(bmTime * 3) * 0.3;
  bmCenterText(BM_TOUCH ? 'TOCA PARA JUGAR SOLO' : 'PULSA  F  /  ENTER  ·  1 JUGADOR', 18, H * 0.55, '#e8e0d0');
  ctx.globalAlpha = 1;

  // botón de CO-OP en línea
  const b = BM_COOP_BTN;
  ctx.save();
  ctx.fillStyle = 'rgba(106,176,232,0.14)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = '#6ab0e8'; ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = '#9ad0e8';
  ctx.font = 'bold 17px "Courier New", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText((BM_TOUCH ? '' : 'O · ') + '友  CO-OP EN LÍNEA', b.x + b.w / 2, b.y + b.h / 2 + 1);
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  if (BM_TOUCH) {
    bmCenterText('◀ ▶ mover · ▲ saltar · 斬 cortar · » deslizar · 受 parar', 13, H * 0.80, '#9a9486');
  } else {
    bmCenterText('← →  mover    W / ↑  saltar    F  cortar    SHIFT  deslizar    K / L  parar', 13, H * 0.80, '#9a9486');
  }
  bmCenterText('un golpe mata — avanza y derrota al yokai de cada etapa', 13, H * 0.86, '#8a8478');

  // mensaje de error de red (desconexión, sin servidor…)
  if (bmNetErrorT > 0 && bmNetError) {
    ctx.globalAlpha = Math.min(1, bmNetErrorT);
    bmCenterText('⚠ ' + bmNetError, 14, H * 0.92, '#e89060');
    ctx.globalAlpha = 1;
  }
  bmCenterText(BM_TOUCH ? '— toca aquí para ver el ranking —' : 'R · ver ranking', 12, H * 0.985, '#6a6458');
}

// pantalla de espera del co-op: buscando / esperando compañero / error
function bmDrawOnline() {
  bmBackdrop();
  bmCenterText('友  CO-OP EN LÍNEA', 34, H * 0.3, '#6ab0e8', '#1a3a5a');
  const fase = bmNet ? bmNet.fase : 'error';
  let msg = 'conectando…', sub = '';
  if (fase === 'buscando') { msg = 'buscando un compañero…'; sub = 'comparte el enlace para que alguien entre al modo'; }
  else if (fase === 'eligiendo') { msg = 'compañero encontrado'; sub = 'elige tu guerrero'; }
  else if (fase === 'esperando') { msg = 'esperando que tu compañero elija…'; sub = 'compañero: ' + (bmNetFoe || '???'); }
  else if (fase === 'error') { msg = bmNetError || 'error de conexión'; sub = ''; }
  // puntos animados
  const dots = '.'.repeat(1 + (Math.floor(bmTime * 2) % 3));
  bmCenterText(msg.replace(/…$/, dots), 20, H * 0.5, '#e8e0d0');
  if (sub) bmCenterText(sub, 14, H * 0.58, '#9a9486');
  ctx.globalAlpha = 0.6 + Math.sin(bmTime * 4) * 0.4;
  bmCenterText(BM_TOUCH ? 'toca para cancelar' : 'F / ESC · cancelar', 14, H * 0.85, '#c0b8a8');
  ctx.globalAlpha = 1;
}

function bmDrawChoose() {
  bmBackdrop();
  bmCenterText('ELIGE TU GUERRERO', 30, H * 0.2, '#e8c050');
  if (bmCoop) bmCenterText('CO-OP · compañero: ' + (bmNetFoe || '???'), 14, H * 0.2 + 26, '#6ab0e8');
  const spots = [W * 0.28, W * 0.5, W * 0.72];
  for (let i = 0; i < BM_PLAYABLE.length; i++) {
    const ch = bmChar(BM_PLAYABLE[i]);
    const sel = i === bmChooseSel;
    if (sel) {
      ctx.fillStyle = 'rgba(232,192,80,0.12)';
      ctx.fillRect(spots[i] - 70, H * 0.28, 140, H * 0.4);
      ctx.strokeStyle = '#e8c050'; ctx.lineWidth = 2;
      ctx.strokeRect(spots[i] - 70, H * 0.28, 140, H * 0.4);
    }
    const fake = bmFakeFighter(BM_PLAYABLE[i], spots[i], 1, 1.15);
    fake.y = H * 0.66; fake.bob = sel ? bmTime * 2 : 0;
    drawSamurai(fake);
    ctx.textAlign = 'center';
    ctx.fillStyle = sel ? '#e8c050' : '#c0b8a8';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText(ch.name, spots[i], H * 0.74);
    ctx.fillStyle = '#9a9486'; ctx.font = '11px "Courier New", monospace';
    bmWrap(ch.desc, spots[i], H * 0.78, 22, 18);
    ctx.textAlign = 'left';
  }
  const txt = bmCoop
    ? (BM_TOUCH ? 'toca un guerrero para confirmar' : '← →  elegir      F  confirmar')
    : (BM_TOUCH ? 'toca un guerrero para empezar' : '← →  elegir      F  confirmar');
  bmCenterText(txt, 16, H * 0.92, '#e8e0d0');
}

function bmWrap(txt, x, y, maxChars, lh) {
  const words = txt.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    if ((line + w).length > maxChars) { ctx.fillText(line.trim(), x, yy); line = ''; yy += lh; }
    line += w + ' ';
  }
  ctx.fillText(line.trim(), x, yy);
}

function bmDrawEnd(title, sub, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.74)'; ctx.fillRect(0, 0, W, H);
  bmCenterText(title, 52, H * 0.26, color, color);
  bmCenterText(sub, 17, H * 0.34, '#d8cfbf');
  bmCenterText(bmScore + ' puntos  ·  ' + bmKills + ' enemigos  ·  mejor combo ' + bmComboBest, 16, H * 0.42, '#c0b8a8');
  if (bmEndT <= 0) {
    bmCenterText('escribe tu nombre y pulsa ENTER para entrar al ranking', 14, H * 0.52, '#9a9486');
    ctx.globalAlpha = 0.6 + Math.sin(bmTime * 4) * 0.4;
    bmCenterText(BM_TOUCH ? 'toca el cuadro · o toca fuera para volver' : 'ENTER: ranking      F: volver al título', 14, H * 0.78, '#e8e0d0');
    ctx.globalAlpha = 1;
  }
}

// ---------------- tabla del ranking del modo ----------------
function bmDrawRanking() {
  bmBackdrop();
  bmCenterText('RANKING · KATANA RŌNIN', 30, H * 0.16, '#e8c050', '#b03030');
  if (bmRankState === 'loading' || (!bmRankList && bmRankState !== 'error')) {
    bmCenterText('cargando…', 18, H * 0.5, '#c0b8a8');
  } else if (bmRankState === 'error' || !bmRankList) {
    bmCenterText('no se pudo cargar el ranking', 16, H * 0.5, '#c08080');
  } else if (bmRankList.length === 0) {
    bmCenterText('aún no hay puntajes — ¡sé el primero!', 16, H * 0.5, '#c0b8a8');
  } else {
    ctx.textAlign = 'left';
    const x0 = W * 0.22, x1 = W * 0.7, x2 = W * 0.84;
    ctx.font = '13px "Courier New", monospace'; ctx.fillStyle = '#9a8a6a';
    ctx.fillText('#  GUERRERO', x0, H * 0.26);
    ctx.textAlign = 'right';
    ctx.fillText('PUNTOS', x1, H * 0.26); ctx.fillText('ETAPA', x2, H * 0.26);
    for (let i = 0; i < bmRankList.length; i++) {
      const r = bmRankList[i], y = H * 0.32 + i * H * 0.058;
      const mine = typeof save !== 'undefined' && r.name === (save.onlineName || '').toUpperCase();
      ctx.fillStyle = mine ? '#e8c050' : (i === 0 ? '#f0e8d8' : '#c0b8a8');
      ctx.font = `${mine ? 'bold ' : ''}16px "Courier New", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText((i + 1) + '.  ' + r.name, x0, y);
      ctx.textAlign = 'right';
      ctx.fillText('' + r.score, x1, y);
      ctx.fillText((r.stage || 1) + '/' + BM_STAGES.length, x2, y);
    }
    ctx.textAlign = 'center';
  }
  ctx.globalAlpha = 0.6 + Math.sin(bmTime * 4) * 0.4;
  bmCenterText(BM_TOUCH ? 'toca para volver' : 'pulsa cualquier tecla para volver', 14, H * 0.92, '#e8e0d0');
  ctx.globalAlpha = 1;
}
