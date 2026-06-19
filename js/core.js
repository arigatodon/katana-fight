'use strict';

// ============================================================
//  CORE — canvas, constantes, guardado y estado global
// ============================================================

const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const W = cvs.width, H = cvs.height;
const GROUND = H - 80;
// balneario: la baranda blanca es una plataforma; su altura hace que
// solo los personajes ágiles (salto alto) puedan subir desde la arena
const BARANDA_Y = GROUND - 64;
const BARANDA_X0 = W * 0.14, BARANDA_X1 = W * 0.86;

// El PUENTE es un arco ASIMÉTRICO (tal como está pintado en assets/bg/puente.png):
// la cima cae a la izquierda del centro y el lado derecho baja más. PUENTE_DECK es
// la cubierta detectada del cuadro en pares [xfrac, yfrac]; groundY(x) interpola
// entre puntos para que los pies sigan la curva. En el resto de escenarios el suelo
// es plano (GROUND). Es determinista (no usa rnd) → seguro en online.
const PUENTE_DECK = [
  [0.10, 0.485], [0.14, 0.465], [0.18, 0.450], [0.22, 0.439], [0.26, 0.428],
  [0.30, 0.417], [0.34, 0.411], [0.38, 0.409], [0.42, 0.411], [0.46, 0.417],
  [0.50, 0.424], [0.54, 0.437], [0.58, 0.450], [0.62, 0.469], [0.66, 0.487],
  [0.70, 0.511], [0.74, 0.535], [0.78, 0.563], [0.82, 0.596], [0.86, 0.633],
  [0.90, 0.670],
];
// definiciones de escenario editables (las carga escena.js desde escenas.json);
// null hasta que lleguen — el juego funciona igual sin ellas.
let escenasData = null;

// interpola una curva [[xfrac, yfrac], …] (ordenada por x) y devuelve px en y
function interpCurva(tab, x) {
  const fx = x / W, n = tab.length;
  if (fx <= tab[0][0]) return tab[0][1] * H;
  if (fx >= tab[n - 1][0]) return tab[n - 1][1] * H;
  for (let i = 0; i < n - 1; i++) {
    if (fx <= tab[i + 1][0]) {
      const u = (fx - tab[i][0]) / (tab[i + 1][0] - tab[i][0]);
      return (tab[i][1] + (tab[i + 1][1] - tab[i][1]) * u) * H;
    }
  }
  return GROUND;
}

function groundY(x) {
  if (typeof stage !== 'undefined' && stage) {
    const def = escenasData && escenasData[stage.id];
    if (def && def.suelo && def.suelo.length >= 2) return interpCurva(def.suelo, x);   // curva del editor
    if (stage.id === 'puente') return interpCurva(PUENTE_DECK, x);                      // arco por defecto
  }
  return GROUND;
}

const WIN_ROUNDS = 2;          // rondas para ganar un duelo (mejor de 3)
const VIDA_MAX = 100;
const RUN_FIGHTS = 6;          // torneo: 5 duelos al azar + el jefe secreto

// ---------------- Controles remapeables ----------------
// teclas por defecto de cada jugador; se guardan junto al save
const KEYMAP_DEFAULT = {
  p1: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', down: 'KeyS', attack: 'KeyF', feint: 'KeyG' },
  p2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown', attack: 'KeyK', feint: 'KeyL' },
};
function defaultKeymap() { return JSON.parse(JSON.stringify(KEYMAP_DEFAULT)); }

// ---------------- Guardado persistente ----------------
const SAVE_KEY = 'katana_fight_save_v1';
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.rep) {
      s.unlocked = s.unlocked || [];
      s.onlineName = s.onlineName || '';
      // migración: el ranking único pasa a una tabla por categoría
      s.rankings = s.rankings || { torneo: s.ranking || [], final: [] };
      delete s.ranking;
      // migración: teclas remapeables (rellena las acciones que falten)
      s.keymap = s.keymap || {};
      for (const pl of ['p1', 'p2']) s.keymap[pl] = Object.assign({}, KEYMAP_DEFAULT[pl], s.keymap[pl]);
      s.musica = s.musica !== false;   // música de combate (por defecto activada)
      return s;
    }
  } catch (e) {}
  return {
    totalWins: 0, streak: 0, bestStreak: 0,
    rep: { honor: 0, astucia: 0, ferocidad: 0, disciplina: 0 },
    rankings: {             // { firma, score, char, fecha, racha, titulo }
      torneo: [],           // torneo normal
      final: [],            // torneo golpe final
    },
    unlocked: [],           // ids de personajes secretos vencidos
    lastFirma: 'AAA',
    onlineName: '',         // nombre para el duelo en línea
    keymap: defaultKeymap(),
    musica: true,           // música de fondo en combate
  };
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

// ---------------- RNG con semilla (mulberry32) ----------------
// Todo azar que AFECTE la pelea (destino, apuestas, virtudes,
// rasgos, escenario, peligros) pasa por rnd(): con la misma
// semilla, los dos clientes del modo online simulan lo mismo.
// El azar puramente visual (partículas, shake…) sigue usando
// Math.random y no toca esta corriente.
let _rngState = (Math.random() * 0xffffffff) >>> 0;
function seedRng(s) { _rngState = s >>> 0; }
function rnd() {
  _rngState = (_rngState + 0x6D2B79F5) >>> 0;
  let t = _rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------- Estado global ----------------
// Escenas: title | controles | nombre | online | choose | virtud |
//          vs | destino | apuesta | fight | roundEnd | matchEnd |
//          apoyo | comentario | firma | ranking
let scene = 'title';
let menuSel = 0;
let vsCPU = true;
let modoFinal = false;          // Golpe Final: un corte decide cada ronda
let p1 = null, p2 = null;
let stage = null;               // se asigna en flow.js (STAGES aún no cargó)
let destino = null;
let timeScale = 1;
let slowmoTimer = 0;
let shake = 0;
let flashTimer = 0;             // destello blanco (parry / ejecución)
let roundMsg = '', roundMsgSub = '', roundMsgTimer = 0;
let roundStartTimer = 0;
let roundNum = 0;
let matchWinner = null;
let lastTime = 0;
let gTime = 0;                  // reloj global para animaciones de UI

// torneo arcade (modo 1 jugador)
let run = null;                 // { fight, score, boss }
let runOver = null;             // null = sigue · 'champion' | 'defeat'
let runUnlocked = null;         // personaje secreto recién desbloqueado
let playerChar = null, rivalChar = null;

// selección de personaje
let chooseSel = 0;
let choosingP = 0;              // 0 = jugador 1 · 1 = jugador 2 (solo 2P)
let vsTimer = 0;                // presentación del duelo (escena 'vs')
// virtud (un solo don, elegido al inicio del torneo)
let virtudOpts = [];
let virtudSel = 0;
let runVirtud = null;
// apuesta (al azar, se revela en pantalla antes de cada ronda)
let betSel = [0, 0];
let betReveal = 0;
// firma arcade
let firmaChars = ['A', 'A', 'A'];
let firmaPos = 0;
let pendingScore = null;

// Fantasmas del Pasado: repetición del ganador de la ronda anterior
let ghostRec = null;
let ghostPlay = null;

// peligros de escenario
let projectiles = [];           // mercado
let cracks = [];                // volcán
let bellTimer = 0;              // templo
let darkPulse = 0;              // oscuridad
let windForce = 0, windPhase = 0;
