'use strict';

// ============================================================
//  RENDER — escenarios, samuráis, fantasma, HUD y combate
// ============================================================

// ---------------- Arte ukiyo-e (Gemini) ----------------
//  Fondos e imágenes de personaje generados con tools/generate_art.py.
//  Si la imagen existe y cargó, se usa; si no, cae al dibujo procedural.
//  Los personajes se animan como "recorte" (una pieza) movido por el
//  esqueleto del combate: posición, volteo, inclinación y caída.
const PUPPET_H = 110;            // alto en pantalla del luchador a escala 1
                                 // (≈ largo visual de la katana ≈ reach del
                                 //  combate, para que las colisiones calcen)
const charImg = {};              // id -> { img, ready }
const bgImg = {};                // id -> { img, ready }

function loadArt(map, dir, ids) {
  for (const id of ids) {
    const rec = { img: new Image(), ready: false };
    rec.img.onload = () => { rec.ready = true; };
    rec.img.src = dir + id + '.png';
    map[id] = rec;
  }
}
// data.js ya está cargado: intentamos todas las imágenes; las que falten
// simplemente nunca quedan "ready" y el juego usa el dibujo procedural.
loadArt(charImg, 'assets/chars/', allChars().map(c => c.id));
loadArt(bgImg, 'assets/bg/', STAGES.map(s => s.id));

// ---------------- Recorte articulado (origami / South Park) ----------------
//  Piezas separadas (torso+cabeza, parte baja, brazos+katana) generadas con
//  tools/generate_art.py parts. El esqueleto del combate las articula: el
//  torso se inclina, los brazos+katana giran en el hombro (windup/ataque/
//  guardia), y todo rota al caer. Si faltan piezas → cae a una pieza / procedural.
const PART_NAMES = ['torso', 'pierna', 'brazos'];
const partsImg = {};             // id -> { torso, pierna, brazos, ready }

function loadParts(ids) {
  for (const id of ids) {
    const rec = { ready: false, loaded: 0 };
    for (const part of PART_NAMES) {
      const im = new Image();
      im.onload = () => { if (++rec.loaded === PART_NAMES.length) rec.ready = true; };
      im.src = `assets/parts/${id}/${part}.png`;
      rec[part] = im;
    }
    partsImg[id] = rec;
  }
}
loadParts(allChars().map(c => c.id));

// proporciones del muñeco (fracciones del alto total) — ajustables
const RIG = {
  hipFrac: 0.46,        // altura de la cadera (cintura)
  shoulderFrac: 0.80,   // altura del hombro (alto, a la altura del cuello)
  shoulderXFrac: -0.05, // hombro algo atrasado (encaja con el cuello, no adelante)
  torsoHFrac: 0.66,     // alto de la pieza de torso
  armsWFrac: 0.92,      // ancho de la pieza de brazos (largo katana incluido)
  lowerHFrac: 0.56,     // alto de la parte baja completa (hakama, cadera→pies)
  legHFrac: 0.54,       // alto de una pierna suelta (cadera→pie)
  legSplitFrac: 0.05,   // separación delante/atrás de las dos piernas
  // ajuste fino por pierna (sobre el ±split): permite acomodar la trasera y la
  // delantera por separado desde el editor. DX/DY en fracción de H; Rot en rad.
  legBackDX: 0, legBackDY: 0, legFrontDX: 0, legFrontDY: 0,
  legBackRot: 0, legFrontRot: 0,
  legSwing: 0.26,       // zancada de las piernas sueltas al caminar (rad)
  lowerSway: 0.06,      // mecida de la parte baja completa al caminar (rad)
  walkBob: 2.5,         // sube/baja al caminar (px)
  seamOverlap: 0.05,    // la parte baja sube bajo el torso para tapar el hueco
  // anclajes (pivote) dentro de cada imagen, en fracción de su bbox
  torsoAnchor: [0.5, 1.0],   // cintura: abajo-centro
  lowerAnchor: [0.5, 0.04],  // cadera: arriba-centro
  legAnchor:   [0.5, 0.06],  // cadera: arriba-centro
  armsAnchor:  [0.06, 0.28], // hombro: extremo izquierdo-superior (encaja en el cuello)
};

// personajes cuya pieza de parte baja ya trae las DOS piernas (hakama
// completo): se dibuja una sola vez. El resto trae UNA pierna → se duplica.
const LEG_FULL = new Set(['maestro', 'gigante', 'sapo', 'abuela']);

// ajustes por personaje guardados por el editor de rig (rig_editor.html →
// rigs.json). Si existe un override para el id, manda sobre el RIG base.
let rigData = null;
if (typeof fetch !== 'undefined') {
  fetch('rigs.json').then(r => r.ok ? r.json() : null).then(d => { rigData = d || {}; applyPartOverrides(); }).catch(() => {});
}
// un personaje puede usar piezas de OTRO (combinar): rigs.json puede traer
// parts: { torso:"ronin/torso.png", pierna:"bandido/pierna.png", ... }
function applyPartOverrides() {
  if (!rigData) return;
  for (const id in rigData) {
    const ov = rigData[id] && rigData[id].parts;
    if (!ov) continue;
    const rec = partsImg[id] || (partsImg[id] = { ready: false, loaded: 0 });
    for (const part of PART_NAMES) {
      if (!ov[part]) continue;
      const im = new Image();
      im.onload = () => { rec.ready = true; };
      im.src = 'assets/parts/' + ov[part];
      rec[part] = im;
    }
  }
}
// rig efectivo de un personaje: RIG base + override de rigs.json
function rigOf(id) {
  const o = rigData && rigData[id];
  return o ? Object.assign({}, RIG, o) : RIG;
}
// ¿la parte baja es una pieza (hakama completo) o una pierna a duplicar?
function legIsFull(id) {
  const o = rigData && rigData[id];
  if (o && o.legMode) return o.legMode === 'full';
  return LEG_FULL.has(id);
}

// retrato del personaje (la pieza de torso trae la cabeza): se recorta al
// recuadro mostrando la cara arriba. Devuelve false si no hay arte.
function drawFace(ch, cx, cy, w, h) {
  const rec = ch && partsImg[ch.id];
  if (!rec || !rec.ready || !rec.torso || !rec.torso.width) return false;
  const img = rec.torso;
  ctx.save();
  ctx.beginPath(); ctx.rect(cx - w / 2, cy - h / 2, w, h); ctx.clip();
  const s = w / img.width;            // ajusta al ancho del recuadro
  ctx.drawImage(img, cx - (img.width * s) / 2, cy - h / 2 - h * 0.04, img.width * s, img.height * s);
  ctx.restore();
  return true;
}

function drawPart(img, anchor, cx, cy, targetH, targetW, rot) {
  if (!img || !img.width) return;
  const s = targetH != null ? targetH / img.height : targetW / img.width;
  const w = img.width * s, h = img.height * s;
  ctx.save();
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -anchor[0] * w, -anchor[1] * h, w, h);
  ctx.restore();
}

// ---------------- Animación del recorte (poses, estela, efectos) ----------------
//  TODO lo de esta sección es VISUAL: la memoria de animación vive en un
//  WeakMap por objeto luchador y corre con reloj real (performance.now), así
//  que la simulación, el online, los replays y el smoke no se enteran.
//  La pose sale de una función pura (estado + progreso del estado + estilo), y
//  eso permite dibujar la estela del corte EXACTA: se re-muestrea la trayectoria
//  de la punta de la katana a lo largo del tajo (una media luna, no una raya).

// punta de la katana dentro de cada pieza de brazos (fracción del bbox),
// medida sobre los PNG con tools (columna opaca más a la derecha)
const PUNTA_KATANA = {
  abuela: [0.999, 0.233], bandido: [0.999, 0.352], cazadora: [0.999, 0.389],
  espectro: [0.999, 0.240], gallina: [0.999, 0.231], gigante: [0.999, 0.573],
  maestro: [0.999, 0.291], mapache: [0.998, 0.659], melena: [0.999, 0.435],
  monja: [0.999, 0.590], nino: [0.999, 0.502], ronin: [0.999, 0.253],
  sapo: [0.999, 0.628], tiburon: [0.999, 0.527],
};
function puntaDe(img) {
  const m = img && img.src && img.src.match(/parts\/([^/]+)\/[^/]+$/);
  return (m && PUNTA_KATANA[m[1]]) || [0.99, 0.3];
}

