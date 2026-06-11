'use strict';

// ============================================================
//  UI — menús: título, virtudes, destino, apuesta, fin del
//  combate, firma arcade y tabla de récords
// ============================================================

const TITLE_OPTS = [
  { id: 'torneo', label: 'TORNEO · 5 duelos y un rival secreto' },
  { id: 'final',  label: 'TORNEO GOLPE FINAL · un corte decide' },
  { id: 'vs2',    label: '2 JUGADORES · elige tu guerrero' },
  { id: 'online', label: 'DUELO EN LÍNEA · emparejamiento' },
  { id: 'rank',   label: 'TABLA DE RÉCORDS' },
];

// tabla de récords: una pestaña por modo de juego
const RANK_TABS = [
  { id: 'torneo', label: 'TORNEO' },
  { id: 'final',  label: 'GOLPE FINAL' },
  { id: 'online', label: 'EN LÍNEA' },
];
let rankTab = 0;

function setRankTab(i) {
  rankTab = (i + RANK_TABS.length) % RANK_TABS.length;
  if (RANK_TABS[rankTab].id === 'online') fetchNetRanking();
}

// enlaces del título (también vale el footer HTML en escritorio)
const LINK_HOME = 'https://igorv.org';
const LINK_DONA = 'https://www.buda.com/link/arigatodon';
const LINK_MPAGO = 'https://link.mercadopago.cl/igordev';   // acepta tarjetas y débito chilenos

function titleChoose(i) {
  const id = TITLE_OPTS[i].id;
  sfxConfirm();
  if (id === 'rank') { setRankTab(rankTab); scene = 'ranking'; return; }
  if (id === 'vs2') { start2P(); return; }
  if (id === 'online') { enterNombre(); return; }
  startRun(id === 'final');
}

// ---------------- Nombre para el duelo en línea ----------------
const nameInput = document.getElementById('nameInput');

function sanitizeName(s) {
  return String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12).toUpperCase();
}

function enterNombre() {
  scene = 'nombre';
  nameInput.value = save.onlineName || '';
  nameInput.style.display = 'block';
  setTimeout(() => nameInput.focus(), 50);
}

function hideNameInput() {
  nameInput.style.display = 'none';
  nameInput.blur();
}

function confirmName() {
  const name = sanitizeName(nameInput.value);
  save.onlineName = name;
  persist();
  hideNameInput();
  sfxConfirm();
  netConnect(name || 'ANÓNIMO');
  scene = 'online';
}

if (nameInput) {
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmName();
    if (e.key === 'Escape') { hideNameInput(); scene = 'title'; }
  });
}

// ---------------- Apoyo al herrero (al terminar el torneo) ----------------
let apoyoSel = 3;
let comentarioEnviado = false;   // un comentario por torneo

function apoyoOpts() {
  return [
    { id: 'buda',  label: 'DONAR ❤ VÍA BUDA' },
    { id: 'mpago', label: 'DONAR ❤ VÍA MERCADO PAGO' },
    { id: 'coment', label: comentarioEnviado ? 'COMENTARIO ENVIADO ✓' : 'DEJAR COMENTARIO O SUGERENCIA' },
    { id: 'seguir', label: 'VER MI PUNTAJE' },
  ];
}

function enterApoyo() {
  apoyoSel = apoyoOpts().length - 1;   // por defecto: seguir
  scene = 'apoyo';
}

function apoyoChoose(i) {
  const id = apoyoOpts()[i].id;
  sfxConfirm();
  if (id === 'buda') { window.open(LINK_DONA, '_blank'); return; }
  if (id === 'mpago') { window.open(LINK_MPAGO, '_blank'); return; }
  if (id === 'coment') { if (!comentarioEnviado) enterComentario(); return; }
  finishRunScore();
}

// comentario: textarea HTML flotante, se publica en /comentarios
const commentInput = document.getElementById('commentInput');

function enterComentario() {
  scene = 'comentario';
  commentInput.value = '';
  commentInput.style.display = 'block';
  setTimeout(() => commentInput.focus(), 50);
}

function hideCommentInput() {
  commentInput.style.display = 'none';
  commentInput.blur();
}

