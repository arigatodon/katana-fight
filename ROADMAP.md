# ROADMAP — KATANA FIGHT ×10

> Estado de partida (jul 2026): duelo 1v1 pulido con online lockstep, torneo arcade de 6 peleas,
> beat 'em up KATANA RŌNIN con co-op, ranking global, clima real, táctil básico, desplegado en
> katana.igorv.org e itch.io. Donaciones por enlace (Buda / Mercado Pago).
>
> **FASE 1 COMPLETA** (jul 2026): colisión de cuerpos, revancha, salas privadas, replays
> compartibles y espectadores en vivo — todo verificado con `smoke.html` + `e2e_online.py`.
> Lo siguiente: FASE 2 (kamae + iaijutsu), el corazón del juego.

## La tesis del ×10

El juego ya es bueno; lo que falta no es "más juego" sino quitar las cuatro fricciones que impiden
que crezca solo:

1. **Hoy es casi imposible jugar con UN amigo concreto** — el emparejador es una cola FIFO ciega,
   no hay revancha ni salas. El caso de uso estrella ("juega conmigo, te paso el link") no existe.
2. **No hay razón para volver mañana** — el único desbloqueo son 5 jefes secretos; después de
   ser campeón una vez, el juego no te llama de vuelta.
3. **El combate tiene techo bajo para el jugador dedicado** — ataque/finta/parry se domina en
   una tarde; falta la capa de kenjutsu (Fase 1 del plan de combate ya acordado).
4. **El valor no se captura** — solo enlaces de donación; no hay nada que comprar aunque quieras.

Ventaja injusta a explotar: el **lockstep determinista ya construido** hace que un replay o un
espectador cueste casi nada (semilla + streams de input = unos pocos KB). Es infraestructura viral
gratis que casi ningún juego indie web tiene.

---

## FASE 1 — Jugar con amigos sin fricción (el multiplicador más grande)

### 1.1 Salas privadas con código de invitación — esfuerzo M — ✅ HECHO

Crear duelo privado genera un código de 4 letras (p. ej. `KIRI`); el amigo lo escribe (o abre
`?sala=KIRI`) y se emparejan directo, saltándose la cola pública. Aplica a duelo **y** co-op RŌNIN.

- El servidor acepta `join{name, code}`: con código empareja solo contra ese código; sin código,
  cola FIFO como hoy. Códigos con TTL (~10 min) y limpieza al desconectar.
- El código sale de `Math.random` del servidor (no toca el RNG con semilla del cliente).
- **Criterios de aceptación:**
  - [x] Dos navegadores con el mismo código se emparejan aunque haya terceros esperando en la cola pública.
  - [x] Un tercero con otro código (o sin código) NUNCA cae en la sala privada.
  - [x] `?sala=XXXX` en la URL lleva directo a la espera de esa sala (compartible por WhatsApp).
  - [x] Código caducado o inexistente → mensaje claro y vuelta al menú online, sin colgar el socket.
  - [x] `e2e_online.py` extendido con un caso de sala privada (3 clientes: 2 con código + 1 intruso) pasa.
  - [x] La presencia del título (`/estado`) sigue contando bien a los que esperan en privado.

### 1.2 Revancha — esfuerzo S — ✅ HECHO

Al terminar el duelo, ambos ven "REVANCHA (Enter) / SALIR (Esc)". Si los dos aceptan en ~15 s,
el servidor reusa el par con **semilla nueva** y se vuelve a elegir guerrero.

- Mensajes nuevos: `rematch` (cliente→servidor) y `match` reemitido con `seed` fresca. Si uno
  se va o expira el plazo, el otro vuelve a la cola/menú.
- **Criterios de aceptación:**
  - [x] Revancha completa sin recargar la página ni reconectar el WebSocket.
  - [x] La semilla de la revancha es distinta (destinos/apuestas no se repiten sistemáticamente).
  - [x] El ranking anota cada duelo por separado con el anti-trampa de doble reporte intacto.
  - [x] Si el rival cierra la pestaña durante la oferta, aparece "TU RIVAL SE FUE" y no un cuelgue.
  - [x] `e2e_online.py` juega dos duelos seguidos vía revancha y las simulaciones coinciden tic a tic en ambos.

