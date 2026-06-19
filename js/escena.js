'use strict';

// ============================================================
//  ESCENA — capas animadas de adorno sobre cada escenario
//
//  Dibuja los props transparentes (assets/props/) en DOS pasadas
//  alrededor de los luchadores, para dar profundidad y vida:
//
//     drawCapas('cielo')   → tras el fondo, ANTES de los luchadores
//     drawCapas('frente')  → DESPUÉS de los luchadores
//
//  Es puro adorno visual: usa gTime (reloj global) y NO toca la
//  simulación ni el RNG con semilla, así que es seguro también en
//  online. Cada prop se anima por código (olas que mecen, koi que
//  saltan, nubes que derivan, faroles en péndulo, brasas que suben,
//  pétalos que caen…). Muchos se reciclan entre etapas.
//
//  Integración en render.js (dos líneas):
//     drawBackground();           // (ya existe)
//     drawCapas('cielo');         // ← añadir aquí
//     ... dibujar a los luchadores ...
//     drawCapas('frente');        // ← y aquí
// ============================================================

const escImgs = {};   // id -> Image
const ESC_PROPS = [
  'nube', 'grulla', 'pajaros', 'farol', 'banderola', 'rama_bambu',
  'ola_alta', 'ola_baja', 'koi', 'bambu_frente', 'pino_nieve',
  'hojas', 'sakura', 'brasas', 'nieve_rafaga',
];
for (const id of ESC_PROPS) {
  const im = new Image();
  im.src = 'assets/props/' + id + '.png';
  escImgs[id] = im;
}
function escImg(id) {
  const im = escImgs[id];
  return im && im.complete && im.naturalWidth ? im : null;
}

// dibuja un prop con alto fijo (mantiene proporción). pivot: 'centro'
// (def) | 'arriba' (cuelga: cy es el tope) | 'abajo' (cy es la base)
function escBlit(im, cx, cy, h, o) {
  o = o || {};
  const s = h / im.naturalHeight, w = im.naturalWidth * s;
  ctx.save();
  ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
  ctx.translate(cx, cy);
  if (o.rot) ctx.rotate(o.rot);
  if (o.flip) ctx.scale(-1, 1);
  const top = o.pivot === 'arriba' ? 0 : o.pivot === 'abajo' ? -h : -h / 2;
  ctx.drawImage(im, -w / 2, top, w, h);
  ctx.restore();
}

