'use strict';

// ============================================================
//  DOJO — práctica libre contra un muñeco configurable
//
//  Para aprender los estilos de corte (ESTILOS en data.js): eliges
//  guerrero, entras al dojo sin destino ni apuestas, y el muñeco hace
//  lo que le pidas (quieto, guardar, atacar o pelear en serio). Nadie
//  muere: el corte mortal se anota y el caído se levanta. Aquí sí hay
//  HUD (es un modo de estudio): el pergamino con la cadena del estilo
//  y el eslabón en curso resaltado. Solo local, nunca online.
// ============================================================

const DOJO_MODOS = [
  { id: 'quieto',  name: 'QUIETO',  desc: 'no se mueve: prueba tus cadenas' },
  { id: 'guardia', name: 'GUARDIA', desc: 'guarda en una línea que cambia: busca el hueco' },
  { id: 'ataca',   name: 'ATACA',   desc: 'corta cada tanto: practica parry y kaeshi' },
  { id: 'libre',   name: 'LIBRE',   desc: 'la CPU pelea en serio (sin morir nadie)' },
];

let dojoStats = null;           // contadores de la sesión de práctica
let dojoVisto = null;           // último corte contado (para no contar dos veces)

function startDojo() {
  vsCPU = true;
  modoFinal = false;
  dailyRun = false; dailyPlan = null;
  run = null; runOver = null; runVirtud = null;
  modoDojo = true;
  chooseSel = 0; choosingP = 0;
  scene = 'choose';
}

// compañero de práctica: el RONIN (o el MAESTRO si practicas con el RONIN)
function dojoRivalDe(c) { return charById(c.id === 'ronin' ? 'maestro' : 'ronin'); }

function dojoComenzar(c) {
  playerChar = c;
  rivalChar = dojoRivalDe(c);
  startMatch();
  // sin destino, sin apuestas, sin dones ni rasgos: el estilo a pelo
  stage = STAGES.find(s => s.id === 'dojo') || STAGES[0];
  destino = DESTINOS[0];
  resetRound();
  for (const p of [p1, p2]) {
    p.bet = null; p.virtud = null; p.rasgo = null;
    deriveAttrs(p);
    p.postura = p.posMax;
  }
  p2.name = 'MUÑECO';
  roundNum = 1;
  roundStartTimer = 0.7;
  dojoStats = { cortes: 0, cadenas: 0, mortales: 0, parries: 0, kaeshis: 0 };
  dojoVisto = null;
}

function salirDojo() {
  modoDojo = false;
  scene = 'title';
}

// el corte mortal en el dojo no termina nada: se anota y el caído se levanta
function dojoRevivir(victim, ejecucion) {
  if (victim === p2 && dojoStats) dojoStats.mortales++;
  floatText(victim.x, bodyCenterY(victim) - 64, ejecucion ? '¡EJECUCIÓN!' : '¡CORTE MORTAL!', '#ff8060', 20);
  sfxKill();
  shake = 10;
  timeScale = 0.3; slowmoTimer = 0.35;
  spawnBlood(victim.x, bodyCenterY(victim), victim.facing * -1, 26);
  victim.vida = VIDA_MAX;
  victim.postura = victim.posMax;
  victim.state = PSTATE.HITSTUN;
  victim.stateTimer = 0.5;
  victim.vy = -160; victim.onGround = false;
  if (victim.x < W * 0.14 || victim.x > W * 0.86) victim.x = W / 2;   // (por si cayó)
}

// comportamiento del muñeco según el modo; 'libre' usa la IA normal
function dojoAI(p, foe, dt) {
  const out = { left: false, right: false, jump: false, down: false, attack: false, feint: false, guard: false };
  const modo = DOJO_MODOS[dojoModo].id;
  p.dojoT = (p.dojoT || 0) + dt;
  if (modo === 'guardia') {
    if (p.dojoT > 1.8) { p.dojoT = 0; p.dojoK = ((p.dojoK || 0) + 1) % 3; }
    out.kamae = p.dojoK || 0;
    out.guard = true;
  } else if (modo === 'ataca') {
    const dist = Math.abs(p.x - foe.x);
    if (dist > p.reach * 0.95) { if (foe.x > p.x) out.right = true; else out.left = true; }
    else if (p.dojoT > 1.4) {
      p.dojoT = 0;
      out.kamae = Math.floor(Math.random() * 3);   // la CPU no toca la corriente rnd()
      p.dojoK = out.kamae;
      out.attack = true;
    }
    if (out.kamae == null && p.dojoK != null) out.kamae = p.dojoK;
  }
  return out;
}

// teclas del dojo durante la pelea: M cambia el muñeco, ESC sale
function dojoTecla(code) {
  if (code === 'KeyM' || code === 'Tab') {
    dojoModo = (dojoModo + 1) % DOJO_MODOS.length;
    p2.dojoT = 0;
    if (p2.state === PSTATE.GUARD) p2.state = PSTATE.IDLE;
    sfxSelect();
  }
  if (code === 'Escape') { sfxConfirm(); salirDojo(); }
}
// toque: el panel superior cambia el muñeco; la ✕ sale
function dojoToque(tp) {
  if (tp.y > 84 && tp.y < 132 && Math.abs(tp.x - W / 2) < 250) {
    if (tp.x > W / 2 + 200) { sfxConfirm(); salirDojo(); }
    else dojoTecla('KeyM');
  }
}

