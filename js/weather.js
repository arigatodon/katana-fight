'use strict';

// ============================================================
//  CLIMA REAL — el tiempo de tu ciudad se cuela en los duelos
//
//  Open-Meteo (gratis, sin clave) da el clima actual: si llueve
//  de verdad, en el juego caerá LLUVIA más seguido; lo mismo con
//  viento, niebla, tormenta (OSCURIDAD) o cielo despejado.
//  SOLO en modos locales: online el destino debe salir del RNG
//  compartido, o los dos clientes simularían peleas distintas.
// ============================================================

let clima = null;            // { destinoId, label } cuando ya se conoce
let climaPedido = false;
let destinoPorClima = false; // la ronda actual usó el clima real

function fetchWeather() {
  if (climaPedido || typeof fetch === 'undefined') return;
  climaPedido = true;
  const go = (lat, lon) => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,wind_speed_10m`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
      .then(d => { clima = mapWeather(d.current || {}); })
      .catch(() => {});      // sin clima no pasa nada: decide la suerte
  };
  // sin permiso de ubicación (o sin respuesta): clima de Santiago de Chile
  const fallback = () => go(-33.45, -70.66);
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => go(pos.coords.latitude.toFixed(2), pos.coords.longitude.toFixed(2)),
      fallback,
      { timeout: 4000, maximumAge: 3600000 });
  } else {
    fallback();
  }
}

// código WMO de Open-Meteo → destino del duelo
function mapWeather(cur) {
  const c = cur.weather_code, viento = cur.wind_speed_10m || 0;
  if (c >= 95) return { destinoId: 'oscuridad', label: 'tormenta' };        // relámpagos
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return { destinoId: 'lluvia', label: 'lluvia' };
  if (c >= 71 && c <= 86) return { destinoId: 'lluvia', label: 'nieve' };
  if (c === 45 || c === 48) return { destinoId: 'niebla', label: 'niebla' };
  if (viento >= 28) return { destinoId: 'viento', label: 'viento fuerte' };
  if (c === 0 || c === 1) return { destinoId: 'ninguno', label: 'cielo despejado' };
  return null;               // nublado sin más: que decida la suerte
}
