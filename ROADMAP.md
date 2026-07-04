# ROADMAP — KATANA FIGHT ×10

> Estado de partida (jul 2026): duelo 1v1 pulido con online lockstep, torneo arcade de 6 peleas,
> beat 'em up KATANA RŌNIN con co-op, ranking global, clima real, táctil básico, desplegado en
> katana.igorv.org e itch.io. Donaciones por enlace (Buda / Mercado Pago).
>
> **FASES 1, 2 y 3 COMPLETAS** (jul 2026): revancha, salas, replays, espectadores; kamae + iaijutsu
> con protocolo v2; desafío diario, yokai jugables en RŌNIN y gestas (logros con sellos) —
> verificado con `smoke.html` + `e2e_online.py` + `e2e_coop.py`. **Aún sin desplegar (prod=v1).**
> Lo siguiente: FASE 4 (monetización: pase de mecenas + muro del dojo) o FASE 5 (PWA, telemetría).

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

### 2.1 Posturas (kamae) y cortes direccionales — esfuerzo L — ✅ HECHO

Tres posturas — alta (jōdan), media (chūdan), baja (gedan) — cambiadas manteniendo finta + saltar/bajar.
La postura determina el corte: alto (lento, rompe guardia), medio (equilibrado), bajo (rápido,
barre piernas, pierde contra guardia). Triángulo piedra-papel-tijera: cada corte tiene una postura
que lo neutraliza de pie (gedan se agacha bajo el tajo alto, jōdan desvía el medio, chūdan pisa el
barrido); la guardia solo cubre la línea de tu propia kamae.

- La matriz vive como DATOS en `KAMAE` (`data.js`): `vsGuardia` (rompe/linea/pierde) y `neutraliza`
  (triángulo). La lógica en `combat.js` (`setKamae`, `startAttack`, `tryHit`) y `update.js` (entrada).
- **No hizo falta más bits**: la kamae se deriva de finta + salto/bajar ya presentes en
  `packLocalInput`; solo se **versionó el protocolo** — `GAME_VER`/`PROTO_VER` = 2, el `join` lleva
  `v`, el servidor no empareja versiones distintas (`{t:'ver'}` → aviso "otra era, recarga").
- La postura se LEE en el rig: la katana se dibuja arriba/media/baja en `render.js` (procedural y
  origami), verificado con capturas: guardia, windup y ataque dan tres siluetas distintas.
- **Criterios de aceptación:**
  - [x] `smoke.html` pasa: misma semilla → mismo hash, con las 3 kamae ejercitadas en la corriente del RNG.
  - [x] Sin mirar HUD, un jugador identifica la kamae del rival solo por la silueta (verificado con capturas de las 3 fases).
  - [x] Cada uno de los 3 cortes tiene al menos una respuesta que lo castiga (matriz `KAMAE` en `data.js` como datos, no ifs sueltos).
  - [x] La CPU (`ai.js`) usa las 3 posturas y responde a la del jugador; el jefe castiga la kamae plantada.
  - [x] `e2e_online.py` pasa con el protocolo nuevo; cliente viejo (`v:1`) recibe `{t:'ver'}` y se cierra, no una pelea corrupta.
  - [x] Los 13 personajes siguen diferenciados: 5 tienen afinidad de kamae (`kamaeFav`) — GIGANTE/TENGU alta, MAESTRO media, NIÑO/KAPPA baja.

### 2.2 Iaijutsu: desenvaine — esfuerzo S — ✅ HECHO

Al inicio de cada ronda ambos empiezan con la katana envainada (`p.sheathed`); el primer corte
desde la vaina es un iai (windup ×0.6 y mucha más rotura de postura), pero fallarlo te deja EXPOSED
un instante. Convierte la apertura de cada ronda en un duelo de nervios, como el modo GOLPE FINAL
pero integrado en toda ronda.

- Lógica en `combat.js`: `startAttack` marca `iai` si venías envainado; `startGuard` desenvaina
  (bloquear no es iai); el iai conectado muele postura extra (`applyDamage`), y `failIai` lo castiga
  con EXPOSED al ser leído (parry/barrido/neutralizado en `tryHit`) o al aire (`update.js`, ATTACK
  sin `hitDone`). Bloquear un iai en línea muele la guardia pero no te deja vendido.
