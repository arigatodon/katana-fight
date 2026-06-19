'use strict';

// ============================================================
//  AUDIO — todo sintetizado con WebAudio, sin archivos
// ============================================================

const AC = window.AudioContext || window.webkitAudioContext;
let audio = null;
function initAudio() { if (!audio && AC) audio = new AC(); if (audio && audio.state === 'suspended') audio.resume(); }

function noiseBuffer(dur) {
  const len = Math.floor(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function noiseHit(dur, type, f0, f1, vol) {
  if (!audio) return;
  const t = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = audio.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
  const g = audio.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(audio.destination);
  src.start(t);
}
function tone(type, f0, f1, dur, vol) {
  if (!audio) return;
  const t = audio.currentTime;
  const o = audio.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = audio.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audio.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

function sfxSlash()   { noiseHit(0.22, 'bandpass', 800, 4500, 0.45); }
function sfxFeint()   { noiseHit(0.14, 'bandpass', 500, 1800, 0.2); }
function sfxJump()    { noiseHit(0.12, 'bandpass', 300, 900, 0.12); }
function sfxHit()     { noiseHit(0.18, 'lowpass', 700, 0, 0.5); tone('sawtooth', 160, 70, 0.2, 0.25); }
function sfxBlock()   { noiseHit(0.1, 'highpass', 3500, 0, 0.25); tone('square', 1800, 1200, 0.12, 0.12); }
function sfxBreak()   { noiseHit(0.35, 'lowpass', 1200, 200, 0.5); tone('square', 320, 60, 0.4, 0.3); }
function sfxBell()    { tone('sine', 440, 438, 1.6, 0.18); tone('sine', 660, 657, 1.3, 0.08); }
function sfxSelect()  { tone('square', 700, 1050, 0.08, 0.1); }
function sfxConfirm() { tone('square', 520, 1040, 0.18, 0.14); }
function sfxThunder() { noiseHit(0.5, 'lowpass', 400, 80, 0.4); tone('sawtooth', 90, 35, 0.5, 0.2); }
function sfxParry() {
  if (!audio) return;
  [2400, 3170, 4080].forEach((fr, i) => tone('square', fr, fr * 0.98, 0.4, 0.1 / (i + 1)));
  noiseHit(0.08, 'highpass', 5000, 0, 0.3);
  tone('sine', 1320, 1318, 0.5, 0.15);
}
function sfxClash() {
  if (!audio) return;
  [2400, 3170, 4080, 5300].forEach((fr, i) => tone('square', fr * (1 + Math.random() * 0.02), fr, 0.35, 0.12 / (i + 1)));
  noiseHit(0.1, 'highpass', 5000, 0, 0.3);
}
function sfxKill() {
  tone('sawtooth', 220, 40, 0.65, 0.35);
  noiseHit(0.4, 'lowpass', 900, 0, 0.4);
}

// ============================================================
//  MÚSICA — pista de fondo durante el combate (HTML5 Audio, aparte
//  del SFX sintetizado). Es puramente audio: no toca la simulación
//  ni el RNG con semilla, así que NO afecta al lockstep del online.
// ============================================================
const MUSIC_VOL = 0.4;
const MUSIC_SRC = {
  vacio: 'assets/music/vacio.mp3',   // la pista principal
  grito: 'assets/music/grito.mp3',   // ~4 min: se entra en distinto punto por escenario
};
// pista + segundo de inicio por escenario. cartagena, bambú y balneario
// usan "vacío"; el resto entra a "grito" en offsets repartidos a lo largo
// de sus 4 min para que no suene siempre lo mismo.
const STAGE_MUSIC = {
  cartagena: ['vacio', 0],
  bambu:     ['vacio', 0],
  playa:     ['vacio', 0],
  dojo:      ['grito', 0],
  puente:    ['grito', 30],
  tejado:    ['grito', 60],
  templo:    ['grito', 90],
  mercado:   ['grito', 120],
  volcan:    ['grito', 150],
  nieve:     ['grito', 180],
  barco:     ['grito', 210],
};

let music = null;          // elemento Audio activo
let musicSrc = null;       // src de la pista cargada
let musicStage = null;     // escenario para el que se inició (null = parada)

function musicEnabled() { return !save || save.musica !== false; }

function startStageMusic(stageId) {
  const cfg = STAGE_MUSIC[stageId] || ['grito', 0];
  const src = MUSIC_SRC[cfg[0]];
  if (musicSrc !== src) {
    if (music) music.pause();
    music = new Audio(src);
    music.loop = true;
    musicSrc = src;
  }
  music.volume = musicEnabled() ? MUSIC_VOL : 0;
  try { music.currentTime = cfg[1]; } catch (e) {}
  if (musicEnabled()) music.play().catch(() => {});
  musicStage = stageId;
}

function stopMusic() {
  if (music) music.pause();
  musicStage = null;
}

// llamado cada frame desde el bucle: la música suena en combate y calla
// en los menús. El primer gesto del usuario (al pasar por el menú) ya
// desbloqueó la reproducción, así que play() no lo rechaza en la pelea.
function syncMusic() {
  const fighting = (scene === 'fight' || scene === 'roundEnd' || scene === 'matchEnd') && stage;
  if (fighting) {
    if (musicStage !== stage.id) startStageMusic(stage.id);
    else if (music) {
      music.volume = musicEnabled() ? MUSIC_VOL : 0;
      if (musicEnabled() && music.paused) music.play().catch(() => {});
    }
  } else if (musicStage) {
    stopMusic();
  }
}

// alterna música on/off desde el menú de opciones
function toggleMusic() {
  save.musica = !musicEnabled();
  persist();
  if (!music) return;
  music.volume = musicEnabled() ? MUSIC_VOL : 0;
  if (musicEnabled() && musicStage) music.play().catch(() => {});
  else if (!musicEnabled()) music.pause();
}
