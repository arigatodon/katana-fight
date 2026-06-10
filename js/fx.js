'use strict';

// ============================================================
//  EFECTOS — partículas, estelas, textos flotantes y ambiente
// ============================================================

let particles = [];
let slashTrails = [];
let floaters = [];

function spawnParticles(x, y, n, colors, speed, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3,
      life: life * (0.5 + Math.random() * 0.5), maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 3, gravity: true,
    });
  }
}

function spawnSparks(x, y) {
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 150 + Math.random() * 450;
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.15 + Math.random() * 0.25, maxLife: 0.4,
      color: ['#fff', '#ffe080', '#ffb030'][Math.floor(Math.random() * 3)],
      size: 1.5 + Math.random() * 2, gravity: false,
    });
  }
}

function floatText(x, y, txt, color, size) {
  floaters.push({ x, y, txt, color, size: size || 16, life: 0.9, maxLife: 0.9 });
}

// pétalos / chispas de ambiente
const petals = [];
for (let i = 0; i < 26; i++) {
  petals.push({
    x: Math.random() * W, y: Math.random() * H,
    sway: Math.random() * Math.PI * 2,
    speed: 14 + Math.random() * 28,
    size: 2 + Math.random() * 3,
  });
}

// gotas de lluvia (destino Lluvia)
const rain = [];
for (let i = 0; i < 80; i++) rain.push({ x: Math.random() * W, y: Math.random() * H, s: 400 + Math.random() * 300 });