- Sin bits nuevos (el iai se deriva del estado envainado, no del input) → protocolo sigue en v2.
- Se LEE en el rig (`render.js`): en reposo la katana descansa horizontal sobre el obi, silueta
  distinta de la guardia (verificado con captura).
- **Criterios de aceptación:**
  - [x] El iai solo existe en el primer ataque de cada ronda por jugador; después, combate normal.
  - [x] Iai fallado (al aire o parado) → ventana EXPOSED castigable; iai conectado → daño de postura extra.
  - [x] Determinista: `smoke.html` (mismo hash, iai/sheathed en la corriente) y `e2e_online.py` (760/1668/3558 tics idénticos) pasan.
  - [x] El destino "sangre" (one-hit) y el modo GOLPE FINAL siguen funcionando: la letalidad se evalúa antes del bono de postura del iai, así que no se rompen.

---

## FASE 3 — Razones para volver (retención)

### 3.1 Desafío diario — esfuerzo M — ✅ HECHO

Un torneo al día, igual para todo el mundo: semilla derivada de la fecha UTC
(`YYYYMMDD` → mulberry32), mismos rivales, destinos, apuestas y escenarios para todos.
Ranking del día separado en el servidor; a medianoche UTC rota.

- El plan (`buildDailyPlan` en `flow.js`) se **pre-genera** de la semilla del día con un mulberry32
  LOCAL, independiente de `rnd()` — clave, porque la simulación consume `rnd()` de forma variable
  (proyectiles del mercado, etc.) según dure cada pelea, así que un stream corrido divergiría entre
  jugadores. El plan fija rivales (sin filtrar tu guerrero, para que sea igual aunque elijas otro),
  jefe, escenarios, destinos, dones y apuestas por ronda. Sin rasgos raros (salen de `rnd()`).
- El desafío **ignora el clima real** a propósito (`pickDestino` cortocircuita en diario), igual que
  el online — si el clima tiñe el destino, Santiago y Madrid no serían comparables.
- Un solo intento que puntúa (`save.dailyDone`); los demás son ENTRENAMIENTO (no se envían). El
  puntaje excluye la racha personal (`computeScore` sin `save.streak` en diario) para ser comparable.
- Servidor: `GET/POST /diario`, board por día UTC en `server/data/diario.json` (volumen), un registro
  por nombre+día (mejor), tope + rate-limit por IP, poda a 14 días. Nuevo tab "DÍA" en RÉCORDS.
- **Criterios de aceptación:**
  - [x] Dos navegadores distintos el mismo día generan exactamente el mismo torneo (verificado en `smoke.html`: `planDeterminista`, `escenarioDelPlan`, `apuestaDelPlan`, `jefeSecreto`).
  - [x] El clima real NO influye en el desafío diario (verificado forzando `clima='sangre'`: `destinoIgnoraClima`).
  - [x] `GET /diario` devuelve el top del día; `POST /diario` acepta un solo score por nombre+día (verificado con curl: mantiene el mejor, 429 al repetir).
  - [x] El título muestra "DESAFÍO DEL DÍA" con cuenta regresiva a la rotación (`fmtCountdown`/`msToUtcMidnight`).
  - [x] `smoke.html` incluye un recorrido del modo diario (`window.__diario`, todo verde).

### 3.2 Los yokai vencidos son jugables en KATANA RŌNIN — esfuerzo M — ✅ HECHO

Nuevo lazo entre modos: los 8 guerreros base + cada yokai secreto que desbloqueas en el torneo
(`save.unlocked`) son jugables en el beat 'em up, cada uno con su rasgo traducido al beat.

- `BM_PLAYABLE` se reconstruye (`bmRebuildPlayable`) desde `CHARS` + `save.unlocked`, no es fija.
  La grilla de selección (`bm_render`) muestra los 13 en dos filas (GUERREROS · YOKAI); los yokai
  aún no vencidos salen como SILUETAS negras (`ctx.filter=brightness(0)`) con "?" y
  "⚔ VÉNCELO EN EL TORNEO PARA JUGARLO" — llamada cruzada entre modos.