// forma del tajo por estilo (cómo se MUEVE, no qué hace): amplitud de la
// preparación, sobreimpulso al final del corte, arremetida y floritura
const FORMA_CORTE = {
  ronin:    { amp: 1.00, over: 0.18, lunge: 1.0, flor: 'chiburi' },
  maestro:  { amp: 0.70, over: 0.06, lunge: 0.7, flor: 'chiburi' },
  bandido:  { amp: 1.30, over: 0.38, lunge: 1.3, flor: 'giro' },
  monja:    { amp: 1.05, over: 0.22, lunge: 1.0, flor: null },
  nino:     { amp: 0.75, over: 0.14, lunge: 1.2, flor: null },
  gigante:  { amp: 1.35, over: 0.30, lunge: 0.8, flor: null },
  cazadora: { amp: 0.90, over: 0.20, lunge: 1.3, flor: null },
  espectro: { amp: 1.00, over: 0.16, lunge: 1.1, flor: null },
  gallina:  { amp: 1.25, over: 0.30, lunge: 1.0, flor: null },
  sapo:     { amp: 1.30, over: 0.30, lunge: 0.8, flor: null },
  mapache:  { amp: 1.20, over: 0.26, lunge: 1.0, flor: null },
  tiburon:  { amp: 1.30, over: 0.30, lunge: 0.9, flor: null },
  abuela:   { amp: 0.80, over: 0.10, lunge: 0.7, flor: 'chiburi' },
};
const FORMA_BASE = { amp: 1.0, over: 0.18, lunge: 1.0, flor: null };

// ángulo del brazo armado (rad, local mirando a la derecha; negativo = hoja
// arriba) por línea [alta, media, baja]
const ARM_IDLE  = [-1.00, -0.30, 0.55];
const ARM_GUARD = [-1.05, -0.45, 0.15];
const ARM_WIND  = [-1.62, -0.98, 1.05];   // gedan: la hoja baja y atrás (barrido)
const ARM_CUT   = [ 0.72,  0.42, -0.12];
const ARM_REC   = [ 0.55,  0.30, 0.25];

const easeOut = u => 1 - Math.pow(1 - u, 3);
const easeInOut = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = u => u < 0 ? 0 : u > 1 ? 1 : u;

const animMem = new WeakMap();
function memDe(p) {
  let m = animMem.get(p);
  if (!m) {
    m = { state: p.state, dur: 0.001, serial: p.chainSerial || 0, t: 0, pose: null,
          flash: 0, squash: 0, wasGround: p.onGround, vida: p.vida, trail: null,
          fxSerial: -1, glintSerial: -1, dustT: 0, spin: 0 };
    animMem.set(p, m);
  }
  return m;
}

// progreso 0→1 del estado actual (la duración se captura al entrar en él)
function progresoEstado(p, m) {
  if (p.state !== m.state || (p.chainSerial || 0) !== m.serial) {
    m.state = p.state;
    m.serial = p.chainSerial || 0;
    m.dur = Math.max(0.001, p.stateTimer || 0.001);
  }
  if (p.state === PSTATE.GUARD) return clamp01((p.guardT || 0) / 0.2);
  return clamp01(1 - (p.stateTimer || 0) / m.dur);
}

// ¿qué remate tiene el corte en curso? (visual: lee el estado, no lo cambia)
function remateVisual(p) {
  const e = p.estilo;
  if (!e || !e.cadena) return null;
  return (p.chainIdx || 0) >= e.cadena.length - 1 ? (e.remate || null) : null;
}

// pose del muñeco: función PURA del estado, su progreso u y el estilo
function poseDe(p, u) {
  const fo = FORMA_CORTE[p.char.id] || FORMA_BASE;
  const atk = p.state === PSTATE.WINDUP || p.state === PSTATE.ATTACK || p.state === PSTATE.RECOVER;
  const km = atk ? (p.atkKamae != null ? p.atkKamae : 1) : (p.kamae != null ? p.kamae : 1);
  const rem = atk ? remateVisual(p) : null;
  const thrust = !!p.attackThrust;
  const breath = Math.sin((p.bob || 0) * 0.9);
  const P = { arm: ARM_IDLE[km] + breath * 0.025, lean: km === 2 ? 0.10 : km === 0 ? -0.04 : 0,
              dx: 0, crouch: km === 2 ? 0.05 : 0, legF: km === 2 ? -0.34 : km === 0 ? -0.08 : -0.16,
              legB: km === 2 ? 0.34 : km === 0 ? 0.10 : 0.18, spin: 0, stretch: 0 };

  // ángulos de la preparación y del final del tajo, según línea y estilo
  let wA = ARM_WIND[km], cA = ARM_CUT[km];
  if (km !== 2) wA = ARM_IDLE[km] + (wA - ARM_IDLE[km]) * fo.amp;
  else wA += (fo.amp - 1) * 0.3;                          // gedan: la hoja cae más atrás
  if (rem === 'alza') { wA = 1.05; cA = -1.35; }          // tajo que sube y lanza
  if (rem === 'nuki') { wA = -0.20; cA = 0.05; }          // estocada que cruza
  if (rem === 'onda' && km !== 2) cA = 1.05;              // el tajo remata en el suelo
  if (thrust) { wA = -0.10; cA = 0.02; }
  if (p.kaeshi) wA = lerp(ARM_GUARD[km], wA, 0.55);       // contragolpe: casi sin preparación
  // el sobreimpulso sigue al tajo; en el barrido bajo es corto (que no parezca un tajo que sube)
  const over = Math.sign(cA - wA) * fo.over * (km === 2 && rem !== 'alza' ? 0.35 : 1);

  switch (p.state) {
    case PSTATE.WINDUP: {
      const k = easeOut(u);
      P.arm = lerp(ARM_IDLE[km], wA, k) + (u > 0.85 ? Math.sin(u * 60) * 0.015 : 0);   // la hoja tiembla, lista
      P.lean = lerp(P.lean, (km === 2 ? 0.05 : -0.14) * fo.amp, k);
      P.dx = -4 * k * fo.amp;
      P.legF = lerp(P.legF, -0.22, k); P.legB = lerp(P.legB, 0.36, k);
      P.crouch = lerp(P.crouch, km === 2 ? 0.08 : 0.03, k);
      if (rem === 'nuki') { P.lean = -0.05 + 0.25 * k; P.legF = -0.45 * k; P.legB = 0.5 * k; P.crouch = 0.07 * k; }
      break;
    }
    case PSTATE.ATTACK: {
      const k = easeOut(u);
      P.arm = lerp(wA, cA + over, k);
      P.lean = lerp(-0.12, (thrust ? 0.12 : 0.24) * Math.min(1.3, fo.lunge), k);
      P.dx = lerp(-4, (thrust ? 26 : 16) * fo.lunge, k);
      P.legF = lerp(-0.22, -0.62, k); P.legB = lerp(0.36, 0.58, k);
      P.crouch = lerp(0.03, km === 2 ? 0.11 : 0.07, k);
      P.stretch = 0.04 * (1 - u);
      if (rem === 'giro') P.spin = u * Math.PI * 2;           // la monja gira sobre sí
      if (rem === 'nuki') { P.dx = lerp(0, 34, k); P.lean = 0.28; P.legF = -0.7; P.legB = 0.7; P.crouch = 0.12; }
      if (rem === 'alza') { P.lean = lerp(0.1, -0.22, k); P.crouch = lerp(0.1, 0.0, k); P.stretch = 0.08 * k; }
      break;
    }
    case PSTATE.RECOVER: {
      const k = easeInOut(u);
      const end = cA + over;
      P.arm = lerp(end, ARM_REC[km], k);
      // floritura: chiburi (sacudir la sangre de la hoja) o giro de muñeca
      if (fo.flor === 'chiburi') P.arm += Math.sin(clamp01((u - 0.35) / 0.5) * Math.PI) * 0.55;
      if (fo.flor === 'giro') P.arm -= Math.sin(clamp01(u / 0.7) * Math.PI) * 0.9;
      P.lean = lerp(0.24 * Math.min(1.3, fo.lunge), 0.06, k);
      P.dx = lerp(16 * fo.lunge, 4, k);
      P.legF = lerp(-0.62, -0.25, k); P.legB = lerp(0.58, 0.25, k);
      P.crouch = lerp(0.07, 0.03, k);
      if (rem === 'alza') P.arm = lerp(end, ARM_REC[0], k);
      break;
    }
    case PSTATE.FEINT: {
      const k = Math.sin(u * Math.PI);                         // amago: sube y vuelve
      P.arm = lerp(P.arm, ARM_WIND[km === 2 ? 1 : km] * 0.8, k);
      P.lean = lerp(P.lean, -0.12, k); P.dx = 6 * k;
      P.legF = lerp(P.legF, -0.4, k);
      break;
    }
    case PSTATE.GUARD: {
      P.arm = ARM_GUARD[km] + Math.sin((p.bob || 0) * 3) * 0.02;
      P.lean = -0.10; P.dx = -2;
      P.legF = -0.18; P.legB = 0.30; P.crouch = km === 2 ? 0.07 : 0.03;
      break;
    }
    case PSTATE.STAGGER:
    case PSTATE.HITSTUN: {
      const k = Math.sin(clamp01(u * 1.4) * Math.PI * 0.5);
      P.arm = lerp(-0.6, 0.35, u);
      P.lean = -0.30 * (1 - u * 0.5) - 0.05 * k;
      P.dx = -8 * (1 - u);
      P.legF = 0.15; P.legB = 0.35; P.crouch = 0.02;
      break;
    }
    case PSTATE.EXPOSED: {
      // postura rota: rodilla casi en tierra, hoja caída, jadeando
      const pant = Math.sin((p.bob || 0) * 6) * 0.04;
      P.arm = 1.05 + pant; P.lean = 0.30 + pant;
      P.legF = -0.55; P.legB = 0.75; P.crouch = 0.12;
      break;
    }
  }
  // iai: katana envainada en reposo — brazo al costado, mano en la tsuka
  if (p.sheathed && p.state === PSTATE.IDLE) { P.arm = 0.85 + breath * 0.02; P.lean = -0.03; }
  // en el aire: piernas recogidas al subir, estiradas al caer
  if (!p.onGround && p.state !== PSTATE.DEAD) {
    const sube = (p.vy || 0) < 0;
    P.legF = sube ? -0.62 : -0.25; P.legB = sube ? 0.30 : 0.18;
    P.crouch = 0;
    P.stretch += sube ? 0.05 : 0.02;
  }
  return P;
}

