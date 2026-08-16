from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps" / "web" / "public" / "images" / "studios"
OUT.mkdir(parents=True, exist_ok=True)

dreamz = Image.open(r"C:\Users\oiano\.codex\generated_images\019ff16b-6790-72b0-b05a-87b9b6829cea\exec-b4aea025-649e-47f3-ac62-cbd836c8d38c.png")
northlight = Image.open(r"C:\Users\oiano\.codex\generated_images\019ff16b-6790-72b0-b05a-87b9b6829cea\exec-c185382b-a178-4a98-ac6d-b6c2f9cfe2a2.png")

def save_crop(source, box, name):
    image = source.crop(box)
    image.thumbnail((1200, 800), Image.Resampling.LANCZOS)
    image.save(OUT / name, "WEBP", quality=88, method=6)

save_crop(dreamz, (0, 0, 768, 512), "dreamz-hero-v1.webp")
save_crop(dreamz, (768, 0, 1536, 512), "dreamz-studio-a-v1.webp")
save_crop(dreamz, (0, 512, 768, 1024), "dreamz-studio-b-v1.webp")
save_crop(dreamz, (768, 512, 1536, 1024), "dreamz-vocal-booth-v1.webp")
save_crop(northlight, (0, 0, 724, 724), "northlight-hero-v1.webp")
save_crop(northlight, (724, 0, 1448, 724), "northlight-live-room-v1.webp")
save_crop(northlight, (1448, 0, 2172, 724), "northlight-writing-suite-v1.webp")
