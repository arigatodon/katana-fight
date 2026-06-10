'use strict';

// ============================================================
//  RENDER — escenarios, samuráis, fantasma, HUD y combate
// ============================================================

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  const skies = {
    dojo:    ['#0d0d1f', '#1c1430', '#3a1c2e', '#1a0e16'],
    puente:  ['#0a1422', '#142838', '#2a3848', '#101820'],
    bambu:   ['#0a140e', '#14241a', '#1e3424', '#0c160e'],
    tejado:  ['#1a1026', '#2a1838', '#48283e', '#1c1018'],
    templo:  ['#160e1e', '#241430', '#42203a', '#1a0e16'],
    mercado: ['#1e1410', '#32221a', '#4c3024', '#1e140e'],
    volcan:  ['#1c0a0a', '#301010', '#521a10', '#200c08'],
  };
  const cs = skies[stage.id] || skies.dojo;
  sky.addColorStop(0, cs[0]); sky.addColorStop(0.55, cs[1]);
  sky.addColorStop(0.8, cs[2]); sky.addColorStop(1, cs[3]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // luna
  ctx.save();
  ctx.fillStyle = stage.id === 'volcan' ? '#e8a060' : '#e8d8c0';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 50;
  ctx.beginPath();
  ctx.arc(W * 0.72, H * 0.24, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // montañas
  ctx.fillStyle = 'rgba(10,8,18,0.8)';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.72);
  ctx.lineTo(W * 0.18, H * 0.45); ctx.lineTo(W * 0.38, H * 0.68);
  ctx.lineTo(W * 0.55, H * 0.5);  ctx.lineTo(W * 0.8, H * 0.7);
  ctx.lineTo(W, H * 0.55); ctx.lineTo(W, H); ctx.lineTo(0, H);
  ctx.closePath(); ctx.fill();

  // elementos por escenario (detrás de los luchadores)
  if (stage.id === 'dojo') {
    ctx.strokeStyle = '#0c0a14'; ctx.lineWidth = 10;
    for (const bx of [40, 70, 905, 935]) {
      ctx.beginPath(); ctx.moveTo(bx, H);
      ctx.quadraticCurveTo(bx + (bx < W / 2 ? 18 : -18), H * 0.4, bx + (bx < W / 2 ? 30 : -30), 30);
      ctx.stroke();
    }
  } else if (stage.id === 'templo') {
    ctx.fillStyle = '#100a16';
    ctx.fillRect(W * 0.42, H * 0.36, W * 0.16, H * 0.36);
    for (let i = 0; i < 3; i++) {
      const y = H * 0.36 + i * H * 0.12;
      ctx.beginPath();
      ctx.moveTo(W * 0.38 - i * 8, y); ctx.lineTo(W * 0.62 + i * 8, y);
      ctx.lineTo(W * 0.58 + i * 8, y - 26); ctx.lineTo(W * 0.42 - i * 8, y - 26);
      ctx.closePath(); ctx.fill();
    }
    const sw = Math.sin(gTime * 2) * (bellTimer < 1 ? 8 : 2);
    ctx.fillStyle = '#6a5a2a';
    ctx.save();
    ctx.translate(W * 0.5, H * 0.3);
    ctx.rotate(sw * 0.03);
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(10, -24); ctx.lineTo(-10, -24); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (stage.id === 'mercado') {
    for (const [mx, mw, c] of [[60, 150, '#7a2a2a'], [W - 220, 160, '#2a5a7a']]) {
      ctx.fillStyle = '#1a120c';
      ctx.fillRect(mx, GROUND - 110, mw, 110);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(mx - 12, GROUND - 110); ctx.lineTo(mx + mw + 12, GROUND - 110);
      ctx.lineTo(mx + mw - 4, GROUND - 140); ctx.lineTo(mx + 4, GROUND - 140);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < 9; i++) {
      const sx = 40 + i * 30 + Math.sin(gTime * 2 + i) * 2;
      ctx.beginPath(); ctx.arc(sx, GROUND - 62 + Math.sin(gTime * 3 + i * 2) * 2, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(sx - 7, GROUND - 56, 14, 24);
    }
  } else if (stage.id === 'tejado') {
    ctx.fillStyle = '#0e0a18';
    for (let i = 0; i < 4; i++) {
      const bx = i * W / 4 + 30, bh = 100 + (i * 53) % 120;
      ctx.fillRect(bx, H - bh - 140, 130, bh);
    }
  } else if (stage.id === 'volcan') {
    ctx.fillStyle = '#2a0e08';
    ctx.beginPath();
    ctx.moveTo(W * 0.1, H); ctx.lineTo(W * 0.45, H * 0.2); ctx.lineTo(W * 0.55, H * 0.2);
    ctx.lineTo(W * 0.9, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,${100 + Math.sin(gTime * 3) * 40},40,0.7)`;
    ctx.fillRect(W * 0.46, H * 0.18, W * 0.08, 8);
    if (Math.random() < 0.1) {
      particles.push({
        x: W * (0.46 + Math.random() * 0.08), y: H * 0.2,
        vx: (Math.random() - 0.5) * 120, vy: -100 - Math.random() * 150,
        life: 1.2, maxLife: 1.2, color: '#ff8030', size: 3, gravity: true,
      });
    }
  }

  // suelo
  if (stage.id === 'puente') {
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    const gr = ctx.createLinearGradient(0, GROUND, 0, H);
    gr.addColorStop(0, '#3a2c1c'); gr.addColorStop(1, '#1c140c');
    ctx.fillStyle = gr;
    ctx.fillRect(W * 0.12, GROUND, W * 0.76, 26);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    for (let x = W * 0.12; x < W * 0.88; x += 34) {
      ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, GROUND + 26); ctx.stroke();
    }
    ctx.strokeStyle = '#4a3a22'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W * 0.12, GROUND - 40); ctx.quadraticCurveTo(W / 2, GROUND - 24, W * 0.88, GROUND - 40); ctx.stroke();
    for (let x = W * 0.14; x < W * 0.88; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, GROUND - 36); ctx.lineTo(x, GROUND); ctx.stroke();
    }
  } else {
    const grounds = {
      dojo: ['#241a20', '#0e080c'], bambu: ['#16241a', '#080e0a'],
      tejado: ['#262030', '#100c16'], templo: ['#221a26', '#0e0a10'],
      mercado: ['#2e2218', '#140e08'], volcan: ['#2a1410', '#140806'],
    };
    const gc = grounds[stage.id] || grounds.dojo;
    const gr = ctx.createLinearGradient(0, GROUND, 0, H);
    gr.addColorStop(0, gc[0]); gr.addColorStop(1, gc[1]);
    ctx.fillStyle = gr;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = 'rgba(230,200,170,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
    if (stage.id === 'tejado') {
      ctx.strokeStyle = 'rgba(120,100,140,0.3)';
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x + 20, H); ctx.stroke();
      }
    }
  }

  // grietas del volcán
  if (stage.id === 'volcan') {
    for (const c of cracks) {
      const glow = c.heat;
      ctx.fillStyle = `rgba(255,${60 + glow * 120},20,${0.25 + glow * 0.7})`;
      ctx.beginPath();
      ctx.ellipse(c.x, GROUND + 4, c.w / 2, 5 + glow * 4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (glow > 0.85 && Math.random() < 0.3) {
        particles.push({
          x: c.x + (Math.random() - 0.5) * c.w, y: GROUND,
          vx: (Math.random() - 0.5) * 60, vy: -80 - Math.random() * 120,
          life: 0.5, maxLife: 0.5, color: '#ff9030', size: 2.5, gravity: true,
        });
      }
    }
  }

  // pétalos
  for (const pt of petals) {
    ctx.fillStyle = stage.id === 'volcan' ? 'rgba(255,150,60,0.5)'
                  : stage.id === 'bambu' ? 'rgba(140,200,120,0.5)'
                  : 'rgba(220,140,160,0.5)';
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, pt.size, pt.size * 0.5, pt.sway, 0, Math.PI * 2);
    ctx.fill();
  }
}

// bambú en primer plano (obstruye la vista)
function drawForeground() {
  if (stage.id !== 'bambu') return;
  ctx.save();
  for (const [bx, w, a] of [[150, 26, 0.92], [380, 32, 0.95], [620, 24, 0.9], [830, 30, 0.94]]) {
    const sway = Math.sin(gTime * 0.8 + bx) * 6;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#1e3a22';
    ctx.save();
    ctx.translate(bx + sway, 0);
    ctx.fillRect(-w / 2, 0, w, H);
    ctx.fillStyle = '#142a18';
    for (let y = 40; y < H; y += 70) ctx.fillRect(-w / 2, y, w, 6);
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------- Samurái ----------------
function drawKatana(gx, gy, a, glow) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const px = dy, py = -dx;
  const hbx = gx - dx * 7, hby = gy - dy * 7;
  const tsx = gx + dx * 9, tsy = gy + dy * 9;
  const L = 64;
  const tipx = tsx + dx * L, tipy = tsy + dy * L;
  const mx = tsx + dx * L * 0.55 + px * 3.5;
  const my = tsy + dy * L * 0.55 + py * 3.5;
  ctx.strokeStyle = '#241a12';
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hbx, hby); ctx.lineTo(tsx, tsy); ctx.stroke();
  ctx.fillStyle = '#a8862a';
  ctx.beginPath(); ctx.arc(tsx, tsy, 4, 0, Math.PI * 2); ctx.fill();
  if (glow) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 14; }
  ctx.strokeStyle = '#cdd6e2';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(tsx, tsy); ctx.quadraticCurveTo(mx, my, tipx, tipy); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(tsx + px * 1.3, tsy + py * 1.3);
  ctx.quadraticCurveTo(mx + px * 1.3, my + py * 1.3, tipx, tipy);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawArm(sx, sy, hx, hy, sleeve, skin) {
  const dx = hx - sx, dy = hy - sy;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.max(1.5, (30 - len) * 0.55);
  const ex = sx + dx / 2 - dy / len * k;
  const ey = sy + dy / 2 + dx / len * k;
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = 6.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(hx, hy, 3.1, 0, Math.PI * 2); ctx.fill();
}

// cabezas especiales por personaje
function drawHead(p, hx, hy, dead) {
  const pal = p.pal, style = p.char.head;
  ctx.fillStyle = pal.skin;
  ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.arc(hx - 2, hy + 1, 7, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();

  if (style === 'gallina') {
    ctx.fillStyle = '#e03020';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(hx + i * 3 - 1, hy - 9 + Math.abs(i), 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f0a020';
    ctx.beginPath(); ctx.moveTo(hx + 7, hy - 1); ctx.lineTo(hx + 14, hy + 1); ctx.lineTo(hx + 7, hy + 3); ctx.closePath(); ctx.fill();
  } else if (style === 'sapo') {
    ctx.fillStyle = pal.skin;
    ctx.beginPath(); ctx.arc(hx - 3, hy - 7, 3.5, 0, Math.PI * 2); ctx.arc(hx + 4, hy - 7, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a2a10';
    ctx.beginPath(); ctx.arc(hx - 3, hy - 7, 1.5, 0, Math.PI * 2); ctx.arc(hx + 4, hy - 7, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a4a1a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(hx + 1, hy + 3); ctx.lineTo(hx + 6, hy + 3); ctx.stroke();
    return;
  } else if (style === 'mapache') {
    ctx.fillStyle = '#28282e';
    ctx.fillRect(hx - 7, hy - 3.5, 15, 5);
    ctx.fillStyle = '#9a9aa4';
    ctx.beginPath(); ctx.moveTo(hx - 7, hy - 5); ctx.lineTo(hx - 4, hy - 12); ctx.lineTo(hx - 1, hy - 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + 1, hy - 6); ctx.lineTo(hx + 4, hy - 12); ctx.lineTo(hx + 7, hy - 5); ctx.closePath(); ctx.fill();
  } else if (style === 'tiburon') {
    ctx.fillStyle = pal.hakama;
    ctx.beginPath(); ctx.moveTo(hx - 2, hy - 7); ctx.lineTo(hx + 1, hy - 16); ctx.lineTo(hx + 5, hy - 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(hx + 3, hy + 2, 5, 1.6);
  } else if (style === 'abuela') {
    ctx.fillStyle = pal.hair;
    ctx.beginPath(); ctx.arc(hx - 2, hy - 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a6a76';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(hx + 4, hy - 1, 2.6, 0, Math.PI * 2); ctx.stroke();
  } else if (style === 'monja') {
    ctx.fillStyle = pal.kimono;
    ctx.beginPath(); ctx.arc(hx - 1, hy - 1.5, 9, Math.PI * 0.6, Math.PI * 2.1); ctx.fill();
  } else if (style === 'viejo') {
    ctx.fillStyle = pal.hair;
    ctx.beginPath(); ctx.moveTo(hx + 2, hy + 4); ctx.lineTo(hx + 5, hy + 14); ctx.lineTo(hx - 2, hy + 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - 2, hy - 2, 8.3, Math.PI * 0.9, Math.PI * 1.9); ctx.fill();
  } else if (style === 'espectro') {
    ctx.fillStyle = 'rgba(128,232,224,0.8)';
    ctx.fillRect(hx + 2.5, hy - 2, 3, 2);
  } else {
    ctx.fillStyle = pal.hair;
    ctx.beginPath();
    ctx.arc(hx - 1, hy - 1.5, 8.3, Math.PI * 0.85, Math.PI * 2.0);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx - 4, hy - 10, 4.5, 2.6, -0.5, 0, Math.PI * 2); ctx.fill();
  }
  // hachimaki
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(hx - 8.3, hy - 3); ctx.lineTo(hx + 8.3, hy - 3); ctx.stroke();
  const flut = Math.sin(p.bob * 2.3);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(hx - 8, hy - 3);
  ctx.quadraticCurveTo(hx - 15, hy - 1 + flut, hx - 20, hy + 3 + flut * 2.5);
  ctx.stroke();
  // ojo
  if (!dead) {
    if (style !== 'espectro') {
      ctx.fillStyle = '#1a1208';
      ctx.fillRect(hx + 3, hy - 1.5, 2.6, 1.8);
    }
  } else {
    ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(hx + 2.5, hy - 2.5); ctx.lineTo(hx + 6, hy + 0.5);
    ctx.moveTo(hx + 6, hy - 2.5); ctx.lineTo(hx + 2.5, hy + 0.5);
    ctx.stroke();
  }
}

function drawSamurai(p, ghostAlpha) {
  const f = p.facing, pal = p.pal;
  const dead = p.state === PSTATE.DEAD;
  const bob = p.onGround && !dead ? Math.sin(p.bob) * 1.5 : 0;
  const sc = p.scale || 1;

  if (ghostAlpha === undefined) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3, (dead ? 36 : 23) * sc, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (dead && p.onGround) {
      ctx.save();
      ctx.translate(p.x + f * 30, GROUND - 4);
      ctx.scale(f, 1);
      drawKatana(0, 0, -0.06, false);
      ctx.restore();
    }
  }

  ctx.save();
  if (ghostAlpha !== undefined) ctx.globalAlpha = ghostAlpha;
  ctx.translate(p.x, p.y + bob);
  if (dead) {
    const fall = Math.min(1, p.deathT * 2.8);
    ctx.rotate(-f * fall * 1.45);
    ctx.translate(0, fall * 5);
  }
  ctx.scale(f * sc, sc);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // pose según estado
  let grip = { x: 16, y: -46 + Math.sin(p.bob * 1.7) * 1.2 };
  let ang = -0.62;
  let footF = 12, footB = -11, lean = 0, headY = -66;
  switch (p.state) {
    case PSTATE.WINDUP: {
      const k = 1 - Math.max(0, p.stateTimer / (p.windup || 0.2));
      grip = { x: 3 - k * 5, y: -60 - k * 9 };
      ang = -1.85 - k * 0.55;
      lean = -3; footF = 10; footB = -14;
      break;
    }
    case PSTATE.FEINT: {
      const k = 1 - Math.max(0, p.stateTimer / (p.feintTime || 0.15));
      grip = { x: 3 - k * 3, y: -58 - k * 6 };
      ang = -1.7 - k * 0.4;
      lean = -2; footF = 10; footB = -13;
      break;
    }
    case PSTATE.ATTACK:
      grip = { x: 26, y: -46 }; ang = 0.12;
      lean = 7; footF = 25; footB = -19; headY = -63;
      break;
    case PSTATE.RECOVER:
      grip = { x: 20, y: -36 }; ang = 0.72;
      lean = 4; footF = 18; footB = -14;
      break;
    case PSTATE.GUARD:
      grip = { x: 12, y: -50 }; ang = -1.15;
      lean = -4; footF = 9; footB = -15; headY = -64;
      break;
    case PSTATE.STAGGER:
    case PSTATE.HITSTUN:
      grip = { x: 8, y: -38 }; ang = 0.9;
      lean = -8; footF = 7; footB = -17; headY = -64;
      break;
    case PSTATE.EXPOSED:
      grip = { x: 14, y: -26 }; ang = 1.25;
      lean = 6 + Math.sin(p.bob * 6) * 2; footF = 16; footB = -8; headY = -58;
      break;
    case PSTATE.DEAD:
      grip = null; footF = 13; footB = -12;
      break;
  }

  const hipY = -34, shoulderY = -56;

  // hakama
  ctx.fillStyle = pal.hakamaDark;
  ctx.beginPath();
  ctx.moveTo(-6, hipY); ctx.lineTo(3, hipY);
  ctx.lineTo(footB + 7, -2); ctx.lineTo(footB - 7, -2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.hakama;
  ctx.beginPath();
  ctx.moveTo(-4, hipY); ctx.lineTo(7, hipY);
  ctx.lineTo(footF + 8, -2); ctx.lineTo(footF - 6, -2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a201a';
  ctx.beginPath(); ctx.ellipse(footF + 2, -2, 7, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(footB - 1, -2, 6, 2.8, 0, 0, Math.PI * 2); ctx.fill();

  // torso
  ctx.fillStyle = pal.kimono;
  ctx.beginPath();
  ctx.moveTo(-8, hipY + 1); ctx.lineTo(8, hipY + 1);
  ctx.lineTo(lean + 9, shoulderY - 2); ctx.lineTo(lean - 9, shoulderY - 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.moveTo(-8, hipY + 1); ctx.lineTo(-2, hipY + 1);
  ctx.lineTo(lean - 3, shoulderY - 2); ctx.lineTo(lean - 9, shoulderY - 2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = pal.kimonoDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(lean - 5, shoulderY - 1); ctx.lineTo(lean + 3, -44); ctx.lineTo(lean + 7, shoulderY + 1);
  ctx.stroke();
  ctx.fillStyle = pal.obi;
  ctx.fillRect(-8, hipY - 4, 16, 6);

  // cabeza
  const hx2 = lean + 3, hy2 = headY;
  ctx.strokeStyle = pal.skin;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(lean + 1, shoulderY - 1); ctx.lineTo(hx2, hy2 + 6); ctx.stroke();
  drawHead(p, hx2, hy2, dead);

  // brazos + katana
  if (grip) {
    const dxg = Math.cos(ang), dyg = Math.sin(ang);
    const farX = grip.x - dxg * 6, farY = grip.y - dyg * 6;
    drawArm(lean - 4, shoulderY + 3, farX, farY, pal.kimonoDark, pal.skin);
    drawKatana(grip.x, grip.y, ang, p.state === PSTATE.ATTACK || (p.state === PSTATE.GUARD && p.guardT <= p.parryWin));
    drawArm(lean + 5, shoulderY + 2, grip.x, grip.y, pal.kimono, pal.skin);
  } else {
    drawArm(lean - 4, shoulderY + 3, -10, -38, pal.kimonoDark, pal.skin);
    drawArm(lean + 5, shoulderY + 2, 12, -36, pal.kimono, pal.skin);
  }

  // aura de expuesto
  if (p.state === PSTATE.EXPOSED) {
    ctx.strokeStyle = `rgba(255,210,60,${0.5 + Math.sin(gTime * 12) * 0.4})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, -40, 36, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  // imágenes falsas del Espectro
  for (const ai of p.afterimages) {
    const fake = Object.assign({}, p, {
      x: ai.x, y: ai.y, facing: ai.facing, state: PSTATE.IDLE,
      bob: ai.bob, afterimages: [],
    });
    drawSamurai(fake, 0.35 * (ai.life / ai.maxLife));
  }
}

const PALG = pal('#aab4c8', '#7a86a0', '#3a4258', '#282e40', '#9ad0e8', '#b8c4d8', '#dce4f0');

function drawGhost() {
  if (!ghostPlay || !ghostPlay.frames.length) return;
  const fr = ghostPlay.frames[Math.min(ghostPlay.i, ghostPlay.frames.length - 1)];
  if (!fr || fr.x === undefined) return;
  const fake = {
    x: fr.x, y: fr.y, facing: fr.facing, state: fr.state === PSTATE.DEAD ? PSTATE.IDLE : fr.state,
    pal: ghostPlay.pal || PALG, char: {}, scale: ghostPlay.scale || 1,
    bob: gTime * 4, onGround: true, deathT: 0, guardT: 1, parryWin: 0,
    windup: 0.2, feintTime: 0.15, afterimages: [], stateTimer: 0,
    rasgo: null,
  };
  drawSamurai(fake, 0.22 + Math.sin(gTime * 5) * 0.06);
}

// ---------------- HUD ----------------
function drawBars() {
  const barW = 300, m = 22;
  for (const [p, x, align] of [[p1, m, 1], [p2, W - m - barW, -1]]) {
    // vida
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 3, m - 3, barW + 6, 20);
    const vPct = Math.max(0, p.vida / VIDA_MAX);
    const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
    grad.addColorStop(0, align === 1 ? '#c03434' : '#e8c050');
    grad.addColorStop(1, align === 1 ? '#e8c050' : '#4a80d8');
    ctx.fillStyle = grad;
    if (align === 1) ctx.fillRect(x, m, barW * vPct, 14);
    else ctx.fillRect(x + barW * (1 - vPct), m, barW * vPct, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 3, m - 3, barW + 6, 20);
    // postura
    const pPct = Math.max(0, p.postura / p.posMax);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 3, m + 21, barW * 0.8 + 6, 11);
    ctx.fillStyle = p.state === PSTATE.EXPOSED ? '#ff4030'
      : pPct < 0.3 ? `rgba(255,${140 + Math.sin(gTime * 10) * 60},40,0.95)` : '#d8b450';
    const pw = barW * 0.8 * pPct;
    if (align === 1) ctx.fillRect(x, m + 23, pw, 7);
    else ctx.fillRect(x + barW * 0.2 + (barW * 0.8 - pw), m + 23, pw, 7);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 3, m + 21, barW * 0.8 + 6, 11);
    // nombre + personaje + apuesta
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.textAlign = align === 1 ? 'left' : 'right';
    const bet = APUESTAS.find(b => b.id === p.bet);
    ctx.fillText(`${p.name} · ${p.char.name}${bet ? ' · ' + bet.kanji : ''}`, align === 1 ? x : x + barW, m + 46);
    if (p.rasgo) {
      ctx.fillStyle = '#9ad0e8';
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText('★ ' + p.rasgo.name, align === 1 ? x : x + barW, m + 60);
    }
    // victorias
    for (let i = 0; i < WIN_ROUNDS; i++) {
      const cx = align === 1 ? x + barW - 40 + i * 18 : x + 40 - i * 18;
      ctx.beginPath();
      ctx.arc(cx, m + 46, 6, 0, Math.PI * 2);
      ctx.fillStyle = i < p.wins ? '#e8c050' : 'rgba(255,255,255,0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // centro: destino activo + progreso del torneo
  ctx.textAlign = 'center';
  if (destino.id !== 'ninguno') {
    ctx.font = 'bold 26px serif';
    ctx.fillStyle = 'rgba(232,192,80,0.9)';
    ctx.fillText(destino.kanji, W / 2, 40);
    ctx.font = '11px "Courier New", monospace';
    ctx.fillStyle = 'rgba(232,224,208,0.7)';
    ctx.fillText(destino.name, W / 2, 56);
  }
  if (run) {
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillStyle = run.fight === RUN_FIGHTS ? '#ff8060' : 'rgba(232,224,208,0.6)';
    ctx.fillText(run.fight === RUN_FIGHTS ? '¡DUELO SECRETO!' : `DUELO ${run.fight} / ${RUN_FIGHTS}`, W / 2, 74);
  }
  ctx.textAlign = 'left';
}

function drawTouchControls() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of TBTN) {
    if (b.id === 'feint' && destino.id === 'honor') ctx.globalAlpha = 0.1;
    else ctx.globalAlpha = touchState[b.id] ? 0.6 : 0.25;
    ctx.fillStyle = touchState[b.id] ? '#e8c050' : '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = touchState[b.id] ? 0.9 : 0.5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#10101a';
    ctx.font = `bold ${Math.round(b.r * 0.72)}px sans-serif`;
    ctx.fillText(b.label, b.x, b.y + 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCenterText(txt, size, y, color = '#e8e0d0', glow = '#b03030') {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `bold ${size}px "Courier New", monospace`;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 24;
  ctx.fillStyle = color;
  ctx.fillText(txt, W / 2, y);
  ctx.restore();
}

// superposiciones según el destino
function drawDestinoOverlay() {
  if (destino.id === 'niebla') {
    for (let i = 0; i < 3; i++) {
      const fx = (gTime * (12 + i * 7)) % (W + 400) - 200;
      const fg = ctx.createRadialGradient(fx, H * 0.6, 30, fx, H * 0.6, 320);
      fg.addColorStop(0, 'rgba(190,195,205,0.5)');
      fg.addColorStop(1, 'rgba(190,195,205,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = 'rgba(170,178,190,0.28)';
    ctx.fillRect(0, 0, W, H);
  }
  if (destino.id === 'lluvia') {
    ctx.strokeStyle = 'rgba(160,190,230,0.4)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const r of rain) {
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - 4, r.y + 16);
    }
    ctx.stroke();
  }
  if (destino.id === 'oscuridad') {
    const dark = 0.45 + Math.max(0, darkPulse) * 0.5;
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.92, dark)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (destino.id === 'sangre') {
    ctx.fillStyle = `rgba(140,10,10,${0.10 + Math.sin(gTime * 2) * 0.04})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (destino.id === 'viento' || stage.id === 'tejado') {
    ctx.strokeStyle = 'rgba(200,210,230,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const y = 60 + i * 90 + Math.sin(gTime * 2 + i) * 18;
      const x0 = ((gTime * 300 * Math.sign(windForce || 1) + i * 250) % (W + 200)) - 100;
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo(x0 + 50, y - 8, x0 + 110, y);
    }
    ctx.stroke();
  }
}

// ---------------- Escena de combate completa ----------------
function drawFight(t) {
  drawBackground();
  drawGhost();

  for (const s of slashTrails) {
    const a = s.life / s.maxLife;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.9})`;
    ctx.lineWidth = 3 + a * 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 16 * a;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    ctx.restore();
  }

  drawSamurai(p1);
  drawSamurai(p2);

  // objetos del mercado
  for (const pr of projectiles) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(pr.rot);
    if (pr.kind === 0) { ctx.fillStyle = '#c04030'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); }
    else if (pr.kind === 1) { ctx.fillStyle = '#b09050'; ctx.fillRect(-8, -4, 16, 8); }
    else { ctx.fillStyle = '#80a040'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  for (const pa of particles) {
    ctx.globalAlpha = Math.max(0, pa.life / pa.maxLife);
    ctx.fillStyle = pa.color;
    ctx.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
  }
  ctx.globalAlpha = 1;

  drawForeground();
  drawDestinoOverlay();

  // textos flotantes
  ctx.textAlign = 'center';
  for (const fl of floaters) {
    ctx.globalAlpha = Math.max(0, fl.life / fl.maxLife);
    ctx.font = `bold ${fl.size}px "Courier New", monospace`;
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.txt, fl.x, fl.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  drawBars();

  if (roundStartTimer > 0 && scene === 'fight') {
    if (roundStartTimer > 0.7) {
      drawCenterText(`RONDA ${roundNum}`, 40, H * 0.4);
      drawCenterText(stage.name + ' · ' + destino.name, 16, H * 0.48, '#c0b8a8', 'transparent');
    } else {
      drawCenterText('¡CORTEN!', 56, H * 0.44, '#e8c050');
    }
  }

  if (scene === 'roundEnd' && roundMsg) {
    drawCenterText(roundMsg, 54, H * 0.42, '#fff', '#b03030');
    drawCenterText(roundMsgSub, 20, H * 0.5, '#e8c050', 'transparent');
  }

  if (TOUCH && (scene === 'fight' || scene === 'roundEnd')) drawTouchControls();

  // destello (parry / ejecución / instinto)
  if (flashTimer > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, flashTimer * 4)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // viñeta
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}
