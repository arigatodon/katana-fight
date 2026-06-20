#!/usr/bin/env python3
"""
generate_art.py — arte ukiyo-e para Katana Fight con Nano Banana (Gemini image).

Estilo: grabado japonés (ukiyo-e), como og.png — azules índigo, contornos
firmes, color plano, sol rojo. Genera fondos de escenario y personajes,
ajustados a los tamaños del juego (lienzo 960x540, luchadores ~190px de alto).

Modos:
  python3 tools/generate_art.py bg dojo            # un fondo de escenario
  python3 tools/generate_art.py bg --all           # los 10 fondos
  python3 tools/generate_art.py char ronin         # un personaje (figura suelta, fondo transparente)
  python3 tools/generate_art.py char --all
  python3 tools/generate_art.py char nuevo --desc "una geisha guerrera con abanico de hierro, kimono dorado"
  python3 tools/generate_art.py sheet ronin        # cuadrícula de poses (experimental)

Salidas:
  assets/bg/{id}.png        fondo 960x540 listo para el juego
  assets/chars/{id}.png     figura del personaje con transparencia
  assets/sheets/{id}.png    cuadrícula de poses normalizada (modo sheet)
  tools/ai_raw/{...}_raw.png crudo de Gemini, para inspección
"""
import io
import os
import sys
import time

from PIL import Image

# ───────────────────────── Config ─────────────────────────
HERE = os.path.dirname(__file__)
ENV_PATH = os.path.join(HERE, '..', '..', 'generate_sprites', '.env')
BG_DIR = os.path.join(HERE, '..', 'assets', 'bg')
CHAR_DIR = os.path.join(HERE, '..', 'assets', 'chars')
SHEET_DIR = os.path.join(HERE, '..', 'assets', 'sheets')
RAW_DIR = os.path.join(HERE, 'ai_raw')

MODELS = [
    'gemini-3.1-flash-image-preview',   # Nano Banana 2 (última generación)
    'gemini-2.5-flash-image',           # Nano Banana 2.5 Flash (estable)
]

# Tamaños del juego (de js/core.js: canvas 960x540, GROUND = H-80)
GAME_W, GAME_H = 960, 540

# ───────────────────── Estilo común ukiyo-e ─────────────────────
UKIYOE = (
    'Traditional Japanese ukiyo-e woodblock print style, like Hokusai and '
    'Hiroshige: bold confident black outlines, flat layered colors, limited '
    'palette of indigo blue, off-white, deep navy and a single vermillion-red '
    'accent, subtle paper texture, no modern shading, no gradients on skin, '
    'elegant Edo-period aesthetic.'
)

# ───────────────────── Fondos de escenario ─────────────────────
# Descripción de la ESCENA (sin luchadores) para cada escenario del juego.
BACKGROUNDS = {
    'dojo':    'the interior of an old samurai dojo at dusk, wooden floor and paper shoji screens, empty, seen from the side',
    'puente':  'a long arched wooden bridge over a misty river at twilight, distant mountains',
    'bambu':   'a dense green bamboo forest with tall stalks and soft light filtering through',
    'tejado':  'the rooftops of an Edo-period town at night under a purple sky, tiled roofs and a full moon',
    'templo':  'the courtyard of a mountain Buddhist temple with a pagoda and a hanging bronze bell at night',
    'mercado': 'a bustling Edo street market at dusk with stalls, lanterns and hanging cloth banners, now empty',
    'volcan':  'a barren volcanic plain with glowing lava cracks and a smoking red mountain at night',
    'playa':   'a sunny coastal seaside resort with a wooden railing, palm trees and bright blue ocean at midday',
    'nieve':   'a snowy mountain summit with pine trees and falling snow under a cold blue sky',
    'barco':   'the wooden deck of a Japanese junk ship sailing the open sea at night under stars and a moon',
}

BG_PROMPT = (
    '{style}\n\n'
    'Draw a wide horizontal BACKGROUND SCENE (16:9, landscape) for a 2D fighting '
    'game stage: {desc}. Empty stage, NO people, NO characters, NO text. '
    'The lower third is flat ground where fighters will stand. Composition leaves '
    'the center open. Cinematic, atmospheric, suitable as a game backdrop.'
)

