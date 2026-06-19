#!/usr/bin/env python3
"""
generate_props.py — elementos sueltos con TRANSPARENCIA para capas de escenario.

Genera adornos aislados (olas, koi, bambú, pino nevado, faroles, nubes, grullas,
hojas…) en estilo ukiyo-e sobre fondo magenta puro, y los recorta a PNG con
transparencia. La idea: montar varias CAPAS por escenario (unas detrás de los
luchadores, otras delante) y animarlas por código —olas que se desplazan, koi
que saltan, bambú al frente, hojas cayendo— para una visual más rica. Muchos son
reutilizables de una etapa a otra (un koi sirve en el barco y en el puente, una
grulla en cualquier cielo, etc.).

  python3 tools/generate_props.py koi              # un elemento
  python3 tools/generate_props.py ola koi bambu    # varios
  python3 tools/generate_props.py --all            # todos

Salida:
  assets/props/{id}.png          elemento recortado con alfa (unique_path)
  tools/ai_raw/prop_{id}_raw.png crudo de Gemini (con el magenta) para inspección
"""
import io
import os
import sys
import time

from PIL import Image

HERE = os.path.dirname(__file__)
ENV_PATH = os.path.join(HERE, '..', '..', 'generate_sprites', '.env')
PROPS_DIR = os.path.join(HERE, '..', 'assets', 'props')
RAW_DIR = os.path.join(HERE, 'ai_raw')

MODELS = [
    'gemini-3.1-flash-image-preview',
    'gemini-2.5-flash-image',
]

# Estilo plano para que el recorte salga limpio (sin textura de papel ni sombras)
PROP_STYLE = (
    'Traditional Japanese ukiyo-e woodblock illustration: bold confident black ink '
    'outline, flat solid areas of color, limited palette (indigo blue, off-white, '
    'vermillion-red, ochre, green), NO gradients, NO realistic shading, NO 3D, '
    'NO cast shadow.'
)

# id → (descripción, capa sugerida, en qué etapas se recicla)
# 'capa': 'frente' (delante de los luchadores) | 'fondo' (detrás) | 'cielo' | 'suelo'
PROPS = {
    'ola_alta':   ('one single big stylized ocean wave crest curling over with white '
                   'foam fingers, like Hokusai\'s Great Wave, deep indigo and white, side view',
                   'frente', 'barco, playa, puente'),
    'ola_baja':   ('one single low wide rolling sea wave with a line of white foam on '
                   'top, indigo and white, side view, wide and short',
                   'frente', 'barco, playa'),
    'koi':        ('one single leaping koi carp fish arching upward in mid-air, orange '
                   'white and black markings, side view facing right, a few water droplets',
                   'frente', 'barco, puente'),
    'bambu_frente':('two or three tall slender bamboo stalks with a few leaves, seen '
                   'up close as a foreground layer, full height vertical, painted in '
                   'MUTED desaturated dark indigo-green sumi-e ink-wash with soft thin '
                   'ink outlines, quiet and elegant, NOT bright green, NOT vivid, NOT '
                   'cartoonish',
                   'frente', 'bambu'),
    'rama_bambu': ('one single elegant slender arching bamboo branch with a few small '
                   'leaves entering from one side, horizontal, MUTED desaturated dark '
                   'green sumi-e ink-wash style, soft and subtle, NOT bright, NOT vivid',
                   'cielo', 'bambu'),
    'pino_nieve': ('one single dark green pine tree branch laden with thick white snow, '
                   'entering from one side, horizontal',
                   'frente', 'nieve'),
    'farol':      ('one single hanging round red and white paper lantern (chochin) with '
                   'a tassel hanging from a cord, vertical',
                   'cielo', 'mercado, templo'),
    'nube':       ('one single long flat stylized cloud band, off-white and pale grey '
                   'with a thin ink outline, horizontal wisp',
                   'cielo', 'tejado, puente, nieve, playa'),
    'grulla':     ('one single white crane bird flying with wings spread wide, side '
                   'view, elegant',
                   'cielo', 'cualquier cielo'),
    'hojas':      ('a small loose scattering of a few falling bamboo leaves drifting, '
                   'green, spread apart',
                   'frente', 'bambu, dojo'),
    'brasas':     ('a loose scattering of glowing orange and red embers and sparks '
                   'rising upward, small bright flecks with a few thin wisps of smoke',
                   'frente', 'volcan'),
    'sakura':     ('a loose scattering of pink cherry blossom petals (sakura) drifting '
                   'and falling, spread apart with empty space between them',
                   'frente', 'templo, dojo, cualquiera'),
    'banderola':  ('one single vertical hanging cloth shop banner (noren) in indigo '
                   'blue with a simple round white family-crest motif (mon) in the '
                   'center, rectangular, the cloth waving slightly. NO text, NO letters',
                   'frente', 'mercado'),
    'pajaros':    ('a small flock of several little birds in flight as simple black ink '
                   'silhouettes, scattered in a loose V formation, side view',
                   'cielo', 'cualquier cielo'),
    'nieve_rafaga':('a sweeping diagonal gust of windblown snow: many small white '
                   'snowflakes and a soft white wisp, spread across in a flurry',
                   'frente', 'nieve'),
}

PROP_PROMPT = (
    '{style}\n\n'
    'Draw EXACTLY ONE single isolated element: {desc}. '
    'NOTHING else in the image — no scenery, no ground, no horizon, no other '
    'objects, no text, no frame, no border. The element is centered with generous '
    'empty margin around it. '
    'BACKGROUND: the ENTIRE background is one perfectly uniform flat solid pure '
    'magenta color #FF00FF (RGB 255,0,255), so the element can be cut out cleanly.'
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


def chroma_key_magenta(im, threshold=130):
    """Vuelve transparente todo lo que sea magenta (o su halo). Igual técnica
    que las piezas de personaje en generate_art.py."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((r - 255) ** 2 + g ** 2 + (b - 255) ** 2) ** 0.5
            if d < threshold:
                px[x, y] = (0, 0, 0, 0)
            elif r > 150 and b > 150 and g < 130 and abs(r - b) < 90:
                # halo magenta semi-mezclado en los bordes
                px[x, y] = (0, 0, 0, 0)
    return im


def run_prop(key, client):
    desc, capa, donde = PROPS[key]
    print(f'\n🎴 ELEMENTO {key.upper()}  (capa: {capa} · recicla en: {donde})')
    prompt = PROP_PROMPT.format(style=PROP_STYLE, desc=desc)
    raw = generate_image(client, prompt)
    save_raw(raw, f'prop_{key}')
    keyed = chroma_key_magenta(raw)
    bbox = keyed.getbbox()
    if bbox:
        keyed = keyed.crop(bbox)
    os.makedirs(PROPS_DIR, exist_ok=True)
    out = unique_path(os.path.abspath(os.path.join(PROPS_DIR, f'{key}.png')))
    keyed.save(out, optimize=True)
    print(f'    💾 {out}  ({keyed.size[0]}x{keyed.size[1]})')


def main():
    from google import genai
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    keys = list(PROPS) if '--all' in args else [a for a in args if a in PROPS]
    if not keys:
        print('Ningún elemento válido. Opciones:', ', '.join(PROPS))
        return
    client = genai.Client(api_key=load_api_key())
    for k in keys:
        try:
            run_prop(k, client)
        except Exception as e:
            print(f'    ❌ {k}: {e}')
        time.sleep(1)


if __name__ == '__main__':
    main()
