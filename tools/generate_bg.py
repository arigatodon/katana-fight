#!/usr/bin/env python3
"""
generate_bg.py — escenarios de Katana Fight como CUADRO CLÁSICO JAPONÉS.

Genera los fondos de cada STAGE (js/data.js) con Nano Banana (Gemini image),
empujando fuerte el estilo de pintura japonesa antigua (xilografía ukiyo-e /
biombo byōbu): plano, contornos de tinta, color liso, NADA de aspecto 3D ni
cinematográfico. Cada descripción muestra la SUPERFICIE JUGABLE del escenario
(el puente con vacío a los lados, la baranda del balneario, las grietas del
volcán, el hielo de la cumbre…), para que el fondo "diga" su mecánica.

  python3 tools/generate_bg.py puente          # un escenario
  python3 tools/generate_bg.py puente volcan   # varios
  python3 tools/generate_bg.py --all           # los 10

Salida:
  assets/bg/{id}.png          fondo 960x540 listo (unique_path: no sobrescribe)
  tools/ai_raw/bg_{id}_raw.png  crudo de Gemini para inspección
"""
import io
import os
import sys
import time

from PIL import Image

HERE = os.path.dirname(__file__)
ENV_PATH = os.path.join(HERE, '..', '..', 'generate_sprites', '.env')
BG_DIR = os.path.join(HERE, '..', 'assets', 'bg')
RAW_DIR = os.path.join(HERE, 'ai_raw')

MODELS = [
    'gemini-3.1-flash-image-preview',   # Nano Banana 2 (si está disponible)
    'gemini-2.5-flash-image',           # Nano Banana 2.5 Flash (estable)
]

GAME_W, GAME_H = 960, 540   # lienzo del juego (js/core.js)

# ───────────── Estilo: dentro de un cuadro clásico japonés ─────────────
PAINTING = (
    'A CLASSIC TRADITIONAL JAPANESE PAINTING in ukiyo-e woodblock print style, '
    'as if it were a scene painted on an antique Edo-period folding screen (byōbu) '
    'by Hokusai or Hiroshige. The whole image is a FLAT 2D hand-painted '
    'illustration: bold confident black ink outlines, large areas of flat solid '
    'color, a limited refined palette of indigo blue, off-white, deep navy, soft '
    'ochre and a single vermillion-red accent, visible washi paper texture, a calm '
    'pale or gold-leaf sky. '
    'CRITICAL — it must look hand-painted, like an old artwork hanging in a museum: '
    'STRICTLY NOT photorealistic, NOT a 3D render, NOT a video-game screenshot, '
    'NO cinematic lighting, NO realistic cast shadows, NO smooth gradients, '
    'NO depth-of-field blur, NO glossy reflections.'
)

# Escena + SUPERFICIE jugable de cada STAGE (los ids salen de js/data.js)
BACKGROUNDS = {
    'dojo': (
        'the quiet interior of an old samurai dojo at dusk, polished wooden floor, '
        'paper shoji screens and a hanging calligraphy scroll',
        'The flat wooden dojo floor runs across the lower third as the fighting ground.',
    ),
    'puente': (
        'a long red-lacquered arched wooden bridge crossing a deep misty gorge, a '
        'thin river far below, distant blue folded mountains and a pale sky with a '
        'few stylized clouds',
        'The arched bridge deck spans the FULL width as the ONLY footing; to both '
        'sides and below its edges there is empty open void and the far-down river — '
        'it must read clearly that falling off the bridge means certain death.',
    ),
    'bambu': (
        'a dense grove of tall slender green bamboo stalks with soft light filtering '
        'between them and a few drifting leaves',
        'Flat mossy forest ground runs across the lower third as the fighting floor.',
    ),
    'tejado': (
        'the dark tiled rooftops of an Edo-period town at night under a large full '
        'moon, with stylized swirling wind clouds streaking across the sky',
        'A flat tiled rooftop ridge runs across the lower third as the ground, with '
        'visible wind streaks suggesting a constant gale.',
    ),
    'templo': (
        'the stone courtyard of a mountain Buddhist temple at night, a red pagoda to '
        'one side and a large hanging bronze temple bell',
        'A flat stone courtyard runs across the lower third as the fighting ground.',
    ),
    'mercado': (
        'a narrow Edo street market at dusk with wooden stalls, glowing paper '
        'lanterns and hanging cloth banners (noren), now emptied of people',
        'A flat packed-earth street runs across the lower third as the fighting ground.',
    ),
    'volcan': (
        'a barren volcanic plain at night with a smoking vermillion-red mountain in '
        'the distance and rivers of glowing molten lava',
        'The dark cracked ground along the lower third is split by glowing orange '
        'molten cracks that run through the fighting floor.',
    ),
    'playa': (
        'a bright sunny coastal seaside resort at midday, a vivid blue ocean, a '
        'couple of palm trees and a long horizontal wooden veranda railing',
        'Pale sand fills the lower third, and a long raised horizontal wooden railing '
        'platform crosses the middle — an upper ledge that agile fighters can jump onto.',
    ),
    'nieve': (
        'a snowy mountain summit with dark pine trees and gently falling snow under a '
        'cold pale-blue winter sky',
        'Flat glistening icy snow-covered ground runs across the lower third as a '
        'slippery fighting floor.',
    ),
    'barco': (
        'the wooden deck of a Japanese junk ship sailing the open sea at night under '
        'a moon and stars, a big sail and rigging ropes, tall stylized waves around',
        'The flat wooden ship deck spans the lower third as the ground, with rolling '
        'ocean waves visible just beyond the railings.',
    ),
}