// suaviza la pose hacia el objetivo (evita saltos entre estados); el tajo
// (ATTACK) va sin filtro para que el corte sea seco y la estela calce
const POSE_KEYS = ['arm', 'lean', 'dx', 'crouch', 'legF', 'legB', 'stretch'];
function suavizarPose(m, P, dt, rate) {
  if (!m.pose || rate === Infinity) { m.pose = Object.assign({}, P); return m.pose; }
  const a = 1 - Math.exp(-rate * dt);
  for (const k of POSE_KEYS) m.pose[k] += (P[k] - m.pose[k]) * a;
  m.pose.spin = P.spin;
  return m.pose;
}

// geometría del rig para una pose: devuelve puntos en coords LOCALES (mirando
// a la derecha, pies en 0,0) — la misma cuenta que usa el dibujo, así la estela
// sale justo de la punta de la hoja que se ve
function rigGeom(p, R, H, rec, P, bob, wbob) {
  const hipY = -R.hipFrac * H + P.crouch * H;
  const tdx = (R.torsoDX || 0) * H, tdy = (R.torsoDY || 0) * H;
  const adx = (R.armsDX || 0) * H, ady = (R.armsDY || 0) * H;
  const pivX = tdx, pivY = hipY + bob + wbob + tdy;
  // el hombro va pegado al torso: gira con la inclinación alrededor de la cintura
  const bx = R.shoulderXFrac * H + adx - pivX;
  const by = (-R.shoulderFrac * H + P.crouch * H) + bob + wbob + ady - pivY;
  const cl = Math.cos(P.lean), sl = Math.sin(P.lean);
  const shX = pivX + bx * cl - by * sl, shY = pivY + bx * sl + by * cl;
  let tipX = shX, tipY = shY;
  const img = rec.brazos;
  if (img && img.width) {
    const w = R.armsWFrac * H, h = w * img.height / img.width;
    const t = puntaDe(img);
    const lx = (t[0] - R.armsAnchor[0]) * w, ly = (t[1] - R.armsAnchor[1]) * h;
    const ca = Math.cos(P.arm), sa = Math.sin(P.arm);
    tipX = shX + lx * ca - ly * sa; tipY = shY + lx * sa + ly * ca;
  }
  return { hipY, pivX, pivY, shX, shY, tipX, tipY };
}

// coords locales → mundo (la misma transformación que aplica drawOrigami)
function aMundo(p, P, sx, sy, lx, ly) {
  const f = p.facing;
  return [p.x + f * P.dx + f * sx * lx, p.y + sy * ly];
}

// muestrea la trayectoria de la punta durante el tajo (0 → u): media luna
function muestrearTajo(p, R, H, rec, uHasta, sx, sy) {
  const N = 14, out = [];
  for (let i = 0; i <= N; i++) {
    const u = uHasta * i / N;
    const P = poseDe(p, u);
    const g = rigGeom(p, R, H, rec, P, 0, 0);
    const spinX = Math.cos(P.spin || 0);
    const tip = aMundo(p, P, sx * spinX, sy, g.tipX, g.tipY);
    const ix = g.shX + (g.tipX - g.shX) * 0.5, iy = g.shY + (g.tipY - g.shY) * 0.5;
    const inn = aMundo(p, P, sx * spinX, sy, ix, iy);
    out.push([tip[0], tip[1], inn[0], inn[1]]);
  }
  return out;
}

