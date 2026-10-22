#!/usr/bin/env python3
"""Draws the Conduint Files app icon (a cyan file on black) and writes every size the Android build and the web app need.
Run from the project folder:  python3 scripts/make-icons.py      (needs Pillow: pip install pillow)
Writes native/res/mipmap-*/ic_launcher*.png and www/icon-512.png. patch-android.sh copies native/res into the Android project."""
import math, os
from PIL import Image, ImageDraw

CYAN = (0, 229, 255, 255)
FOLD = (0, 150, 170, 255)
HOLE = (0, 0, 0, 0)
BLACK = (0, 0, 0, 255)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def arc(cx, cy, r, a0, a1, n=14):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

def page():
    """File outline on a 512 grid: rounded corners, top right corner cut off for the fold."""
    L, T, R, B, r = 148, 100, 364, 412, 34
    pts = arc(L + r, T + r, r, 180, 270)            # top left
    pts += [(292, T), (R, 172)]                      # along the top, down the cut
    pts += arc(R - r, B - r, r, 0, 90)               # bottom right
    pts += arc(L + r, B - r, r, 90, 180)             # bottom left
    return pts

def glyph(size, frac):
    """RGBA picture of the file, `frac` of the canvas tall, centred, transparent background, text lines cut out."""
    S = 4                                            # supersampling for smooth edges
    N = size * S
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = N * frac / 312.0                             # scale: the file is 312 tall on the 512 grid
    ox = N / 2 - 256 * k
    oy = N / 2 - 256 * k
    P = lambda p: (ox + p[0] * k, oy + p[1] * k)
    d.polygon([P(p) for p in page()], fill=CYAN)
    d.polygon([P((292, 100)), P((364, 172)), P((292, 172))], fill=FOLD)
    for (x0, y0, x1) in [(188, 244, 324), (188, 286, 324), (188, 328, 276)]:
        d.rounded_rectangle([P((x0, y0)), P((x1, y0 + 16))], radius=8 * k, fill=HOLE)
    return im.resize((size, size), Image.LANCZOS)

def with_bg(size, frac, shape):
    g = glyph(size, frac)
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    m = Image.new('L', (size * 4, size * 4), 0)
    md = ImageDraw.Draw(m)
    if shape == 'round':
        md.ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    else:
        md.rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=size * 4 * 0.22, fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    bg.paste(BLACK, (0, 0), m)
    return Image.alpha_composite(bg, g)

def save(im, rel):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)
    print('wrote', rel)

DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, f in DENS.items():
    d = 'native/res/mipmap-' + name + '/'
    save(glyph(round(108 * f), 0.50), d + 'ic_launcher_foreground.png')      # adaptive icon layer, inside the 66dp safe zone
    save(with_bg(round(48 * f), 0.66, 'square'), d + 'ic_launcher.png')      # old phones
    save(with_bg(round(48 * f), 0.62, 'round'), d + 'ic_launcher_round.png')
save(with_bg(512, 0.64, 'square'), 'www/icon-512.png')