function sendComment() {
  const text = commentInput.value.trim().slice(0, 280);
  hideCommentInput();
  if (!text) { scene = 'apoyo'; return; }
  fetch(netHttpBase() + '/comentarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: save.onlineName || save.lastFirma || 'ANÓNIMO', text }),
  }).catch(() => {});
  comentarioEnviado = true;
  apoyoSel = apoyoOpts().length - 1;   // siguiente ENTER: ver el puntaje
  sfxConfirm();
  scene = 'apoyo';
}

if (commentInput) {
  commentInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
    if (e.key === 'Escape') { hideCommentInput(); scene = 'apoyo'; }
  });
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
    } else if (scene === 'choose') {
      const n = choosePool().length;
      if (code === 'KeyA' || code === 'ArrowLeft')  { chooseSel = (chooseSel + n - 1) % n; sfxSelect(); }
      if (code === 'KeyD' || code === 'ArrowRight') { chooseSel = (chooseSel + 1) % n; sfxSelect(); }
      if ((code === 'KeyW' || code === 'ArrowUp') && chooseSel - CHOOSE_COLS >= 0)   { chooseSel -= CHOOSE_COLS; sfxSelect(); }
      if ((code === 'KeyS' || code === 'ArrowDown') && chooseSel + CHOOSE_COLS < n)  { chooseSel += CHOOSE_COLS; sfxSelect(); }
      if (code === 'Enter' || code === 'Space' || code === 'KeyF' || code === 'KeyK') confirmChoose();
    } else if (scene === 'virtud') {
      if (code === 'KeyA' || code === 'ArrowLeft')  { virtudSel = (virtudSel + 2) % 3; sfxSelect(); }
      if (code === 'KeyD' || code === 'ArrowRight') { virtudSel = (virtudSel + 1) % 3; sfxSelect(); }
      if (code === 'Enter' || code === 'Space' || code === 'KeyF') {
        sfxConfirm();
        runVirtud = virtudOpts[virtudSel];
        nextFight();
      }
    } else if (scene === 'vs') {
      // online la presentación avanza sola: saltarla desincronizaría el lockstep
      if (!netActive() && (code === 'Enter' || code === 'Space' || code === 'KeyF' || code === 'KeyK')) { sfxConfirm(); startMatch(); }
    } else if (scene === 'nombre') {
      // mientras se escribe, el input retiene las teclas; esto cubre
      // el caso de confirmar/cancelar con el campo sin foco
      if (code === 'Enter') confirmName();
      if (code === 'Escape') { hideNameInput(); scene = 'title'; }
    } else if (scene === 'online') {
      if (code === 'Enter' || code === 'Space' || code === 'Escape') { sfxConfirm(); netLeave2Title(); }
    } else if (scene === 'matchEnd') {
      if (code === 'Enter' || code === 'Space') {
        sfxConfirm();
        if (netActive() || netResult) leaveNetMatch();
        else continueRun();
      }
    } else if (scene === 'apoyo') {
      const n = apoyoOpts().length;
      if (code === 'KeyW' || code === 'ArrowUp')   { apoyoSel = (apoyoSel + n - 1) % n; sfxSelect(); }
      if (code === 'KeyS' || code === 'ArrowDown') { apoyoSel = (apoyoSel + 1) % n; sfxSelect(); }
      if (code === 'Enter' || code === 'Space') apoyoChoose(apoyoSel);
      if (code === 'Escape') { sfxConfirm(); finishRunScore(); }
    } else if (scene === 'comentario') {
      // mientras se escribe, el textarea retiene las teclas; esto cubre
      // el caso de confirmar/cancelar con el campo sin foco
      if (code === 'Enter') sendComment();
      if (code === 'Escape') { hideCommentInput(); scene = 'apoyo'; }
    } else if (scene === 'firma') {
      if (code === 'KeyA' || code === 'ArrowLeft')  { firmaPos = (firmaPos + 2) % 3; sfxSelect(); }
      if (code === 'KeyD' || code === 'ArrowRight') { firmaPos = (firmaPos + 1) % 3; sfxSelect(); }
      if (code === 'KeyW' || code === 'ArrowUp')    { firmaChars[firmaPos] = cycleChar(firmaChars[firmaPos], 1); sfxSelect(); }
      if (code === 'KeyS' || code === 'ArrowDown')  { firmaChars[firmaPos] = cycleChar(firmaChars[firmaPos], -1); sfxSelect(); }
      if (code === 'Enter' || code === 'Space') { sfxConfirm(); submitScore(); }
      if (/^Key[A-Z]$/.test(code)) { firmaChars[firmaPos] = code[3]; firmaPos = Math.min(2, firmaPos + 1); sfxSelect(); }
    } else if (scene === 'ranking') {
      if (code === 'KeyA' || code === 'ArrowLeft')  { setRankTab(rankTab - 1); sfxSelect(); }
      if (code === 'KeyD' || code === 'ArrowRight') { setRankTab(rankTab + 1); sfxSelect(); }
      if (code === 'Enter' || code === 'Space' || code === 'Escape') { sfxConfirm(); scene = 'title'; }
    }
  }
  for (const tp of tapQueue) {
    if (scene === 'title') {
      if (tp.y < 34) {        // enlaces de las esquinas superiores
        if (tp.x < 120) { window.open(LINK_HOME, '_blank'); continue; }
        if (tp.x > W - 120) { window.open(LINK_DONA, '_blank'); continue; }
      }
      for (let i = 0; i < TITLE_OPTS.length; i++) {
        if (Math.abs(tp.y - (H * 0.52 + i * 42)) < 20) {
          if (menuSel === i) titleChoose(i);
          else { menuSel = i; sfxSelect(); }
        }
      }
    } else if (scene === 'choose') {
      const pool = choosePool();
      for (let i = 0; i < pool.length; i++) {
        const c = chooseCell(i);
        if (Math.abs(tp.x - c.x) < 86 && Math.abs(tp.y - c.y) < 54) {
          if (chooseSel === i) confirmChoose();
          else { chooseSel = i; sfxSelect(); }
        }
      }
    } else if (scene === 'virtud') {
      for (let i = 0; i < 3; i++) {
        const bx = W / 2 + (i - 1) * 260;
        if (Math.abs(tp.x - bx) < 120 && Math.abs(tp.y - H * 0.55) < 100) {
          if (virtudSel === i) { sfxConfirm(); runVirtud = virtudOpts[virtudSel]; nextFight(); }
          else { virtudSel = i; sfxSelect(); }
        }
      }
    } else if (scene === 'vs') {
      if (!netActive()) { sfxConfirm(); startMatch(); }
    } else if (scene === 'nombre') {
      if (Math.abs(tp.x - W / 2) < 130 && Math.abs(tp.y - H * 0.68) < 30) confirmName();
    } else if (scene === 'online') {
      sfxConfirm(); netLeave2Title();
    } else if (scene === 'matchEnd') {
      sfxConfirm();
      if (netActive() || netResult) leaveNetMatch();
      else continueRun();
    } else if (scene === 'apoyo') {
      const opts = apoyoOpts();
      for (let i = 0; i < opts.length; i++) {
        if (Math.abs(tp.y - (H * 0.44 + i * 50)) < 23) {
          if (apoyoSel === i) apoyoChoose(i);
          else { apoyoSel = i; sfxSelect(); }
        }
      }
    } else if (scene === 'comentario') {
      if (Math.abs(tp.x - W / 2) < 130 && Math.abs(tp.y - H * 0.68) < 30) sendComment();
      else if (tp.y > H * 0.82) { hideCommentInput(); scene = 'apoyo'; }
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
      let hit = false;
      for (let i = 0; i < RANK_TABS.length; i++) {
        if (Math.abs(tp.x - (W / 2 + (i - 1) * 240)) < 110 && Math.abs(tp.y - 96) < 22) {
          setRankTab(i); sfxSelect(); hit = true;
        }
      }
      if (!hit) { sfxConfirm(); scene = 'title'; }
    }
  }
}

