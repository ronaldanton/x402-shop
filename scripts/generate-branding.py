#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs("branding/final", exist_ok=True)

# Load the hex-gear logo (v2-07) - our winner
src = Image.open("branding/v2/07-hex-gear.jpg").convert("RGBA")
sz = min(src.size)
left = (src.size[0] - sz) // 2
top = (src.size[1] - sz) // 2
src = src.crop((left, top, left+sz, top+sz))

# Convert near-white to transparent
pixels = src.load()
for y in range(src.size[1]):
    for x in range(src.size[0]):
        r, g, b, a = pixels[x, y]
        if r > 230 and g > 230 and b > 230:
            pixels[x, y] = (r, g, b, 0)

# Standard sizes
sizes = {
    "logo-512.png": 512, "logo-192.png": 192, "logo-64.png": 64,
    "logo-32.png": 32, "favicon.png": 64, "apple-touch-icon.png": 180,
}
for name, size in sizes.items():
    img = src.resize((size, size), Image.LANCZOS)
    img.save(f"branding/final/{name}")

# favicon.ico
img16 = src.resize((16, 16), Image.LANCZOS)
img32 = src.resize((32, 32), Image.LANCZOS)
img48 = src.resize((48, 48), Image.LANCZOS)
img16.save("branding/final/favicon.ico", format="ICO", sizes=[(16,16),(32,32),(48,48)])

# Fonts
try:
    fb = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 72)
    fr = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
    fs = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
except:
    fb = fr = fs = ImageFont.load_default()

# OG image 1200x630
banner = Image.new("RGB", (1200, 630), (11, 14, 20))
logo_b = src.resize((300, 300), Image.LANCZOS)
banner.paste(logo_b, (120, 165))
d = ImageDraw.Draw(banner)
d.text((460, 140), "AgentPay", font=fb, fill=(110, 231, 160))
d.text((460, 230), "AI microservices - pay per call in USDC", font=fr, fill=(157, 195, 255))
d.text((460, 280), "No accounts. No API keys. x402 protocol.", font=fs, fill=(213, 217, 224))
d.text((460, 450), "agentpay.help", font=fb, fill=(157, 195, 255))
banner.save("branding/final/og-image.png")

print("Done! Files:")
for f in sorted(os.listdir("branding/final")):
    p = f"branding/final/{f}"
    print(f"  {f:40s} {os.path.getsize(p):>8,d} bytes")
