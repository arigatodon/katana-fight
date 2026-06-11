#!/usr/bin/env python3
"""E2E del modo online de KATANA FIGHT: dos navegadores se emparejan
por el servidor real y juegan; se comparan las simulaciones tic a tic.

Por defecto levanta su propio server (node + estáticos). Para probar
contra un despliegue existente (contenedor, VPS):
    KATANA_URL='http://localhost:8090/?server=ws://localhost:8090' python3 e2e_online.py
"""
import json, subprocess, time, sys, os, signal
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
WS_PORT = 8099
URL = os.environ.get('KATANA_URL')

server = None
if not URL:
    URL = f'http://localhost:{WS_PORT}/?server=ws://localhost:{WS_PORT}'
    server = subprocess.Popen(['node', 'server/server.js'], cwd=ROOT,
                              env={**os.environ, 'PORT': str(WS_PORT)},
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

        # menú: bajar hasta DUELO EN LÍNEA (índice 3), poner nombre y buscar
        for pg, nombre in ((A, 'IGOR'), (B, 'ANA')):
            for _ in range(3): pg.keyboard.press('ArrowDown')
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
        browser.close()
except Exception as e:
    fallos.append(f'EXCEPCIÓN: {type(e).__name__}: {e}')
finally:
    if server: server.terminate()

print('== RESULTADO E2E ONLINE ==')
for l in ok: print(' ✓', l)
for l in fallos: print(' ✗', l)
sys.exit(1 if fallos else 0)