// al salir del matchEnd online: cerrar la conexión y mostrar el ranking
function leaveNetMatch() {
  netLeave();
  netResult = null;
  setRankTab(RANK_TABS.findIndex(tb => tb.id === 'online'));
  scene = 'ranking';
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
  ctx.fillStyle = '#665';
  const secretos = save.unlocked.length;
  ctx.fillText(`victorias: ${save.totalWins} · mejor racha: ${save.bestStreak} · secretos: ${secretos}/${SECRET_CHARS.length} · título: ${currentTitle()}`, W / 2, H * 0.96);
  // enlaces en las esquinas (tocables / clicables)
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#5a7a8a';
  ctx.fillText('igorv.org', 12, 22);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a86a6a';
  ctx.fillText('dona ❤', W - 12, 22);
  ctx.textAlign = 'left';
}

// nombre del guerrero antes de buscar duelo (el input HTML flota encima)
function drawNombre(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText('DUELO EN LÍNEA', 30, H * 0.16, '#e8c050');
  drawCenterText('¿cómo te llamarán en el duelo?', 18, H * 0.28, '#c0b8a8', 'transparent');
  // el campo de texto (HTML) queda centrado en H*0.46
  const sel = Math.sin(t * 4) > -0.3;
  ctx.strokeStyle = sel ? '#e8c050' : '#9a8440';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 130, H * 0.68 - 26, 260, 52);
  drawCenterText('BUSCAR RIVAL', 20, H * 0.69, '#e8c050', 'transparent');
  drawCenterText(TOUCH ? 'escribe y toca BUSCAR RIVAL' : 'escribe tu nombre y pulsa ENTER', 13, H * 0.88, '#776', 'transparent');
}