# ───────────────────────── Personajes ─────────────────────────
# Apariencia de cada personaje (de js/data.js). El esqueleto del juego los
# anima; aquí solo importa el aspecto y que estén de cuerpo entero, de perfil.
CHARACTERS = {
    'ronin':    'a wandering ronin samurai, balanced build, off-white kimono with a dark red hakama and a red headband (hachimaki), holding a katana',
    'maestro':  'an old sword master with long white beard and hair, grey kimono, calm and wise, holding a katana',
    'bandido':  'a fierce bandit swordsman, brown ragged kimono, orange sash, wild hair, aggressive stance, holding a katana',
    'monja':    'a warrior nun (onna-bugeisha), white robe with a purple hakama, head wrap, serene, holding a katana',
    'nino':     'a small child prodigy samurai, light blue kimono, yellow accents, short, holding a katana too big for him',
    'gigante':  'a huge towering giant samurai, brown kimono, massive muscular build, slow and powerful, holding a large katana',
    'cazadora': 'a huntress warrior, green hunting garb, agile and lean, holding a katana',
    'espectro': 'a pale ghostly spectre swordsman, translucent bluish-white robes, eerie, holding a katana',
    # jefes secretos: YOKAI gigantes del folclore japonés
    'gallina':  'a giant TENGU yokai (crow demon) warrior, red face with a long nose and black feathered wings, dark red robes, fierce, holding a katana',
    'sapo':     'a giant KAPPA yokai (green water demon) warrior, turtle shell on the back, a water-filled dish on top of its head, webbed hands, wearing a tattered kimono, holding a katana',
    'mapache':  'a giant TANUKI yokai (shapeshifting raccoon-dog spirit) warrior, brown fur, mischievous, wearing a kimono with a leaf on its head, holding a katana',
    'tiburon':  'a giant UMIBOZU yokai (dark sea spirit), huge round shadowy black-and-deep-blue body, glowing eyes, dripping with seawater, holding a katana',
    'abuela':   'a giant YAMAUBA yokai (mountain hag witch), wild grey hair, pale weathered skin, ragged earth-toned kimono, eerie and fierce, holding a katana',
}

CHAR_PROMPT = (
    '{style}\n\n'
    'Draw EXACTLY ONE single character, ONE individual only: {desc}. '
    'FULL BODY from head to feet, SIDE PROFILE VIEW facing RIGHT, neutral '
    'fighting stance, feet on the ground. '
    'CRITICAL: do NOT repeat the character, do NOT make a turnaround, do NOT '
    'show multiple poses or copies — only ONE figure, centered in the frame '
    'with margin around it. '
    'NO ground, NO scenery, NO text. '
    'BACKGROUND: the ENTIRE background is flat solid pure magenta #FF00FF, no shadows.'
)

# ───────────── Piezas de recorte (origami / South Park) ─────────────
# Cada personaje se arma con piezas separadas que el esqueleto del juego
# articula: torso (con cabeza), una pierna (se reutiliza para ambas) y los
# dos brazos sujetando la katana a dos manos (giran en el hombro).
PARTS = ['torso', 'pierna', 'brazos']

PART_COMMON = (
    '{style}\n\n'
    'Flat PAPER CUTOUT puppet piece for a 2D animation rig (South Park style '
    'cutout, but drawn in ukiyo-e coloring). ONE single isolated body part only, '
    'bold black outline, flat color, SIDE VIEW facing RIGHT. '
    'Draw NOTHING else — no other body parts, no text, no frame. '
    'BACKGROUND: the ENTIRE background is flat solid pure magenta #FF00FF.\n\n'
)
PART_PROMPTS = {
    'torso': (
        'Draw ONLY the TORSO piece of {desc}: the chest and belly wearing the '
        'kimono with BROAD kimono shoulders that fully cover the shoulder area '
        '(so detached arms can tuck underneath without a visible seam), WITH the '
        'head and face on top (hairstyle and any headwear exactly as described in '
        'the character) and the waist/hips at the bottom. Vertical orientation. '
        'ABSOLUTELY NO arms, NO hands, NO legs, NO sword.'
    ),
    'pierna': (
        'Draw ONE single isolated LEG only, like a doll accessory floating in '
        'empty space: ONE leg of {desc} wearing ONE wide pleated hakama trouser '
        'leg (the hakama is a divided trouser, so only ONE trouser leg), from '
        'the hip joint at the TOP to the foot with a sandal at the BOTTOM, '
        'slightly bent, vertical. '
        'CRITICAL: only ONE leg — NO second leg, NO wide skirt covering two '
        'legs, NO torso, NO arms, NO head, NO sword. Surrounded entirely by magenta.'
    ),
    'brazos': (
        'Draw a DETACHED pair of slim arms only, like a doll accessory floating '
        'in empty space: two thin arms with a CLOSE-FITTING tight under-sleeve '
        '(NO wide bulky kimono sleeves, NO loose hanging fabric) and two hands '
        'gripping a katana with a two-handed grip, cut cleanly at the shoulder '
        'sockets on the LEFT with NARROW shoulder ends (small, so they tuck under '
        'the torso piece), the katana blade extending to the RIGHT roughly '
        'horizontal. '
        'CRITICAL: NO wide kimono sleeves, NO chest, NO torso, NO body, NO neck, '
        'NO head, NO legs between or behind the arms — ONLY the two slim floating '
        'arms and the sword, surrounded entirely by magenta.'
    ),
}


