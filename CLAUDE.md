# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Lenguaje: todo el código, comentarios, logs y commits van en **español** (convención del workspace). Mantenlo así salvo que se pida lo contrario.

## Qué es KATANA FIGHT

Juego de duelos de katana 1-contra-1 en el navegador: **JavaScript vanilla, Canvas 2D, sin paso de build ni framework**. Modos torneo arcade (1 jugador), 2 jugadores local, y **duelo en línea**. Un único proceso Node (`server/server.js`, dep única `ws`) sirve los estáticos *y* hace de emparejador/relé WebSocket. Desplegado con Kamal en `katana.igorv.org`.

## Comandos

```bash
# Desarrollo: levanta juego + WebSocket en http://localhost:8081
cd server && npm install && npm start

# Abrir index.html directo con file:// también funciona (online apunta a ws://localhost:8081)

# Smoke test (sin red): carga todos los módulos, recorre escenas, valida determinismo
google-chrome --headless smoke.html   # leer el <pre id="result"> (errores, determinismo)

# E2E online: dos navegadores reales emparejados, compara la simulación tic a tic
python3 e2e_online.py                  # levanta su propio server
KATANA_URL='http://host/?server=ws://host' python3 e2e_online.py   # contra un deploy

# E2E co-op del beat 'em up: dos navegadores juegan KATANA RŌNIN en línea
python3 e2e_coop.py                    # empareja, juega, valida snapshots + sync

# Regenerar la imagen de previsualización al compartir (og.png)
python3 og_image.py

# Deploy (requiere KAMAL_REGISTRY_PASSWORD; lee secrets de .kamal/)
kamal deploy        # alias útiles: kamal logs · kamal rollback · kamal app details
```

No hay test runner ni linter. La verificación es manual: `smoke.html` para regresiones rápidas, `e2e_online.py` para el online, y jugar en el navegador.

## Arquitectura

### Carga de scripts (sin módulos — el orden importa)
`index.html` carga los `js/*.js` como scripts clásicos en orden de dependencia. Todo vive en el **scope global** (sin `import`/`export`): variables de estado en `core.js`, funciones repartidas por archivo. Orden: `core → audio → data → fx → input → net → weather → player → combat → ai → flow → update → render → ui → main`. Añadir un archivo nuevo implica añadir su `<script>` aquí **y** en `smoke.html`.

- **`core.js`** — canvas, constantes (`W/H/GROUND`, `WIN_ROUNDS`, `RUN_FIGHTS`…), el RNG con semilla, el save en localStorage, y **todo el estado global mutable** (`scene`, `p1/p2`, `run`, etc.). Empieza aquí para entender qué existe.
- **`main.js`** — bucle `requestAnimationFrame` con **timestep fijo** (`FIXED_DT = 1/60`) y el despachador `draw()` por escena.
- **`net.js`** — cliente online (ver abajo). **`server/server.js`** — emparejador + relé + ranking + comentarios.
- **`data.js`** — datos de diseño puros: `CHARS`, `SECRET_CHARS` (jefes), destinos, virtudes, escenarios, títulos.
- **`flow.js`** — máquina de estados del torneo/rondas/apuestas/puntaje. **`update.js`** — física y bucle de simulación. **`combat.js`** — golpes, parry, bloqueo, muerte. **`ai.js`** — CPU. **`render.js`/`ui.js`** — dibujo (los dos más grandes, ~38k c/u).

### Escenas
El estado `scene` (string) dirige todo: `title → controles → nombre → online → choose → virtud → vs → destino → apuesta → fight → roundEnd → matchEnd → apoyo → comentario → firma → ranking`. `main.js:draw()` despacha el dibujo y `handleMenus()` (en `ui.js`) la entrada. Para añadir una pantalla: nuevo string de `scene`, un `drawX()` y su caso en el switch.

### Determinismo: la regla de oro del online
El modo online es **lockstep determinista**: el servidor solo empareja, reparte una semilla compartida y reenvía inputs; **cada navegador simula la pelea entera por su cuenta**. Para que ambos lados calculen lo mismo:

