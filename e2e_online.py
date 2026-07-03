#!/usr/bin/env python3
"""E2E del modo online de KATANA FIGHT: dos navegadores se emparejan
por el servidor real y juegan; se comparan las simulaciones tic a tic.

Por defecto levanta su propio server (node + estáticos). Para probar
contra un despliegue existente (contenedor, VPS):
    KATANA_URL='http://localhost:8090/?server=ws://localhost:8090' python3 e2e_online.py
"""
import json, subprocess, time, sys, os, signal, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
WS_PORT = 8099
URL = os.environ.get('KATANA_URL')

server = None
if not URL:
    URL = f'http://localhost:{WS_PORT}/?server=ws://localhost:{WS_PORT}'
    server = subprocess.Popen(['node', 'server/server.js'], cwd=ROOT,
                              env={**os.environ, 'PORT': str(WS_PORT),
                                   'DATA_DIR': tempfile.mkdtemp(prefix='katana_rank_')},
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)

SNAP_HOOK = """() => {
  window.__snap = {};
  const _u = update;
  update = function (dt) {
    _u(dt);
    if (netPlaying()) {
      __snap[net.tick] = [p1 && p1.x, p1 && p1.y, p1 && p1.vida, p1 && p1.postura,
                          p2 && p2.x, p2 && p2.y, p2 && p2.vida, p2 && p2.postura,
                          roundNum, scene].join(',');
    }
  };
}"""

def wait_for(page, expr, timeout=15000):
    page.wait_for_function(expr, timeout=timeout)