def run_parts(key, client, desc=None):
    desc = desc or CHARACTERS[key]
    print(f'\n🧩 PIEZAS {key.upper()}')
    out_dir = os.path.abspath(os.path.join(CHAR_DIR, '..', 'parts', key))
    os.makedirs(out_dir, exist_ok=True)
    for part in PARTS:
        print(f'  · {part}')
        prompt = PART_COMMON.format(style=UKIYOE) + PART_PROMPTS[part].format(desc=desc)
        try:
            raw = generate_image(client, prompt)
        except Exception as e:
            print(f'    ❌ {part}: {e}')
            continue
        save_raw(raw, f'parts_{key}_{part}')
        keyed = chroma_key_magenta(raw)
        bbox = keyed.getbbox()
        if bbox:
            keyed = keyed.crop(bbox)
        dest = unique_path(os.path.join(out_dir, f'{part}.png'))
        keyed.save(dest)
        print(f'    💾 {os.path.basename(dest)} ({keyed.size[0]}x{keyed.size[1]})')
        time.sleep(1)


# Cuadrícula de poses (experimental): filas = animaciones.
SHEET_COLS, SHEET_ROWS = 4, 4
SHEET_CELL_W, SHEET_CELL_H = 96, 192
SHEET_PROMPT = (
    '{style}\n\n'
    'Sprite sheet of ONE character for a 2D katana fighting game. CHARACTER: {desc}.\n'
    'Layout: a GRID of 4 COLUMNS x 4 ROWS (16 cells), all cells the same size, '
    'character always full-body SIDE VIEW FACING RIGHT, same scale in every cell, '
    'feet on the same baseline near the bottom of each cell, centered. Clear gap '
    'between cells. NO grid lines, NO text, NO numbers.\n'
    'POSES by row, left to right:\n'
    'ROW 1 (stance/walk): standing guard stance, walk step 1, walk step 2, walk step 3\n'
    'ROW 2 (jump): crouch before jump, rising in air, apex airborne, falling down\n'
    'ROW 3 (attack): katana raised high wind-up, full forward slash extended, recovery after slash, defensive guard with katana vertical\n'
    'ROW 4 (damage): flinching hurt backwards, staggered off-balance, collapsing, lying dead on the ground\n'
    'BACKGROUND: the ENTIRE background is flat solid pure magenta #FF00FF, no shadows.'
)


# ───────────────────────── Gemini ─────────────────────────
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
    """Devuelve una ruta que NO existe: si 'x.png' existe, prueba 'x_2.png',
    'x_3.png'… Así nunca sobrescribimos una generación previa."""
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    n = 2
    while os.path.exists(f'{base}_{n}{ext}'):
        n += 1
    return f'{base}_{n}{ext}'


def save_raw(img, tag):
    os.makedirs(RAW_DIR, exist_ok=True)
    path = unique_path(os.path.join(RAW_DIR, f'{tag}_raw.png'))
    img.convert('RGB').save(path)


# ───────────────────────── Chroma-key magenta ─────────────────────────
def _opaque_frac(im):
    px = im.load()
    w, h = im.size
    op = tot = 0
    for y in range(0, h, 6):
        for x in range(0, w, 6):
            tot += 1
            if px[x, y][3] > 40:
                op += 1
    return op / max(1, tot)


