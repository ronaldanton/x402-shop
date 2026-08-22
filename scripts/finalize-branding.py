#!/usr/bin/env python3
"""Create OG image and favicon from rendered PNGs"""
from PIL import Image
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINAL = os.path.join(BASE, "branding", "final")

# OG image 1200x630
# Use the wordmark-1200 as base
wordmark = Image.open(os.path.join(FINAL, "wordmark-1200.png"))

# Create dark banner
og = Image.new("RGB", (1200, 630), (11, 14, 20))
# Paste wordmark centered
wx = (1200 - wordmark.width) // 2
wy = (630 - wordmark.height) // 2 - 30
og.paste(wordmark, (wx, wy), wordmark if wordmark.mode == "RGBA" else None)

# Add bottom bar accent
for y in range(600, 608):
    for x in range(0, 1200):
        r, g, b = og.getpixel((x, y))
        # Gradient green to blue left to right
        t = x / 1200
        nr = int(110 * (1 - t) + 157 * t)
        ng = int(231 * (1 - t) + 195 * t)
        nb = int(160 * (1 - t) + 255 * t)
        og.putpixel((x, y), (nr, ng, nb))

og.save(os.path.join(FINAL, "og-image.png"))
print(f"OG image: 1200x630 -> {os.path.getsize(os.path.join(FINAL, 'og-image.png')):,d} bytes")

# Create proper favicon.ico from logo-mark-32 and logo-mark-16
logo_32 = Image.open(os.path.join(FINAL, "logo-mark-32.png")).convert("RGBA")
logo_16 = logo_32.resize((16, 16), Image.LANCZOS)
logo_48 = Image.open(os.path.join(FINAL, "logo-mark-64.png")).resize((48, 48), Image.LANCZOS)

# Save multi-size favicon
logo_16.save(os.path.join(FINAL, "favicon.ico"), format="ICO", sizes=[(16,16), (32,32), (48,48)])
print(f"Favicon: 16+32+48 -> {os.path.getsize(os.path.join(FINAL, 'favicon.ico')):,d} bytes")

# Also update apple-touch-icon
logo_180 = Image.open(os.path.join(FINAL, "logo-mark-192.png")).resize((180, 180), Image.LANCZOS)
logo_180.save(os.path.join(FINAL, "apple-touch-icon.png"))
print(f"Apple touch: 180 -> {os.path.getsize(os.path.join(FINAL, 'apple-touch-icon.png')):,d} bytes")

# Clean up intermediate files (keep the SVGs and rendered PNGs)
# Remove old AI-generated logo-* files from the previous batch
for f in os.listdir(FINAL):
    if f.startswith("logo-") and f.endswith(".png") and f not in [
        "logo-mark-512.png", "logo-mark-256.png", "logo-mark-192.png",
        "logo-mark-128.png", "logo-mark-64.png", "logo-mark-32.png",
        "logo-mark-300.png"
    ]:
        os.remove(os.path.join(FINAL, f))
        print(f"  Removed old: {f}")

print("\nDone! Final branding files:")
for f in sorted(os.listdir(FINAL)):
    p = os.path.join(FINAL, f)
    print(f"  {f:35s} {os.path.getsize(p):>8,d} bytes")
