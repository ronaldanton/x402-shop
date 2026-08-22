#!/usr/bin/env python3
"""Convert SVG logos to PNG at various sizes using cairosvg or PIL."""
import os, subprocess, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINAL = os.path.join(BASE, "branding", "final")

# Check for converters
def has_cmd(cmd):
    return subprocess.run(["which", cmd], capture_output=True).returncode == 0

if has_cmd("rsvg-convert"):
    converter = "rsvg"
elif has_cmd("inkscape"):
    converter = "inkscape"
elif has_cmd("convert") and "ImageMagick" in subprocess.run(["convert", "--version"], capture_output=True, text=True).stdout:
    converter = "imagemagick"
else:
    # Try pip install cairosvg
    subprocess.run([sys.executable, "-m", "pip", "install", "cairosvg"], capture_output=True)
    converter = "cairosvg"

print(f"Using converter: {converter}")

def svg_to_png(svg_path, png_path, width, height=None):
    if height is None:
        height = width
    os.makedirs(os.path.dirname(png_path), exist_ok=True)
    
    if converter == "rsvg":
        subprocess.run([
            "rsvg-convert", "-w", str(width), "-h", str(height),
            "-o", png_path, svg_path
        ], check=True)
    elif converter == "inkscape":
        subprocess.run([
            "inkscape", svg_path, "--export-width", str(width),
            "--export-height", str(height), "--export-filename", png_path
        ], check=True)
    elif converter == "imagemagick":
        subprocess.run([
            "convert", "-background", "none", "-resize", f"{width}x{height}!",
            svg_path, png_path
        ], check=True)
    elif converter == "cairosvg":
        import cairosvg
        with open(svg_path) as f:
            svg_data = f.read()
        out = cairosvg.svg2png(svg_data, output_width=width, output_height=height)
        with open(png_path, "wb") as f:
            f.write(out)
    
    size = os.path.getsize(png_path)
    print(f"  {os.path.basename(png_path):35s} {width}x{height} -> {size:>8,d} bytes")

# Source SVGs
logo_svg = os.path.join(FINAL, "logo-source.svg")
wordmark_svg = os.path.join(FINAL, "wordmark.svg")

# Logo mark sizes
svg_to_png(logo_svg, os.path.join(FINAL, "logo-mark-512.png"), 512)
svg_to_png(logo_svg, os.path.join(FINAL, "logo-mark-256.png"), 256)
svg_to_png(logo_svg, os.path.join(FINAL, "logo-mark-192.png"), 192)
svg_to_png(logo_svg, os.path.join(FINAL, "logo-mark-128.png"), 128)
svg_to_png(logo_svg, os.path.join(FINAL, "logo-mark-64.png"), 64)
svg_to_png(logo_svg, os.path.join(FINAL, "logo-mark-32.png"), 32)

# Wordmark sizes
svg_to_png(wordmark_svg, os.path.join(FINAL, "wordmark-1200.png"), 1200, 300)
svg_to_png(wordmark_svg, os.path.join(FINAL, "wordmark-800.png"), 800, 200)
svg_to_png(wordmark_svg, os.path.join(FINAL, "wordmark-600.png"), 600, 150)

# OG image - 1200x630 with logo centered
svg_to_png(logo_svg, os.path.join(FINAL, "logo-mark-300.png"), 300)

print("\nDone!")