// pantalla del duelo en línea: conexión, búsqueda y errores
function drawOnline(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText('DUELO EN LÍNEA', 30, H * 0.18, '#e8c050');

  const pulse = 1 + Math.sin(t * 3) * 0.06;
  ctx.save();
  ctx.translate(W / 2, H * 0.48);
  ctx.scale(pulse, pulse);
  ctx.textAlign = 'center';
  ctx.font = 'bold 96px serif';
  ctx.shadowColor = '#b03030';
  ctx.shadowBlur = 35;
  ctx.fillStyle = net && net.fase === 'error' ? '#886' : '#fff';
  ctx.fillText('縁', 0, 30);
  ctx.restore();

  if (net && net.fase !== 'error') {
    drawCenterText('— ' + net.myName + ' —', 15, H * 0.27, '#9ad0e8', 'transparent');
  }
  let msg = '';
  if (!net || net.fase === 'error') msg = (net && net.error) || 'sin conexión';
  else if (net.fase === 'conectando') msg = 'forjando la conexión…';
  else if (net.fase === 'buscando') msg = 'buscando un rival digno…';
  else if (net.fase === 'esperando') msg = `${net.foeName} elige a su guerrero…`;
  const dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
  const searching = net && net.fase !== 'error';
  drawCenterText(msg + (searching ? ' ' + dots : ''), 18, H * 0.68,
                 searching ? '#c0b8a8' : '#ff8a7a', 'transparent');
  if (Math.sin(t * 4) > -0.3) {
    drawCenterText(
      searching ? (TOUCH ? 'toca para cancelar' : 'ESC para cancelar')
                : (TOUCH ? 'toca para volver' : 'ENTER para volver'),
      13, H * 0.88, '#776', 'transparent');
  }
}

// selección de personaje (torneo: J1 · 2 jugadores: J1 y luego J2 · online: cada cual el suyo)
function drawChoose(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);

  const pool = choosePool();
  const who = vsCPU || netActive() ? '' : (choosingP === 0 ? ' — JUGADOR 1' : ' — JUGADOR 2');
  drawCenterText('ELIGE A TU GUERRERO' + who, 24, 64,
                 !vsCPU && !netActive() && choosingP === 1 ? '#8ab4ff' : '#e8c050');
  if (netActive()) {
    drawCenterText(`tu rival: ${net.foeName}`, 14, 92, '#8ab4ff', 'transparent');
  }

  for (let i = 0; i < pool.length; i++) {
    const ch = pool[i];
    const c = chooseCell(i);
    const sel = chooseSel === i;
    const lift = sel ? Math.sin(t * 4) * 3 : 0;
    ctx.fillStyle = sel ? 'rgba(232,192,80,0.16)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(c.x - 82, c.y - 50 - lift, 164, 100);
    ctx.strokeStyle = sel ? '#e8c050' : ch.secret ? 'rgba(154,208,232,0.5)' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = sel ? 3 : 1;
    ctx.strokeRect(c.x - 82, c.y - 50 - lift, 164, 100);
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px serif';
    ctx.fillStyle = sel ? '#e8c050' : ch.secret ? '#9ad0e8' : '#998';
    ctx.fillText(ch.kanji, c.x, c.y + 8 - lift);
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = sel ? '#fff' : '#bbb';
    ctx.fillText(ch.name, c.x, c.y + 34 - lift);
  }
  ctx.textAlign = 'left';
  drawCenterText(pool[chooseSel].desc, 16, H * 0.86, '#c0b8a8', 'transparent');
  drawCenterText(TOUCH ? 'toca dos veces para elegir' : 'A/D/W/S elegir · F aceptar', 13, H * 0.94, '#776', 'transparent');
}

