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

// choque de aceros: chispas más fuertes y un destello en el punto de contacto
function spawnClash(x, y) {
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 220 + Math.random() * 560;
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
      life: 0.12 + Math.random() * 0.3, maxLife: 0.42,
      color: ['#ffffff', '#fff4c0', '#ffe080', '#ffb030'][Math.floor(Math.random() * 4)],
      size: 1.5 + Math.random() * 2.5, gravity: false,
    });
  }
  // núcleo brillante del impacto
  particles.push({ x, y, vx: 0, vy: 0, life: 0.12, maxLife: 0.12, color: '#ffffff', size: 16, gravity: false });
  slashTrails.push({ x1: x - 26, y1: y - 26, x2: x + 26, y2: y + 26, life: 0.16, maxLife: 0.16 });
  slashTrails.push({ x1: x - 26, y1: y + 26, x2: x + 26, y2: y - 26, life: 0.16, maxLife: 0.16 });
}

// sangre al cortar: rocío dirigido en el sentido del corte (dir = facing) que
// luego cae por gravedad
function spawnBlood(x, y, dir, amount) {
  const n = amount || 20;
  for (let i = 0; i < n; i++) {
    const a = (Math.random() - 0.5) * 1.7;            // abanico
    const s = 120 + Math.random() * 340;
    particles.push({
      x, y,
      vx: dir * Math.cos(a) * s + (Math.random() - 0.5) * 70,
      vy: Math.sin(a) * s - 130 - Math.random() * 110,
      life: 0.4 + Math.random() * 0.55, maxLife: 0.95,
      color: ['#c01818', '#8e0e0e', '#e03030', '#a01414'][Math.floor(Math.random() * 4)],
      size: 2 + Math.random() * 3.5, gravity: true,
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
