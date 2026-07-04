#!/usr/bin/env python3
"""E2E del CO-OP en línea de KATANA RŌNIN (beat 'em up).

Dos navegadores entran al co-op, se emparejan por el servidor real, eligen
guerrero y juegan. Verifica que:
  · ambos llegan a la escena 'play' en co-op,
  · el host simula y el invitado recibe snapshots (enemigos + compañero),
  · el input del invitado llega al host (mueve a su luchador),
  · no hay errores de consola en ninguno de los dos.

Levanta su propio server. Uso:  python3 e2e_coop.py
"""
import subprocess, time, os, tempfile, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8097
URL = f'http://localhost:{PORT}/beat.html?server=ws://localhost:{PORT}'

server = subprocess.Popen(
    ['node', 'server/server.js'], cwd=ROOT,
    env={**os.environ, 'PORT': str(PORT), 'DATA_DIR': tempfile.mkdtemp(prefix='katana_coop_')},
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
time.sleep(1.3)

errors = {'A': [], 'B': []}
ok = True

def fail(msg):
    global ok
    ok = False
    print('  ✗', msg)

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
        ctxA = browser.new_context(); ctxB = browser.new_context()
        A = ctxA.new_page(); B = ctxB.new_page()
        # ignora 404 de recursos (retratos de personajes que no están en local):
        # son preexistentes y no tocan la lógica del co-op
        def is_real(m):
            return m.type == 'error' and 'Failed to load resource' not in m.text
        A.on('console', lambda m: errors['A'].append(m.text) if is_real(m) else None)
        B.on('console', lambda m: errors['B'].append(m.text) if is_real(m) else None)
        A.on('pageerror', lambda e: errors['A'].append(str(e)))
        B.on('pageerror', lambda e: errors['B'].append(str(e)))

        A.goto(URL); B.goto(URL)
        A.wait_for_function("typeof bmNetStart === 'function' && typeof bmScene !== 'undefined'")
        B.wait_for_function("typeof bmNetStart === 'function' && typeof bmScene !== 'undefined'")
        print('• páginas cargadas')

        # entrar al co-op: A primero (queda esperando), luego B (empareja)
        A.evaluate("bmNetStart()")
        time.sleep(0.4)
        B.evaluate("bmNetStart()")

        A.wait_for_function("bmScene === 'choose' && bmCoop", timeout=8000)
        B.wait_for_function("bmScene === 'choose' && bmCoop", timeout=8000)
        print('• emparejados, ambos en elección')

        # identificar host / invitado (bmHost ya quedó fijado al emparejar)
        hostA = A.evaluate("bmHost")
        host, guest = (A, B) if hostA else (B, A)
        print(f'• host = {"A" if hostA else "B"}')

        # el HOST desbloquea y juega con un YOKAI; el invitado, un común.
        # Prueba el lazo cruzado 3.2: un yokai vencido en el torneo es jugable en RŌNIN.
        host.evaluate("save.unlocked = ['mapache']; bmRebuildPlayable()")
        host.evaluate("bmNetChoose(bmChar('mapache'))")   # TANUKI (yokai)
        guest.evaluate("bmNetChoose(bmChar('ronin'))")

        A.wait_for_function("bmScene === 'play'", timeout=8000)
        B.wait_for_function("bmScene === 'play'", timeout=8000)
        print('• ambos en juego')

        # sonda de control: dentro de la gracia de aparición (sin enemigos aún),
        # un toque corto a la derecha debe mover a ambos luchadores. Se mide aquí
        # porque más tarde, con la oleada, el host podría morir y reaparecer.
        hx0 = host.evaluate("bmPlayer.x")
        host.keyboard.down('ArrowRight'); guest.keyboard.down('ArrowRight')
        time.sleep(0.6)
        hx1 = host.evaluate("bmPlayer.x")          # host visto por sí mismo
        hmx1 = host.evaluate("bmMate ? bmMate.x : null")   # invitado visto por el host
        if not (hx1 > hx0 + 8): fail(f'el host no responde a su input ({hx0:.0f}→{hx1:.0f})')
        if hmx1 is None: fail('el host no tiene compañero (bmMate)')
        elif not (hmx1 > 179): fail(f'el input del invitado no llega al host (mate en {hmx1:.0f})')

        # seguir avanzando para gatillar la primera oleada
        time.sleep(2.2)
        host.keyboard.up('ArrowRight')
        guest.keyboard.up('ArrowRight')
        time.sleep(0.8)

        # el host debe haber generado enemigos y el invitado recibirlos por snapshot
        he = host.evaluate("bmEnemies.length")
        ge = guest.evaluate("bmEnemies.length")
        print(f'• enemigos — host={he}  invitado={ge}')
        if he <= 0: fail('el host no generó enemigos al avanzar')
        if ge <= 0: fail('el invitado no recibió enemigos por snapshot')

        # el invitado debe tener compañero y verse cerca de donde el host lo simula
        hmx = host.evaluate("bmMate ? bmMate.x : null")   # el invitado, visto por el host
        gx = guest.evaluate("bmPlayer.x")         # el invitado, visto por sí mismo
        gmate = guest.evaluate("bmMate ? bmMate.x : null")
        print(f'• posiciones — host.mate={hmx}  guest.player={gx:.0f}  guest.mate={gmate}')
        if gmate is None: fail('el invitado no tiene compañero (bmMate)')
        if hmx is not None and gx is not None and abs(hmx - gx) > 120:
            fail(f'desync de posición del invitado: host.mate={hmx:.0f} vs guest.player={gx:.0f}')

        # 3.2: el host juega con un YOKAI y el invitado lo ve correctamente
        host_char = host.evaluate("bmPlayer.char.id")
        guest_sees = guest.evaluate("bmMate ? bmMate.char.id : null")
        print(f'• host juega {host_char}  ·  invitado ve al host como {guest_sees}')
        if host_char != 'mapache': fail('el host no juega con el yokai desbloqueado')
        if guest_sees != 'mapache': fail('el invitado no ve al host con su yokai (id de personaje en snapshot)')

        # desconexión: si cae el invitado, el host vuelve al título con aviso
        guest.close()
        time.sleep(0.8)
        hs = host.evaluate("bmScene")
        print(f'• tras desconexión del invitado, host.scene = {hs}')
        if hs != 'title': fail('el host no volvió al título al desconectarse el compañero')

        for who in ('A', 'B'):
            if errors[who]:
                fail(f'errores de consola en {who}: {errors[who][:3]}')

        browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=5)
    except Exception: server.kill()

print('\n' + ('✓ CO-OP OK' if ok else '✗ FALLOS DETECTADOS'))
sys.exit(0 if ok else 1)