- Traducción de rasgos (tabla documentada en `bm_core.js`): la mayoría se aplican solos vía
  makePlayer (alcance/tamaño por scale, salto por jumpMul, cadencia por windup, velocidad). Los que
  no tenían efecto se enganchan: doubleJump (CAZADORA)→2º salto, parryMul (YAMAUBA)→parada más ancha,
  slide (UMIBOZU)→embestida larga e invulnerable, steal (TANUKI)→instante invulnerable al matar,
  bounce (KAPPA)→rebota al aterrizar, afterimage (ESPECTRO)→estelas (cosmético). Aditivos: no
  crashean contra jefes ni en co-op.
- Co-op: el snapshot ya reconstruía al compañero por `bmMateCharId`; además ahora el id del
  personaje viaja en cada snapshot (`bmEncFighter.c`), fuente de verdad para dibujar el yokai del host
  aunque el invitado no lo tenga desbloqueado.
- **Criterios de aceptación:**
  - [x] `BM_PLAYABLE` se construye desde `CHARS` + `save.unlocked`, no de una lista fija (`bmRebuildPlayable`).
  - [x] Cada rasgo distintivo tiene traducción funcional en el beat (documentada en `bm_core.js`); ninguno crashea contra jefes ni en co-op.
  - [x] En co-op, el invitado ve correctamente al host jugando con un yokai (snapshots incluyen el id del personaje).
  - [x] `e2e_coop.py` pasa con un yokai (TANUKI) como host.
  - [x] La pantalla de selección del beat enseña siluetas bloqueadas con "VÉNCELO EN EL TORNEO" (verificado con captura).

### 3.3 Gestas (logros con testigo) — esfuerzo S — ✅ HECHO

12 logros con sabor (HOJA HONESTA, PIEL INTACTA, DESENVAINE FATAL, FILO CARMESÍ, SEÑOR DEL DOJO,
GRAN ESPÍRITU, SENDA IMPECABLE, COSECHA PERFECTA…). Se guardan en el save y se lucen como sellos
(kanji) junto a la firma del ranking — cosméticos y narrativos, sin tocar stats.

- Las gestas son DATOS en `data.js` (`GESTAS`: id, name, sello, desc, `test(c)`). Se evalúan en DOS
  puntos únicos: `finishMatch` (fin de duelo/torneo, con contexto completo) y `finishBonus` (bonus),
  con un solo `evaluarGestas(c)` que recorre todas — un test cuyo campo no venga en `c` da falso, así
  el mismo evaluador sirve para ambos puntos. Nada de ifs regados. Tracking mínimo: `stats.iaiHits`
  (combat.js), `ultimaEjecucion` (combat.js), `run.roundsLost` (flow.js).
- Aviso discreto al final de la ronda/torneo (`drawGestaAvisos` en matchEnd y en el bonus), nunca
  durante el combate.
- Nueva escena `gestas` (tecla G desde RÉCORDS): elige hasta 3 sellos (`save.sellos`, tope respetado).
  Los sellos aparecen junto a la firma en el ranking local y en el online (el ganador los envía con el
  resultado; el servidor los guarda en su entrada, cosmético, sin tocar el anti-trampa).
- **Criterios de aceptación:**
  - [x] Las gestas se definen como datos en `data.js` (condición `test(c)` evaluada en puntos únicos de `flow.js`, no ifs regados).
  - [x] Desbloquear una gesta muestra un aviso discreto al final de la ronda, nunca durante el combate.
  - [x] Los sellos aparecen junto a la firma en el ranking local y en el online (máx. 3 elegidos por el jugador; verificado con captura y `smoke.html`).
  - [x] El save viejo migra sin romperse (`s.gestas`/`s.sellos` con default en `loadSave`).

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
HECHO      Fase 0 (colisión), FASE 1 entera (revancha, salas, replays, espectadores)
HECHO      FASE 2 entera: 2.1 kamae + protocolo v2 (L) → 2.2 iaijutsu (S)
HECHO      FASE 3 entera: 3.1 diario · 3.2 yokai en RŌNIN · 3.3 gestas
AHORA      FASE 4 (mecenas + Stripe, muro) o FASE 5 (PWA, telemetría) — ambas independientes
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
