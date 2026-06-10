'use strict';

// ============================================================
//  UI — menús: título, virtudes, destino, apuesta, fin del
//  combate, firma arcade y tabla de récords
// ============================================================

const TITLE_OPTS = [
  { id: 'torneo', label: 'TORNEO · 5 duelos y un rival secreto' },
  { id: 'final',  label: 'TORNEO GOLPE FINAL · un corte decide' },
  { id: 'vs2',    label: '2 JUGADORES · duelo al azar' },
  { id: 'rank',   label: 'TABLA DE RÉCORDS' },
];

function titleChoose(i) {
  const id = TITLE_OPTS[i].id;
  sfxConfirm();
  if (id === 'rank') { scene = 'ranking'; return; }
  if (id === 'vs2') { start2P(); return; }
  startRun(id === 'final');
}

const FIRMA_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function cycleChar(c, d) {
  const i = FIRMA_ALPHA.indexOf(c);
  return FIRMA_ALPHA[(i + d + FIRMA_ALPHA.length) % FIRMA_ALPHA.length];
}

// ---------------- Entrada de menús ----------------
function handleMenus() {
  for (const code of keyPressQueue) {
    if (scene === 'title') {
      if (code === 'KeyW' || code === 'ArrowUp')   { menuSel = (menuSel + TITLE_OPTS.length - 1) % TITLE_OPTS.length; sfxSelect(); }
      if (code === 'KeyS' || code === 'ArrowDown') { menuSel = (menuSel + 1) % TITLE_OPTS.length; sfxSelect(); }
      if (code === 'Enter' || code === 'Space') titleChoose(menuSel);
    } else if (scene === 'virtud') {
      if (code === 'KeyA' || code === 'ArrowLeft')  { virtudSel = (virtudSel + 2) % 3; sfxSelect(); }
      if (code === 'KeyD' || code === 'ArrowRight') { virtudSel = (virtudSel + 1) % 3; sfxSelect(); }
      if (code === 'Enter' || code === 'Space' || code === 'KeyF') { sfxConfirm(); startMatch(); }
    } else if (scene === 'matchEnd') {
      if (code === 'Enter' || code === 'Space') { sfxConfirm(); continueRun(); }
    } else if (scene === 'firma') {
      if (code === 'KeyA' || code === 'ArrowLeft')  { firmaPos = (firmaPos + 2) % 3; sfxSelect(); }
      if (code === 'KeyD' || code === 'ArrowRight') { firmaPos = (firmaPos + 1) % 3; sfxSelect(); }
      if (code === 'KeyW' || code === 'ArrowUp')    { firmaChars[firmaPos] = cycleChar(firmaChars[firmaPos], 1); sfxSelect(); }
      if (code === 'KeyS' || code === 'ArrowDown')  { firmaChars[firmaPos] = cycleChar(firmaChars[firmaPos], -1); sfxSelect(); }
      if (code === 'Enter' || code === 'Space') { sfxConfirm(); submitScore(); }
      if (/^Key[A-Z]$/.test(code)) { firmaChars[firmaPos] = code[3]; firmaPos = Math.min(2, firmaPos + 1); sfxSelect(); }
    } else if (scene === 'ranking') {
      if (code === 'Enter' || code === 'Space' || code === 'Escape') { sfxConfirm(); scene = 'title'; }
    }
  }
  for (const tp of tapQueue) {
    if (scene === 'title') {
      for (let i = 0; i < TITLE_OPTS.length; i++) {
        if (Math.abs(tp.y - (H * 0.52 + i * 42)) < 20) {
          if (menuSel === i) titleChoose(i);
          else { menuSel = i; sfxSelect(); }
        }
      }
    } else if (scene === 'virtud') {
      for (let i = 0; i < 3; i++) {
        const bx = W / 2 + (i - 1) * 260;
        if (Math.abs(tp.x - bx) < 120 && Math.abs(tp.y - H * 0.55) < 100) {
          if (virtudSel === i) { sfxConfirm(); startMatch(); }
          else { virtudSel = i; sfxSelect(); }
        }
      }
    } else if (scene === 'matchEnd') {
      sfxConfirm(); continueRun();
    } else if (scene === 'firma') {
      for (let i = 0; i < 3; i++) {
        const lx = W / 2 + (i - 1) * 80;
        if (Math.abs(tp.x - lx) < 35) {
          if (tp.y > H * 0.34 && tp.y < H * 0.46) { firmaPos = i; firmaChars[i] = cycleChar(firmaChars[i], 1); sfxSelect(); }
          if (tp.y > H * 0.52 && tp.y < H * 0.62) { firmaPos = i; firmaChars[i] = cycleChar(firmaChars[i], -1); sfxSelect(); }
        }
      }
      if (Math.abs(tp.x - W / 2) < 110 && Math.abs(tp.y - H * 0.74) < 26) { sfxConfirm(); submitScore(); }
    } else if (scene === 'ranking') {
      sfxConfirm(); scene = 'title';
    }
  }
}

