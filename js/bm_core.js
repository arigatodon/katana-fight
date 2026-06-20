'use strict';

// ============================================================
//  KATANA RONIN — spin-off BEAT 'EM UP (1 jugador)
//
//  Avanzas por una calle/sendero LARGO derrotando a los demás
//  guerreros del juego; al final de cada etapa te espera un jefe
//  YOKAI, más grande y poderoso. Un golpe te puede matar (tienes
//  vidas), y un golpe limpio mata a cualquier enemigo común.
//
//  Reutiliza el arte por piezas y `drawSamurai()` del duelo 1v1
//  (render.js), los datos de personajes (data.js), los efectos
//  (fx.js), el audio (audio.js) y la creación de luchadores
//  (player.js). Todo lo propio del beat'em up vive en bm_*.js y
//  usa el prefijo `bm`. El duelo 1v1 NO se toca.
// ============================================================

// ---- estado del beat 'em up ----
let bmScene = 'title';      // title | choose | online | play | stageclear | win | gameover
let bmPlayer = null;
// ---- co-op en línea (autoritativo por host) ----
// El lado 0 (anfitrión) simula la partida entera y transmite snapshots; el lado
// 1 (invitado) solo envía su input y renderiza lo que recibe. Así NO hace falta
// determinismo (el beat usa Math.random por todas partes). Todo lo del co-op va
// detrás de `bmCoop`; el modo 1 jugador queda intacto. Ver bm_online.js.
let bmCoop = false;         // co-op en línea activo
let bmHost = false;         // soy el anfitrión (simulo) — en solo también es true
let bmMate = null;          // el compañero de co-op (segundo luchador)
let bmNetSide = 0;          // mi lado (0 = host, 1 = invitado)
let bmLivesMax = 3;         // tope de vidas a dibujar (3 solo · compartidas en co-op)
const BM_COOP_LIVES = 5;    // bolsa de vidas COMPARTIDA en co-op
let bmNid = 0;              // contador de id de red para los enemigos (host)
let bmEnemiesById = {};     // nid → enemigo (reconstrucción en el invitado)
let bmEnemies = [];
let bmStageIdx = 0;
let bmStage = null;
let bmCamX = 0;
let bmCamMax = 0;           // tope derecho de cámara (bloqueo de oleada)
let bmWaveIdx = 0;
let bmWaveActive = false;
let bmLives = 3;
let bmScore = 0;
let bmKills = 0;
let bmTime = 0;
let bmBanner = '', bmBannerSub = '', bmBannerT = 0;
let bmGameOverPending = false;
let bmChooseSel = 0;
let bmFlash = 0;            // destello blanco (muerte / corte)
let bmBossDown = false;     // jefe abatido: mana sangre y hay que AVANZAR a pie
let bmFallenBoss = null;    // el jefe caído (origen del chorro de sangre)
let bmStains = [];          // manchas rojas que quedan en el suelo (persistentes)
let bmHazards = [];         // peligros: onda del kappa, embestida, aplastón, etc.
let bmAmbient = [];         // adornos animados del escenario (aves, pétalos, nieve)
// combos: racha de muertes seguidas → multiplicador de puntaje
let bmCombo = 0, bmComboT = 0, bmMult = 1, bmComboBest = 0;
let bmEndT = 0;            // temporizador de pantallas de fin
let bmArrowPulse = 0;      // flecha "avanza →"

const BM_LIVES = 3;
const BM_GRAV = 1700;
const BM_VIEW_W = 960;     // se reasigna a W al cargar

// ---- personajes ----
// Jugables: los tres que pidió el diseño (rōnin, viejo maestro, niño).
const BM_PLAYABLE = ['ronin', 'maestro', 'nino'];
// Todos los demás guerreros comunes son enemigos.
const BM_ENEMIES = ['bandido', 'monja', 'gigante', 'cazadora', 'espectro'];

function bmChar(id) {
  return allChars().find(c => c.id === id) || CHARS[0];
}

// jugadores activos: en solo solo el local; en co-op el local y el compañero
function bmAllPlayers() {
  return bmCoop ? [bmPlayer, bmMate].filter(Boolean) : [bmPlayer].filter(Boolean);
}