// ───────────────────────── Animaciones ─────────────────────────
// cada entrada de capa tiene { id, capa, anim, ...params }. El alto va
// como fracción de H para que escale con el lienzo.
function animar(e) {
  const im = escImg(e.id);
  if (!im) return;                       // aún cargando → se omite
  const t = gTime;
  const h = (e.h || 0.2) * H;
  const s = h / im.naturalHeight, w = im.naturalWidth * s;

  switch (e.anim) {
    case 'deriva': {                     // nubes: cruzan horizontal y reaparecen
      const span = W + w, vx = e.vx || 18;
      const x = (((t * vx) % span) + span) % span - w / 2;
      escBlit(im, x, e.y * H, h, { alpha: e.alpha, flip: e.flip });
      break;
    }
    case 'vuela': {                      // aves: cruzan + leve cabeceo
      const span = W + w, vx = e.vx || 45;
      const x = (((t * vx) % span) + span) % span - w / 2;
      const y = e.y * H + Math.sin(t * (e.bob || 1.2)) * (e.bobAmp || 7);
      escBlit(im, x, y, h, { alpha: e.alpha, flip: e.flip });   // flip: que mire hacia donde vuela
      break;
    }
    case 'pendulo': {                    // faroles / banderolas: oscilan colgando
      const rot = Math.sin(t * (e.speed || 1.6) + (e.phase || 0)) * (e.amp || 0.12);
      escBlit(im, e.x * W, (e.y || 0) * H, h, { rot, pivot: 'arriba', flip: e.flip });
      break;
    }
    case 'olas': {                       // olas: mecen arriba/abajo y de lado
      const ph = e.phase || 0, sp = e.speed || 1.1;
      const dy = Math.sin(t * sp + ph) * (e.amp || 6) * (H / 540);
      const dx = Math.cos(t * sp * 0.6 + ph) * (e.sway || 12);
      escBlit(im, e.x * W + dx, e.y * H + dy, h, { alpha: e.alpha, flip: e.flip });
      break;
    }
    case 'koi': {                        // koi: salta en arco cada 'period' s
      const period = e.period || 7, jd = e.jump || 1.7;
      const lt = t % period;
      if (lt > jd) break;                // entre saltos: oculto
      const u = lt / jd, arc = Math.sin(u * Math.PI);
      const x = e.x * W + (e.dx || 70) * (u - 0.5);
      const y = (e.yBase || 1.02) * H - arc * (e.height || 0.3) * H;
      const rot = (u - 0.5) * 1.5 * (e.flip ? -1 : 1);
      escBlit(im, x, y, h, { rot, flip: e.flip });
      break;
    }
    case 'cae': {                        // pétalos / hojas / nieve: caen y derivan
      const vy = e.vy || 32, span = H + h;
      for (let k = 0; k < (e.copias || 2); k++) {
        const off = (k * span) / (e.copias || 2);
        const y = (((t * vy + off) % span) + span) % span - h / 2;
        const dx = Math.sin(t * 0.6 + k * 2.1) * (e.sway || 38);
        escBlit(im, (e.x || 0.5) * W + dx, y, h, { alpha: e.alpha, rot: e.spin ? t * e.spin + k : 0 });
      }
      break;
    }
    case 'sube': {                       // brasas: ascienden desde el suelo y se apagan
      const vy = e.vy || 42, span = H * 0.9;
      for (let k = 0; k < (e.copias || 2); k++) {
        const prog = (t * vy + (k * span) / (e.copias || 2)) % span;
        const y = GROUND - prog;
        const dx = Math.sin(t * 1.3 + k * 3.0) * (e.sway || 18);
        escBlit(im, (e.x || 0.5) * W + dx, y, h, { alpha: Math.max(0, 1 - prog / span) });
      }
      break;
    }
    case 'lado': {                       // bambú/pino al frente: balanceo suave en la base
      const rot = Math.sin(t * (e.speed || 0.9) + (e.phase || 0)) * (e.amp || 0.025);
      escBlit(im, e.x * W, GROUND + (e.dy || 0) * H, h, { rot, pivot: 'abajo', flip: e.flip });
      break;
    }
    default:
      escBlit(im, (e.x || 0.5) * W, (e.y || 0.5) * H, h, { alpha: e.alpha, flip: e.flip });
  }
}