### 1.3 Replays compartibles por URL — esfuerzo M — ✅ HECHO

Al acabar un duelo online, el cliente puede publicar el replay: `POST /replay` con
`{seed, chars, nombres, inputs de ambos lados, versión}` (pocos KB). El servidor devuelve un id y
la URL `?replay=<id>` reproduce la pelea completa re-simulándola.

- Guardar en `server/data/replays/` (volumen `katana_data`), con tope de tamaño y cuota por IP.
- Guardar también la **versión de protocolo/juego**: un replay de una versión vieja se rechaza con
  mensaje amable en vez de divergir en silencio.
- Controles mínimos de reproducción: pausa y velocidad ×1/×2 (avanzar tics de más por frame; nada
  de tocar la simulación).
- **Criterios de aceptación:**
  - [x] Re-simular un replay produce exactamente el mismo ganador y el mismo hash de simulación que registró el duelo original.
  - [x] La URL de replay funciona en un navegador limpio sin estado previo (incógnito).
  - [x] Replay de versión incompatible → mensaje "REPLAY DE OTRA ERA", nunca una pelea distinta.
  - [x] Un replay pesa < 50 KB; el servidor rechaza payloads mayores y limita publicaciones por IP.
  - [x] Los 3 mejores duelos recientes se listan en la pantalla de ranking como "DUELOS MEMORABLES".

### 1.4 Espectadores en vivo — esfuerzo M — ✅ HECHO

Mismo principio que el replay pero en directo: el servidor reenvía los `i{k,v}` de ambos lados a
mirones de solo lectura, que simulan con unos tics de retraso.

- **Criterios de aceptación:**
  - [x] Un espectador que entra ANTES del duelo lo ve entero idéntico a los jugadores (mismo hash al final).
  - [x] El espectador no puede inyectar inputs (el servidor descarta cualquier `i` de un socket mirón).
  - [x] Con 5 espectadores en un duelo, los dos jugadores no notan lag añadido (el relé no espera a los mirones).
  - [x] Desde el título se puede "VER DUELO EN CURSO" si `jugando > 0`.

---

## FASE 2 — Profundidad de combate: cortes de kenjutsu (plan ya acordado)

> Regla de la casa: nada de overlays de HUD; la profundidad va en la mecánica y se lee en el
> cuerpo del samurái (postura visible del rig, no aros ni barras nuevas).

### 2.1 Posturas (kamae) y cortes direccionales — esfuerzo L

Tres posturas — alta (jōdan), media (chūdan), baja (gedan) — cambiadas con ↑/↓ manteniendo
finta (o gesto vertical en táctil). La postura determina el corte: alto (lento, rompe guardia),
medio (equilibrado), bajo (rápido, barre piernas, pierde contra guardia). Regla piedra-papel-tijera:
cada corte tiene una postura que lo neutraliza; la guardia solo cubre la línea de tu kamae.

- Todo el azar derivado (si lo hay) por `rnd()`; la lógica nueva vive en `combat.js`/`update.js`
  con estados nuevos en `PSTATE` solo si hace falta.
- El **input online necesita más bits**: extender `packLocalInput`/`unpackInput` (`net.js`) y
  **versionar el protocolo** — el `match` lleva `v`; versiones distintas no se emparejan (mensaje
  "ACTUALIZA LA PÁGINA"), porque un bit de diferencia = divergencia silenciosa.
- La postura se LEE en el rig: la katana se dibuja arriba/media/baja en `render.js` (los samuráis
  son 100% código, así que es barato).
