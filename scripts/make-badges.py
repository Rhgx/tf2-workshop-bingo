"""README badges styled as TF2 item tooltips, after Devin's Badges (cozy).

The icon floats on a soft glow in its own colour (a nod to Unusual effects), the label is the grey
item level line and the name is in the Unique quality colour. Text is converted to paths from the
game fonts in public/ui/fonts, so the SVGs render the same everywhere. Icons come from Simple Icons (CC0),
except pnpm's two-colour logo, which is drawn here.

    pip install fonttools
    python scripts/make-badges.py      # writes docs/badges/*.svg
"""

import re
import urllib.request
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "public/ui/fonts"
OUT = ROOT / "docs/badges"
ICONS = "https://cdn.jsdelivr.net/npm/simple-icons@16.32.0/icons/{}.svg"


def pnpm_icon() -> str:
    """pnpm's two-colour logo for dark backgrounds (32 units, drawn at 24). Simple Icons only has a one-colour outline."""
    return (
        '<g transform="scale(.75)">'
        '<path fill="#e0e0e0" d="M2 22h8v8H2zm10 0h8v8h-8zm10 0h8v8h-8zM12 12h8v8h-8z"/>'
        '<path fill="#ffb300" d="M2 2h8v8H2zm10 0h8v8h-8zm10 0h8v8h-8zm0 10h8v8h-8z"/>'
        "</g>"
    )


# (file, Simple Icons slug or icon function, icon colour, label, name, backing). Backing fills a logo's cut-outs,
# e.g. the white letters of the TypeScript square. Vite's colour is the bolt in its current logo (vite.dev/logo.svg).
BADGES = [
    ("typescript", "typescript", "#3178c6", "Built with", "TypeScript", "#fff"),
    ("vite", "vite", "#863bff", "Built with", "Vite", None),
    ("pnpm", pnpm_icon, "#ffb300", "Managed with", "pnpm", None),
]

# Colours from the game: backpack panels and clientscheme.res tooltip text
# (the level grey is lifted a little from #756b5e so it stays readable at badge size).
PANEL_TOP, PANEL_BOTTOM = "#39332b", "#25211c"
LEVEL, UNIQUE = "#8a7f70", "#ffd700"

HEIGHT, ICON_AT, ICON_SIZE = 56, 11, 34


class Font:
    def __init__(self, file: str):
        self.font = TTFont(FONTS / file)
        self.cmap = self.font.getBestCmap()
        self.glyphs = self.font.getGlyphSet()
        self.em = self.font["head"].unitsPerEm
        self.kern = self.font["kern"].kernTables[0].kernTable if "kern" in self.font else {}

    def path(self, text: str, size: float, x: float, baseline: float) -> tuple[str, float]:
        """SVG path data for `text` with its baseline at (x, baseline), and the advance width."""
        scale = size / self.em
        pen = SVGPathPen(self.glyphs, ntos=lambda n: f"{n:.2f}".rstrip("0").rstrip("."))
        cursor, previous = 0, None
        for char in text:
            name = self.cmap[ord(char)]
            if previous:
                cursor += self.kern.get((previous, name), 0)
            self.glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x + cursor * scale, baseline)))
            cursor += self.glyphs[name].width
            previous = name
        return pen.getCommands(), cursor * scale


def icon_path(slug: str) -> str:
    with urllib.request.urlopen(ICONS.format(slug)) as response:
        return re.search(r' d="([^"]+)"', response.read().decode()).group(1)


def badge(label_font: Font, name_font: Font, icon, colour: str, label: str, name: str, backing: str | None) -> str:
    icon_svg = icon() if callable(icon) else f'<path fill="{colour}" d="{icon_path(icon)}"/>'
    text_x = ICON_AT + ICON_SIZE + 11
    label_d, label_w = label_font.path(label, 13, text_x, 24)
    name_d, name_w = name_font.path(name, 19, text_x, 44)
    width = round(text_x + max(label_w, name_w) + 14)
    icon_at, centre = ICON_AT, ICON_AT + ICON_SIZE / 2
    backing_rect = f'<rect x="{icon_at + 2}" y="{icon_at + 2}" width="{ICON_SIZE - 4}" height="{ICON_SIZE - 4}" fill="{backing}"/>' if backing else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{HEIGHT}" viewBox="0 0 {width} {HEIGHT}">'
        f"<title>{label} {name}</title>"
        "<defs>"
        f'<linearGradient id="panel" x2="0" y2="1"><stop stop-color="{PANEL_TOP}"/><stop offset="1" stop-color="{PANEL_BOTTOM}"/></linearGradient>'
        # Light catches the top edge and fades out, like the rim on button_holder_central.
        '<linearGradient id="rim" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity=".03"/></linearGradient>'
        f'<radialGradient id="glow"><stop stop-color="{colour}" stop-opacity=".25"/><stop offset="1" stop-color="{colour}" stop-opacity="0"/></radialGradient>'
        # TF2 menu text sits on a hard, slightly blurred shadow.
        '<filter id="shadow" x="-5%" y="-5%" width="110%" height="130%"><feDropShadow dx="0" dy="1.5" stdDeviation=".6" flood-opacity=".7"/></filter>'
        "</defs>"
        f'<rect x=".5" y=".5" width="{width - 1}" height="{HEIGHT - 1}" rx="8" fill="url(#panel)" stroke="#16130f"/>'
        f'<rect x="1.5" y="1.5" width="{width - 3}" height="{HEIGHT - 3}" rx="7" fill="none" stroke="url(#rim)"/>'
        f'<circle cx="{centre}" cy="{centre}" r="{ICON_SIZE / 2 + 6}" fill="url(#glow)"/>'
        '<g filter="url(#shadow)">'
        f"{backing_rect}"
        f'<g transform="translate({icon_at} {icon_at}) scale({ICON_SIZE / 24})">{icon_svg}</g>'
        f'<path fill="{LEVEL}" d="{label_d}"/>'
        f'<path fill="{UNIQUE}" d="{name_d}"/>'
        "</g>"
        "</svg>\n"
    )


def main() -> None:
    label_font, name_font = Font("tf2secondary.ttf"), Font("tf2build.ttf")
    OUT.mkdir(parents=True, exist_ok=True)
    for file, *spec in BADGES:
        (OUT / f"{file}.svg").write_text(badge(label_font, name_font, *spec), encoding="utf-8")
        print(f"docs/badges/{file}.svg")


if __name__ == "__main__":
    main()