// ---------------- Pantallas ----------------
function drawTitle(t) {
  drawBackground();
  const demo1 = makePlayer(W * 0.22, 1, CHARS[0], false, '');
  const demo2 = makePlayer(W * 0.78, -1, CHARS[2], false, '');
  demo1.bob = t * 2; demo2.bob = t * 2 + 2;
  demo1.rasgo = null; demo2.rasgo = null;
  drawSamurai(demo1); drawSamurai(demo2);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, H);

  drawCenterText('刀', 80, H * 0.2, '#b03030', '#000');
  drawCenterText('K A T A N A   F I G H T', 44, H * 0.34);
  drawCenterText('fácil de aprender · difícil de dominar', 15, H * 0.41, '#c0b8a8', 'transparent');

  for (let i = 0; i < TITLE_OPTS.length; i++) {
    const sel = menuSel === i;
    const blink = sel && Math.sin(t * 6) > -0.2;
    drawCenterText(
      (sel ? '» ' : '  ') + TITLE_OPTS[i].label + (sel ? ' «' : '  '),
      20, H * 0.52 + i * 42,
      blink ? '#e8c050' : (sel ? '#e8c050' : '#888'),
      sel ? '#b03030' : 'transparent'
    );
  }
  ctx.textAlign = 'center';
  ctx.font = '12px "Courier New", monospace';
  ctx.fillStyle = '#776';
  if (TOUCH) {
    ctx.fillText('◀ ▶ mover · ▲ saltar · 斬 golpe · 謀 finta (mantén = bloqueo)', W / 2, H * 0.88);
  } else {
    ctx.fillText('J1: A/D mover · W saltar · F golpe · G finta (mantén = bloqueo)', W / 2, H * 0.86);
    ctx.fillText('J2: ←/→ mover · ↑ saltar · K golpe · L finta', W / 2, H * 0.90);
  }
  ctx.fillStyle = '#665';
  const secretos = save.unlocked.length;
  ctx.fillText(`victorias: ${save.totalWins} · mejor racha: ${save.bestStreak} · secretos: ${secretos}/${SECRET_CHARS.length} · título: ${currentTitle()}`, W / 2, H * 0.96);
  ctx.textAlign = 'left';
}