- **Criterios de aceptación:**
  - [ ] `smoke.html` pasa: misma semilla → mismo hash con las mecánicas nuevas incluidas en la corriente del RNG.
  - [ ] Sin mirar HUD, un jugador identifica la kamae del rival solo por la silueta (verificación manual con 2 personas).
  - [ ] Cada uno de los 3 cortes tiene al menos una respuesta que lo castiga (matriz documentada en `data.js` como datos, no ifs sueltos).
  - [ ] La CPU (`ai.js`) usa las 3 posturas y cambia según la del jugador; en dificultad de jefe, castiga la kamae repetida.
  - [ ] `e2e_online.py` pasa con el protocolo nuevo; cliente viejo contra servidor nuevo recibe el aviso de versión, no una pelea corrupta.
  - [ ] Los 13 personajes siguen diferenciados: al menos 3 tienen afinidad de kamae en sus stats (p. ej. GIGANTE mejor en alta, NIÑO en baja) vía `deriveAttrs()`.

### 2.2 Iaijutsu: desenvaine — esfuerzo S

Al inicio de cada ronda ambos empiezan con la katana envainada; el primer corte desde la vaina es
un iai (más rápido y con más rotura de postura), pero fallar el iai te deja EXPOSED un instante.
Convierte los primeros 2 segundos de cada ronda en un duelo de nervios, como el modo GOLPE FINAL
pero integrado en toda ronda.

- **Criterios de aceptación:**
  - [ ] El iai solo existe en el primer ataque de cada ronda por jugador; después, combate normal.
  - [ ] Iai fallado (al aire o parado) → ventana EXPOSED castigable; iai conectado → daño de postura extra.
  - [ ] Determinista: `smoke.html` y `e2e_online.py` pasan.
  - [ ] El destino "sangre" (one-hit) y el modo GOLPE FINAL siguen funcionando y no se rompen con el iai.

---

## FASE 3 — Razones para volver (retención)

### 3.1 Desafío diario — esfuerzo M

Un torneo al día, igual para todo el mundo: semilla derivada de la fecha UTC
(`YYYYMMDD` → mulberry32), mismos rivales, destinos, apuestas y escenarios para todos.
Ranking del día separado en el servidor; a medianoche UTC rota.

- **Importante:** el desafío diario debe **ignorar el clima real** (`weather.js`), igual que el
  online — si el clima tiñe el destino 55%, los runs de Santiago y Madrid no serían comparables.
- Un solo intento que puntúa por día (los siguientes se marcan "ENTRENAMIENTO").
- **Criterios de aceptación:**
  - [ ] Dos navegadores distintos el mismo día generan exactamente el mismo torneo (mismos 5 rivales + jefe, destinos, apuestas, escenarios).
  - [ ] El clima real NO influye en el desafío diario (verificable forzando climas distintos).
  - [ ] `GET /diario` devuelve el top del día; `POST /diario` acepta un solo score por nombre+día.
  - [ ] El título muestra "DESAFÍO DEL DÍA" con cuenta regresiva a la rotación.
  - [ ] `smoke.html` incluye un recorrido del modo diario.

### 3.2 Los yokai vencidos son jugables en KATANA RŌNIN — esfuerzo M

Hoy `BM_PLAYABLE` son solo 3 de 13 personajes. Nuevo lazo entre modos: cada jefe secreto que
desbloqueas en el torneo (`save.unlocked`) se vuelve jugable en el beat 'em up, con su rasgo
(TANUKI roba postura, UMIBOZU embiste…). De paso, los 8 base también jugables en RŌNIN.

- **Criterios de aceptación:**
  - [ ] `BM_PLAYABLE` se construye desde `CHARS` + `save.unlocked`, no de una lista fija.
  - [ ] Cada rasgo distintivo tiene traducción funcional en el beat (documentada en `bm_core.js`); ninguno crashea contra jefes ni en co-op.
  - [ ] En co-op, el invitado ve correctamente al host jugando con un yokai (snapshots incluyen el id del personaje).
  - [ ] `e2e_coop.py` pasa con un yokai como host.
  - [ ] La pantalla de selección del beat enseña siluetas bloqueadas con "VÉNCELO EN EL TORNEO" (llamada cruzada entre modos).

### 3.3 Gestas (logros con testigo) — esfuerzo S

10–15 logros con sabor ("Vencer sin usar finta", "Parry a un iai", "Campeón con el NIÑO",
"Cortar las 12 manzanas del mono"). Se guardan en el save y se enseñan como sellos en la firma
del ranking — el logro es cosmético y narrativo, sin tocar stats (coherente con la regla de
mecánica > adornos: no dan ventajas, dan identidad).

