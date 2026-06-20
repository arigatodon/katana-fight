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

function bmDraw() {
  ctx.clearRect(0, 0, W, H);
  if (bmScene === 'title') return bmDrawTitle();
  if (bmScene === 'choose') return bmDrawChoose();

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

  // manchas de sangre acumuladas en el suelo (jefe abatido)
  for (const s of bmStains) {
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r, s.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

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
  const all = bmEnemies.concat([bmPlayer]).filter(Boolean).sort((a, b) => a.y - b.y);
  for (const f of all) {
    // parpadeo de invulnerabilidad del jugador
    if (f === bmPlayer && f.invT > 0 && Math.floor(bmTime * 20) % 2 === 0 && f.state !== PSTATE.DEAD) continue;
    drawSamurai(f);
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

// ---------------- HUD ----------------
function bmDrawHud() {
  // vidas (katanas)
  ctx.save();
  for (let i = 0; i < BM_LIVES; i++) {
    ctx.globalAlpha = i < bmLives ? 1 : 0.22;
    bmDrawLifeIcon(20 + i * 26, 26);
  }
  ctx.globalAlpha = 1;

  // puntaje
  ctx.fillStyle = '#e8e0d0';
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('武 ' + bmScore, W - 16, 30);
  ctx.textAlign = 'left';

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
  bmCenterText('KATANA RŌNIN', 52, H * 0.34, '#e8c050', '#b03030');
  bmCenterText('一  el camino del filo  一', 18, H * 0.34 + 38, '#c0b8a8');
  ctx.globalAlpha = 0.7 + Math.sin(bmTime * 3) * 0.3;
  bmCenterText(BM_TOUCH ? 'TOCA LA PANTALLA PARA EMPEZAR' : 'PULSA  F  /  ENTER  PARA EMPEZAR', 18, H * 0.62, '#e8e0d0');
  ctx.globalAlpha = 1;
  if (BM_TOUCH) {
    bmCenterText('botones en pantalla: ◀ ▶ mover · ▲ saltar · 斬 cortar · » deslizar', 13, H * 0.79, '#9a9486');
  } else {
    bmCenterText('← →  mover     W / ↑  saltar     F  cortar', 14, H * 0.76, '#9a9486');
    bmCenterText('doble ← / →  ó  SHIFT  ·  deslizamiento rápido (esquiva)', 14, H * 0.82, '#9a9486');
  }
  bmCenterText('un golpe mata — avanza y derrota al yokai de cada etapa', 13, H * 0.88, '#8a8478');
}

function bmDrawChoose() {
  bmBackdrop();
  bmCenterText('ELIGE TU GUERRERO', 30, H * 0.2, '#e8c050');
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
  bmCenterText(BM_TOUCH ? 'toca un guerrero para empezar' : '← →  elegir      F  confirmar', 16, H * 0.92, '#e8e0d0');
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
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
  bmCenterText(title, 56, H * 0.4, color, color);
  bmCenterText(sub, 18, H * 0.49, '#d8cfbf');
  bmCenterText('Puntuación final: ' + bmScore + '  ·  ' + bmKills + ' enemigos', 16, H * 0.57, '#c0b8a8');
  if (bmEndT <= 0) {
    ctx.globalAlpha = 0.6 + Math.sin(bmTime * 4) * 0.4;
    bmCenterText('PULSA  F  PARA VOLVER', 16, H * 0.7, '#e8e0d0');
    ctx.globalAlpha = 1;
  }
}