// presentación del duelo (automática, se puede saltar)
function drawVS(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);

  const isBoss = run && run.fight === RUN_FIGHTS;
  if (run) {
    drawCenterText(isBoss ? '¡EL RIVAL SECRETO TE ESPERA!' : `DUELO ${run.fight} DE ${RUN_FIGHTS}`, 24, H * 0.14,
                   isBoss ? '#ff8060' : '#c0b8a8', isBoss ? '#b03030' : 'transparent');
  } else {
    drawCenterText(netActive() ? 'DUELO EN LÍNEA' : 'DUELO A 2 JUGADORES', 24, H * 0.14, '#c0b8a8', 'transparent');
  }

  ctx.textAlign = 'center';
  const hidden = isBoss && !charUnlocked(run.boss);
  const rivalName = hidden ? '？？？' : rivalChar.name;
  const rivalKanji = hidden ? '謎' : rivalChar.kanji;
  if (netActive()) {            // quién es quién en el duelo en línea
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = '#ff8a7a';
    ctx.fillText(net.side === 0 ? net.myName + ' (TÚ)' : net.foeName, W * 0.3, H * 0.28);
    ctx.fillStyle = '#8ab4ff';
    ctx.fillText(net.side === 1 ? net.myName + ' (TÚ)' : net.foeName, W * 0.7, H * 0.28);
  }
  ctx.font = 'bold 84px serif';
  ctx.shadowBlur = 30;
  ctx.shadowColor = '#b03030';
  ctx.fillStyle = '#c03434';
  ctx.fillText(playerChar.kanji, W * 0.3, H * 0.48);
  ctx.shadowColor = '#3050a0';
  ctx.fillStyle = '#4a80d8';
  ctx.fillText(rivalKanji, W * 0.7, H * 0.48);
  ctx.shadowBlur = 0;
  ctx.font = 'bold 17px "Courier New", monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(playerChar.name, W * 0.3, H * 0.58);
  ctx.fillText(rivalName, W * 0.7, H * 0.58);
  ctx.font = '12px "Courier New", monospace';
  ctx.fillStyle = '#998';
  ctx.fillText(playerChar.desc, W * 0.3, H * 0.63);
  ctx.fillText(hidden ? 'véncelo y se unirá a tu baraja' : rivalChar.desc, W * 0.7, H * 0.63);

  const pulse = 1 + Math.sin(t * 5) * 0.08;
  ctx.save();
  ctx.translate(W / 2, H * 0.52);
  ctx.scale(pulse, pulse);
  ctx.font = 'bold 30px "Courier New", monospace';
  ctx.fillStyle = '#e8c050';
  ctx.fillText('VS', 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';

  if (runVirtud) {
    drawCenterText(`don del torneo: ${runVirtud.name} — ${runVirtud.desc}`, 13, H * 0.76, '#9ad0e8', 'transparent');
  }
  if (!netActive() && Math.sin(t * 4) > -0.3) {
    drawCenterText(TOUCH ? 'toca para desenvainar' : 'F para desenvainar', 14, H * 0.88, '#c0b8a8', 'transparent');
  }
}