// presentación del duelo + elección de virtud
function drawVirtud(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, W, H);

  const isBoss = run && run.fight === RUN_FIGHTS;
  if (run) {
    drawCenterText(isBoss ? '¡EL RIVAL SECRETO TE ESPERA!' : `DUELO ${run.fight} DE ${RUN_FIGHTS}`, 22, H * 0.1,
                   isBoss ? '#ff8060' : '#c0b8a8', isBoss ? '#b03030' : 'transparent');
  } else {
    drawCenterText('DUELO A 2 JUGADORES', 22, H * 0.1, '#c0b8a8', 'transparent');
  }

  // el destino reparte los guerreros: muestra el enfrentamiento
  ctx.textAlign = 'center';
  const rivalName = isBoss && !charUnlocked(run.boss) ? '？？？' : rivalChar.name;
  const rivalKanji = isBoss && !charUnlocked(run.boss) ? '謎' : rivalChar.kanji;
  ctx.font = 'bold 30px serif';
  ctx.fillStyle = '#c03434';
  ctx.fillText(playerChar.kanji, W * 0.3, H * 0.2);
  ctx.fillStyle = '#4a80d8';
  ctx.fillText(rivalKanji, W * 0.7, H * 0.2);
  ctx.font = 'bold 14px "Courier New", monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(playerChar.name, W * 0.3, H * 0.26);
  ctx.fillText(rivalName, W * 0.7, H * 0.26);
  ctx.font = '11px "Courier New", monospace';
  ctx.fillStyle = '#998';
  ctx.fillText(playerChar.desc, W * 0.3, H * 0.3);
  ctx.fillText(isBoss && !charUnlocked(run.boss) ? 'véncelo y se unirá a tu baraja' : rivalChar.desc, W * 0.7, H * 0.3);
  ctx.fillStyle = '#e8c050';
  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.fillText('VS', W / 2, H * 0.24);

  drawCenterText('VIRTUDES DEL DESTINO — elige un don', 20, H * 0.4, '#e8c050');
  for (let i = 0; i < 3; i++) {
    const v = virtudOpts[i];
    const bx = W / 2 + (i - 1) * 260;
    const sel = virtudSel === i;
    const lift = sel ? Math.sin(t * 4) * 4 : 0;
    ctx.fillStyle = sel ? 'rgba(232,192,80,0.16)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(bx - 110, H * 0.45 - lift, 220, 180);
    ctx.strokeStyle = sel ? '#e8c050' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = sel ? 3 : 1;
    ctx.strokeRect(bx - 110, H * 0.45 - lift, 220, 180);
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px serif';
    ctx.fillStyle = sel ? '#e8c050' : '#998';
    ctx.fillText(v.kanji, bx, H * 0.58 - lift);
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillStyle = sel ? '#fff' : '#bbb';
    ctx.fillText(v.name, bx, H * 0.66 - lift);
    ctx.font = '11px "Courier New", monospace';
    ctx.fillStyle = '#c0b8a8';
    ctx.fillText(v.desc, bx, H * 0.7 - lift);
  }
  ctx.textAlign = 'left';
  drawCenterText(TOUCH ? 'toca dos veces para aceptar el don' : 'A/D elegir · F aceptar', 13, H * 0.94, '#776', 'transparent');
}

function drawDestinoScene(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText(`RONDA ${roundNum} — ${stage.name}`, 20, H * 0.22, '#c0b8a8', 'transparent');
  drawCenterText('DESTINO DEL DUELO', 26, H * 0.32, '#e8c050');
  const pulse = 1 + Math.sin(t * 5) * 0.04;
  ctx.save();
  ctx.translate(W / 2, H * 0.54);
  ctx.scale(pulse, pulse);
  ctx.textAlign = 'center';
  ctx.font = 'bold 110px serif';
  ctx.shadowColor = '#b03030';
  ctx.shadowBlur = 40;
  ctx.fillStyle = '#fff';
  ctx.fillText(destino.kanji, 0, 30);
  ctx.restore();
  drawCenterText(destino.name, 32, H * 0.74, '#fff');
  drawCenterText(destino.desc, 16, H * 0.81, '#c0b8a8', 'transparent');
}

