'use strict';

// ============================================================
//  DATOS DE DISEÑO — personajes, destinos, virtudes, apuestas,
//  escenarios, rasgos raros y títulos
// ============================================================

function pal(kimono, kimonoDark, hakama, hakamaDark, accent, skin, hair) {
  return { kimono, kimonoDark, hakama, hakamaDark, obi: '#3a2a22', accent, skin, hair };
}

// Estadísticas ocultas: corte, postura, agilidad, engano, reflejos, espiritu (0-40)
const CHARS = [
  { id: 'ronin', name: 'RONIN', kanji: '浪人', desc: 'Equilibrado en todo',
    stats: { corte: 20, postura: 20, agilidad: 20, engano: 20, reflejos: 20, espiritu: 20 },
    pal: pal('#ece4d2', '#c6b89e', '#8c2424', '#641a1a', '#c03434', '#dca87c', '#1c1410') },

  { id: 'maestro', name: 'VIEJO MAESTRO', kanji: '老師', desc: 'Especialista defensivo',
    stats: { corte: 15, postura: 35, agilidad: 10, engano: 10, reflejos: 30, espiritu: 30 },
    head: 'viejo',
    pal: pal('#9a9a8c', '#76766a', '#4a4a42', '#34342e', '#d8d0c0', '#d8b894', '#e8e4dc') },

  { id: 'bandido', name: 'BANDIDO', kanji: '盗賊', desc: 'Muy agresivo',
    stats: { corte: 30, postura: 10, agilidad: 30, engano: 20, reflejos: 10, espiritu: 12 },
    head: 'bandido',
    pal: pal('#5a4632', '#443522', '#2e2a26', '#1e1c1a', '#d88a2a', '#c89060', '#2a1c12') },

  { id: 'monja', name: 'MONJA GUERRERA', kanji: '尼僧', desc: 'Especialista en fintas',
    stats: { corte: 15, postura: 15, agilidad: 20, engano: 35, reflejos: 15, espiritu: 25 },
    head: 'monja',
    pal: pal('#f0ece0', '#ccc6b4', '#6a3a5a', '#4c2a40', '#b060a0', '#e0b890', '#1a1410') },

  { id: 'nino', name: 'NIÑO PRODIGIO', kanji: '神童', desc: 'Recuperación rápida, poco alcance',
    stats: { corte: 18, postura: 12, agilidad: 28, engano: 18, reflejos: 22, espiritu: 38 },
    scale: 0.82, reachMul: 0.72, head: 'nino',
    pal: pal('#7ac0e8', '#5a98c0', '#28486a', '#1c3450', '#f0d050', '#ecc8a0', '#2a1c10') },

  { id: 'gigante', name: 'GIGANTE', kanji: '巨人', desc: 'Lento, rompe defensas',
    stats: { corte: 28, postura: 30, agilidad: 6, engano: 5, reflejos: 10, espiritu: 15 },
    scale: 1.28, windupMul: 1.55, dmgMul: 1.15, breakMul: 2.4, head: 'gigante',
    pal: pal('#8a5a3a', '#6c4428', '#3a2e22', '#281f16', '#e0a040', '#c08858', '#0d0a08') },

  { id: 'cazadora', name: 'CAZADORA', kanji: '狩人', desc: 'Doble salto, menor daño',
    stats: { corte: 14, postura: 14, agilidad: 32, engano: 18, reflejos: 22, espiritu: 20 },
    dmgMul: 0.72, doubleJump: true, head: 'cazadora',
    pal: pal('#4a6a3a', '#36502a', '#2a3424', '#1c2418', '#9ad04a', '#d8a878', '#3a2812') },

  { id: 'espectro', name: 'ESPECTRO', kanji: '亡霊', desc: 'Sus fintas dejan imágenes falsas',
    stats: { corte: 18, postura: 12, agilidad: 22, engano: 32, reflejos: 18, espiritu: 18 },
    afterimage: true, head: 'espectro',
    pal: pal('#b8c4d8', '#8a96ac', '#3a4258', '#282e40', '#80e8e0', '#cfd8e8', '#e8eef8') },
];

