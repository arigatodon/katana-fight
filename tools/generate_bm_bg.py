#!/usr/bin/env python3
"""
generate_bm_bg.py — fondos LARGOS panorámicos para el spin-off beat 'em up
(KATANA RONIN), generados con Nano Banana 2 (Gemini image).

A diferencia de generate_bg.py (escenarios cuadrados 960x540 para el duelo
1v1), aquí cada etapa es una banda HORIZONTAL muy ancha por la que el jugador
avanza haciendo scroll: un camino continuo que recorre toda la imagen, de
izquierda a derecha, hasta el jefe yokai del final.

Mismo estilo de cuadro clásico japonés (ukiyo-e / biombo byōbu): plano, tinta,
color liso, NADA 3D ni cinematográfico. El suelo jugable corre por el tercio
inferior a lo ancho de TODA la banda.

  python3 tools/generate_bm_bg.py calle           # una etapa
  python3 tools/generate_bm_bg.py calle bambu      # varias
  python3 tools/generate_bm_bg.py --all            # todas

Salida:
  assets/bm_bg/{id}.png            banda 2880x540 lista (no sobrescribe)
  tools/ai_raw/bm_{id}_raw.png     crudo de Gemini para inspección
"""
import io
import os
import sys
import time

from PIL import Image

HERE = os.path.dirname(__file__)
# .env local del proyecto primero; si no, el compartido del workspace
ENV_PATH = os.path.join(HERE, '..', '.env')
if not os.path.exists(ENV_PATH):
    ENV_PATH = os.path.join(HERE, '..', '..', 'generate_sprites', '.env')
BG_DIR = os.path.join(HERE, '..', 'assets', 'bm_bg')
RAW_DIR = os.path.join(HERE, 'ai_raw')

# Nano Banana 2 primero; si no está, caemos al Flash estable.
MODELS = [
    'gemini-3-pro-image-preview',       # Nano Banana 2 (Gemini 3 Pro Image)
    'gemini-3-pro-image',
    'gemini-3.1-flash-image-preview',
    'gemini-2.5-flash-image',           # Nano Banana 2.5 Flash (estable)
]

# El lienzo del juego es 960x540 → la banda tiene 540 de alto. El ancho NO se
# fuerza: ajustamos cada panel a la altura SIN recortar (para no perder cielo y
# suelo ni "hacer zoom") y unimos PANELS paneles en una banda ancha y larga.
WORLD_H = 540
PANELS = 2          # paneles 21:9 unidos → banda ≈ 2.5 pantallas, sin estirar
ASPECT = '21:9'     # proporción que Nano Banana 2 admite como más ancha

PAINTING = (
    'A CLASSIC TRADITIONAL JAPANESE PAINTING in ukiyo-e woodblock print style, '
    'as if painted on an antique Edo-period folding screen (byōbu) by Hokusai or '
    'Hiroshige. The whole image is a FLAT 2D hand-painted illustration: bold '
    'confident black ink outlines, large areas of flat solid color, a limited '
    'refined palette of indigo blue, off-white, deep navy, soft ochre and a single '
    'vermillion-red accent, visible washi paper texture, a calm pale or gold-leaf '
    'sky. '
    'CRITICAL — it must look hand-painted, like an old artwork in a museum: '
    'STRICTLY NOT photorealistic, NOT a 3D render, NOT a video-game screenshot, '
    'NO cinematic lighting, NO realistic cast shadows, NO smooth gradients, '
    'NO depth-of-field blur, NO glossy reflections.'
)

