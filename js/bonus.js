'use strict';

// ============================================================
//  BONUS STAGE — entre la 2ª y la 3ª pelea del torneo.
//  Un mono en un árbol lanza manzanas; córtalas todas para
//  sacar PERFECT y una puntuación especial. Solo en arcade
//  (1 jugador): no toca el online ni el determinismo, así que
//  puede usar Math.random como los efectos visuales.
// ============================================================

let bonus = null;
const BONUS_TOTAL = 12;          // manzanas que lanza el mono
const BONUS_CUT_PTS = 120;       // puntos por manzana cortada
const BONUS_PERFECT_PTS = 2000;  // extra por cortarlas TODAS

function startBonus() {
  // reutiliza al jugador (en arcade p1 es el humano) y lo recoloca
  p1.x = W * 0.30; p1.y = GROUND; p1.vx = 0; p1.vy = 0; p1.facing = 1;
  p1.state = PSTATE.IDLE; p1.stateTimer = 0; p1.onGround = true;
  p1.deathT = 0; p1.afterimages = []; p1.attackThrust = false;
  particles = []; slashTrails = []; floaters = []; projectiles = [];
  bonus = {
    apples: [], spawned: 0, cut: 0, missed: 0,
    spawnT: 0.6, intro: 2.0, slashT: 0, atkHeld: false,
    monkeyBob: 0, throwT: 0, done: false, outT: 0, result: null,
  };
  scene = 'bonus';
  sfxConfirm();
}

function spawnApple(b) {
  const mx = W * 0.82, my = GROUND - 210;            // mano del mono
  const vx = -(150 + Math.random() * 170);           // hacia el jugador
  const vy = -(150 + Math.random() * 170);           // con arco
  b.apples.push({ x: mx, y: my, vx, vy, r: 13, rot: 0,
                  spin: (Math.random() - 0.5) * 10, cut: false, life: 0 });
  b.spawned++;
  b.throwT = 0.25;                                    // el mono "lanza"
  sfxFeint();
}

function bonusSlash(b) {
  b.slashT = 0.22;
  p1.state = PSTATE.ATTACK; p1.attackThrust = false;
  sfxSlash();
  const cy = bodyCenterY(p1);
  slashTrails.push({
    x1: p1.x + p1.facing * 8, y1: cy - 52,
    x2: p1.x + p1.facing * 72, y2: cy + 12,
    life: 0.2, maxLife: 0.2,
  });
}

function cutApple(b, a) {
  a.cut = true; a.life = 0.6;
  a.vx = (Math.random() - 0.5) * 120; a.vy = -90;    // las mitades saltan
  b.cut++;
  sfxHit();
  floatText(a.x, a.y - 8, '+' + BONUS_CUT_PTS, '#ffd24a', 14);
  spawnParticles(a.x, a.y, 12, ['#d83030', '#ff6040', '#a01818', '#f8f0e0'], 220, 0.5);
}

function finishBonus(b) {
  b.done = true; b.outT = 3.4;
  const perfect = b.cut === BONUS_TOTAL;
  let pts = b.cut * BONUS_CUT_PTS;
  if (perfect) pts += BONUS_PERFECT_PTS;
  b.result = { perfect, pts, cut: b.cut };
  if (run) run.score += pts;
  if (perfect) { flashTimer = 0.5; shake = 8; sfxConfirm(); }
}

