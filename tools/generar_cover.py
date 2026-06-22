#!/usr/bin/env python3
"""
generar_cover.py — portada 630x500 para itch.io con Nano Banana (Gemini image),
en el MISMO estilo ukiyo-e del juego. Escena: el NIÑO contra el GIGANTE en un
duelo de katana, con la GRAN OLA al fondo (Edo / Okinawa, Hokusai).

  python3 tools/generar_cover.py            -> assets/cover.png (630x500)
  python3 tools/generar_cover.py salida.png -> ruta personalizada

Imprime "OK <ruta>" o "ERROR <motivo>".
"""
import io
import os
import sys
import time

from PIL import Image

HERE = os.path.dirname(__file__)
MODELS = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']
COVER_W, COVER_H = 630, 500

# Mismo estilo que generar_uno.py / generate_bg.py
PAINTING = (
    'A CLASSIC TRADITIONAL JAPANESE PAINTING in ukiyo-e woodblock print style, '
    'as if painted on an antique Edo-period folding screen (byōbu) by Hokusai or '
    'Hiroshige. Flat 2D hand-painted illustration: bold black ink outlines, large '
    'areas of flat solid color, a limited refined palette of indigo blue, off-white, '
    'deep navy, soft ochre and a single vermillion-red accent, visible washi paper '
    'texture, calm pale or gold-leaf sky. STRICTLY NOT photorealistic, NOT a 3D '
    'render, NOT a video-game screenshot, NO cinematic lighting, NO realistic '
    'shadows, NO smooth gradients, NO depth-of-field blur.'
)

COVER_PROMPT = (
    '{style}\n\nCompose a striking near-SQUARE vertical-ish KEY ART COVER '
    '(aspect ratio about 5:4). SCENE: a dramatic one-on-one katana duel on a '
    'sandy Okinawan shore at dusk. On the LEFT, a small nimble CHILD samurai in a '
    'short indigo kimono holds a katana in a low ready stance, calm and focused. '
    'On the RIGHT, a HUGE towering GIANT warrior (oni-sized brute, bare-chested, '
    'topknot, massive nōdachi sword) looms over the child — clear size contrast. '
    'They face each other mid-standoff. In the BACKGROUND rises Hokusai\'s GREAT '
    'WAVE: one enormous curling indigo-and-white wave with foam claws arching '
    'across the sky, and a pale gold full moon behind it. Footprints in the sand. '
    'Composition leaves the duel centered and readable. Vermillion-red accents on '
    'the sashes. NO text, NO logo, NO signature, NO frame border. One continuous '
    'painted scene filling the whole image.'
)


def load_api_key():
    v = os.environ.get('GOOGLE_API_KEY') or os.environ.get('GEMINI_API_KEY')
    if v:
        return v.strip()
    candidates = [
        os.path.join(HERE, '..', '.env'),
        os.path.join(HERE, '..', 'server', '.env'),
        os.path.join(HERE, '..', '..', 'generate_sprites', '.env'),
    ]
    for pth in candidates:
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


def fit_cover(raw):
    """recorta al centro al ratio 630x500 y reescala."""
    raw = raw.convert('RGB')
    w, h = raw.size
    target = COVER_W / COVER_H
    if w / h > target:
        nw = int(h * target)
        raw = raw.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        raw = raw.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return raw.resize((COVER_W, COVER_H), Image.LANCZOS)


def main():
    out = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else \
        os.path.abspath(os.path.join(HERE, '..', 'assets', 'cover.png'))
    try:
        from google import genai
        client = genai.Client(api_key=load_api_key())
        img = fit_cover(generate_image(client, COVER_PROMPT.format(style=PAINTING)))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        img.save(out, optimize=True)
        print('OK ' + out)
    except Exception as e:
        print('ERROR ' + str(e)[:200])


if __name__ == '__main__':
    main()