1. **Todo azar que afecte la pelea** (destino, apuestas, virtudes, rasgos, escenario, peligros) DEBE pasar por `rnd()` (mulberry32 con semilla, en `core.js`), nunca por `Math.random`. El azar puramente visual (partículas, shake) sí usa `Math.random` y no toca esa corriente.
2. La simulación avanza en tics fijos de `1/60 s`; nunca metas lógica de juego dependiente del `dt` real del frame.
3. El **clima real** (`weather.js`, Open-Meteo) influye en los destinos **solo en modos locales** — en online el destino sale del RNG compartido, o las dos simulaciones divergirían.
4. Cuidado con `Math.sin` y similares entre motores JS distintos (Safari↔Chrome pueden divergir; aún sin mitigar). Lo seguro es mismo navegador en ambos lados.

`smoke.html` valida el determinismo (misma semilla → mismo hash de simulación); rómpelo y el smoke lo detecta.

### Protocolo online
`net.js` ↔ `server.js` por WebSocket. Mensajes: `join{name}` → `match{side,seed,foe}` → relé de `char{id}` (guerrero elegido) e `i{k,v}` (input empaquetado en bits por tic, con `NET_DELAY=4` tics de adelanto) → `bye` al desconectar. El input se codifica en bits (`packLocalInput`/`unpackInput`); `netPump()` avanza la simulación solo cuando tiene los inputs de ambos lados del tic.

### Co-op del beat 'em up (KATANA RŌNIN) — autoritativo por host
A diferencia del duelo (lockstep determinista), el co-op de `beat.html` es **autoritativo por host** porque el beat 'em up usa `Math.random` por todas partes y tiene muchas entidades (determinismo sería frágil). Vive en `bm_online.js` (no confundir con `bm_net.js`, que es el ranking del modo). El lado 0 (**host**) simula toda la partida y transmite SNAPSHOTS (`bs`) a ~20 Hz; el lado 1 (**invitado**) no simula: envía su input (`bd` dirección, `ba` acción) y renderiza interpolando. Comparte el servidor con el duelo pero en una **cola aparte** (`join{mode:'beat'}` → `waitingBeat`); el relé admite mensajes grandes (`RELAY_MAX`) por el peso de los snapshots. Vidas en bolsa compartida; los snapshots de transición terminal (win/gameover) se fuerzan para que el invitado siempre los reciba. Casi todo lo del co-op va detrás de `bmCoop`; el modo 1 jugador queda intacto. Probar con `python3 e2e_coop.py`.

### Presencia (aviso de "hay con quién jugar")
La pantalla de título "late" con `GET /estado?id=<efímero>` cada 5 s (`pollPresence` en `net.js`, dibujado en `drawTitle`). El servidor mantiene un `Map` de presencia con TTL de 12 s y devuelve `{ presentes, esperando, jugando }` — así dos personas que solo miran el menú se ven y se animan a entrar, sin abrir WebSocket todavía. Es puramente informativo: **no toca la simulación**, por eso su id puede salir de `Math.random` sin contaminar el RNG con semilla.

### Servidor: ranking y anti-trampa
El ranking (`/ranking`, top 10) y los comentarios (`/comentarios`, página HTML) se guardan en `server/data/*.json` — en producción es un **volumen Kamal con nombre** (`katana_data`) que sobrevive a los deploys. Anti-trampa del ranking: ambos clientes simulan la misma pelea y reportan el resultado; el servidor **solo lo anota cuando los dos coinciden** (y toma el menor `score`), así un cliente no se inventa victorias. Comentarios: 1 por IP cada 30 s, sanitizados.

## Despliegue (Kamal)

Un solo contenedor Node (`Dockerfile`, `config/deploy.yml`) en un VPS compartido (`72.60.156.215`) donde kamal-proxy enruta por dominio con SSL automático. El cliente usa `wss://katana.igorv.org/ws` cuando se sirve por HTTPS, `ws://localhost:8081` en local (override con `?server=` en la URL). El secreto del registry vive crudo en `.kamal/registry-password` (gitignored); `.kamal/secrets` hace `cat` de él. El subdominio convive con `igorv.org` (sitio + correo en Hostinger) sin tocarlo.

## Convención de spritesheets del workspace
Este juego dibuja a los samuráis **por código** (en `render.js`), no usa spritesheets. La convención de hojas 8×4 / 40×80 del workspace (ver `../CLAUDE.md`) no aplica aquí.