// dibuja la estela: cinta que se afina hacia atrás, del color del estilo
function drawTrail(tr, alpha) {
  const pts = tr.pts, n = pts.length;
  if (n < 2 || alpha <= 0) return;
  const tz = tr.trazo;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < n; i++) {
    const a0 = pts[i - 1], a1 = pts[i];
    const k = i / (n - 1);                               // 0 = cola · 1 = cabeza
    const wIn = Math.min(1, 0.25 + tz.ancho * 0.55);     // cuánto se acerca al hombro
    const ix0 = a0[0] + (a0[2] - a0[0]) * wIn * k, iy0 = a0[1] + (a0[3] - a0[1]) * wIn * k;
    const ix1 = a1[0] + (a1[2] - a1[0]) * wIn * k, iy1 = a1[1] + (a1[3] - a1[1]) * wIn * k;
    ctx.globalAlpha = alpha * (0.15 + 0.75 * k * k);
    ctx.fillStyle = tz.color;
    ctx.beginPath();
    ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(ix1, iy1); ctx.lineTo(ix0, iy0);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // filo exterior: la línea viva del corte
  ctx.globalAlpha = alpha * 0.95;
  ctx.strokeStyle = tz.borde;
  ctx.lineWidth = 2 + tz.ancho * 1.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const h = Math.floor(n * 0.4);
  ctx.moveTo(pts[h][0], pts[h][1]);
  for (let i = h + 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}

// destello en la punta ("kirari"): anuncia el tajo que viene / el kaeshi listo
function drawGlint(x, y, size, color, rot) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? size : size * 0.18;
    const a = i * Math.PI / 4;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// partículas propias del estilo a lo largo del tajo (visual: Math.random ok)
const FX_ESTILO = {
  chispa: { colors: ['#ffffff', '#fff4c0'], n: 8, size: 2, grav: false, spd: 120, life: 0.3 },
  oro:    { colors: ['#fff0a0', '#e8c050', '#ffffff'], n: 12, size: 2, grav: false, spd: 60, life: 0.5 },
  brasa:  { colors: ['#ffb040', '#ff7020', '#ffe080'], n: 14, size: 2.5, grav: false, spd: 90, life: 0.55, up: -60 },
  petalo: { colors: ['#ffc8e8', '#f0a0d0', '#ffffff'], n: 12, size: 3.5, grav: false, spd: 70, life: 0.9, up: 40 },
  polvo:  { colors: ['rgba(190,170,140,0.7)', 'rgba(150,130,110,0.6)'], n: 10, size: 5, grav: false, spd: 60, life: 0.6, disc: true },
  hoja:   { colors: ['#9ad04a', '#6aa030', '#c8e070'], n: 10, size: 3.5, grav: false, spd: 90, life: 0.8, up: 30 },
  bruma:  { colors: ['rgba(160,240,235,0.45)', 'rgba(200,180,240,0.4)'], n: 9, size: 7, grav: false, spd: 40, life: 0.7, disc: true },
  pluma:  { colors: ['#1a1014', '#3a2a3a', '#e03020'], n: 10, size: 4, grav: false, spd: 80, life: 0.9, up: 35 },
  agua:   { colors: ['#c0f0ff', '#70c0e0', '#ffffff'], n: 16, size: 2.5, grav: true, spd: 160, life: 0.6 },
};
function spawnFxEstilo(p, pts) {
  const tz = (p.estilo && p.estilo.trazo) || ESTILO_BASE.trazo;
  const d = FX_ESTILO[tz.fx] || FX_ESTILO.chispa;
  for (let i = 0; i < d.n; i++) {
    const s = pts[Math.floor(Math.random() * pts.length)];
    const a = Math.random() * Math.PI * 2, v = d.spd * (0.3 + Math.random());
    particles.push({
      x: s[0], y: s[1], vx: Math.cos(a) * v + p.facing * 40, vy: Math.sin(a) * v + (d.up || 0),
      life: d.life * (0.5 + Math.random() * 0.5), maxLife: d.life,
      color: d.colors[Math.floor(Math.random() * d.colors.length)],
      size: d.size * (0.6 + Math.random() * 0.8), gravity: d.grav, disc: !!d.disc,
    });
  }
}

// polvo a los pies (aterrizaje, arrancar a correr)
function spawnPolvo(x, y, n, dir) {
  const nieve = typeof stage !== 'undefined' && stage && stage.id === 'nieve';
  for (let i = 0; i < n; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 16, y: y - 2,
      vx: (dir || (Math.random() - 0.5) * 2) * (30 + Math.random() * 60), vy: -20 - Math.random() * 40,
      life: 0.35 + Math.random() * 0.3, maxLife: 0.65,
      color: nieve ? 'rgba(240,244,255,0.7)' : 'rgba(196,182,156,0.55)',
      size: 4 + Math.random() * 5, gravity: false, disc: true,
    });
  }
}

function drawOrigami(p, ghostAlpha, rec) {
  const f = p.facing;
  const dead = p.state === PSTATE.DEAD;
  const bob = p.onGround && !dead ? Math.sin(p.bob) * 1.5 : 0;
  const sc = p.scale || 1;
  const R = rigOf(p.char.id);              // rig base + ajuste por personaje
  const H = PUPPET_H * sc * (R.heightMul || 1);
  const ghost = ghostAlpha !== undefined;

  // reloj real de la memoria de animación (visual; no toca la simulación)
  const m = memDe(p);
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const dt = m.t ? Math.min(0.05, Math.max(0, now - m.t)) : 1 / 60;
  m.t = now;

  const u = progresoEstado(p, m);
  const raw = poseDe(p, u);
  const P = suavizarPose(m, raw, dt, p.state === PSTATE.ATTACK ? Infinity : p.state === PSTATE.WINDUP ? 32 : 16);

  // eventos visuales: golpe recibido (destello), aterrizaje (aplaste + polvo)
  if (!ghost) {
    if (p.vida < m.vida - 0.01) m.flash = 0.13;
    m.vida = p.vida;
    if (p.onGround && !m.wasGround && !dead) { m.squash = 0.16; spawnPolvo(p.x, p.y, 7); }
    m.wasGround = p.onGround;
    // correr levanta polvo del talón
    if (p.onGround && Math.abs(p.vx) > 120 && !dead) {
      m.dustT -= dt;
      if (m.dustT <= 0) { m.dustT = 0.18; spawnPolvo(p.x - f * 10, p.y, 1, -Math.sign(p.vx)); }
    }
  }
  m.flash = Math.max(0, m.flash - dt);
  m.squash = Math.max(0, m.squash - dt);

  // aplastar/estirar: aterrizaje y salto
  const sq = m.squash > 0 ? Math.sin((m.squash / 0.16) * Math.PI) * 0.10 : 0;
  const sy = 1 - sq + P.stretch, sx = 1 + sq * 0.8 - P.stretch * 0.5;
  const spinX = Math.cos(P.spin || 0);

  const walking = !dead && p.onGround && Math.abs(p.vx) > 30 && p.state === PSTATE.IDLE;
  const phase = Math.sin(p.bob * 1.6);
  const wbob = walking ? Math.abs(phase) * R.walkBob : 0;
  const g = rigGeom(p, R, H, rec, P, bob, wbob);

  // estela del tajo: se re-muestrea la punta durante ATTACK y se deja
  // desvanecer después (no se dibuja para fantasmas ni muertos)
  if (!ghost && !dead) {
    if (p.state === PSTATE.ATTACK) {
      const pts = muestrearTajo(p, R, H, rec, Math.max(0.12, u), sx, sy);
      m.trail = { pts, life: 0.24, maxLife: 0.24, trazo: (p.estilo && p.estilo.trazo) || ESTILO_BASE.trazo };
      if (m.fxSerial !== (p.chainSerial || 0)) { m.fxSerial = p.chainSerial || 0; spawnFxEstilo(p, pts); }
    } else if (m.trail) {
      m.trail.life -= dt;
      if (m.trail.life <= 0) m.trail = null;
    }
  }

  ctx.save();
  if (ghost) ctx.globalAlpha = ghostAlpha;
  ctx.translate(p.x + f * P.dx, p.y);
  if (dead) {
    // muerte en dos tiempos: cae de rodillas y luego se desploma
    const t = p.deathT || 0;
    const kneel = Math.min(1, t * 5);
    const fall = clamp01((t - 0.35) * 2.6);
    ctx.rotate(f * 0.22 * kneel * (1 - fall) - f * easeInOut(fall) * 1.45);
    ctx.translate(0, fall * 8);
  }
  ctx.scale(f * sx * spinX, sy);          // mira a la derecha por defecto
  if (m.flash > 0 && !ghost) {
    // destello de impacto: silueta blanca el primer instante, luego rojiza
    ctx.filter = m.flash > 0.07 ? 'brightness(0) invert(1)' : 'brightness(1.6) sepia(1) saturate(4) hue-rotate(-30deg)';
  }

  // desplazamientos por pieza (el editor de rig los mueve arrastrando)
  const ldx = (R.lowerDX || 0) * H, ldy = (R.lowerDY || 0) * H;
  const legPoseF = dead ? -0.1 : P.legF, legPoseB = dead ? 0.1 : P.legB;

  // 1) parte baja: hakama completo (1 pieza) o una pierna duplicada (delante/
  //    atrás) con zancada. Sube `seam` bajo el torso para tapar el hueco.
  const seam = R.seamOverlap * H;
  if (legIsFull(p.char.id)) {
    const sway = walking ? phase * R.lowerSway : (legPoseF + legPoseB) * 0.15;
    drawPart(rec.pierna, R.lowerAnchor, ldx, g.hipY + wbob - seam + ldy, R.lowerHFrac * H + seam - P.crouch * H, null, sway);
  } else {
    const sw = walking ? phase * R.legSwing : 0;
    const legH = R.legHFrac * H + seam, split = R.legSplitFrac * H;
    const bdx = (R.legBackDX || 0) * H, bdy = (R.legBackDY || 0) * H;
    const fdx = (R.legFrontDX || 0) * H, fdy = (R.legFrontDY || 0) * H;
    // la cadera baja al agacharse y la pierna abierta se "acorta" en vertical:
    // se reescala cada pierna para que el pie siga pisando el suelo
    const legB = -sw + legPoseB + (R.legBackRot || 0), legF = sw + legPoseF + (R.legFrontRot || 0);
    const baja = (R.hipFrac - P.crouch) / R.hipFrac;
    const hB = legH * Math.min(1.15, baja / Math.max(0.6, Math.cos(legPoseB)));
    const hF = legH * Math.min(1.15, baja / Math.max(0.6, Math.cos(legPoseF)));
    drawPart(rec.pierna, R.legAnchor, -split + ldx + bdx, g.hipY - seam + ldy + bdy, hB, null, legB);   // trasera
    drawPart(rec.pierna, R.legAnchor,  split + ldx + fdx, g.hipY - seam + ldy + fdy, hF, null, legF);   // delantera
  }
  // 2) torso + cabeza: pivota en la cintura, se inclina (rotación en local)
  drawPart(rec.torso, R.torsoAnchor, g.pivX, g.pivY, R.torsoHFrac * H, null, P.lean);
  // 3) brazos + katana: pivotan en el hombro (que sigue al torso) y giran con la pose
  drawPart(rec.brazos, R.armsAnchor, g.shX, g.shY, null, R.armsWFrac * H, P.arm);
  ctx.filter = 'none';
  ctx.restore();

  if (ghost || dead) return;
  // la estela se dibuja SOBRE el muñeco: el filo pasa por delante
  if (m.trail) drawTrail(m.trail, m.trail.life / m.trail.maxLife);
  const tip = aMundo(p, P, sx * spinX, sy, g.tipX, g.tipY);
  // kirari: brillo en la punta al final de la preparación (el tajo viene)
  if (p.state === PSTATE.WINDUP && u > 0.55) {
    const k = (u - 0.55) / 0.45;
    drawGlint(tip[0], tip[1], 6 + 10 * Math.sin(k * Math.PI), p.kaeshi ? '#ffe890' : '#ffffff', now * 3);
  }
  // kaeshi listo: la hoja arde en oro mientras dura la ventana del contragolpe
  if (p.estilo && p.estilo.kaeshi && p.kaeshiT > 0) {
    drawGlint(tip[0], tip[1], 5 + Math.sin(now * 30) * 2, '#f4d860', now * 5);
  }
  // guardia en ventana de parry: filo encendido
  if (p.state === PSTATE.GUARD && (p.guardT || 0) <= (p.parryWin || 0)) {
    drawGlint(tip[0], tip[1], 7, '#b0f0ff', 0.4);
  }
}

