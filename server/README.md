# Servidor de KATANA FIGHT

Un solo proceso Node (`ws` como única dependencia) que hace dos cosas:

1. **Sirve el juego** (index.html + `js/`) con healthcheck en `/up`.
2. **Empareja duelos online**: el primer jugador espera; cuando llega el
   segundo, les reparte lado (0/1) y una semilla compartida, y a partir
   de ahí solo reenvía mensajes. La pelea se simula en los navegadores
   (lockstep determinista), así que consume casi nada (~40 MB).

## Probar en local

```bash
cd server && npm install && npm start     # todo en http://localhost:8081
```

Abre **dos** ventanas en `http://localhost:8081` y entra en
*DUELO EN LÍNEA* en ambas. Para forzar otro servidor de duelos:
`?server=ws://host:puerto` en la URL.

Prueba automática (2 navegadores reales, comparación tic a tic):

```bash
python3 e2e_online.py                     # levanta su propio server
KATANA_URL='http://localhost:8090/?server=ws://localhost:8090' python3 e2e_online.py   # contra un contenedor
```

## Despliegue con Kamal

Configurado en `config/deploy.yml` igual que memoriaqr: mismo VPS
(`72.60.156.215`), kamal-proxy enruta `katana.bloqs.cl` con SSL
automático, imagen `arigatodon/katana-fight` en Docker Hub.

Requisitos una sola vez:

1. **DNS**: registro A `katana.bloqs.cl → 72.60.156.215`.
2. El secreto `KAMAL_REGISTRY_PASSWORD` exportado en tu shell
   (el mismo que usas para desplegar memoriaqr).

Desplegar:

```bash
cd ~/workspace/sueños/juegos/katana_fight
kamal deploy
```

Útiles: `kamal logs` (alias), `kamal app details`, `kamal rollback`.

> kamal-proxy pasa los WebSockets sin configuración extra; el cliente
> usa `wss://katana.bloqs.cl/ws` automáticamente al servirse por HTTPS.

## Notas

- El lockstep exige que ambos clientes calculen lo mismo: mismo
  navegador en ambos lados es lo seguro (Chrome↔Chrome, Android↔PC con
  Chrome…). Entre motores distintos (Safari↔Chrome) `Math.sin` y otros
  podrían divergir; aún no está mitigado.
- Mensajes: `join` → `match{side,seed}` → relé de `char{id}` e
  `i{k,v}` (input por tic) → `bye` al desconectarse el rival.