# id → (escena, descripción del camino continuo)
STAGES = {
    'calle': (
        'a long Edo-period town street at dusk seen straight on, lined on both '
        'sides with wooden machiya houses, tiled roofs, hanging paper lanterns and '
        'cloth shop banners (noren), receding gently into a misty distance',
        'a continuous flat packed-earth street',
    ),
    'bambu': (
        'a long path winding through a dense grove of tall slender green bamboo '
        'stalks, soft light filtering between them, a few drifting leaves and a '
        'distant pale sky',
        'a continuous flat mossy forest path',
    ),
    'rio': (
        'a long red-lacquered wooden riverbank walkway beside a wide calm river '
        'with stylized rolling waves, distant blue folded mountains and a pale sky '
        'with a few stylized clouds',
        'a continuous flat wooden riverbank boardwalk',
    ),
    'costa': (
        'a long rocky sea coast at golden hour, a vivid blue ocean with tall '
        'stylized cresting waves on the right, scattered pines on weathered cliffs '
        'and a few drifting gulls',
        'a continuous flat sandy-and-stone coastal trail',
    ),
    'monte': (
        'a long snowy mountain trail at dusk climbing past dark twisted pines and '
        'a distant red temple gate (torii), gently falling snow under a cold '
        'pale-blue sky',
        'a continuous flat snow-covered mountain path',
    ),
}

PROMPT = (
    '{style}\n\n'
    'Compose ONE EXTREMELY WIDE horizontal PANORAMIC BACKGROUND (about 21:9, like a '
    'long emaki hand-scroll) for a side-scrolling beat-em-up stage, painted as a '
    'single continuous classic Japanese artwork that reads left to right. '
    'SCENE: {desc}. '
    'A SINGLE CONTINUOUS WALKING SURFACE — {floor} — runs UNBROKEN across the FULL '
    'width along the lower third, the same ground level from the far left edge to '
    'the far right edge, with nothing blocking the path. '
    'EMPTY stage — absolutely NO people, NO animals, NO characters, NO text, NO '
    'signatures, NO UI, NO frame or border. The whole frame is one seamless painted '
    'scene that could scroll endlessly.'
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
        # primero con pista de proporción (Nano Banana 2); si el modelo no la
        # admite, reintenta sin ella.
        configs = [
            types.GenerateContentConfig(
                response_modalities=['Image'],
                image_config=types.ImageConfig(aspect_ratio=ASPECT),
            ),
            types.GenerateContentConfig(response_modalities=['Image']),
        ]
        for config in configs:
            try:
                response = client.models.generate_content(
                    model=model, contents=[prompt], config=config)
                parts = response.parts or (response.candidates and
                        response.candidates[0].content.parts) or []
                for part in parts:
                    if part.inline_data is not None:
                        img = Image.open(io.BytesIO(part.inline_data.data))
                        print(f'    ✔ {model}: {img.size[0]}x{img.size[1]}')
                        return img
                print(f'    … {model}: sin imagen')
            except Exception as e:
                last_err = e
                print(f'    ⚠ {model}: {str(e)[:90]}')
                time.sleep(1)
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


def fit_h(img):
    """ajusta a la altura de la banda SIN recortar (conserva todo el cuadro)."""
    img = img.convert('RGB')
    w, h = img.size
    nw = max(1, round(w * WORLD_H / h))
    return img.resize((nw, WORLD_H), Image.LANCZOS)


def run_stage(key, client):
    desc, floor = STAGES[key]
    print(f'\n🏯 ETAPA {key.upper()}')
    prompt = PROMPT.format(style=PAINTING, desc=desc, floor=floor)
    panels = []
    for i in range(PANELS):
        raw = generate_image(client, prompt)
        save_raw(raw, f'bm_{key}_{i}')
        panels.append(fit_h(raw))
    # unir paneles en una banda horizontal continua
    total_w = sum(p.size[0] for p in panels)
    band = Image.new('RGB', (total_w, WORLD_H))
    x = 0
    for p in panels:
        band.paste(p, (x, 0))
        x += p.size[0]
    os.makedirs(BG_DIR, exist_ok=True)
    out = unique_path(os.path.abspath(os.path.join(BG_DIR, f'{key}.png')))
    band.save(out, optimize=True)
    print(f'    💾 {out}  ({total_w}x{WORLD_H})')


def main():
    from google import genai
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    keys = list(STAGES) if '--all' in args else [a for a in args if a in STAGES]
    if not keys:
        print('Ninguna etapa válida. Opciones:', ', '.join(STAGES))
        return
    client = genai.Client(api_key=load_api_key())
    for k in keys:
        try:
            run_stage(k, client)
        except Exception as e:
            print(f'    ❌ {k}: {e}')
        time.sleep(1)


if __name__ == '__main__':
    main()