// recorte de una pieza: la figura entera, movida por el estado del combate
function drawPuppet(p, ghostAlpha, art) {
  const f = p.facing;
  const dead = p.state === PSTATE.DEAD;
  const bob = p.onGround && !dead ? Math.sin(p.bob) * 1.5 : 0;
  const sc = p.scale || 1;
  const img = art.img;
  const h = PUPPET_H * sc;
  const w = h * (img.width / img.height);

  // inclinación / arremetida según el estado (legibilidad de la pose);
  // figura de una pieza: la kamae solo puede leerse en la inclinación
  const km2 = p.kamae != null ? p.kamae : 1;
  let lean = km2 === 0 ? -0.06 : km2 === 2 ? 0.08 : 0, dx = 0, dy = km2 === 2 ? 2 : 0;
  switch (p.state) {
    case PSTATE.WINDUP:  lean = -0.20; dy = -3; break;
    case PSTATE.FEINT:   lean = -0.12; break;
    case PSTATE.ATTACK:  lean = 0.32; dx = 20; break;
    case PSTATE.RECOVER: lean = 0.16; dx = 8; break;
    case PSTATE.GUARD:   lean = -0.14; break;
    case PSTATE.STAGGER:
    case PSTATE.HITSTUN: lean = -0.36; dx = -8; break;
    case PSTATE.EXPOSED: lean = 0.22 + Math.sin(p.bob * 6) * 0.05; break;
  }

  ctx.save();
  if (ghostAlpha !== undefined) ctx.globalAlpha = ghostAlpha;
  ctx.translate(p.x + f * dx, p.y + bob + dy);
  if (dead) {
    const fall = Math.min(1, p.deathT * 2.8);
    ctx.rotate(-f * fall * 1.45);
    ctx.translate(0, fall * 8);
  } else {
    ctx.rotate(f * lean);
  }
  ctx.scale(f, 1);                       // la figura mira a la derecha por defecto
  ctx.drawImage(img, -w / 2, -h, w, h);  // pies en el origen, centrado en x
  ctx.restore();
}

