#!/usr/bin/env python3
"""Overprint KLAFI / קְלָפִי on the approved parchment wrapper."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

root = Path(__file__).resolve().parents[1]
src = root / "docs/design/assets/pack-wrapper-transparent.png"
out = root / "docs/design/assets/pack-wrapper-klafi.png"
latin_font = "/usr/share/fonts/truetype/noto/NotoSerifDisplay-Regular.ttf"
hebrew_font = "/usr/share/fonts/truetype/noto/NotoSerifHebrew-Regular.ttf"

GOLD = (120, 92, 42, 255)
GOLD_DEEP = (78, 56, 22, 255)
GOLD_LIGHT = (176, 148, 86, 255)
INK = (28, 68, 64, 255)

im = Image.open(src).convert("RGBA")
width, _height = im.size
pixels = im.load()


def parchment_at(x, y):
    x = max(40, min(width - 41, x))
    sample_y = 608 + (y % 18)
    sample_x = max(40, min(width - 41, x + ((y * 13) % 7) - 3))
    return pixels[sample_x, sample_y]


for y in range(618, 848):
    for x in range(90, width - 90):
        red, green, blue, alpha = pixels[x, y]
        if alpha < 8:
            continue
        parchment = parchment_at(x, y)
        contrast = abs(red - parchment[0]) + abs(green - parchment[1]) + abs(blue - parchment[2])
        dark = red + green + blue < parchment[0] + parchment[1] + parchment[2] - 40
        if contrast > 28 or dark:
            pixels[x, y] = parchment

band = im.crop((90, 618, width - 90, 848)).filter(ImageFilter.GaussianBlur(0.45))
im.paste(band, (90, 618))

layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(layer)
latin = ImageFont.truetype(latin_font, 112)
hebrew = ImageFont.truetype(hebrew_font, 40)
letters = list("KLAFI")
gap = 16
widths = [
    draw.textbbox((0, 0), letter, font=latin)[2] - draw.textbbox((0, 0), letter, font=latin)[0]
    for letter in letters
]
start = (width - (sum(widths) + gap * (len(letters) - 1))) / 2


def draw_tracked(target, top, fill):
    pen = ImageDraw.Draw(target)
    x = start
    for letter, letter_width in zip(letters, widths):
        box = pen.textbbox((0, 0), letter, font=latin)
        pen.text((x - box[0], top), letter, font=latin, fill=fill)
        x += letter_width + gap


draw_tracked(layer, 650, GOLD_DEEP)
face = Image.new("RGBA", im.size, (0, 0, 0, 0))
draw_tracked(face, 646, GOLD_LIGHT)
draw_tracked(face, 644, GOLD)
layer = Image.alpha_composite(layer, face)
draw = ImageDraw.Draw(layer)
center_x, ornament_y = width / 2, 768
draw.line((center_x - 48, ornament_y, center_x - 11, ornament_y), fill=GOLD, width=2)
draw.line((center_x + 11, ornament_y, center_x + 48, ornament_y), fill=GOLD, width=2)
draw.ellipse((center_x - 3.4, ornament_y - 3.4, center_x + 3.4, ornament_y + 3.4), fill=GOLD_DEEP)
draw.ellipse((center_x - 1.6, ornament_y - 1.6, center_x + 1.6, ornament_y + 1.6), fill=GOLD_LIGHT)
hebrew_text = "קְלָפִי"
box = draw.textbbox((0, 0), hebrew_text, font=hebrew)
draw.text(((width - (box[2] - box[0])) / 2 - box[0], 796), hebrew_text, font=hebrew, fill=INK)

Image.alpha_composite(im, layer).save(out, "PNG", optimize=True)
print(f"wrote {out}")
