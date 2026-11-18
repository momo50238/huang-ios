#!/usr/bin/env python3
"""Generate the original Huangguo music-note icon at iPhone icon sizes."""
from pathlib import Path

from PIL import Image, ImageDraw

RESOURCES = Path(__file__).resolve().parents[1] / "Resources"


def icon(size):
    canvas = 768
    image = Image.new("RGB", (canvas, canvas))
    draw = ImageDraw.Draw(image)
    for row in range(canvas):
        t = row / (canvas - 1)
        draw.line((0, row, canvas, row), fill=(
            round(29 - 14 * t), round(57 - 31 * t), round(36 - 16 * t),
        ))
    draw.rounded_rectangle((139, 194, 629, 574), radius=81, outline="#71935B", width=13)
    for column in (181, 561):
        for row in (270, 370, 470):
            draw.rounded_rectangle((column, row, column + 28, row + 28), radius=8, fill="#A3BF8E")
    draw.line((387, 457, 387, 297), width=37, fill="#D7F87F")
    draw.ellipse((283, 435, 408, 518), fill="#D7F87F")
    draw.polygon([(369, 282), (466, 251), (485, 270), (485, 299), (405, 326), (369, 326)], fill="#D7F87F")
    return image.resize((size, size), Image.Resampling.LANCZOS)


for scale in (2, 3):
    icon(60 * scale).save(RESOURCES / f"AppIcon60x60@{scale}x.png", optimize=True)