function drawBackground() {
  // fondo ukiyo-e generado, si está disponible para este escenario
  const bg = bgImg[stage.id];
  if (bg && bg.ready) { ctx.drawImage(bg.img, 0, 0, W, H); return; }
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  const skies = {
    dojo:    ['#0d0d1f', '#1c1430', '#3a1c2e', '#1a0e16'],
    puente:  ['#0a1422', '#142838', '#2a3848', '#101820'],
    bambu:   ['#0a140e', '#14241a', '#1e3424', '#0c160e'],
    tejado:  ['#1a1026', '#2a1838', '#48283e', '#1c1018'],
    templo:  ['#160e1e', '#241430', '#42203a', '#1a0e16'],
    mercado: ['#1e1410', '#32221a', '#4c3024', '#1e140e'],
    volcan:  ['#1c0a0a', '#301010', '#521a10', '#200c08'],
    playa:   ['#1a64c0', '#3a82d4', '#74aade', '#a8c6e4'],   // día pleno en la costa
    nieve:   ['#0c1422', '#16243a', '#2a3c54', '#0e1620'],
    barco:   ['#080e1c', '#102032', '#1a3448', '#0a1018'],
  };
  const cs = skies[stage.id] || skies.dojo;
  sky.addColorStop(0, cs[0]); sky.addColorStop(0.55, cs[1]);
  sky.addColorStop(0.8, cs[2]); sky.addColorStop(1, cs[3]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // astro: sol de día en el balneario, luna en el resto
  ctx.save();
  if (stage.id === 'playa') {
    ctx.fillStyle = '#fff8dc';
    ctx.shadowColor = '#ffe890';
    ctx.shadowBlur = 70;
    ctx.beginPath();
    ctx.arc(W * 0.18, H * 0.16, 44, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = stage.id === 'volcan' ? '#e8a060' : '#e8d8c0';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 50;
    ctx.beginPath();
    ctx.arc(W * 0.72, H * 0.24, 58, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // fondo lejano: cerros costeros, mar abierto o montañas nocturnas
  if (stage.id === 'playa') {
    ctx.fillStyle = 'rgba(70,110,150,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.5);
    ctx.lineTo(W * 0.2, H * 0.34); ctx.lineTo(W * 0.45, H * 0.48);
    ctx.lineTo(W * 0.7, H * 0.38); ctx.lineTo(W, H * 0.5);
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath(); ctx.fill();
  } else if (stage.id === 'barco') {
    // mar hasta el horizonte, con olas que avanzan
    ctx.fillStyle = '#0c2236';
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
    ctx.strokeStyle = 'rgba(140,190,220,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const wy = H * 0.6 + i * 26;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const yy = wy + Math.sin(x * 0.025 + gTime * (1.2 + i * 0.2) + i * 2) * 4;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (stage.id === 'nieve') {
    for (const [a, h1, h2] of [[0.35, 0.55, 0.3], [0.7, 0.42, 0.52]]) {
      ctx.fillStyle = `rgba(190,205,225,${0.18 + a * 0.1})`;
      ctx.beginPath();
      ctx.moveTo(W * (a - 0.35), H);
      ctx.lineTo(W * a, H * h2);
      ctx.lineTo(W * (a + 0.35), H);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(240,246,252,0.55)';
      ctx.beginPath();
      ctx.moveTo(W * (a - 0.07), H * (h2 + 0.12));
      ctx.lineTo(W * a, H * h2);
      ctx.lineTo(W * (a + 0.07), H * (h2 + 0.12));
      ctx.closePath(); ctx.fill();
    }
  } else {
    ctx.fillStyle = 'rgba(10,8,18,0.8)';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.72);
    ctx.lineTo(W * 0.18, H * 0.45); ctx.lineTo(W * 0.38, H * 0.68);
    ctx.lineTo(W * 0.55, H * 0.5);  ctx.lineTo(W * 0.8, H * 0.7);
    ctx.lineTo(W, H * 0.55); ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath(); ctx.fill();
  }

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
  } else if (stage.id === 'playa') {
    drawBalneario();
  } else if (stage.id === 'nieve') {
    // pinos nevados a los lados
    for (const [px, s] of [[60, 1], [130, 0.7], [W - 70, 1.1], [W - 150, 0.75]]) {
      ctx.fillStyle = '#0e1a26';
      for (let i = 0; i < 3; i++) {
        const ty = GROUND - 150 * s + i * 44 * s;
        ctx.beginPath();
        ctx.moveTo(px - (26 + i * 12) * s, ty + 40 * s);
        ctx.lineTo(px, ty);
        ctx.lineTo(px + (26 + i * 12) * s, ty + 40 * s);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(235,242,250,0.8)';
      for (let i = 0; i < 3; i++) {
        const ty = GROUND - 150 * s + i * 44 * s;
        ctx.beginPath();
        ctx.moveTo(px - (12 + i * 6) * s, ty + 16 * s);
        ctx.lineTo(px, ty);
        ctx.lineTo(px + (12 + i * 6) * s, ty + 16 * s);
        ctx.closePath(); ctx.fill();
      }
    }
    // nevada constante (visual, sin estado)
    ctx.fillStyle = 'rgba(240,246,255,0.7)';
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 157 + gTime * (18 + (i % 5) * 9)) % (W + 20)) - 10;
      const sy = (i * 211 + gTime * (46 + (i % 7) * 14)) % H;
      ctx.fillRect(sx, sy, 2, 2);
    }
  } else if (stage.id === 'barco') {
    // estrellas
    ctx.fillStyle = 'rgba(220,230,255,0.8)';
    for (let i = 0; i < 36; i++) {
      const tw = 0.3 + (Math.sin(gTime * 2 + i * 1.7) + 1) * 0.35;
      ctx.globalAlpha = tw;
      ctx.fillRect((i * 173) % W, (i * 97) % (H * 0.45), 2, 2);
    }
    ctx.globalAlpha = 1;
    // mástil, verga y vela de junco recogida
    const rock = Math.sin(gTime * 0.7) * 0.012;     // el barco cabecea
    ctx.save();
    ctx.translate(W * 0.32, GROUND);
    ctx.rotate(rock);
    ctx.fillStyle = '#241a10';
    ctx.fillRect(-7, -330, 14, 330);
    ctx.fillRect(-120, -310, 240, 8);
    ctx.fillStyle = '#4a3824';
    for (let i = 0; i < 4; i++) ctx.fillRect(-100 + i * 8, -300 + i * 26, 200 - i * 16, 18);
    ctx.strokeStyle = 'rgba(180,150,100,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -330); ctx.lineTo(-W * 0.22, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -330); ctx.lineTo(W * 0.24, 0); ctx.stroke();
    ctx.restore();
    // farol que se mece
    const fx = W * 0.57, fy = H * 0.34, sw = Math.sin(gTime * 1.4) * 10;
    ctx.strokeStyle = '#2a2014'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fx, fy - 60); ctx.lineTo(fx + sw, fy); ctx.stroke();
    ctx.save();
    ctx.fillStyle = '#ffb850';
    ctx.shadowColor = '#ff9830';
    ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(fx + sw, fy + 8, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
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
      playa: ['#d8c098', '#9a8058'], nieve: ['#e8eef6', '#a8b4c8'],
      barco: ['#3e2e1c', '#1a1208'],
    };
    const gc = grounds[stage.id] || grounds.dojo;
    const gr = ctx.createLinearGradient(0, GROUND, 0, H);
    gr.addColorStop(0, gc[0]); gr.addColorStop(1, gc[1]);
    ctx.fillStyle = gr;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = stage.id === 'playa' || stage.id === 'nieve'
      ? 'rgba(90,70,50,0.25)' : 'rgba(230,200,170,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
    if (stage.id === 'tejado') {
      ctx.strokeStyle = 'rgba(120,100,140,0.3)';
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x + 20, H); ctx.stroke();
      }
    } else if (stage.id === 'playa') {
      // conchitas y piedras sobre la arena
      ctx.fillStyle = 'rgba(120,90,60,0.4)';
      for (let i = 0; i < 36; i++) {
        ctx.fillRect((i * 193) % W, GROUND + 8 + (i * 71) % (H - GROUND - 14), 3, 2);
      }
    } else if (stage.id === 'barco') {
      // tablones de la cubierta
      ctx.strokeStyle = 'rgba(20,12,4,0.5)';
      for (let y = GROUND + 12; y < H; y += 16) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    } else if (stage.id === 'nieve') {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 24; i++) {
        ctx.fillRect((i * 211) % W, GROUND + 6 + (i * 53) % (H - GROUND - 10), 5, 2);
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

  // pétalos (cada costa tiene los suyos: plumas, copos, espuma…)
  for (const pt of petals) {
    ctx.fillStyle = stage.id === 'volcan' ? 'rgba(255,150,60,0.5)'
                  : stage.id === 'bambu' ? 'rgba(140,200,120,0.5)'
                  : stage.id === 'playa' ? 'rgba(252,252,244,0.75)'
                  : stage.id === 'nieve' ? 'rgba(240,246,255,0.8)'
                  : stage.id === 'barco' ? 'rgba(170,210,235,0.45)'
                  : 'rgba(220,140,160,0.5)';
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, pt.size, pt.size * 0.5, pt.sway, 0, Math.PI * 2);
    ctx.fill();
  }
}