- **Criterios de aceptación:**
  - [ ] Las gestas se definen como datos en `data.js` (condición evaluada en puntos únicos de `flow.js`/`combat.js`, no ifs regados).
  - [ ] Desbloquear una gesta muestra un aviso discreto al final de la ronda, nunca durante el combate.
  - [ ] Los sellos aparecen junto a la firma en el ranking local y en el online (máx. 3 elegidos por el jugador).
  - [ ] El save viejo migra sin romperse (jugadores existentes no pierden nada).

---

## FASE 4 — Monetización (Fase 2 del plan original: web + Stripe)

> Principio: **nunca pay-to-win**. Se vende identidad (cosmética) y gratitud (mecenazgo),
> los stats no se tocan. El online justo es el activo; venderlo lo mataría.

### 4.1 Pase de Mecenas (compra única) — esfuerzo L

Un solo producto para empezar (simple de operar): "MECENAS DEL DOJO", compra única (~3–5 USD)
vía Stripe Checkout. Otorga: paletas de color exclusivas para tu samurái (baratas de hacer:
`render.js` dibuja por código), firma dorada en el ranking online, y un sello de mecenas.
Buda/Mercado Pago se quedan como vía chilena paralela.

- Servidor: dep `stripe`, `POST /checkout` crea la sesión, webhook `/stripe-hook` valida la firma
  y guarda el entitlement en `server/data/mecenas.json` (volumen persistente) asociado a un
  **código de canje** que se muestra al pagar; el cliente lo canjea una vez y lo guarda en el save.
- Las paletas son cosmética pura: el `char` enviado por `char{id}` al rival no cambia; solo se
  añade un campo de paleta al mensaje (y al snapshot del co-op).
- **Criterios de aceptación:**
  - [ ] Flujo completo en modo test de Stripe: pagar → código → canjear → paleta activa; y el webhook con firma inválida se rechaza.
  - [ ] Un código solo se canjea una vez; canje repetido → mensaje claro.
  - [ ] El entitlement sobrevive a `kamal deploy` (vive en el volumen `katana_data`).
  - [ ] En un duelo online, el rival VE tu paleta de mecenas (viaja en el protocolo) y la simulación no diverge (`e2e_online.py` pasa con paletas distintas).
  - [ ] Ningún número de combate (daño, velocidad, postura…) difiere entre mecenas y no mecenas — verificado con `smoke.html`: mismo hash con y sin paleta.
  - [ ] Sin conexión al servidor de pagos, el juego entero sigue funcionando (la tienda falla suave).

### 4.2 Propina con teatro (mejora de la escena "apoyo") — esfuerzo S

La escena de apoyo ya existe; darle recompensa emocional inmediata: al volver de donar, el dojo
se ilumina con linternas y tu nombre entra al "MURO DEL DOJO" (`GET /muro`, lista pública de
agradecimientos, sanitizada como los comentarios).

- **Criterios de aceptación:**
  - [ ] El muro es visible desde el título y en `/comentarios`; 1 inscripción por IP por día, sanitizada.
  - [ ] La escena apoyo muestra el efecto de linternas tras marcar "YA APOYÉ" (basado en confianza; es una propina, no un DLC).
  - [ ] Las tasas de conversión son medibles: contador anónimo de cuántos ven la escena vs. cuántos tocan cada enlace (ver 5.3).

---

## FASE 5 — Distribución móvil y salud del proyecto

### 5.1 PWA instalable — esfuerzo S

`manifest.json` + service worker de caché estática: instalar en el móvil, arranque a pantalla
completa, y los modos locales funcionan sin conexión (el online pide red, obvio).