function drawApuesta(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);
  if (betReveal > 0) {
    drawCenterText('LAS APUESTAS SE REVELAN', 24, H * 0.2, '#e8c050');
    for (const [idx, px] of [[0, W * 0.3], [1, W * 0.7]]) {
      const b = APUESTAS[betSel[idx]];
      ctx.textAlign = 'center';
      ctx.font = 'bold 64px serif';
      ctx.fillStyle = idx === 0 ? '#c03434' : '#4a80d8';
      ctx.fillText(b.kanji, px, H * 0.5);
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(b.name, px, H * 0.6);
      ctx.font = '13px "Courier New", monospace';
      ctx.fillStyle = '#998';
      ctx.fillText(idx === 0 ? p1.name : p2.name, px, H * 0.38);
    }
    ctx.textAlign = 'left';
    return;
  }
  const who = !betDone[0] ? 0 : 1;
  drawCenterText('APUESTA SECRETA', 28, H * 0.18, '#e8c050');
  drawCenterText(
    (who === 0 ? p1.name : p2.name) + ' — elige tu actitud para esta ronda',
    15, H * 0.25, who === 0 ? '#ff8a7a' : '#8ab4ff', 'transparent');
  for (let i = 0; i < 3; i++) {
    const b = APUESTAS[i];
    const bx = W / 2 + (i - 1) * 250;
    const sel = betSel[who] === i;
    ctx.fillStyle = sel ? 'rgba(232,192,80,0.16)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(bx - 105, H * 0.36, 210, 170);
    ctx.strokeStyle = sel ? '#e8c050' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = sel ? 3 : 1;
    ctx.strokeRect(bx - 105, H * 0.36, 210, 170);
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px serif';
    ctx.fillStyle = sel ? '#e8c050' : '#998';
    ctx.fillText(b.kanji, bx, H * 0.49);
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.fillStyle = sel ? '#fff' : '#bbb';
    ctx.fillText(b.name, bx, H * 0.56);
    ctx.font = '11px "Courier New", monospace';
    ctx.fillStyle = '#c0b8a8';
    ctx.fillText(b.desc, bx, H * 0.61);
  }
  ctx.textAlign = 'left';
  if (!vsCPU) drawCenterText('elección secreta: ¡que no mire el rival!', 13, H * 0.9, '#776', 'transparent');
  drawCenterText(TOUCH ? 'toca dos veces para sellar tu apuesta' : (who === 0 ? 'A/D elegir · F sellar' : '←/→ elegir · K sellar'), 13, H * 0.95, '#776', 'transparent');
}

function drawMatchEnd(t) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, W, H);

  if (run && !runOver) {
    // duelo del torneo superado: hay más por delante
    drawCenterText('勝 利', 56, H * 0.22, '#b03030', '#000');
    drawCenterText(`DUELO ${run.fight} SUPERADO`, 36, H * 0.36);
    drawCenterText(`puntaje acumulado: ${run.score}`, 20, H * 0.46, '#e8c050', 'transparent');
    drawCenterText(run.fight + 1 === RUN_FIGHTS
      ? 'el siguiente rival se oculta entre sombras…'
      : `siguiente duelo: ${run.fight + 1} de ${RUN_FIGHTS}`,
      16, H * 0.56, '#c0b8a8', 'transparent');
  } else if (runOver === 'champion') {
    drawCenterText('天 下 一', 56, H * 0.2, '#e8c050', '#b03030');
    drawCenterText('¡CAMPEÓN DEL TORNEO!', 40, H * 0.34);
    if (runUnlocked) {
      drawCenterText(`★ ${runUnlocked.name} se une a tu baraja ★`, 20, H * 0.46, '#9ad0e8', 'transparent');
    } else {
      drawCenterText('el rival secreto reconoce tu acero', 16, H * 0.46, '#c0b8a8', 'transparent');
    }
    drawCenterText(`PUNTAJE FINAL: ${run ? run.score : 0}`, 26, H * 0.58, '#e8c050');
  } else if (runOver === 'defeat') {
    drawCenterText('敗 北', 56, H * 0.22, '#888', '#000');
    drawCenterText('HAS CAÍDO', 40, H * 0.36);
    drawCenterText(`llegaste al duelo ${run ? run.fight : '?'} de ${RUN_FIGHTS}`, 17, H * 0.46, '#c0b8a8', 'transparent');
    drawCenterText(`puntaje final: ${run ? run.score : 0}`, 20, H * 0.55, '#e8c050', 'transparent');
  } else {
    // 2 jugadores
    drawCenterText('勝 利', 64, H * 0.24, '#b03030', '#000');
    drawCenterText(`${matchWinner.name} VENCE`, 40, H * 0.4);
    drawCenterText(`${matchWinner.char.name} · ${matchWinner.wins} — ${matchWinner === p1 ? p2.wins : p1.wins}`, 20, H * 0.5, '#e8c050', 'transparent');
  }

  if (Math.sin(t * 4) > -0.3) {
    drawCenterText(TOUCH ? 'toca para continuar' : 'ENTER para continuar', 15, H * 0.82, '#c0b8a8', 'transparent');
  }
}