// Personajes secretos: el jefe final del torneo es uno de ellos.
// Si lo vences, se desbloquea y entra a tu baraja de personajes.
const SECRET_CHARS = [
  { id: 'gallina', name: 'GALLINA SAMURAI', kanji: '鶏', desc: 'Muy rápida y con gran salto', secret: true,
    stats: { corte: 12, postura: 8, agilidad: 38, engano: 22, reflejos: 24, espiritu: 16 },
    scale: 0.7, jumpMul: 1.45, head: 'gallina',
    pal: pal('#f4f0e4', '#d4ccb8', '#e8d8b8', '#c4b494', '#e03020', '#f0c040', '#f4f0e4') },

  { id: 'sapo', name: 'SAPO RONIN', kanji: '蛙', desc: 'Rebota al aterrizar', secret: true,
    stats: { corte: 18, postura: 18, agilidad: 24, engano: 14, reflejos: 16, espiritu: 22 },
    scale: 0.88, bounce: true, head: 'sapo',
    pal: pal('#5a8a3a', '#44682a', '#3a5226', '#28381a', '#d0e060', '#88b050', '#2e4a1e') },

  { id: 'mapache', name: 'MAPACHE LADRÓN', kanji: '狸', desc: 'Roba postura al golpear', secret: true,
    stats: { corte: 16, postura: 14, agilidad: 26, engano: 28, reflejos: 16, espiritu: 18 },
    scale: 0.85, steal: true, head: 'mapache',
    pal: pal('#6a6a72', '#50505a', '#3a3a42', '#28282e', '#e8a030', '#9a9aa4', '#28282e') },

  { id: 'tiburon', name: 'TIBURÓN DE TIERRA', kanji: '鮫', desc: 'Su salto es un deslizamiento veloz', secret: true,
    stats: { corte: 24, postura: 18, agilidad: 28, engano: 10, reflejos: 14, espiritu: 14 },
    slide: true, head: 'tiburon',
    pal: pal('#5a7a9a', '#446080', '#2a3a4e', '#1c2836', '#c0e8f8', '#7a9ab8', '#34495e') },

  { id: 'abuela', name: 'ABUELA DEL BARRIO', kanji: '婆', desc: 'Lenta, pero muy precisa', secret: true,
    stats: { corte: 26, postura: 24, agilidad: 5, engano: 12, reflejos: 38, espiritu: 28 },
    scale: 0.85, parryMul: 1.8, head: 'abuela',
    pal: pal('#c8a8c0', '#a4849c', '#5a4a56', '#42363e', '#e8c8d8', '#e8c8a8', '#e4e0dc') },
];

function allChars() { return CHARS.concat(SECRET_CHARS); }
function charUnlocked(c) { return !c.secret || save.unlocked.includes(c.id); }
function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------------- Destino del Duelo (condición aleatoria por ronda) ----------------
const DESTINOS = [
  { id: 'ninguno',   name: 'CIELO SERENO', kanji: '空', desc: 'Un duelo sin presagios' },
  { id: 'niebla',    name: 'NIEBLA',    kanji: '霧', desc: 'Visibilidad reducida' },
  { id: 'lluvia',    name: 'LLUVIA',    kanji: '雨', desc: 'Saltos más bajos' },
  { id: 'sangre',    name: 'SANGRE',    kanji: '血', desc: 'Un golpe mata' },
  { id: 'viento',    name: 'VIENTO',    kanji: '風', desc: 'Empuja a los luchadores' },
  { id: 'temblor',   name: 'TEMBLOR',   kanji: '震', desc: 'El suelo vibra' },
  { id: 'oscuridad', name: 'OSCURIDAD', kanji: '闇', desc: 'La pantalla parpadea' },
  { id: 'honor',     name: 'HONOR',     kanji: '誉', desc: 'No se pueden usar fintas' },
  { id: 'furia',     name: 'FURIA',     kanji: '怒', desc: 'Todo ocurre más rápido' },
];