// elección de virtud: un solo don para todo el torneo
function drawVirtud(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.font = 'bold 40px serif';
  ctx.fillStyle = '#c03434';
  ctx.fillText(playerChar.kanji, W / 2, H * 0.15);
  ctx.font = 'bold 15px "Courier New", monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(playerChar.name, W / 2, H * 0.21);
  ctx.textAlign = 'left';

  drawCenterText('VIRTUDES DEL DESTINO — un don para todo el torneo', 20, H * 0.32, '#e8c050');
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
  if (destinoPorClima && clima) {
    drawCenterText(`el cielo real lo dicta: hay ${clima.label} en tu ciudad`, 13, H * 0.9, '#9ad0e8', 'transparent');
  }
}

// apuestas al azar: la suerte decide y se muestra en pantalla
function drawApuesta(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText('LA SUERTE REPARTE LAS APUESTAS', 24, H * 0.18, '#e8c050');
  for (const [idx, px] of [[0, W * 0.3], [1, W * 0.7]]) {
    const b = APUESTAS[betSel[idx]];
    ctx.textAlign = 'center';
    ctx.font = '13px "Courier New", monospace';
    ctx.fillStyle = '#998';
    ctx.fillText(idx === 0 ? p1.name : p2.name, px, H * 0.34);
    ctx.font = 'bold 64px serif';
    ctx.fillStyle = idx === 0 ? '#c03434' : '#4a80d8';
    ctx.fillText(b.kanji, px, H * 0.5);
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(b.name, px, H * 0.6);
    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = '#c0b8a8';
    ctx.fillText(b.desc, px, H * 0.66);
  }
  ctx.textAlign = 'left';
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
    // 2 jugadores u online
    drawCenterText('勝 利', 64, H * 0.24, '#b03030', '#000');
    drawCenterText(`${matchWinner.name} VENCE`, 40, H * 0.4);
    drawCenterText(`${matchWinner.char.name} · ${matchWinner.wins} — ${matchWinner === p1 ? p2.wins : p1.wins}`, 20, H * 0.5, '#e8c050', 'transparent');
    if (netResult) {
      drawCenterText(netResult.mine
        ? `+${netResult.score} puntos en el ranking en línea`
        : 'tu rival suma puntos en el ranking en línea',
        16, H * 0.6, '#9ad0e8', 'transparent');
    }
  }

  if (Math.sin(t * 4) > -0.3) {
    drawCenterText(TOUCH ? 'toca para continuar' : 'ENTER para continuar', 15, H * 0.82, '#c0b8a8', 'transparent');
  }
}

// gracias por jugar: donar o dejar un comentario antes del puntaje
function drawApoyo(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText('礼', 60, H * 0.15, '#b03030', '#000');
  drawCenterText('GRACIAS POR JUGAR', 30, H * 0.27, '#e8c050');
  drawCenterText('si el duelo te gustó, puedes apoyar al herrero o dejarle un mensaje', 14, H * 0.34, '#c0b8a8', 'transparent');
  const opts = apoyoOpts();
  for (let i = 0; i < opts.length; i++) {
    const sel = apoyoSel === i;
    const blink = sel && Math.sin(t * 6) > -0.2;
    const enviado = opts[i].id === 'coment' && comentarioEnviado;
    drawCenterText(
      (sel ? '» ' : '  ') + opts[i].label + (sel ? ' «' : '  '),
      19, H * 0.44 + i * 50,
      enviado ? '#6a9a6a' : blink || sel ? '#e8c050' : '#888',
      sel ? '#b03030' : 'transparent');
  }
  drawCenterText('los comentarios se publican en katana.igorv.org/comentarios', 12, H * 0.92, '#776', 'transparent');
}

// escribir comentario (el textarea HTML flota encima, centrado en H*0.42)
function drawComentario(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText('TU COMENTARIO O SUGERENCIA', 26, H * 0.13, '#e8c050');
  drawCenterText('quedará publicado en la página de comentarios del juego', 14, H * 0.21, '#c0b8a8', 'transparent');
  ctx.strokeStyle = Math.sin(t * 4) > -0.3 ? '#e8c050' : '#9a8440';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 130, H * 0.68 - 26, 260, 52);
  drawCenterText('ENVIAR', 20, H * 0.69, '#e8c050', 'transparent');
  drawCenterText(TOUCH ? 'toca ENVIAR · toca abajo para volver sin enviar' : 'ENTER envía · ESC vuelve sin enviar', 13, H * 0.88, '#776', 'transparent');
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

