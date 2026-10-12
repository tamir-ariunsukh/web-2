"""Generates the hero banner images for the web app.

The banner is drawn procedurally so the repository ships no binary source art.
Each size is written as AVIF (best compression), WebP (universal fallback) and
PNG (for ``<img>`` fallbacks and Open Graph), so the layout can pick the best
format the browser supports.

Run: python scripts/generate-banner.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = Path(__file__).resolve().parent.parent / "apps" / "web" / "public" / "img"

# Rendered at 2x the largest CSS box, then downscaled, so the gradient stays
# smooth and the result is crisp on high-density screens.
WIDTHS = (2400, 1600, 1200, 800)
ASPECT = 2400 / 1000

# Dusk palette: deep navy sky fading into a warm horizon.
SKY_TOP = (11, 18, 48)
SKY_MID = (30, 58, 138)
SKY_LOW = (56, 122, 214)
HORIZON = (251, 191, 36)
GLOW = (253, 224, 171)


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def sky_gradient(width: int, height: int) -> Image.Image:
    """Vertical gradient across the whole canvas."""
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)

    for y in range(height):
        t = y / max(1, height - 1)
        if t < 0.55:
            colour = lerp(SKY_TOP, SKY_MID, t / 0.55)
        elif t < 0.82:
            colour = lerp(SKY_MID, SKY_LOW, (t - 0.55) / 0.27)
        else:
            colour = lerp(SKY_LOW, HORIZON, (t - 0.82) / 0.18)
        draw.line([(0, y), (width, y)], fill=colour)

    return image


def add_sun_glow(image: Image.Image) -> None:
    """Soft radial glow sitting just above the horizon."""
    width, height = image.size
    cx, cy = width * 0.74, height * 0.74
    radius = width * 0.34

    glow = Image.new("RGB", (width, height), (0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for step in range(28, 0, -1):
        r = radius * step / 28
        alpha = (1 - step / 28) ** 2
        colour = tuple(round(c * alpha) for c in GLOW)
        gdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=colour)

    glow = glow.filter(ImageFilter.GaussianBlur(width * 0.05))
    image.paste(Image.blend(image, Image.new("RGB", image.size, GLOW), 0.0), (0, 0))
    image.paste(glow, (0, 0), glow.convert("L"))


def add_stars(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    """Deterministic star field in the upper third, so builds are reproducible."""
    count = 260
    for index in range(count):
        # A cheap hash keeps the field stable across runs without importing random.
        h = (index * 2654435761) % 4294967296
        x = (h % width)
        y = int((h // width) % (height * 0.45))
        size = 1 + (h % 3) * (width / 1600)
        brightness = 120 + (h % 120)
        inset = min(0.9, 1 - (y / (height * 0.5)))
        alpha = int(brightness * inset)
        draw.ellipse([x, y, x + size, y + size], fill=(alpha, alpha, min(255, alpha + 20)))


def add_clouds(image: Image.Image) -> None:
    """Soft horizontal cloud bands near the horizon."""
    width, height = image.size
    clouds = Image.new("RGB", (width, height), (0, 0, 0))
    cdraw = ImageDraw.Draw(clouds)

    bands = [
        (0.78, 0.055, 0.55),
        (0.68, 0.04, 0.32),
        (0.60, 0.03, 0.18),
    ]
    for centre, thickness, strength in bands:
        cy = height * centre
        th = height * thickness
        for step in range(6):
            offset = (step - 3) * th * 0.5
            w = width * (1.05 - abs(step - 3) * 0.04)
            x0 = (width - w) / 2
            value = int(255 * strength * (1 - abs(step - 3) / 6))
            cdraw.ellipse([x0, cy + offset - th / 2, x0 + w, cy + offset + th / 2],
                          fill=(value, value, value))

    clouds = clouds.filter(ImageFilter.GaussianBlur(width * 0.02))
    image.paste(Image.new("RGB", image.size, (255, 245, 230)), (0, 0), clouds.convert("L"))


def add_route(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    """A dashed great-circle arc with two airport nodes."""
    start = (width * 0.10, height * 0.62)
    end = (width * 0.90, height * 0.40)
    peak = height * 0.20

    points: list[tuple[float, float]] = []
    steps = 220
    for index in range(steps + 1):
        t = index / steps
        x = start[0] + (end[0] - start[0]) * t
        # Quadratic Bezier: control point lifted above the midpoint.
        control_y = 2 * peak - (start[1] + end[1]) / 2
        y = (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * control_y + t**2 * end[1]
        points.append((x, y))

    line_width = max(2, int(width * 0.0022))
    dash, gap = 16, 14
    for index, point in enumerate(points):
        if index % (dash + gap) < dash and index + 1 < len(points):
            draw.line([point, points[index + 1]], fill=(255, 255, 255, 190), width=line_width)

    radius = max(4, int(width * 0.006))
    for (x, y) in (points[0], points[-1]):
        draw.ellipse([x - radius * 2.4, y - radius * 2.4, x + radius * 2.4, y + radius * 2.4],
                     outline=(255, 255, 255, 90), width=max(1, int(width * 0.001)))
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=(255, 255, 255, 255))


def build(width: int) -> Image.Image:
    height = round(width / ASPECT)
    image = sky_gradient(width, height)

    stars = Image.new("RGB", (width, height), (0, 0, 0))
    add_stars(ImageDraw.Draw(stars), width, height)
    image.paste(stars, (0, 0), stars.convert("L"))

    add_sun_glow(image)
    add_clouds(image)

    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    add_route(ImageDraw.Draw(overlay), width, height)
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

    return image


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    master = build(WIDTHS[0])

    for width in WIDTHS:
        height = round(width / ASPECT)
        frame = master if width == WIDTHS[0] else master.resize((width, height), Image.LANCZOS)

        frame.save(OUT_DIR / f"banner-{width}.avif", quality=52, method=6)
        frame.save(OUT_DIR / f"banner-{width}.webp", quality=78, method=6)

        size_kb = (OUT_DIR / f"banner-{width}.avif").stat().st_size / 1024
        webp_kb = (OUT_DIR / f"banner-{width}.webp").stat().st_size / 1024
        print(f"  {width:>5}x{height:<5} avif {size_kb:6.1f} KB   webp {webp_kb:6.1f} KB")

    # A small PNG keeps a raster fallback for the rare client without WebP or AVIF
    # without shipping the full-size bitmap.
    fallback = master.resize((1200, round(1200 / ASPECT)), Image.LANCZOS)
    fallback.save(OUT_DIR / "banner.png", optimize=True)

    # Open Graph card, cropped to the 1.91:1 the crawlers expect.
    og_height = round(1200 / 1.91)
    og = master.resize((1200, round(1200 / ASPECT)), Image.LANCZOS)
    top = max(0, (og.height - og_height) // 2)
    og = og.crop((0, top, 1200, top + og_height))
    og.save(OUT_DIR / "og.png", optimize=True)

    total = sum(f.stat().st_size for f in OUT_DIR.iterdir() if f.is_file())
    print(f"  banner.png 1200x{round(1200 / ASPECT)} fallback")
    print(f"  og.png 1200x{og_height}")
    print(f"total {total / 1024:.1f} KB")


if __name__ == "__main__":
    main()