// ---------------- Virtudes del Destino (elige 1 de 3 por combate) ----------------
const VIRTUDES = [
  { id: 'firme',    name: 'MANO FIRME',       kanji: '手', desc: '+10 Reflejos', mod: { reflejos: 10 } },
  { id: 'sangreH',  name: 'SANGRE HIRVIENDO', kanji: '熱', desc: '+10 Corte, -10 Postura', mod: { corte: 10, postura: -10 } },
  { id: 'ligero',   name: 'PASO LIGERO',      kanji: '軽', desc: '+15 Agilidad', mod: { agilidad: 15 } },
  { id: 'serena',   name: 'MENTE SERENA',     kanji: '禅', desc: 'Recuperación acelerada', mod: {} },
  { id: 'actor',    name: 'ACTOR CONSUMADO',  kanji: '芸', desc: 'Fintas mejoradas', mod: { engano: 12 } },
  { id: 'instinto', name: 'INSTINTO',         kanji: '生', desc: 'Sobrevive una vez a un golpe letal', mod: {} },
];

// ---------------- Apuestas (elección secreta por ronda) ----------------
const APUESTAS = [
  { id: 'prudente',    name: 'PRUDENTE',    kanji: '守', desc: 'Mayor defensa' },
  { id: 'agresivo',    name: 'AGRESIVO',    kanji: '攻', desc: 'Mayor velocidad' },
  { id: 'desesperado', name: 'DESESPERADO', kanji: '命', desc: 'Tu primer golpe mata… pero eres frágil' },
];

// ---------------- Escenarios dinámicos ----------------
const STAGES = [
  { id: 'dojo',    name: 'DOJO',            kanji: '道場', desc: 'Terreno sagrado y limpio' },
  { id: 'puente',  name: 'PUENTE',          kanji: '橋',   desc: 'Caer al vacío es la derrota' },
  { id: 'bambu',   name: 'BOSQUE DE BAMBÚ', kanji: '竹林', desc: 'Los tallos obstruyen la vista' },
  { id: 'tejado',  name: 'TEJADO',          kanji: '屋根', desc: 'Viento constante' },
  { id: 'templo',  name: 'TEMPLO',          kanji: '寺',   desc: 'Las campanas distraen' },
  { id: 'mercado', name: 'MERCADO',         kanji: '市場', desc: 'Los espectadores lanzan objetos' },
  { id: 'volcan',  name: 'VOLCÁN',          kanji: '火山', desc: 'Grietas ardientes en el suelo' },
];

// ---------------- Rasgos raros ----------------
const RASGOS = [
  { id: 'trueno', name: 'ELEGIDO DEL TRUENO',   prob: 0.01, desc: 'Un rastro eléctrico te sigue' },
  { id: 'cuervo', name: 'BENDICIÓN DEL CUERVO', prob: 0.03, desc: 'Postura adicional' },
  { id: 'sed',    name: 'SED DE VICTORIA',      prob: 0.05, desc: 'Resistes más al borde de la muerte' },
];
function rollRasgo() {
  const r = Math.random();
  let acc = 0;
  for (const rg of RASGOS) { acc += rg.prob; if (r < acc) return rg; }
  return null;
}

// ---------------- Títulos por reputación ----------------
const TITULOS = [
  { rep: 'astucia',    min: 12, name: 'EL IMPREDECIBLE' },
  { rep: 'disciplina', min: 12, name: 'EL MURO DE ACERO' },
  { rep: 'ferocidad',  min: 12, name: 'EL FANTASMA CARMESÍ' },
  { rep: 'honor',      min: 12, name: 'HOJA INTACHABLE' },
  { rep: 'astucia',    min: 5,  name: 'LENGUA DE ZORRO' },
  { rep: 'disciplina', min: 5,  name: 'PACIENTE DE HIERRO' },
  { rep: 'ferocidad',  min: 5,  name: 'PERRO RABIOSO' },
  { rep: 'honor',      min: 5,  name: 'CORAZÓN RECTO' },
];
function currentTitle() {
  for (const t of TITULOS) if (save.rep[t.rep] >= t.min) return t.name;
  return 'APRENDIZ';
}

// estado inicial seguro antes del primer combate
stage = STAGES[0];
destino = DESTINOS[0];