// el jugador vivo (no muerto ni reapareciendo) más cercano a `e`, o null
function bmNearestLivingPlayer(e) {
  let best = null, bd = Infinity;
  for (const p of bmAllPlayers()) {
    if (!p || p.state === PSTATE.DEAD || p.respawnT > 0) continue;
    const d = Math.abs(p.x - e.x);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// el jugador vivo más a la derecha (marca el avance/oleadas en co-op)
function bmLeadPlayer() {
  let lead = null;
  for (const p of bmAllPlayers()) {
    if (!p || p.state === PSTATE.DEAD) continue;
    if (!lead || p.x > lead.x) lead = p;
  }
  return lead || bmPlayer;
}

// ---- etapas: banda larga + oleadas + jefe yokai ----
// `at` es una FRACCIÓN del ancho del mundo (0..1): la oleada se dispara cuando
// el jugador llega a ese punto y la cámara se bloquea hasta limpiarla. Así el
// ancho real lo fija la imagen del fondo (bm_render → worldW) sin números mágicos.
// La última oleada es el jefe.
const BM_STAGES = [
  { id: 'calle', name: 'CALLE DE EDO', kanji: '江戸', boss: 'mapache',
    waves: [
      { at: 0.13, enemies: ['bandido', 'bandido'] },
      { at: 0.40, enemies: ['monja', 'bandido', 'cazadora'] },
      { at: 0.68, enemies: ['gigante', 'espectro', 'bandido'] },
      { at: 0.90, boss: true },
    ] },
  { id: 'bambu', name: 'BOSQUE DE BAMBÚ', kanji: '竹林', boss: 'gallina',
    waves: [
      { at: 0.13, enemies: ['cazadora', 'cazadora'] },
      { at: 0.40, enemies: ['espectro', 'monja', 'cazadora'] },
      { at: 0.68, enemies: ['gigante', 'bandido', 'espectro'] },
      { at: 0.90, boss: true },
    ] },
  { id: 'rio', name: 'RIBERA DEL RÍO', kanji: '川', boss: 'sapo',
    waves: [
      { at: 0.13, enemies: ['monja', 'bandido', 'monja'] },
      { at: 0.40, enemies: ['gigante', 'cazadora', 'bandido'] },
      { at: 0.68, enemies: ['espectro', 'espectro', 'gigante'] },
      { at: 0.90, boss: true },
    ] },
  { id: 'costa', name: 'COSTA BRAVA', kanji: '海', boss: 'tiburon',
    waves: [
      { at: 0.13, enemies: ['bandido', 'cazadora', 'monja'] },
      { at: 0.40, enemies: ['gigante', 'gigante', 'bandido'] },
      { at: 0.68, enemies: ['espectro', 'monja', 'cazadora', 'bandido'] },
      { at: 0.90, boss: true },
    ] },
  { id: 'monte', name: 'MONTE NEVADO', kanji: '雪山', boss: 'abuela',
    waves: [
      { at: 0.13, enemies: ['gigante', 'bandido', 'monja'] },
      { at: 0.40, enemies: ['espectro', 'cazadora', 'gigante'] },
      { at: 0.68, enemies: ['bandido', 'monja', 'espectro', 'cazadora', 'gigante'] },
      { at: 0.90, boss: true },
    ] },
];
const BM_WORLD_FALLBACK = 2520;   // ancho hasta que carga la imagen del fondo

// ---- creación de luchadores (reutiliza makePlayer de player.js) ----
function bmMakeFighter(id, x, facing, isBoss) {
  const ch = bmChar(id);
  const p = makePlayer(x, facing, ch, true, ch.name);
  p.nid = bmNid++;            // id de red para sincronizar con el invitado
  p.isBoss = !!isBoss;
  p.hp = isBoss ? bmBossHp() : 1;
  p.maxHp = p.hp;
  p.invT = 0;
  p.atkCd = 0.5 + Math.random() * 1.1;
  p.spCd = 2.5 + Math.random() * 2;   // enfriamiento del ataque firma (jefes)
  p.hitDone = false;
  p.attackThrust = false;
  p.unblockable = (ch.id === 'gigante');   // su golpe no se puede parar
  p.airAtk = false;
  // ritmo de beat'em up: enemigos algo más lentos que en el duelo
  p.speed *= isBoss ? 0.42 : 0.62;
  p.windup = Math.max(0.26, p.windup) * (isBoss ? 1.15 : 1);  // telégrafo visible
  return p;
}

// El jefe es más resistente cuanto más avanzada la etapa.
function bmBossHp() { return 7 + bmStageIdx * 2; }

function bmPlayablePlayer(charId, side, x) {
  const p = makePlayer(x || 140, 1, bmChar(charId), false, 'JUGADOR');
  p.isBoss = false;
  p.hp = 1;
  p.invT = 1.2;             // breve gracia al empezar
  p.hitDone = false;
  p.attackThrust = false;
  p.slideT = 0;             // deslizamiento rápido (dash) en curso
  p.slideCd = 0;            // enfriamiento del deslizamiento
  p.parryT = 0;             // ventana de parada/contraataque
  p.parryCd = 0;
  p.parriedKill = false;    // marca para el contragolpe del parry
  p.respawnT = 0;           // temporizador de reaparición (por jugador)
  p.side = side || 0;       // 0 = host · 1 = invitado (co-op)
  p._dir = 0;               // dirección sostenida del compañero (vía red, en el host)
  p.speed *= 0.92;
  return p;
}

// ---- arranque / carga de etapa ----
function bmStartGame(charId) {
  bmCoop = false;
  bmHost = true;            // en solo, el local simula como si fuera anfitrión
  bmMate = null;
  bmLives = BM_LIVES;
  bmLivesMax = BM_LIVES;
  bmScore = 0;
  bmKills = 0;
  bmStageIdx = 0;
  bmGameOverPending = false;
  bmPlayerCharId = charId;
  bmLoadStage(0);
  bmScene = 'play';
}
let bmPlayerCharId = 'ronin';
let bmMateCharId = 'maestro';

// arranque del co-op en línea (lo llama bm_online cuando ambos eligen guerrero)
function bmStartCoop(myChar, mateChar, side) {
  bmCoop = true;
  bmHost = (side === 0);
  bmNetSide = side;
  bmMate = null;
  bmLives = BM_COOP_LIVES;
  bmLivesMax = BM_COOP_LIVES;
  bmScore = 0;
  bmKills = 0;
  bmStageIdx = 0;
  bmGameOverPending = false;
  bmComboBest = 0;
  bmPlayerCharId = myChar;
  bmMateCharId = mateChar;
  bmLoadStage(0);
  bmScene = 'play';
}

function bmLoadStage(i) {
  bmStageIdx = i;
  bmStage = BM_STAGES[i];
  bmNid = 0;
  bmEnemiesById = {};
  // el jugador LOCAL conserva su lado; el compañero entra al lado contrario
  bmPlayer = bmPlayablePlayer(bmPlayerCharId, bmCoop ? bmNetSide : 0, 130);
  bmMate = bmCoop ? bmPlayablePlayer(bmMateCharId, 1 - bmNetSide, 175) : null;
  bmEnemies = [];
  bmCamX = 0;
  bmCamMax = bmWorldW() - W;
  bmWaveIdx = 0;
  bmWaveActive = false;
  bmBossDown = false;
  bmFallenBoss = null;
  bmStains = [];
  bmHazards = [];
  bmCombo = 0; bmComboT = 0; bmMult = 1;
  bmInitAmbient(bmStage.id);
  particles.length = 0;
  floaters.length = 0;
  slashTrails.length = 0;
  bmLoadBg(bmStage.id);
  bmBanner = bmStage.name;
  bmBannerSub = '一  ' + bmStage.kanji + '  一';
  bmBannerT = 2.4;
  if (typeof startStageMusic === 'function') startStageMusic(bmStage.id);
}

function bmWorldW() {
  const o = bmStage && bmBg[bmStage.id];
  return (o && o.worldW) || BM_WORLD_FALLBACK;
}
