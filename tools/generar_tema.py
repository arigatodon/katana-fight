#!/usr/bin/env python3
"""
generar_tema.py — imágenes para el tema de la página de itch.io de Katana Fight,
en el MISMO estilo ukiyo-e del juego, con Nano Banana (Gemini image).

Genera:
  banner_itch.png       1600x450  cabecera ancha (la Gran Ola + duelo)
  background_itch.png   1920x1080 fondo de página oscuro y de bajo contraste

  python3 tools/generar_tema.py [banner|fondo|todo]   (por defecto: todo)

Imprime "OK <ruta>" por cada imagen, o "ERROR <motivo>".
"""
import io
import os
import sys
import time

from PIL import Image, ImageEnhance

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, '..'))
MODELS = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']

PAINTING = (
    'A CLASSIC TRADITIONAL JAPANESE PAINTING in ukiyo-e woodblock print style, '
    'as if painted on an antique Edo-period folding screen (byōbu) by Hokusai or '
    'Hiroshige. Flat 2D hand-painted illustration: bold black ink outlines, large '
    'areas of flat solid color, a limited refined palette of indigo blue, off-white, '
    'deep navy, soft ochre and a single vermillion-red accent, visible washi paper '
    'texture. STRICTLY NOT photorealistic, NOT a 3D render, NOT a video-game '
    'screenshot, NO cinematic lighting, NO realistic shadows, NO smooth gradients.'
)

BANNER_PROMPT = (
    '{style}\n\nCompose a VERY WIDE horizontal BANNER (cinematic ~16:4 letterbox). '
    'SCENE: Hokusai\'s GREAT WAVE — one enormous curling indigo-and-white wave with '
    'foam claws sweeping across the frame from the right, a pale gold full moon low '
    'in the off-white sky. On the sandy shore at the LEFT, two tiny duelist '
    'silhouettes face off: a small CHILD samurai and a HUGE towering GIANT warrior, '
    'katanas drawn. Lots of calm open sky in the upper area. A single vermillion-red '
    'accent. NO text, NO logo, NO signature, NO frame border. One continuous scene.'
)

BG_PROMPT = (
    '{style}\n\nCreate a SEAMLESS subtle BACKGROUND TEXTURE: the traditional Japanese '
    'seigaiha wave-scale pattern (overlapping concentric arcs like calm sea waves), '
    'painted in VERY DARK deep navy and near-black indigo with the faintest off-white '
    'outlines, on dark washi paper. EXTREMELY LOW CONTRAST, muted, quiet, almost '
    'monochrome — it must sit BEHIND page text without distracting. Evenly tiled all '
    'over the frame. NO focal point, NO bright areas, NO text, NO characters.'
)


def load_api_key():
    v = os.environ.get('GOOGLE_API_KEY') or os.environ.get('GEMINI_API_KEY')
    if v:
        return v.strip()
    for pth in [os.path.join(ROOT, '.env'), os.path.join(ROOT, 'server', '.env'),
                os.path.join(ROOT, '..', 'generate_sprites', '.env')]:
        try:
            with open(os.path.abspath(pth)) as f:
                for line in f:
                    line = line.strip()
                    for k in ('GOOGLE_API_KEY=', 'GEMINI_API_KEY='):
                        if line.startswith(k):
                            return line[len(k):].strip().strip('"').strip("'")
        except Exception:
            pass
    raise RuntimeError('no encontré GOOGLE_API_KEY')


def generate_image(client, prompt):
    from google.genai import types
    last = None
    for model in MODELS:
        for _ in range(2):
            try:
                resp = client.models.generate_content(
                    model=model, contents=[prompt],
                    config=types.GenerateContentConfig(response_modalities=['Image']))
                parts = resp.parts or (resp.candidates and resp.candidates[0].content.parts) or []
                for part in parts:
                    if part.inline_data is not None:
                        return Image.open(io.BytesIO(part.inline_data.data))
            except Exception as e:
                last = e
                time.sleep(2)
    raise RuntimeError('generación fallida: %s' % last)


def fit(raw, w, h):
    raw = raw.convert('RGB')
    W, H = raw.size
    target = w / h
    if W / H > target:
        nw = int(H * target); raw = raw.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
    else:
        nh = int(W / target); raw = raw.crop((0, (H - nh) // 2, W, (H - nh) // 2 + nh))
    return raw.resize((w, h), Image.LANCZOS)


def darken(im, mix=0.55, contrast=0.7):
    """mezcla hacia negro y baja contraste para un fondo discreto."""
    im = ImageEnhance.Contrast(im).enhance(contrast)
    black = Image.new('RGB', im.size, (8, 8, 16))
    return Image.blend(im, black, mix)


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else 'todo'
    from google import genai
    client = genai.Client(api_key=load_api_key())

    if what in ('banner', 'todo'):
        try:
            img = fit(generate_image(client, BANNER_PROMPT.format(style=PAINTING)), 1600, 450)
            out = os.path.join(ROOT, 'banner_itch.png')
            img.save(out, optimize=True)
            print('OK ' + out)
        except Exception as e:
            print('ERROR banner: ' + str(e)[:200])

    if what in ('fondo', 'todo'):
        try:
            img = darken(fit(generate_image(client, BG_PROMPT.format(style=PAINTING)), 1920, 1080))
            out = os.path.join(ROOT, 'background_itch.png')
            img.save(out, optimize=True)
            print('OK ' + out)
        except Exception as e:
            print('ERROR fondo: ' + str(e)[:200])


if __name__ == '__main__':
    main()