// el balneario de la foto: casona de madera carcomida, edificio
// morado, palmeras, gaviotas, y la baranda blanca sobre el muro
function drawBalneario() {
  const base = GROUND - 38;            // nivel de la costanera (tras el muro)

  // edificio blanco a la izquierda con letrero rojo
  ctx.fillStyle = '#d8d4c8';
  ctx.fillRect(8, base - 150, 152, 150);
  ctx.fillStyle = '#a83030';
  ctx.fillRect(8, base - 98, 72, 16);
  ctx.fillStyle = '#5a6a78';
  ctx.fillRect(26, base - 132, 30, 24);
  ctx.fillRect(72, base - 132, 30, 24);

  // edificio morado (derecha) con piso superior blanco
  ctx.fillStyle = '#e4e0d8';
  ctx.fillRect(520, base - 212, 220, 64);
  ctx.fillStyle = '#1c1a20';
  ctx.fillRect(560, base - 196, 26, 34); ctx.fillRect(640, base - 196, 26, 34);
  ctx.fillStyle = '#a44aac';
  ctx.fillRect(510, base - 150, 240, 150);
  for (const [vx, vy] of [[534, -126], [596, -126], [658, -126], [534, -64], [658, -64]]) {
    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(vx, base + vy, 36, 44);
    ctx.fillStyle = '#2a2030';
    ctx.fillRect(vx + 4, base + vy + 4, 28, 36);
  }
  ctx.fillStyle = '#e8c050';                       // letrero
  ctx.fillRect(596, base - 70, 86, 18);

  // edificio celeste al fondo derecho
  ctx.fillStyle = '#c8d4d8';
  ctx.fillRect(760, base - 170, 200, 170);
  ctx.fillStyle = '#3a4a52';
  for (let i = 0; i < 3; i++) ctx.fillRect(782 + i * 62, base - 144, 32, 40);

  // LA CASONA: cuerpo de madera, torre con aguja roja y torre mirador
  const wx = 190;
  ctx.fillStyle = '#7a6a52';
  ctx.fillRect(wx, base - 200, 250, 200);
  ctx.fillStyle = '#695a44';
  for (let y = base - 192; y < base; y += 14) ctx.fillRect(wx, y, 250, 3);
  ctx.fillStyle = '#564a38';                       // techo hundido
  ctx.beginPath();
  ctx.moveTo(wx - 14, base - 196);
  ctx.lineTo(wx + 90, base - 266);
  ctx.lineTo(wx + 150, base - 250);
  ctx.lineTo(wx + 264, base - 196);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#71624c';                       // torre izquierda
  ctx.fillRect(wx + 20, base - 278, 56, 82);
  ctx.fillStyle = '#a83028';                       // aguja roja
  ctx.beginPath();
  ctx.moveTo(wx + 12, base - 278); ctx.lineTo(wx + 48, base - 344); ctx.lineTo(wx + 84, base - 278);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#84745c';                       // torre mirador
  ctx.fillRect(wx + 170, base - 288, 74, 288);
  ctx.fillStyle = '#73644e';
  for (let y = base - 280; y < base; y += 14) ctx.fillRect(wx + 170, y, 74, 3);
  ctx.fillStyle = '#4e4234';
  ctx.beginPath();
  ctx.moveTo(wx + 156, base - 286); ctx.lineTo(wx + 207, base - 336); ctx.lineTo(wx + 258, base - 286);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#241c12';                       // ventanas vacías
  ctx.fillRect(wx + 34, base - 252, 28, 32);
  ctx.fillRect(wx + 52, base - 162, 34, 44);
  ctx.fillRect(wx + 112, base - 170, 34, 44);
  ctx.fillRect(wx + 184, base - 248, 18, 30); ctx.fillRect(wx + 212, base - 248, 18, 30);
  ctx.fillRect(wx + 184, base - 178, 18, 30); ctx.fillRect(wx + 212, base - 178, 18, 30);
  ctx.fillRect(wx + 30, base - 82, 40, 58);
  ctx.fillRect(wx + 112, base - 82, 40, 58);

  // palmeras que se mecen
  for (const [px, s, ph] of [[480, 1, 0], [790, 0.8, 2.2]]) {
    const sway = Math.sin(gTime * 0.9 + ph) * 5;
    ctx.strokeStyle = '#6a5638';
    ctx.lineWidth = 9 * s;
    ctx.beginPath();
    ctx.moveTo(px, base + 30);
    ctx.quadraticCurveTo(px + 6, base - 50 * s, px + sway, base - 105 * s);
    ctx.stroke();
    ctx.strokeStyle = '#2e6a34';
    ctx.lineWidth = 5 * s;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.55;
      const tipx = px + sway + Math.cos(a) * 52 * s;
      const tipy = base - 105 * s + Math.sin(a) * 40 * s + 16 * s;
      ctx.beginPath();
      ctx.moveTo(px + sway, base - 105 * s);
      ctx.quadraticCurveTo(px + sway + Math.cos(a) * 28 * s, base - 105 * s + Math.sin(a) * 30 * s - 12 * s, tipx, tipy);
      ctx.stroke();
    }
  }

  // gaviotas
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const gx = ((gTime * (34 + i * 13) + i * 330) % (W + 120)) - 60;
    const gy = 64 + i * 34 + Math.sin(gTime * 2 + i * 3) * 9;
    const flap = Math.sin(gTime * 7 + i * 2) * 5;
    ctx.beginPath();
    ctx.moveTo(gx - 10, gy - flap);
    ctx.quadraticCurveTo(gx - 4, gy + 3, gx, gy);
    ctx.quadraticCurveTo(gx + 4, gy + 3, gx + 10, gy - flap);
    ctx.stroke();
  }

  // muro de piedra de la costanera, con su desagüe
  const muroY = GROUND - 38;
  ctx.fillStyle = '#8a7c66';
  ctx.fillRect(0, muroY, W, 38);
  ctx.strokeStyle = 'rgba(40,32,22,0.45)';
  ctx.lineWidth = 2;
  for (let x = -20; x < W; x += 46) {
    ctx.strokeRect(x + (Math.abs(Math.floor(x / 46)) % 2) * 14, muroY + 4, 40, 13);
    ctx.strokeRect(x, muroY + 21, 40, 13);
  }
  ctx.fillStyle = '#181208';                       // túnel de desagüe
  ctx.beginPath();
  ctx.moveTo(58, GROUND);
  ctx.lineTo(58, muroY + 18);
  ctx.arc(94, muroY + 18, 36, Math.PI, 0);
  ctx.lineTo(130, GROUND);
  ctx.closePath(); ctx.fill();

  // baranda blanca: el pasamanos es la plataforma (BARANDA_Y)
  ctx.fillStyle = '#ecece4';
  ctx.fillRect(BARANDA_X0 - 8, BARANDA_Y, BARANDA_X1 - BARANDA_X0 + 16, 7);
  for (let x = BARANDA_X0; x <= BARANDA_X1; x += 26) {
    ctx.fillRect(x - 3, BARANDA_Y + 7, 6, muroY - BARANDA_Y - 11);
  }
  ctx.fillRect(BARANDA_X0 - 8, muroY - 5, BARANDA_X1 - BARANDA_X0 + 16, 5);
  ctx.fillStyle = '#e0e0d4';                       // pilares de los extremos
  ctx.fillRect(BARANDA_X0 - 18, BARANDA_Y - 4, 14, muroY - BARANDA_Y + 4);
  ctx.fillRect(BARANDA_X1 + 4, BARANDA_Y - 4, 14, muroY - BARANDA_Y + 4);
}