BG_PROMPT = (
    '{style}\n\n'
    'Compose ONE WIDE horizontal landscape BACKGROUND (16:9, very wide) for a 2D '
    'fighting-game stage, painted as a single classic Japanese artwork. '
    'SCENE: {desc}. {floor} '
    'Leave the CENTER open and uncluttered for two fighters to stand. '
    'EMPTY stage — absolutely NO people, NO animals, NO characters, NO text, NO '
    'signatures, NO UI. The entire frame is one continuous painted scene.'
)


def load_api_key():
    with open(os.path.abspath(ENV_PATH)) as f:
        for line in f:
            if line.startswith('GOOGLE_API_KEY='):
                return line.split('=', 1)[1].strip()
    raise RuntimeError('GOOGLE_API_KEY no encontrada en generate_sprites/.env')


def generate_image(client, prompt):
    from google.genai import types
    last_err = None
    for model in MODELS:
        for attempt in range(2):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=[prompt],
                    config=types.GenerateContentConfig(response_modalities=['Image']),
                )
                parts = response.parts or (response.candidates and response.candidates[0].content.parts) or []
                for part in parts:
                    if part.inline_data is not None:
                        img = Image.open(io.BytesIO(part.inline_data.data))
                        print(f'    ✔ {model}: {img.size[0]}x{img.size[1]}')
                        return img
                print(f'    … {model}: sin imagen (intento {attempt + 1})')
            except Exception as e:
                last_err = e
                print(f'    ⚠ {model}: {str(e)[:90]}')
                time.sleep(2)
    raise RuntimeError(f'Todos los modelos fallaron: {last_err}')


def unique_path(path):
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    n = 2
    while os.path.exists(f'{base}_{n}{ext}'):
        n += 1
    return f'{base}_{n}{ext}'


def save_raw(img, tag):
    os.makedirs(RAW_DIR, exist_ok=True)
    img.convert('RGB').save(unique_path(os.path.join(RAW_DIR, f'{tag}_raw.png')))


def run_bg(key, client):
    desc, floor = BACKGROUNDS[key]
    print(f'\n🏯 ESCENARIO {key.upper()}')
    prompt = BG_PROMPT.format(style=PAINTING, desc=desc, floor=floor)
    raw = generate_image(client, prompt)
    save_raw(raw, f'bg_{key}')
    # recorte central a 16:9 y escala exacta al lienzo del juego
    img = raw.convert('RGB')
    w, h = img.size
    target = GAME_W / GAME_H
    if w / h > target:
        nw = int(h * target)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    img = img.resize((GAME_W, GAME_H), Image.LANCZOS)
    os.makedirs(BG_DIR, exist_ok=True)
    out = unique_path(os.path.abspath(os.path.join(BG_DIR, f'{key}.png')))
    img.save(out, optimize=True)
    print(f'    💾 {out}')


def main():
    from google import genai
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    keys = list(BACKGROUNDS) if '--all' in args else [a for a in args if a in BACKGROUNDS]
    if not keys:
        print('Ningún escenario válido. Opciones:', ', '.join(BACKGROUNDS))
        return
    client = genai.Client(api_key=load_api_key())
    for k in keys:
        try:
            run_bg(k, client)
        except Exception as e:
            print(f'    ❌ {k}: {e}')
        time.sleep(1)


if __name__ == '__main__':
    main()