// ───────────── Capas por escenario (ids de STAGES en data.js) ─────────────
const CAPAS = {
  // dojo: lugar cerrado (interior) → sin plantas ni clima; se deja limpio
  dojo: [],
  puente: [
    { id: 'nube', capa: 'cielo', anim: 'deriva', y: 0.16, h: 0.13, vx: 12, alpha: 0.95 },
    { id: 'pajaros', capa: 'cielo', anim: 'vuela', y: 0.22, h: 0.1, vx: 48 },
    { id: 'nube', capa: 'cielo', anim: 'deriva', y: 0.3, h: 0.09, vx: 8, alpha: 0.7 },
  ],
  bambu: [
    { id: 'rama_bambu', capa: 'cielo', anim: 'pendulo', x: 0.82, y: -0.03, h: 0.36, amp: 0.025, speed: 0.7, flip: true },
    { id: 'bambu_frente', capa: 'frente', anim: 'lado', x: 0.1, h: 0.95, amp: 0.02, speed: 0.8 },
    { id: 'bambu_frente', capa: 'frente', anim: 'lado', x: 0.9, h: 1.05, amp: 0.025, speed: 0.6, phase: 1.5, flip: true },
  ],
  tejado: [
    { id: 'nube', capa: 'cielo', anim: 'deriva', y: 0.14, h: 0.12, vx: 42, alpha: 0.9 },
    { id: 'pajaros', capa: 'cielo', anim: 'vuela', y: 0.24, h: 0.1, vx: 75 },
  ],
  templo: [
    { id: 'farol', capa: 'cielo', anim: 'pendulo', x: 0.2, y: 0.0, h: 0.22, amp: 0.1, speed: 1.5 },
    { id: 'farol', capa: 'cielo', anim: 'pendulo', x: 0.8, y: 0.0, h: 0.22, amp: 0.1, speed: 1.5, phase: 1.0 },
    { id: 'sakura', capa: 'frente', anim: 'cae', x: 0.5, h: 0.28, vy: 24, sway: 55, copias: 2 },
  ],
  mercado: [
    { id: 'farol', capa: 'cielo', anim: 'pendulo', x: 0.5, y: 0.0, h: 0.2, amp: 0.12, speed: 1.7 },
    { id: 'banderola', capa: 'frente', anim: 'pendulo', x: 0.13, y: 0.18, h: 0.28, amp: 0.06, speed: 1.3 },
    { id: 'banderola', capa: 'frente', anim: 'pendulo', x: 0.87, y: 0.18, h: 0.28, amp: 0.06, speed: 1.3, phase: 0.8, flip: true },
  ],
  volcan: [
    { id: 'nube', capa: 'cielo', anim: 'deriva', y: 0.14, h: 0.1, vx: 14, alpha: 0.5 },
    { id: 'brasas', capa: 'frente', anim: 'sube', x: 0.28, h: 0.26, vy: 40, sway: 22 },
    { id: 'brasas', capa: 'frente', anim: 'sube', x: 0.72, h: 0.3, vy: 48, sway: 26 },
  ],
  playa: [
    { id: 'nube', capa: 'cielo', anim: 'deriva', y: 0.14, h: 0.13, vx: 10, alpha: 0.95 },
    { id: 'grulla', capa: 'cielo', anim: 'vuela', y: 0.2, h: 0.13, vx: 46, flip: true },
    { id: 'ola_baja', capa: 'frente', anim: 'olas', x: 0.5, y: 0.96, h: 0.22, amp: 7, speed: 1.2, sway: 14 },
  ],
  nieve: [
    { id: 'nube', capa: 'cielo', anim: 'deriva', y: 0.13, h: 0.11, vx: 16, alpha: 0.85 },
    { id: 'pino_nieve', capa: 'frente', anim: 'lado', x: 0.11, h: 0.5, amp: 0.02, speed: 0.7 },
    { id: 'nieve_rafaga', capa: 'frente', anim: 'cae', x: 0.5, h: 0.4, vy: 55, sway: 90, copias: 2, alpha: 0.85 },
  ],
  barco: [
    { id: 'nube', capa: 'cielo', anim: 'deriva', y: 0.13, h: 0.11, vx: 13, alpha: 0.9 },
    { id: 'grulla', capa: 'cielo', anim: 'vuela', y: 0.19, h: 0.12, vx: 40, flip: true },
    { id: 'koi', capa: 'frente', anim: 'koi', x: 0.22, h: 0.3, yBase: 1.04, height: 0.34, period: 6.5, jump: 1.7 },
    { id: 'ola_baja', capa: 'frente', anim: 'olas', x: 0.18, y: 0.98, h: 0.24, amp: 8, speed: 1.0, sway: 14 },
    { id: 'ola_alta', capa: 'frente', anim: 'olas', x: 0.8, y: 0.92, h: 0.4, amp: 10, speed: 0.8, sway: 16, phase: 1.5 },
  ],
};

// ───────────── API: dibuja la capa pedida del escenario actual ─────────────
// 'capa' = 'cielo' (detrás de los luchadores) | 'frente' (delante)
function drawCapas(capa) {
  if (typeof stage === 'undefined' || !stage) return;
  const list = CAPAS[stage.id];
  if (!list) return;
  for (const e of list) if (e.capa === capa) animar(e);
}