function drawFirma(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText('¡HAZAÑA DIGNA DE LEYENDA!', 26, H * 0.14, '#e8c050');
  drawCenterText(`puntaje: ${pendingScore.score}`, 18, H * 0.22, '#fff', 'transparent');
  drawCenterText('deja tu firma en la historia', 14, H * 0.28, '#c0b8a8', 'transparent');
  for (let i = 0; i < 3; i++) {
    const lx = W / 2 + (i - 1) * 80;
    const sel = firmaPos === i;
    ctx.textAlign = 'center';
    ctx.font = '20px "Courier New", monospace';
    ctx.fillStyle = sel ? '#e8c050' : '#555';
    ctx.fillText('▲', lx, H * 0.4);
    ctx.font = 'bold 64px "Courier New", monospace';
    ctx.fillStyle = sel && Math.sin(t * 6) > -0.2 ? '#e8c050' : '#fff';
    ctx.fillText(firmaChars[i], lx, H * 0.52);
    ctx.font = '20px "Courier New", monospace';
    ctx.fillStyle = sel ? '#e8c050' : '#555';
    ctx.fillText('▼', lx, H * 0.6);
  }
  ctx.strokeStyle = '#e8c050';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 110, H * 0.7, 220, 50);
  drawCenterText('CONFIRMAR', 20, H * 0.76, '#e8c050', 'transparent');
  ctx.textAlign = 'left';
}

function drawRanking(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText('番付 — TABLA DE RÉCORDS', 28, 56, '#e8c050');
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillStyle = '#998';
  ctx.fillText('#   FIRMA   PUNTAJE   RACHA   FECHA       TÍTULO', W / 2, 96);
  if (!save.ranking.length) {
    drawCenterText('aún nadie ha dejado su nombre…', 16, H * 0.5, '#776', 'transparent');
  }
  for (let i = 0; i < save.ranking.length; i++) {
    const r = save.ranking[i];
    const y = 126 + i * 32;
    const top = i === 0;
    ctx.font = (top ? 'bold 15px' : '13px') + ' "Courier New", monospace';
    ctx.fillStyle = top ? '#e8c050' : i < 3 ? '#d8c8a0' : '#b0a890';
    const row = `${String(i + 1).padStart(2)}  ${r.firma.padEnd(5)} ${String(r.score).padStart(8)}  ${String(r.racha).padStart(4)}   ${(r.fecha || '').padEnd(10)}  ${r.titulo || ''}`;
    ctx.fillText(row, W / 2, y);
  }
  ctx.textAlign = 'left';
  drawCenterText(`reputación — honor ${save.rep.honor} · astucia ${save.rep.astucia} · ferocidad ${save.rep.ferocidad} · disciplina ${save.rep.disciplina}`, 13, H - 50, '#998', 'transparent');
  if (Math.sin(t * 4) > -0.3) {
    drawCenterText(TOUCH ? 'toca para volver' : 'ENTER para volver', 14, H - 22, '#c0b8a8', 'transparent');
  }
}