// bambú en primer plano (obstruye la vista)
function drawForeground() {
  if (stage.id !== 'bambu') return;
  // si escena.js tiene el bambú de frente cargado, lo dibuja él (arte);
  // este bambú procedural queda solo como respaldo
  if (typeof escImg === 'function' && escImg('bambu_frente')) return;
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
  const rig = p.char && partsImg[p.char.id];
  const art = p.char && charImg[p.char.id];
  const hasArt = (rig && rig.ready) || (art && art.ready);

  if (ghostAlpha === undefined) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3, (dead ? 36 : 23) * sc, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (dead && p.onGround && !hasArt) {
      ctx.save();
      ctx.translate(p.x + f * 30, GROUND - 4);
      ctx.scale(f, 1);
      drawKatana(0, 0, -0.06, false);
      ctx.restore();
    }
  }

  // arte ukiyo-e: recorte articulado (origami) si están las piezas; si no,
  // figura de una pieza; si tampoco, el dibujo procedural de más abajo
  if (hasArt) {
    if (rig && rig.ready) drawOrigami(p, ghostAlpha, rig);
    else drawPuppet(p, ghostAlpha, art);
    for (const ai of p.afterimages) {
      const fake = Object.assign({}, p, {
        x: ai.x, y: ai.y, facing: ai.facing, state: PSTATE.IDLE,
        bob: ai.bob, afterimages: [],
      });
      drawSamurai(fake, (ai.aMax || 0.62) * Math.min(1, (ai.life / ai.maxLife) * 1.8));
    }
    return;
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

  // pose según estado — la kamae se LEE en la hoja: jōdan la alza sobre la
  // cabeza, chūdan la cruza al pecho, gedan la deja rasante (sin HUD)
  const km = (p.state === PSTATE.WINDUP || p.state === PSTATE.ATTACK || p.state === PSTATE.RECOVER)
    ? (p.atkKamae != null ? p.atkKamae : 1)
    : (p.kamae != null ? p.kamae : 1);
  const wob = Math.sin(p.bob * 1.7) * 1.2;
  let grip = km === 0 ? { x: 5, y: -62 + wob }
           : km === 2 ? { x: 15, y: -31 + wob }
           : { x: 16, y: -46 + wob };
  let ang = km === 0 ? -1.72 : km === 2 ? 0.46 : -0.62;
  let footF = 12, footB = -11, lean = 0, headY = -66;
  switch (p.state) {
    case PSTATE.WINDUP: {
      const k = 1 - Math.max(0, p.stateTimer / (p.windup || 0.2));
      if (km === 0) {            // jōdan: la hoja se alza aún más, corte que cae
        grip = { x: 3 - k * 5, y: -60 - k * 9 };
        ang = -1.85 - k * 0.55;
      } else if (km === 2) {     // gedan: agachado, hoja atrás y abajo
        grip = { x: -2 - k * 4, y: -26 - k * 3 };
        ang = 2.62 + k * 0.3;
      } else {                   // chūdan: hoja recogida al costado
        grip = { x: -1 - k * 4, y: -46 - k * 4 };
        ang = -2.5 - k * 0.35;
      }
      lean = km === 2 ? -5 : -3; footF = 10; footB = -14;
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
      // el corte termina donde manda su línea: alto cae, medio cruza, bajo barre
      grip = km === 0 ? { x: 26, y: -46 } : km === 2 ? { x: 24, y: -22 } : { x: 27, y: -40 };
      ang = km === 0 ? 0.12 : km === 2 ? 0.34 : -0.04;
      lean = 7; footF = 25; footB = -19; headY = -63;
      break;
    case PSTATE.RECOVER:
      grip = km === 2 ? { x: 18, y: -22 } : { x: 20, y: -36 };
      ang = km === 2 ? 0.9 : 0.72;
      lean = 4; footF = 18; footB = -14;
      break;
    case PSTATE.GUARD:
      // la guardia cubre SOLO la línea de tu kamae: se lee en la altura de la hoja
      grip = km === 0 ? { x: 8, y: -58 } : km === 2 ? { x: 13, y: -34 } : { x: 12, y: -50 };
      ang = km === 0 ? -1.38 : km === 2 ? -0.68 : -1.15;
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

  // katana aún en la vaina (iaijutsu): en reposo la mano descansa en la
  // empuñadura al costado y la hoja yace horizontal sobre el obi — silueta
  // distinta de la guardia, para que se lea que el primer corte será un
  // desenvaine (sin HUD). Guardar o atacar ya desenvainó, así que solo aquí.
  if (p.sheathed && p.state === PSTATE.IDLE && grip) {
    grip = { x: 2, y: -32 + wob };   // mano en la empuñadura, a la altura del obi
    ang = 3.02;                      // hoja casi horizontal hacia atrás: envainada
    lean = -1;
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

// fantasma del ganador desactivado por ahora: usaba el dibujo procedural
// antiguo y desentonaba con el arte ukiyo-e. Reactivar quitando este return.
const GHOST_ON = false;

function drawGhost() {
  if (!GHOST_ON) return;
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
    if (b.id === 'down' && stage.id !== 'playa') continue;   // ▼ solo sirve en el balneario
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
// recordatorio de cómo cambiar de kamae (postura de kenjutsu), con las teclas
// reales del J1 (remapeables). En táctil aún no hay gesto dedicado (Fase 5.2).
function kamaeHint() {
  if (TOUCH) return '3 posturas: alta rompe guardias · baja barre · media equilibra';
  const m = save.keymap.p1;
  return `mantén ${keyLabel(m.feint)} + ${keyLabel(m.jump)}/${keyLabel(m.down)} para cambiar de postura (alta·media·baja)`;
}

// ¿el luchador se dibuja con el recorte articulado? (entonces su estela de
// corte la dibuja drawOrigami siguiendo la hoja real)
function tieneRig(p) {
  const rig = p && p.char && partsImg[p.char.id];
  return !!(rig && rig.ready);
}

// trazo de pincel (sumi-e): lente que se afina en las puntas, en vez de una raya
function drawBrushStroke(x1, y1, x2, y2, w, color, alpha) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx + nx * w, my + ny * w, x2, y2);
  ctx.quadraticCurveTo(mx - nx * w * 0.35, my - ny * w * 0.35, x1, y1);
  ctx.fill();
  ctx.restore();
}

// cámara cinematográfica: se acerca al duelo en el corte mortal y en los
// choques con cámara lenta; franjas de cine en la muerte. Visual puro.
let camZ = 1, camCX = 0, camCY = 0, camT = 0;
function camaraDuelo() {
  const now = performance.now() / 1000;
  const dt = camT ? Math.min(0.05, now - camT) : 1 / 60;
  camT = now;
  let z = 1, cx = W / 2, cy = H / 2;
  if (p1 && p2 && slowmoTimer > 0 && timeScale < 1) {
    const muerte = p1.state === PSTATE.DEAD || p2.state === PSTATE.DEAD;
    z = muerte ? 1.24 : 1.08;
    cx = (p1.x + p2.x) / 2;
    cy = (bodyCenterY(p1) + bodyCenterY(p2)) / 2 - 10;
  }
  const rate = z > camZ ? 7 : 2.5;
  const a = 1 - Math.exp(-rate * dt);
  if (camZ < 1.001 && z > 1) { camCX = cx; camCY = cy; }
  camZ += (z - camZ) * a;
  camCX += (cx - camCX) * a;
  camCY += (cy - camCY) * a;
  const vx = Math.max(W / (2 * camZ), Math.min(W - W / (2 * camZ), camCX));
  const vy = Math.max(H / (2 * camZ), Math.min(H - H / (2 * camZ), camCY));
  ctx.translate(W / 2, H / 2);
  ctx.scale(camZ, camZ);
  ctx.translate(-vx, -vy);
}

function drawFight(t) {
  ctx.save();
  camaraDuelo();
  drawBackground();
  drawCapas('cielo');        // capa de adorno detrás de los luchadores (escena.js)
  drawGhost();

  // manchas de sangre en el suelo (se secan: pierden opacidad despacio)
  for (const d of decals) {
    ctx.globalAlpha = d.a;
    ctx.fillStyle = '#6a0a0a';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 1.8, d.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    d.a = Math.max(0.35, d.a - 0.0004);
  }
  ctx.globalAlpha = 1;

  // ondas de choque (remate 'onda'): anillo que corre por el suelo
  for (const sw of shockwaves) {
    const a = sw.life / sw.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = 3 + 6 * a;
    ctx.beginPath(); ctx.ellipse(sw.x, sw.y, sw.r, sw.r * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,200,' + (a * 0.8) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(sw.x, sw.y, sw.r * 0.7, sw.r * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    if (Math.random() < 0.5) spawnPolvo(sw.x + (Math.random() < 0.5 ? -1 : 1) * sw.r, sw.y, 1);
  }

  for (const s of slashTrails) {
    if (s.owner && tieneRig(s.owner)) continue;   // ya dibuja la estela real de su hoja
    const a = s.life / s.maxLife;
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    drawBrushStroke(s.x1, s.y1, s.x2, s.y2, Math.min(22, 4 + len * 0.08) * (0.4 + a * 0.6), '#ffffff', a * 0.9);
    if (len > 120) drawBrushStroke(s.x1, s.y1, s.x2, s.y2, Math.min(10, len * 0.03) * a, '#b01818', a);   // el tajo mortal
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
    if (pa.disc) {           // bruma / polvo: disco que se expande al disiparse
      const r = pa.size * (1.6 - 0.6 * (pa.life / pa.maxLife));
      ctx.beginPath(); ctx.arc(pa.x, pa.y, r, 0, Math.PI * 2); ctx.fill();
    } else ctx.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
  }
  ctx.globalAlpha = 1;

  drawForeground();
  drawCapas('frente');       // capa de adorno delante de los luchadores (escena.js)
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
  ctx.restore();             // fin de la cámara: el HUD va fijo en pantalla

  // franjas de cine mientras la cámara se acerca al corte mortal
  const cine = Math.max(0, Math.min(1, (camZ - 1.04) / 0.2));
  if (cine > 0) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 40 * cine);
    ctx.fillRect(0, H - 40 * cine, W, 40 * cine);
  }

  drawBars();
  if (modoDojo) drawDojoHUD(t);    // pergamino del estilo y panel del muñeco

  if (roundStartTimer > 0 && scene === 'fight') {
    if (roundStartTimer > 0.7) {
      drawCenterText(`RONDA ${roundNum}`, 40, H * 0.4);
      drawCenterText(stage.name + ' · ' + destino.name, 16, H * 0.48, '#c0b8a8', 'transparent');
      // recordatorio de kamae en la 1ª ronda (no en replay/mirón: no controlan)
      if (roundNum === 1 && !replayActive() && !(typeof specActive === 'function' && specActive())) {
        drawCenterText(kamaeHint(), 13, H * 0.57, '#9ad0e8', 'transparent');
      }
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

  // viñeta (gradiente constante: se construye una sola vez y se reusa cada frame)
  ctx.fillStyle = vignetteGrad();
  ctx.fillRect(0, 0, W, H);
}

// gradiente de viñeta cacheado (sus parámetros nunca cambian)
let _vigGrad = null;
function vignetteGrad() {
  if (!_vigGrad) {
    _vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    _vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    _vigGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
  }
  return _vigGrad;
}
