#!/usr/bin/env python3
"""
generar_uno.py — genera UN fondo o UN elemento para Katana Fight con Nano Banana
(Gemini image), manteniendo el estilo gráfico del juego. Lo invoca el editor de
escenarios (escena_editor.html) a través del endpoint /api/generar del servidor.

  python3 tools/generar_uno.py bg   <id> "una descripción de la escena"
  python3 tools/generar_uno.py prop <id> "una descripción del elemento"

Salida:
  assets/bg/{id}.png      fondo 960x540
  assets/props/{id}.png   elemento recortado con transparencia
Imprime una línea "OK <ruta>" si todo fue bien, o "ERROR <motivo>".
"""
import io
import os
import sys
import time

from PIL import Image

HERE = os.path.dirname(__file__)
ENV_PATH = os.path.join(HERE, '..', '..', 'generate_sprites', '.env')
BG_DIR = os.path.join(HERE, '..', 'assets', 'bg')
PROPS_DIR = os.path.join(HERE, '..', 'assets', 'props')

MODELS = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']
GAME_W, GAME_H = 960, 540

# Estilo del juego — el MISMO que usan generate_bg.py / generate_props.py
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
PROP_STYLE = (
    'Traditional Japanese ukiyo-e woodblock illustration: bold confident black ink '
    'outline, flat solid areas of color, limited palette (indigo blue, off-white, '
    'vermillion-red, ochre, green), NO gradients, NO realistic shading, NO 3D, '
    'NO cast shadow.'
)
BG_PROMPT = (
    '{style}\n\nCompose ONE WIDE horizontal landscape BACKGROUND (16:9, very wide) '
    'for a 2D fighting-game stage, painted as a single classic Japanese artwork. '
    'SCENE: {desc}. The lower third is flat ground where two fighters will stand; '
    'leave the CENTER open and uncluttered. EMPTY stage — absolutely NO people, NO '
    'characters, NO text, NO signatures. The entire frame is one continuous painted scene.'
)
PROP_PROMPT = (
    '{style}\n\nDraw EXACTLY ONE single isolated element: {desc}. NOTHING else — no '
    'scenery, no ground, no horizon, no other objects, no text, no frame. The element '
    'is centered with generous empty margin. BACKGROUND: the ENTIRE background is one '
    'perfectly uniform flat solid pure magenta color #FF00FF (RGB 255,0,255), so it '
    'can be cut out cleanly.'
)


def load_api_key():
    # 1) variable de entorno · 2) .env del propio proyecto · 3) workspace
    v = os.environ.get('GOOGLE_API_KEY') or os.environ.get('GEMINI_API_KEY')
    if v:
        return v.strip()
    candidates = [
        os.path.join(HERE, '..', '.env'),            # katana_fight/.env (del proyecto)
        os.path.join(HERE, '..', 'server', '.env'),
        os.path.join(HERE, '..', '..', 'generate_sprites', '.env'),
        os.path.join(HERE, '..', '..', 'generate_sprites1', '.env'),
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
    raise RuntimeError('no encontré GOOGLE_API_KEY (pon un .env en el proyecto o exporta la variable)')


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


def chroma_key_magenta(im, threshold=130):
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((r - 255) ** 2 + g ** 2 + (b - 255) ** 2) ** 0.5
            if d < threshold or (r > 150 and b > 150 and g < 130 and abs(r - b) < 90):
                px[x, y] = (0, 0, 0, 0)
    return im


def do_bg(client, idd, desc):
    raw = generate_image(client, BG_PROMPT.format(style=PAINTING, desc=desc)).convert('RGB')
    w, h = raw.size
    target = GAME_W / GAME_H
    if w / h > target:
        nw = int(h * target); raw = raw.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target); raw = raw.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    raw = raw.resize((GAME_W, GAME_H), Image.LANCZOS)
    os.makedirs(BG_DIR, exist_ok=True)
    out = os.path.abspath(os.path.join(BG_DIR, idd + '.png'))
    raw.save(out, optimize=True)
    return out


def do_prop(client, idd, desc):
    raw = generate_image(client, PROP_PROMPT.format(style=PROP_STYLE, desc=desc))
    keyed = chroma_key_magenta(raw)
    bbox = keyed.getbbox()
    if bbox:
        keyed = keyed.crop(bbox)
    os.makedirs(PROPS_DIR, exist_ok=True)
    out = os.path.abspath(os.path.join(PROPS_DIR, idd + '.png'))
    keyed.save(out, optimize=True)
    return out


def main():
    if len(sys.argv) < 4:
        print('ERROR uso: generar_uno.py bg|prop <id> "<desc>"'); return
    tipo, idd, desc = sys.argv[1], sys.argv[2], ' '.join(sys.argv[3:])
    idd = ''.join(c for c in idd if c.isalnum() or c in '_-').lower()[:32]
    if not idd or tipo not in ('bg', 'prop'):
        print('ERROR id o tipo inválido'); return
    try:
        from google import genai
        client = genai.Client(api_key=load_api_key())
        out = (do_bg if tipo == 'bg' else do_prop)(client, idd, desc)
        print('OK ' + out)
    except Exception as e:
        print('ERROR ' + str(e)[:200])


if __name__ == '__main__':
    main()
