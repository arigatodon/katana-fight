'use strict';

// ============================================================
//  CORE — canvas, constantes, guardado y estado global
// ============================================================

const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const W = cvs.width, H = cvs.height;
const GROUND = H - 80;
const WIN_ROUNDS = 2;          // rondas para ganar un duelo (mejor de 3)
const VIDA_MAX = 100;
const RUN_FIGHTS = 6;          // torneo: 5 duelos al azar + el jefe secreto

// ---------------- Guardado persistente ----------------
const SAVE_KEY = 'katana_fight_save_v1';
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.rep) {
      s.unlocked = s.unlocked || [];
      s.onlineName = s.onlineName || '';
      return s;
    }
  } catch (e) {}
  return {
    totalWins: 0, streak: 0, bestStreak: 0,
    rep: { honor: 0, astucia: 0, ferocidad: 0, disciplina: 0 },
    ranking: [],            // { firma, score, char, fecha, racha, titulo }
    unlocked: [],           // ids de personajes secretos vencidos
    lastFirma: 'AAA',
    onlineName: '',         // nombre para el duelo en línea
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
// Escenas: title | nombre | online | choose | virtud | vs |
//          destino | apuesta | fight | roundEnd | matchEnd |
//          firma | ranking | rankingOnline
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