function updateBonus(dt) {
  const b = bonus;
  b.monkeyBob += dt;
  if (b.throwT > 0) b.throwT -= dt;
  if (b.intro > 0) { b.intro -= dt; return; }

  if (b.done) {
    // las mitades cortadas siguen cayendo durante la pantalla de resultado
    for (const a of b.apples) { if (a.cut) { a.vy += 720 * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt; } }
    b.outT -= dt;
    if (b.outT <= 0) { bonus = null; nextFight(); }
    return;
  }

  // ── entrada: mover y cortar ──
  const m = save.keymap.p1;
  const left = keys[m.left] || touchState.left;
  const right = keys[m.right] || touchState.right;
  const atk = keys[m.attack] || touchState.attack;
  if (left && !right)  { p1.x -= 330 * dt; p1.facing = -1; }
  if (right && !left)  { p1.x += 330 * dt; p1.facing = 1; }
  p1.x = Math.max(40, Math.min(W - 40, p1.x));
  p1.bob += dt * ((left || right) ? 9 : 4);

  if (atk && !b.atkHeld && b.slashT <= 0) bonusSlash(b);
  b.atkHeld = atk;
  if (b.slashT > 0) {
    b.slashT -= dt;
    if (b.slashT <= 0) p1.state = PSTATE.IDLE;
    // ventana activa del corte: rebana manzanas dentro del arco de la katana
    if (b.slashT > 0.05) {
      const bx = p1.x + p1.facing * 42, by = bodyCenterY(p1) - 20;
      for (const a of b.apples) {
        if (a.cut) continue;
        if (Math.hypot(a.x - bx, a.y - by) < 90) cutApple(b, a);
      }
    }
  }

  // ── el mono suelta manzanas a intervalos ──
  if (b.spawned < BONUS_TOTAL) {
    b.spawnT -= dt;
    if (b.spawnT <= 0) { spawnApple(b); b.spawnT = 0.78 + Math.random() * 0.5; }
  }

  // ── física de las manzanas ──
  for (let i = b.apples.length - 1; i >= 0; i--) {
    const a = b.apples[i];
    a.vy += 720 * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rot += a.spin * dt;
    if (a.cut) {
      a.life -= dt;
      if (a.life <= 0) b.apples.splice(i, 1);
    } else if (a.y >= GROUND - a.r || a.x < -30) {
      // manzana sin cortar: cae al suelo → fallada
      b.missed++;
      if (a.y >= GROUND - a.r) spawnParticles(a.x, GROUND, 8, ['#d83030', '#7a1414'], 140, 0.4);
      b.apples.splice(i, 1);
    }
  }

  if (b.spawned >= BONUS_TOTAL && b.cut + b.missed >= BONUS_TOTAL) finishBonus(b);
}