- **Criterios de aceptación:**
  - [ ] Chrome Android ofrece "Instalar app"; el icono abre a pantalla completa sin barra del navegador.
  - [ ] En modo avión: título, torneo local, 2 jugadores local y RŌNIN solo funcionan; el online avisa "SIN CONEXIÓN" sin colgarse.
  - [ ] Tras un `kamal deploy`, los clientes instalados reciben la versión nueva en el siguiente arranque (estrategia network-first para el HTML/JS o versionado del SW) — criterio crítico: el protocolo versionado de la Fase 2 depende de no tener clientes zombis cacheados.
  - [ ] `index.html` y `beat.html` comparten el mismo SW y manifest.

### 5.2 Táctil de kenjutsu — esfuerzo M (depende de 2.1)

Las kamae en táctil: deslizar vertical en la mitad derecha cambia de postura, tap corta.
Los 6 botones actuales se reordenan para no tapar el duelo en apaisado.

- **Criterios de aceptación:**
  - [ ] En un móvil real (no solo emulación) se puede: cambiar de kamae, cortar en las 3 líneas, fintar, guardar y parry.
  - [ ] Los controles no tapan a ningún samurái en 16:9 ni en pantallas anchas tipo 19.5:9.
  - [ ] El input táctil se empaqueta en los mismos bits que el teclado (`packLocalInput`): móvil vs. escritorio online funciona.

### 5.3 Medir para saber qué vale (telemetría mínima y anónima) — esfuerzo S

Sin esto, el "×10" no se puede comprobar. Un `POST /pulso` anónimo (sin IDs de usuario, solo
evento + modo): partida empezada/terminada, modo, escena de apoyo vista/click. Contadores
agregados por día en `server/data/pulso.json`.

- **Criterios de aceptación:**
  - [ ] Ningún dato personal: ni nombre, ni IP almacenada, solo contadores diarios agregados.
  - [ ] `GET /pulso` (o la salida de `kamal logs`) permite responder: partidas/día por modo, % que llega al jefe, % que ve apoyo y % que clica.
  - [ ] Si el POST falla, el juego ni se entera (fire-and-forget).

### 5.4 Ranking del beat 'em up sin agujeros — esfuerzo S

Hoy `POST /beatscore` confía en el cliente (a diferencia del duelo, que exige doble reporte).
Mitigación barata sin rehacer nada: límites de plausibilidad en el servidor (score máximo por
etapa alcanzada, kills máximos por etapa, duración mínima reportada) + en co-op exigir el doble
reporte host/invitado como en el duelo.

- **Criterios de aceptación:**
  - [ ] Un `curl` con score absurdo (etapa 2, score 150000) se rechaza; un score legítimo entra.
  - [ ] En co-op, el score solo se anota si host e invitado reportan lo mismo.
  - [ ] Los scores legítimos existentes en `beat_ranking.json` no se pierden.

---

## Orden sugerido y dependencias

```
HECHO      Fase 0 (colisión) y FASE 1 entera (revancha, salas, replays, espectadores)
AHORA      FASE 2: 2.1 kamae + protocolo v (L) → 2.2 iaijutsu (S)
FASE 2     2.1 kamae + protocolo v (L) → 2.2 iaijutsu (S)     ← el corazón del juego
FASE 3     3.1 diario (M) → 3.2 yokai en RŌNIN (M) → 3.3 gestas (S)
FASE 4     4.1 mecenas + Stripe (L) → 4.2 muro del dojo (S)
FASE 5     5.1 PWA (S) y 5.3 telemetría (S) pueden ir EN CUALQUIER MOMENTO (cuanto antes mejor);
           5.2 táctil kenjutsu tras 2.1; 5.4 anti-trampa beat cuando haya un hueco
```

Notas transversales:
- **Toda función online nueva versiona el protocolo** (campo `v` en `match`): la lección del
  lockstep es que un bit de diferencia no da error, da una pelea distinta en cada pantalla.
- **Todo azar de juego nuevo pasa por `rnd()`**; `Math.random` solo para lo visual y para el
  servidor. `smoke.html` es el guardián: cada fase termina con smoke + e2e verdes.
- Archivo JS nuevo ⇒ `<script>` en `index.html` **y** `smoke.html` (y `beat.html` si aplica).
- Datos nuevos del servidor ⇒ dentro de `server/data/` (volumen `katana_data`) o se pierden al deploy.