// cuenta cortes, cadenas completas y kaeshi del jugador (una vez por corte)
function dojoContar() {
  if (!dojoStats || !p1) return;
  const e = p1.estilo;
  if ((p1.state === PSTATE.WINDUP || p1.state === PSTATE.ATTACK) && dojoVisto !== p1.chainSerial) {
    dojoVisto = p1.chainSerial;
    dojoStats.cortes++;
    if (e.cadena.length > 1 && p1.chainIdx === e.cadena.length - 1) dojoStats.cadenas++;
    if (p1.kaeshi) dojoStats.kaeshis++;
  }
  dojoStats.parries = p1.stats.parries;
}

function drawDojoHUD(t) {
  dojoContar();
  const e = p1.estilo, modo = DOJO_MODOS[dojoModo];
  ctx.save();
  // panel superior: qué hace el muñeco
  ctx.fillStyle = 'rgba(10,8,6,0.72)';
  ctx.fillRect(W / 2 - 250, 86, 500, 44);
  ctx.strokeStyle = 'rgba(232,192,80,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(W / 2 - 250, 86, 500, 44);
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px "Courier New", monospace';
  ctx.fillStyle = '#e8c050';
  ctx.fillText('道場 DOJO · muñeco: ' + modo.name + (TOUCH ? ' (toca)' : ' (M)'), W / 2, 104);
  ctx.font = '11px "Courier New", monospace';
  ctx.fillStyle = '#c0b8a8';
  ctx.fillText(modo.desc + (TOUCH ? '' : ' · ESC salir'), W / 2, 121);
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#a86a6a';
  ctx.fillText('✕', W / 2 + 242, 113);

  // pergamino del estilo (abajo a la izquierda) con el eslabón en curso
  const x0 = 22, y0 = H - 118;
  ctx.fillStyle = 'rgba(236,228,210,0.9)';
  ctx.fillRect(x0, y0, 360, 96);
  ctx.fillStyle = '#6a1a1a';
  ctx.fillRect(x0, y0, 5, 96);
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px serif';
  ctx.fillStyle = '#2a1a10';
  ctx.fillText(e.kanji + '  ' + e.name, x0 + 14, y0 + 20);
  ctx.font = '11px "Courier New", monospace';
  ctx.fillStyle = '#5a4a3a';
  ctx.fillText(e.desc, x0 + 14, y0 + 36);
  // eslabones: se enciende el que está saliendo
  const atacando = p1.state === PSTATE.WINDUP || p1.state === PSTATE.ATTACK || p1.state === PSTATE.RECOVER;
  let cx = x0 + 14;
  ctx.font = 'bold 12px "Courier New", monospace';
  e.cadena.forEach((c, i) => {
    const txt = i === 0 ? 'KAMAE' : LINEA_TXT[c.linea];
    const on = atacando && p1.chainIdx === i;
    const w = ctx.measureText(txt).width + 12;
    ctx.fillStyle = on ? '#b03030' : 'rgba(60,40,30,0.15)';
    ctx.fillRect(cx, y0 + 46, w, 20);
    ctx.fillStyle = on ? '#fff' : '#3a2a1a';
    ctx.fillText(txt, cx + 6, y0 + 60);
    cx += w;
    if (i < e.cadena.length - 1) { ctx.fillStyle = '#6a5a4a'; ctx.fillText('→', cx + 3, y0 + 60); cx += 18; }
  });
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = '#5a4a3a';
  const extra = (e.remate ? 'remate: ' + REMATE_TXT[e.remate] : '') + (e.kaeshi ? '返し tras parar, corta: contragolpe' : '');
  ctx.fillText(extra || 'encadena pulsando ataque al terminar un corte que tocó', x0 + 14, y0 + 82);
  if (extra) ctx.fillText('encadena: ataque durante la recuperación de un corte que tocó', x0 + 14, y0 + 93);

  // contadores (abajo a la derecha)
  const s = dojoStats || {};
  ctx.textAlign = 'right';
  ctx.font = '12px "Courier New", monospace';
  ctx.fillStyle = 'rgba(232,224,208,0.85)';
  const kam = ['JŌDAN', 'CHŪDAN', 'GEDAN'][p1.kamae];
  const filas = [
    'tu kamae: ' + kam,
    'cortes ' + (s.cortes || 0) + ' · cadenas ' + (s.cadenas || 0),
    'parries ' + (s.parries || 0) + ' · kaeshi ' + (s.kaeshis || 0),
    'cortes mortales: ' + (s.mortales || 0),
  ];
  filas.forEach((f, i) => ctx.fillText(f, W - 22, H - 88 + i * 17));
  ctx.restore();
}
