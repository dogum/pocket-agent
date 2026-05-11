"""Render docs/social-preview.png — 1280x640 GitHub social card.

Observatory Hours composition. Single-pass refinements over v1:
  - removed stray bleed text at top
  - moved tagline below wordmark's italic descenders, not into them
  - scan-bar positioned in the negative-space gap, not behind glyphs
  - asymmetric corner stamps: 3 corners only (no top-right) for poise
  - rings tightened so the outer ring lives inside the hairline bezel
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math

# ── Paths ─────────────────────────────────────────────────────────
FONTS = Path(
    "/Users/gregdogum/Library/Application Support/Claude/"
    "local-agent-mode-sessions/skills-plugin/"
    "670da223-6b70-4fa9-b775-a990b53aae25/"
    "35b68ec8-daa7-432d-b4f0-8ba2a006f09a/skills/canvas-design/canvas-fonts"
)
OUT = Path("/Users/gregdogum/Developer/pocket-agent/docs/social-preview.png")
OUT.parent.mkdir(parents=True, exist_ok=True)

# ── Tokens ────────────────────────────────────────────────────────
W, H = 1280, 640
FIELD = (8, 8, 10)             # #08080A
SIGNAL = (92, 184, 178)        # #5CB8B2
TEXT = (239, 236, 231)         # #EFECE7
TEXT_2 = (160, 157, 152)       # #A09D98

# ── Fonts ─────────────────────────────────────────────────────────
serif = ImageFont.truetype(str(FONTS / "InstrumentSerif-Regular.ttf"), 168)
serif_italic = ImageFont.truetype(str(FONTS / "InstrumentSerif-Italic.ttf"), 168)
sans = ImageFont.truetype(str(FONTS / "InstrumentSans-Regular.ttf"), 22)
mono = ImageFont.truetype(str(FONTS / "IBMPlexMono-Regular.ttf"), 10)

# ── Helpers ───────────────────────────────────────────────────────


def overlay_draw():
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    return overlay, ImageDraw.Draw(overlay)


def composite(base, overlay):
    rgba = base.convert("RGBA")
    rgba.alpha_composite(overlay)
    return rgba.convert("RGB")


def text_width(font, txt, tracking_px=0):
    widths = [font.getbbox(c)[2] - font.getbbox(c)[0] for c in txt]
    return sum(widths) + tracking_px * max(0, len(txt) - 1)


def draw_spaced(d, txt, font, fill, y, tracking_px=2, anchor_x=None):
    """Draw `txt` with manual letter-spacing. If `anchor_x` is None,
    centers on canvas; otherwise treats it as the left x-coordinate."""
    widths = [font.getbbox(c)[2] - font.getbbox(c)[0] for c in txt]
    total = sum(widths) + tracking_px * max(0, len(txt) - 1)
    x = (W - total) // 2 if anchor_x is None else anchor_x
    for c, w in zip(txt, widths):
        bb = font.getbbox(c)
        d.text((x - bb[0], y), c, font=font, fill=fill)
        x += w + tracking_px


# ── Canvas ────────────────────────────────────────────────────────
img = Image.new("RGB", (W, H), FIELD)

# ── Layer 1: concentric rings (behind everything) ─────────────────
overlay, od = overlay_draw()
cx, cy = W // 2, H // 2

# Inner-band ticks (azimuth dial residue), small + restrained.
TICK_R_IN, TICK_R_OUT = 218, 232
for i in range(24):
    a = (i / 24) * math.tau
    x1 = cx + math.cos(a) * TICK_R_IN
    y1 = cy + math.sin(a) * TICK_R_IN
    x2 = cx + math.cos(a) * TICK_R_OUT
    y2 = cy + math.sin(a) * TICK_R_OUT
    alpha = 60 if i % 6 == 0 else 22
    od.line([(x1, y1), (x2, y2)], fill=(92, 184, 178, alpha), width=1)

# Rings — three faint concentric circles centered behind the wordmark.
# Outer ring sized so it lives inside the hairline bezel (bezel is at
# 60..580 vertical; cy is 320, so r_max = 260 minus a hair of breath).
for r, alpha in [(250, 22), (175, 16), (108, 11)]:
    od.ellipse(
        [(cx - r, cy - r), (cx + r, cy + r)],
        outline=(255, 255, 255, alpha),
        width=1,
    )

img = composite(img, overlay)

# ── Layer 2: hairline instrument-bezel ────────────────────────────
overlay, od = overlay_draw()
od.rectangle(
    [(60, 60), (W - 60, H - 60)],
    outline=(255, 255, 255, 14),
    width=1,
)
img = composite(img, overlay)

# ── Layer 3: scan-bar (below wordmark, above tagline) ─────────────
# The scan-bar sits in the negative space gap, not behind any glyph.
overlay, od = overlay_draw()
SCAN_Y = 450
x0, x1 = 360, W - 360
for x in range(x0, x1):
    t = (x - x0) / (x1 - x0)
    fade = math.sin(t * math.pi)
    alpha = int(95 * fade)
    if alpha < 4:
        continue
    od.line([(x, SCAN_Y), (x, SCAN_Y)], fill=(92, 184, 178, alpha), width=1)
# Anchor dot at the peak — small but with a soft halo so it reads as
# the moment a needle settles, not just a punctuation mark.
od.ellipse(
    [(cx - 4, SCAN_Y - 4), (cx + 4, SCAN_Y + 4)],
    fill=(92, 184, 178, 40),
)
od.ellipse(
    [(cx - 2, SCAN_Y - 2), (cx + 2, SCAN_Y + 2)],
    fill=(92, 184, 178, 240),
)
img = composite(img, overlay)

draw = ImageDraw.Draw(img)

# ── Layer 4: wordmark "Pocket Agent" ──────────────────────────────
# "Pocket " regular ivory; "Agent" italic signal-teal.
pocket_text = "Pocket "
agent_text = "Agent"
pocket_bbox = serif.getbbox(pocket_text)
agent_bbox = serif_italic.getbbox(agent_text)
pocket_w = pocket_bbox[2] - pocket_bbox[0]
agent_w = agent_bbox[2] - agent_bbox[0]
total_w = pocket_w + agent_w

# Vertical: glyph top at y=240 puts the cap-line ~250 and baseline ~370.
# Italic "g" descender reaches ~410. That leaves a clean 40px gap before
# the scan-bar at 450.
GLYPH_TOP_Y = 240
x_pocket = (W - total_w) // 2
draw.text(
    (x_pocket - pocket_bbox[0], GLYPH_TOP_Y),
    pocket_text,
    font=serif,
    fill=TEXT,
)
x_agent = x_pocket + pocket_w
draw.text(
    (x_agent - agent_bbox[0], GLYPH_TOP_Y),
    agent_text,
    font=serif_italic,
    fill=SIGNAL,
)

# ── Layer 5: tagline ──────────────────────────────────────────────
tagline = "The agent builds the app for you."
TAGLINE_Y = 475
draw_spaced(draw, tagline, sans, TEXT_2, TAGLINE_Y, tracking_px=1)

# ── Layer 6: mono corner stamps (3 corners, asymmetric) ───────────
# Top-left: observatory tick reference (subtle deduced reference).
draw_spaced(draw, "OBS · 04H 22M", mono, SIGNAL, 88, tracking_px=2, anchor_x=88)

# Bottom-left: version + license
draw_spaced(draw, "V0.1.0 · MIT", mono, TEXT_2, H - 88, tracking_px=2, anchor_x=88)

# Bottom-right: project URL
url = "GITHUB.COM/DOGUM/POCKET-AGENT"
url_total = text_width(mono, url, tracking_px=2)
draw_spaced(draw, url, mono, TEXT_2, H - 88, tracking_px=2, anchor_x=W - 88 - url_total)

# ── Save ──────────────────────────────────────────────────────────
img.save(OUT, format="PNG", optimize=True)
print(f"wrote {OUT}  ({img.size[0]}x{img.size[1]})")