// tabla de récords con pestañas: torneo / golpe final / en línea
function drawRanking(t) {
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, W, H);
  drawCenterText('番付 — TABLA DE RÉCORDS', 28, 52, '#e8c050');

  ctx.textAlign = 'center';
  for (let i = 0; i < RANK_TABS.length; i++) {
    const sel = rankTab === i;
    ctx.font = (sel ? 'bold 16px' : '14px') + ' "Courier New", monospace';
    ctx.fillStyle = sel ? '#e8c050' : '#776';
    ctx.fillText((sel ? '« ' : '') + RANK_TABS[i].label + (sel ? ' »' : ''), W / 2 + (i - 1) * 240, 100);
  }

  const cat = RANK_TABS[rankTab].id;
  if (cat === 'online') drawRankRowsOnline(t);
  else drawRankRowsLocal(save.rankings[cat]);

  ctx.textAlign = 'left';
  drawCenterText(`reputación — honor ${save.rep.honor} · astucia ${save.rep.astucia} · ferocidad ${save.rep.ferocidad} · disciplina ${save.rep.disciplina}`, 13, H - 50, '#998', 'transparent');
  if (Math.sin(t * 4) > -0.3) {
    drawCenterText(TOUCH ? 'desliza las pestañas con un toque · toca abajo para volver' : 'A/D cambiar pestaña · ENTER para volver', 14, H - 22, '#c0b8a8', 'transparent');
  }
}

function drawRankRowsLocal(tabla) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillStyle = '#998';
  ctx.fillText('#   FIRMA   PUNTAJE   RACHA   FECHA       TÍTULO', W / 2, 138);
  if (!tabla.length) {
    drawCenterText('aún nadie ha dejado su nombre…', 16, H * 0.52, '#776', 'transparent');
    return;
  }
  for (let i = 0; i < tabla.length; i++) {
    const r = tabla[i];
    const y = 166 + i * 30;
    const top = i === 0;
    ctx.font = (top ? 'bold 15px' : '13px') + ' "Courier New", monospace';
    ctx.fillStyle = top ? '#e8c050' : i < 3 ? '#d8c8a0' : '#b0a890';
    const row = `${String(i + 1).padStart(2)}  ${r.firma.padEnd(5)} ${String(r.score).padStart(8)}  ${String(r.racha).padStart(4)}   ${(r.fecha || '').padEnd(10)}  ${r.titulo || ''}`;
    ctx.fillText(row, W / 2, y);
  }
}

// filas del ranking en línea (lo sirve el servidor: GET /ranking)
function drawRankRowsOnline(t) {
  if (!netRank || netRank.fase === 'cargando') {
    const dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
    drawCenterText('consultando al escriba ' + dots, 16, H * 0.52, '#c0b8a8', 'transparent');
    return;
  }
  if (netRank.fase === 'error') {
    drawCenterText('no se pudo alcanzar el servidor', 16, H * 0.52, '#ff8a7a', 'transparent');
    return;
  }
  if (!netRank.rows.length) {
    drawCenterText('aún nadie ha ganado un duelo en línea…', 16, H * 0.52, '#776', 'transparent');
    return;
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillStyle = '#998';
  ctx.fillText(' #   NOMBRE          PUNTOS    V    D   MEJOR RACHA', W / 2, 138);
  for (let i = 0; i < netRank.rows.length; i++) {
    const r = netRank.rows[i];
    const y = 166 + i * 30;
    const top = i === 0;
    const isMe = r.name === save.onlineName;
    ctx.font = (top ? 'bold 15px' : '13px') + ' "Courier New", monospace';
    ctx.fillStyle = isMe ? '#9ad0e8' : top ? '#e8c050' : i < 3 ? '#d8c8a0' : '#b0a890';
    const row = `${String(i + 1).padStart(2)}   ${r.name.padEnd(12)} ${String(r.pts).padStart(8)} ${String(r.wins).padStart(4)} ${String(r.losses).padStart(4)}   ${String(r.best).padStart(5)}`;
    ctx.fillText(row + (isMe ? '  ◂ tú' : ''), W / 2, y);
  }
}