ok, fallos = [], []
def check(nombre, cond, extra=''):
    (ok if cond else fallos).append(f"{nombre} {extra}")

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/google-chrome',
                                     args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        A = browser.new_page()
        B = browser.new_page()
        A.goto(URL); B.goto(URL)
        for pg in (A, B):
            pg.wait_for_function("typeof scene !== 'undefined' && scene === 'title'")

        # menú: bajar hasta DUELO EN LÍNEA (índice 1), poner nombre y buscar
        for pg, nombre in ((A, 'IGOR'), (B, 'ANA')):
            pg.keyboard.press('ArrowDown')
            pg.keyboard.press('Enter')
            wait_for(pg, "scene === 'nombre'")
            pg.fill('#nameInput', nombre)
            pg.keyboard.press('Enter')

        wait_for(A, "scene === 'choose'"); wait_for(B, "scene === 'choose'")
        check('emparejamiento', True)
        sides = [A.evaluate('net.side'), B.evaluate('net.side')]
        check('lados repartidos', sorted(sides) == [0, 1], str(sides))
        check('misma semilla', A.evaluate('net.seed') == B.evaluate('net.seed'))
        check('nombres intercambiados',
              A.evaluate('net.foeName') == 'ANA' and B.evaluate('net.foeName') == 'IGOR',
              f"A ve {A.evaluate('net.foeName')!r}, B ve {B.evaluate('net.foeName')!r}")

        for pg in (A, B): pg.evaluate(SNAP_HOOK)

        # elegir guerreros distintos
        A.keyboard.press('Enter')                       # RONIN
        B.keyboard.press('d'); B.keyboard.press('Enter')  # VIEJO MAESTRO
        wait_for(A, "scene === 'vs'"); wait_for(B, "scene === 'vs'")
        check('ambos en presentación VS', True)
        wait_for(A, "scene === 'fight'", 20000); wait_for(B, "scene === 'fight'", 20000)
        check('ambos en la pelea', True)
        hudA = A.evaluate("net.side === 0 ? p1.name : p2.name")
        hudB = B.evaluate("net.side === 0 ? p1.name : p2.name")
        check('nombres en el HUD', hudA == 'IGOR (TÚ)' and hudB == 'ANA (TÚ)',
              f'{hudA!r} / {hudB!r}')
        # esperar el fin de la cuenta atrás: antes el movimiento está bloqueado
        wait_for(A, "scene === 'fight' && roundStartTimer <= 0", 10000)
        wait_for(B, "scene === 'fight' && roundStartTimer <= 0", 10000)

        x0 = B.evaluate('p1.x')          # p1 visto por B, antes de que A se mueva
        A.keyboard.down('d'); time.sleep(0.9); A.keyboard.up('d')
        A.keyboard.press('f')            # golpe de A
        B.keyboard.down('a'); time.sleep(0.6); B.keyboard.up('a')
        B.keyboard.press('f')            # golpe de B
        time.sleep(1.2)                  # reposo: que ambos alcancen el mismo estado

        x1 = B.evaluate('p1.x')
        check('el rival ve moverse a A', abs(x1 - x0) > 30, f'{x0:.0f}→{x1:.0f}')

        snapA = A.evaluate('window.__snap')
        snapB = B.evaluate('window.__snap')
        comunes = sorted(set(snapA) & set(snapB), key=int)
        iguales = sum(1 for k in comunes if snapA[k] == snapB[k])
        check('tics comparados', len(comunes) > 200, f'{len(comunes)} tics')
        check('simulaciones idénticas', iguales == len(comunes),
              f'{iguales}/{len(comunes)} tics iguales')
        if iguales != len(comunes):
            primero = next(k for k in comunes if snapA[k] != snapB[k])
            fallos.append(f'  primer desvío en tic {primero}:\n   A: {snapA[primero]}\n   B: {snapB[primero]}')

        # desconexión: A se va, B debe enterarse
        A.close()
        wait_for(B, "scene === 'online' || scene === 'title'", 8000)
        check('aviso de desconexión', True, '· mensaje: ' + str(B.evaluate('net && net.error')))

        # ---- revancha: dos duelos completos seguidos sin reconectar ----
        # (solo contra el server local: termina duelos de verdad y anota ranking)
        if server:
            def machacar_hasta(pg_atk, pg_def, escena, deadline=150):
                """el atacante avanza y corta en bucle hasta que ambos llegan a la escena"""
                fin = time.time() + deadline
                while time.time() < fin:
                    if pg_atk.evaluate('scene') == escena and pg_def.evaluate('scene') == escena:
                        return True
                    pg_atk.keyboard.down('d'); time.sleep(0.45); pg_atk.keyboard.up('d')
                    pg_atk.keyboard.press('f'); time.sleep(0.35)
                return False

            def comparar_snaps(pa, pb, etiqueta, minimo=200):
                sa, sb = pa.evaluate('window.__snap'), pb.evaluate('window.__snap')
                com = sorted(set(sa) & set(sb), key=int)
                ig = sum(1 for k in com if sa[k] == sb[k])
                check(f'tics comparados ({etiqueta})', len(com) > minimo, f'{len(com)} tics')
                check(f'simulaciones idénticas ({etiqueta})', ig == len(com), f'{ig}/{len(com)}')
                if ig != len(com):
                    k0 = next(k for k in com if sa[k] != sb[k])
                    fallos.append(f'  desvío ({etiqueta}) tic {k0}:\n   A: {sa[k0]}\n   B: {sb[k0]}')
                return sa

            RA, RB = browser.new_page(), browser.new_page()
            RA.goto(URL); RB.goto(URL)
            for pg, nombre in ((RA, 'REMA'), (RB, 'REMB')):
                pg.wait_for_function("typeof scene !== 'undefined' && scene === 'title'")
                pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter')
                wait_for(pg, "scene === 'nombre'")
                pg.fill('#nameInput', nombre); pg.keyboard.press('Enter')
            wait_for(RA, "scene === 'choose'"); wait_for(RB, "scene === 'choose'")
            semilla1 = RA.evaluate('net.seed')
            lados1 = [RA.evaluate('net.side'), RB.evaluate('net.side')]
            for pg in (RA, RB): pg.evaluate(SNAP_HOOK)
            RA.keyboard.press('Enter')
            RB.keyboard.press('d'); RB.keyboard.press('Enter')
            wait_for(RA, "scene === 'fight'", 25000); wait_for(RB, "scene === 'fight'", 25000)
            wait_for(RA, "roundStartTimer <= 0", 10000)

            # duelo 1 completo: REMA machaca, REMB no se defiende
            check('duelo 1 terminado', machacar_hasta(RA, RB, 'matchEnd'))
            snap_d1 = comparar_snaps(RA, RB, 'duelo 1')
            check('resultado en ambos', RA.evaluate('netResult !== null') and RB.evaluate('netResult !== null'))

            # el lado 0 publicó el replay y compartió el id con el rival
            wait_for(RA, 'netReplayId !== null', 10000)
            wait_for(RB, 'netReplayId !== null', 10000)
            replay_id = RA.evaluate('netReplayId')
            check('replay publicado y compartido', RB.evaluate('netReplayId') == replay_id,
                  str(replay_id))
            check('oferta de revancha abierta',
                  RA.evaluate('netRematch && !netRematch.gone') and RB.evaluate('netRematch && !netRematch.gone'))

            # REMB pide primero; REMA debe ver el aviso y aceptar
            RB.keyboard.press('Enter')
            wait_for(RA, 'netRematch && netRematch.theirs === true', 8000)
            check('aviso de revancha al rival', True)
            RA.keyboard.press('Enter')
            wait_for(RA, "scene === 'choose'", 8000); wait_for(RB, "scene === 'choose'", 8000)
            semilla2 = RA.evaluate('net.seed')
            check('semilla nueva en la revancha',
                  semilla2 == RB.evaluate('net.seed') and semilla2 != semilla1,
                  f'{semilla1} → {semilla2}')
            check('lados conservados', [RA.evaluate('net.side'), RB.evaluate('net.side')] == lados1)
            check('lockstep limpio para la revancha',
                  RA.evaluate('net.tick === 0 && net.inputs[0].size === 0 && net.inputs[1].size === 0'))

            # duelo 2 (la revancha) también completo y tic a tic idéntico
            for pg in (RA, RB): pg.evaluate(SNAP_HOOK)
            RA.keyboard.press('Enter')
            RB.keyboard.press('d'); RB.keyboard.press('Enter')
            wait_for(RA, "scene === 'fight'", 25000); wait_for(RB, "scene === 'fight'", 25000)
            wait_for(RA, "roundStartTimer <= 0", 10000)
            check('duelo 2 (revancha) terminado', machacar_hasta(RA, RB, 'matchEnd'))
            comparar_snaps(RA, RB, 'revancha')

            # ambos duelos anotados por separado en el ranking
            rows = RB.evaluate("fetch(netHttpBase() + '/ranking').then(r => r.json())")
            ganadas = sum(r['wins'] for r in rows if r['name'] in ('REMA', 'REMB'))
            check('dos duelos anotados en /ranking', ganadas == 2, f'{ganadas} victorias')

            # el rival se va durante la oferta: REMA debe verlo y poder salir
            RA.keyboard.press('Enter')          # REMA pide revancha…
            wait_for(RA, 'netRematch && netRematch.mine === true', 5000)
            RB.close()                          # …y REMB cierra la pestaña
            wait_for(RA, 'netRematch && netRematch.gone === true', 8000)
            check('rival ido durante la oferta', True)
            RA.keyboard.press('Enter')
            wait_for(RA, "scene === 'ranking'", 5000)
            check('salida limpia al ranking', True)
            RA.close()

            # ---- ver el replay del duelo 1: debe re-simular EXACTAMENTE la pelea ----
            RP = browser.new_page()
            RP.goto(URL + '&replay=' + replay_id)
            RP.wait_for_function("typeof replayActive === 'function'")
            RP.evaluate("""() => {
              window.__snap = {};
              const _u = update;
              update = function (dt) {
                _u(dt);
                if (replayActive()) {
                  __snap[replay.tick] = [p1 && p1.x, p1 && p1.y, p1 && p1.vida, p1 && p1.postura,
                                         p2 && p2.x, p2 && p2.y, p2 && p2.vida, p2 && p2.postura,
                                         roundNum, scene].join(',');
                }
              };
            }""")
            wait_for(RP, 'replay && replay.playing', 10000)
            peso = RP.evaluate(f"fetch(netHttpBase() + '/replay?id={replay_id}').then(r => r.text()).then(t => t.length)")
            check('el replay pesa poco', peso < 50000, f'{peso} bytes')
            # pausa: la simulación se congela y se reanuda
            RP.keyboard.press('Space')
            t0 = RP.evaluate('replay.tick'); time.sleep(0.4)
            check('pausa congela el replay', RP.evaluate('replay.paused && replay.tick === ' + str(t0)))
            RP.keyboard.press('Space')
            RP.keyboard.press('v')                       # velocidad ×2
            time.sleep(0.2)
            check('velocidad ×2', RP.evaluate('replay.speed') == 2)
            wait_for(RP, "scene === 'matchEnd'", 120000)
            rsnap = RP.evaluate('window.__snap')
            com = sorted(set(snap_d1) & set(rsnap), key=int)
            ig = sum(1 for k in com if snap_d1[k] == rsnap[k])
            check('replay re-simula idéntico al duelo', len(com) > 500 and ig == len(com),
                  f'{ig}/{len(com)} tics')
            lista = RP.evaluate("fetch(netHttpBase() + '/replays').then(r => r.json())")
            check('lista de duelos grabados', len(lista) >= 2 and all('id' in r for r in lista),
                  f'{len(lista)} replays')

            # replay de otra versión del juego: se rechaza con aviso, nunca diverge
            time.sleep(1)
            bad = RP.evaluate("""async () => {
              const r = await fetch(netHttpBase() + '/replay', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ v: 999, seed: 1, chars: ['ronin', 'ronin'],
                  names: ['VIEJO', 'REPLAY'], winner: 0, score: 0, inputs: [[0, 10], [0, 10]] }),
              });
              return r.json();
            }""")
            VP = browser.new_page()
            VP.goto(URL + '&replay=' + bad['id'])
            wait_for(VP, "typeof net !== 'undefined' && net && net.fase === 'error'", 8000)
            check('replay de otra era rechazado con aviso', 'era' in str(VP.evaluate('net.error')))
            RP.close(); VP.close()

        # ranking en línea: dos sockets se emparejan, ambos reportan el
        # mismo resultado y el ganador debe aparecer en GET /ranking
        # (solo contra el server local: no ensucia un ranking real)
        if server:
            C = browser.new_page()
            C.goto(URL)
            C.wait_for_function("typeof netUrl === 'function'")
            rank = C.evaluate("""async () => {
              const mk = name => new Promise((res, rej) => {
                const ws = new WebSocket(netUrl());
                ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
                ws.onmessage = ev => {
                  const m = JSON.parse(ev.data);
                  if (m.t === 'match') res({ ws, side: m.side, name });
                };
                ws.onerror = () => rej(new Error('ws error'));
              });
              const pa = mk('RANKTESTA'), pb = mk('RANKTESTB');
              const [a, b] = await Promise.all([pa, pb]);
              const winner = 0;   // gana el lado 0, sea quien sea
              for (const c of [a, b]) c.ws.send(JSON.stringify({ t: 'result', winner, score: 1500 }));
              await new Promise(r => setTimeout(r, 400));
              const ganador = a.side === winner ? a.name : b.name;
              a.ws.close(); b.ws.close();
              const rows = await (await fetch(netHttpBase() + '/ranking')).json();
              return { ganador, rows };
            }""")
            fila = next((r for r in rank['rows'] if r['name'] == rank['ganador']), None)
            check('victoria anotada en /ranking',
                  fila is not None and fila['wins'] == 1 and fila['pts'] == 1500,
                  json.dumps(fila))
            perdedor = 'RANKTESTA' if rank['ganador'] == 'RANKTESTB' else 'RANKTESTB'
            filaP = next((r for r in rank['rows'] if r['name'] == perdedor), None)
            check('derrota anotada en /ranking',
                  filaP is not None and filaP['losses'] == 1 and filaP['pts'] == 0,
                  json.dumps(filaP))

            # comentarios: POST guarda y GET /comentarios lo publica escapado
            com = C.evaluate("""async () => {
              const r = await fetch(netHttpBase() + '/comentarios', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'tester', text: '¡gran juego! <script>x</script>' }),
              });
              const ok = (await r.json()).ok;
              const html = await (await fetch(netHttpBase() + '/comentarios')).text();
              return { ok, html };
            }""")
            check('comentario aceptado', com['ok'] is True)
            check('comentario publicado y escapado',
                  '¡gran juego!' in com['html'] and '<script>x' not in com['html']
                  and 'TESTER' in com['html'])
            C.close()

            # ---- salas privadas: dos amigos con ?sala= + un intruso en la cola ----
            def entrar_online(pg, nombre):
                pg.wait_for_function("typeof scene !== 'undefined' && scene === 'title'")
                pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter')
                wait_for(pg, "scene === 'nombre'")
                pg.fill('#nameInput', nombre); pg.keyboard.press('Enter')

            INT = browser.new_page(); INT.goto(URL)
            entrar_online(INT, 'INTRUSO')             # cola pública
            wait_for(INT, "net && net.fase === 'buscando'")

            S1 = browser.new_page(); S1.goto(URL + '&sala=amigos!x')   # se sanea a AMIGOSX
            entrar_online(S1, 'AMIGO1')
            wait_for(S1, "net && net.fase === 'buscando'")
            check('sala saneada y en espera', S1.evaluate('net.code') == 'AMIGOSX',
                  repr(S1.evaluate('net.code')))
            check('el intruso no entra a la sala', INT.evaluate("net.fase === 'buscando'"))

            S2 = browser.new_page(); S2.goto(URL + '&sala=AMIGOSX')
            entrar_online(S2, 'AMIGO2')
            wait_for(S1, "scene === 'choose'", 8000); wait_for(S2, "scene === 'choose'", 8000)
            check('amigos emparejados por código',
                  S1.evaluate('net.foeName') == 'AMIGO2' and S2.evaluate('net.foeName') == 'AMIGO1')
            check('el intruso sigue esperando en la cola pública',
                  INT.evaluate("net && net.fase === 'buscando'"))
            for pg in (INT, S1, S2): pg.close()
        browser.close()
except Exception as e:
    fallos.append(f'EXCEPCIÓN: {type(e).__name__}: {e}')
finally:
    if server: server.terminate()

print('== RESULTADO E2E ONLINE ==')
for l in ok: print(' ✓', l)
for l in fallos: print(' ✗', l)
sys.exit(1 if fallos else 0)