// ── dibujo ──────────────────────────────────────────────────
function drawBonus(t) {
  // cielo de tarde
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#3a4e74'); sky.addColorStop(0.6, '#9a86a0'); sky.addColorStop(1, '#e8b884');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GROUND);
  // colinas
  ctx.fillStyle = '#6a5a78';
  ctx.beginPath(); ctx.moveTo(0, GROUND);
  ctx.quadraticCurveTo(W * 0.25, GROUND - 80, W * 0.5, GROUND - 20);
  ctx.quadraticCurveTo(W * 0.78, GROUND - 90, W, GROUND - 30);
  ctx.lineTo(W, GROUND); ctx.closePath(); ctx.fill();
  // suelo
  const gr = ctx.createLinearGradient(0, GROUND, 0, H);
  gr.addColorStop(0, '#4a6a3a'); gr.addColorStop(1, '#2a3824');
  ctx.fillStyle = gr; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.strokeStyle = '#1c2616'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();

  drawTreeAndMonkey();

  // estelas de corte
  for (const s of slashTrails) {
    const a = s.life / s.maxLife;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.9})`;
    ctx.lineWidth = 3 + a * 5; ctx.lineCap = 'round';
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 16 * a;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    ctx.restore();
  }

  if (p1) drawSamurai(p1);

  // manzanas
  for (const a of bonus.apples) {
    if (a.cut) drawAppleHalves(a); else drawApple(a.x, a.y, a.r, a.rot);
  }

  // partículas y flotantes
  for (const pa of particles) {
    ctx.globalAlpha = Math.max(0, pa.life / pa.maxLife);
    ctx.fillStyle = pa.color;
    ctx.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const fl of floaters) {
    ctx.globalAlpha = Math.max(0, fl.life / fl.maxLife);
    ctx.font = `bold ${fl.size}px "Courier New", monospace`;
    ctx.fillStyle = fl.color; ctx.fillText(fl.txt, fl.x, fl.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';

  // HUD
  ctx.textAlign = 'center';
  if (bonus.intro > 0) {
    drawCenterText('¡FASE DE BONUS!', 40, H * 0.4);
    drawCenterText('corta todas las manzanas del mono', 16, H * 0.48, '#f0e0c0', 'transparent');
  } else if (bonus.done) {
    const r = bonus.result;
    if (r.perfect) {
      drawCenterText('¡PERFECT!', 52, H * 0.36, '#ffd24a');
      drawCenterText('todas cortadas', 18, H * 0.45, '#f0e0c0', 'transparent');
    } else {
      drawCenterText(`${r.cut} / ${BONUS_TOTAL} cortadas`, 36, H * 0.38, '#e8e0d0');
    }
    drawCenterText('+' + r.pts + ' puntos', 24, H * 0.52, '#9ad04a', 'transparent');
  } else {
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(`manzanas: ${bonus.cut} / ${BONUS_TOTAL}`, W / 2, 44);
    ctx.font = '13px "Courier New", monospace';
    ctx.fillStyle = '#f0e0c0';
    ctx.fillText('mover: ◀ ▶   ·   cortar: ataque', W / 2, 66);
  }
  ctx.textAlign = 'left';

  if (TOUCH) drawTouchControls();   // botones en móvil (usa mover + ataque)
}

function drawApple(x, y, r, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = '#c8202a';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.35, r * 0.3, r * 0.45, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a3a18'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(2, -r - 6); ctx.stroke();
  ctx.fillStyle = '#3a8a2a';
  ctx.beginPath(); ctx.ellipse(7, -r - 4, 5, 2.5, 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawAppleHalves(a) {
  const sep = (0.6 - a.life) * 14 + 2;
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
  for (const dir of [-1, 1]) {
    ctx.save(); ctx.translate(dir * sep, 0);
    ctx.fillStyle = '#c8202a';
    ctx.beginPath(); ctx.arc(0, 0, a.r, dir < 0 ? Math.PI / 2 : -Math.PI / 2, dir < 0 ? -Math.PI / 2 : Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4ead0';   // pulpa expuesta
    ctx.fillRect(dir < 0 ? -2 : 0, -a.r, 2, a.r * 2);
    ctx.restore();
  }
  ctx.restore();
}

function drawTreeAndMonkey() {
  const tx = W * 0.86, ty = GROUND;
  // tronco
  ctx.fillStyle = '#5a3a22';
  ctx.beginPath();
  ctx.moveTo(tx - 22, ty); ctx.lineTo(tx - 12, ty - 200);
  ctx.lineTo(tx + 12, ty - 200); ctx.lineTo(tx + 24, ty); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 2; ctx.stroke();
  // rama hacia el jugador
  ctx.lineWidth = 12; ctx.strokeStyle = '#5a3a22'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tx, ty - 180); ctx.lineTo(tx - 110, ty - 205); ctx.stroke();
  // copa
  ctx.fillStyle = '#2f6a2a';
  for (const [ox, oy, rr] of [[-40, -230, 70], [40, -240, 75], [0, -270, 80], [-70, -255, 55], [70, -255, 55]]) {
    ctx.beginPath(); ctx.arc(tx + ox, ty + oy, rr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#3a8035';
  for (const [ox, oy, rr] of [[-20, -250, 40], [30, -262, 38], [-55, -240, 28]]) {
    ctx.beginPath(); ctx.arc(tx + ox, ty + oy, rr, 0, Math.PI * 2); ctx.fill();
  }
  // manzanas decorativas en la copa
  for (const [ox, oy] of [[-30, -210], [50, -225], [-60, -270], [20, -290]]) drawApple(tx + ox, ty + oy, 9, 0);

  // mono sentado en la rama
  const b = bonus, throwing = b && b.throwT > 0;
  const bob = Math.sin((b ? b.monkeyBob : 0) * 3) * 2;
  const mx = tx - 96, my = ty - 210 + bob;
  ctx.fillStyle = '#6a4a30';
  ctx.beginPath(); ctx.ellipse(mx, my, 18, 22, 0, 0, Math.PI * 2); ctx.fill();   // cuerpo
  ctx.beginPath(); ctx.arc(mx, my - 26, 13, 0, Math.PI * 2); ctx.fill();          // cabeza
  ctx.fillStyle = '#caa882';
  ctx.beginPath(); ctx.arc(mx, my - 24, 8, 0, Math.PI * 2); ctx.fill();           // cara
  ctx.fillStyle = '#2a1c10';
  ctx.beginPath(); ctx.arc(mx - 3, my - 25, 1.8, 0, Math.PI * 2); ctx.arc(mx + 3, my - 25, 1.8, 0, Math.PI * 2); ctx.fill();
  // orejas
  ctx.fillStyle = '#6a4a30';
  ctx.beginPath(); ctx.arc(mx - 12, my - 28, 5, 0, Math.PI * 2); ctx.arc(mx + 12, my - 28, 5, 0, Math.PI * 2); ctx.fill();
  // brazo lanzador (sube al lanzar)
  ctx.strokeStyle = '#6a4a30'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(mx - 8, my - 6);
  ctx.lineTo(mx - 22, my + (throwing ? -22 : 6));
  ctx.stroke();
  // cola
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(mx + 14, my + 8);
  ctx.quadraticCurveTo(mx + 40, my + 4, mx + 36, my - 18); ctx.stroke();
}
