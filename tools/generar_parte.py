#!/usr/bin/env python3
"""
generar_parte.py — genera UNA pieza (torso | pierna | brazos) de un personaje
con Nano Banana (Gemini image), en el estilo ukiyo-e del juego. Lo invoca el
editor de rig (rig_editor.html) por el endpoint /api/generar-parte del servidor.

  python3 tools/generar_parte.py <id> <torso|pierna|brazos> ["descripción"]

Reutiliza los prompts y el chroma-key de generate_art.py. Guarda en
assets/parts/<id>/<parte>.png; si ya existía, la anterior se respalda como
<parte>_prev*.png (nunca se pierde). Imprime "OK <ruta>" o "ERROR <motivo>".
"""
import os
import sys
import importlib.util

HERE = os.path.dirname(__file__)
_spec = importlib.util.spec_from_file_location('ga', os.path.join(HERE, 'generate_art.py'))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)


def main():
    if len(sys.argv) < 3:
        print('ERROR uso: generar_parte.py <id> <parte> ["desc"]')
        return
    cid = ''.join(c for c in sys.argv[1] if c.isalnum() or c in '_-').lower()[:32]
    part = sys.argv[2]
    desc = sys.argv[3] if len(sys.argv) > 3 else ga.CHARACTERS.get(cid, cid)
    if part not in ga.PART_PROMPTS:
        print('ERROR parte desconocida:', part)
        return
    try:
        from google import genai
        client = genai.Client(api_key=ga.load_api_key())
        prompt = ga.PART_COMMON.format(style=ga.UKIYOE) + ga.PART_PROMPTS[part].format(desc=desc)
        raw = ga.generate_image(client, prompt)
        ga.save_raw(raw, f'parts_{cid}_{part}')
        keyed = ga.chroma_key_magenta(raw)
        bb = keyed.getbbox()
        if bb:
            keyed = keyed.crop(bb)
        out_dir = os.path.join(HERE, '..', 'assets', 'parts', cid)
        os.makedirs(out_dir, exist_ok=True)
        dest = os.path.join(out_dir, f'{part}.png')
        if os.path.exists(dest):                      # respaldar la anterior, no perderla
            os.rename(dest, ga.unique_path(os.path.join(out_dir, f'{part}_prev.png')))
        keyed.save(dest)
        print('OK', os.path.abspath(dest))
    except Exception as e:
        print('ERROR', str(e)[:200])


if __name__ == '__main__':
    main()