def remove_bg_by_corners(im, tol=72):
    """Quita el fondo sólido tomando su color de las esquinas. Respaldo para
    cuando el modelo NO usó magenta puro (#FF00FF) sino otro tono."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    cs = [px[1, 1], px[w - 2, 1], px[1, h - 2], px[w - 2, h - 2]]
    br = sum(c[0] for c in cs) // 4
    bg = sum(c[1] for c in cs) // 4
    bb = sum(c[2] for c in cs) // 4
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if ((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2) ** 0.5 < tol:
                px[x, y] = (0, 0, 0, 0)
    return im


def chroma_key_magenta(im, threshold=120):
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((r - 255) ** 2 + g ** 2 + (b - 255) ** 2) ** 0.5
            if d < threshold:
                px[x, y] = (0, 0, 0, 0)
            elif r > 160 and b > 160 and g < 120 and abs(r - b) < 80:
                px[x, y] = (0, 0, 0, 0)
    # si el magenta no era puro y casi no se recortó nada, quita por esquinas
    if _opaque_frac(im) > 0.92:
        print('    … magenta no puro: recorte por color de esquinas')
        return remove_bg_by_corners(im)
    return im


# ───────────────────────── Fondos ─────────────────────────
def run_bg(key, client):
    print(f'\n🏯 FONDO {key.upper()}')
    prompt = BG_PROMPT.format(style=UKIYOE, desc=BACKGROUNDS[key])
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
    img.save(out)
    print(f'    💾 {out}')


# ───────────────────────── Personaje (figura suelta) ─────────────────────────
def run_char(key, client, desc=None):
    desc = desc or CHARACTERS[key]
    print(f'\n🗡  PERSONAJE {key.upper()}')
    prompt = CHAR_PROMPT.format(style=UKIYOE, desc=desc)
    raw = generate_image(client, prompt)
    save_raw(raw, f'char_{key}')
    keyed = chroma_key_magenta(raw)
    bbox = keyed.getbbox()
    if bbox:
        keyed = keyed.crop(bbox)
    os.makedirs(CHAR_DIR, exist_ok=True)
    out = unique_path(os.path.abspath(os.path.join(CHAR_DIR, f'{key}.png')))
    keyed.save(out)
    print(f'    💾 {out}  ({keyed.size[0]}x{keyed.size[1]})')


# ───────────────────────── Cuadrícula de poses ─────────────────────────
def normalize_cell(cell):
    bbox = cell.getbbox()
    out = Image.new('RGBA', (SHEET_CELL_W, SHEET_CELL_H), (0, 0, 0, 0))
    if not bbox:
        return out
    cropped = cell.crop(bbox)
    scale = min((SHEET_CELL_W - 6) / cropped.width, (SHEET_CELL_H - 6) / cropped.height)
    nw, nh = max(1, int(cropped.width * scale)), max(1, int(cropped.height * scale))
    cropped = cropped.resize((nw, nh), Image.LANCZOS)
    out.paste(cropped, ((SHEET_CELL_W - nw) // 2, SHEET_CELL_H - 4 - nh), cropped)
    return out


def run_sheet(key, client, desc=None):
    desc = desc or CHARACTERS[key]
    print(f'\n🎞  HOJA DE POSES {key.upper()}')
    prompt = SHEET_PROMPT.format(style=UKIYOE, desc=desc)
    raw = generate_image(client, prompt)
    save_raw(raw, f'sheet_{key}')
    keyed = chroma_key_magenta(raw)
    w, h = keyed.size
    cw, ch = w / SHEET_COLS, h / SHEET_ROWS
    final = Image.new('RGBA', (SHEET_CELL_W * SHEET_COLS, SHEET_CELL_H * SHEET_ROWS), (0, 0, 0, 0))
    empty = 0
    for row in range(SHEET_ROWS):
        for col in range(SHEET_COLS):
            cell = keyed.crop((int(col * cw), int(row * ch), int((col + 1) * cw), int((row + 1) * ch)))
            norm = normalize_cell(cell)
            if norm.getbbox() is None:
                empty += 1
            final.paste(norm, (col * SHEET_CELL_W, row * SHEET_CELL_H), norm)
    os.makedirs(SHEET_DIR, exist_ok=True)
    out = unique_path(os.path.abspath(os.path.join(SHEET_DIR, f'{key}.png')))
    final.save(out)
    print(f'    💾 {out}  ({empty}/16 celdas vacías)')


# ───────────────────────── CLI ─────────────────────────
def parse_desc(args):
    if '--desc' in args:
        i = args.index('--desc')
        return ' '.join(args[i + 1:]).strip(), args[:i]
    return None, args


def main():
    from google import genai
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    mode = args[0]
    rest = args[1:]
    desc, rest = parse_desc(rest)
    client = genai.Client(api_key=load_api_key())

    if mode == 'bg':
        keys = list(BACKGROUNDS) if '--all' in rest else [a for a in rest if a in BACKGROUNDS]
        for k in keys:
            try: run_bg(k, client)
            except Exception as e: print(f'    ❌ {k}: {e}')
            time.sleep(1)
    elif mode == 'char':
        keys = list(CHARACTERS) if '--all' in rest else [a for a in rest]
        for k in keys:
            try: run_char(k, client, desc if len(keys) == 1 else None)
            except Exception as e: print(f'    ❌ {k}: {e}')
            time.sleep(1)
    elif mode == 'parts':
        keys = list(CHARACTERS) if '--all' in rest else [a for a in rest]
        for k in keys:
            try: run_parts(k, client, desc if len(keys) == 1 else None)
            except Exception as e: print(f'    ❌ {k}: {e}')
            time.sleep(1)
    elif mode == 'sheet':
        keys = list(CHARACTERS) if '--all' in rest else [a for a in rest]
        for k in keys:
            try: run_sheet(k, client, desc if len(keys) == 1 else None)
            except Exception as e: print(f'    ❌ {k}: {e}')
            time.sleep(1)
    else:
        print(f'Modo desconocido: {mode}')
        print(__doc__)


if __name__ == '__main__':
    main()
