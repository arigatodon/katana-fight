#!/usr/bin/env python3
"""Genera og.png (1200x630): captura de la pantalla de título para la
vista previa al compartir el link en redes sociales. Regenerar cuando
cambie el aspecto del título y commitear el PNG resultante.

    python3 og_image.py
"""
import os, subprocess, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8098

server = subprocess.Popen(['node', 'server/server.js'], cwd=ROOT,
                          env={**os.environ, 'PORT': str(PORT)},
                          stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
time.sleep(1.0)
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/google-chrome',
                                     args=['--no-sandbox'])
        # el canvas se muestra a su tamaño natural (960x540); con
        # device_scale_factor 1.25 el recorte de 960x504 (1.91:1)
        # sale a 1200x630 píxeles reales
        page = browser.new_page(viewport={'width': 960, 'height': 700},
                                device_scale_factor=1.25)
        page.goto(f'http://localhost:{PORT}/')
        page.wait_for_function("typeof scene !== 'undefined' && scene === 'title'")
        time.sleep(1.5)        # que los pétalos se repartan por la pantalla
        box = page.locator('#game').bounding_box()
        page.screenshot(path=os.path.join(ROOT, 'og.png'), clip={
            'x': box['x'], 'y': box['y'] + (box['height'] - 504) / 2,
            'width': 960, 'height': 504,
        })
        browser.close()
finally:
    server.terminate()
print('og.png generado:', os.path.getsize(os.path.join(ROOT, 'og.png')), 'bytes')
