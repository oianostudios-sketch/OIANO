from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps" / "web" / "public" / "images" / "engineers"
OUT.mkdir(parents=True, exist_ok=True)
source = Image.open(r"C:\Users\oiano\.codex\generated_images\019ff16b-6790-72b0-b05a-87b9b6829cea\exec-358c7e5a-23b2-42b8-9a7b-3cf3fd508598.png")
names = ["marcus-dean-v1.webp", "priya-nair-v1.webp", "torre-williams-v1.webp", "amara-cole-v1.webp", "eli-mercer-v1.webp"]
edges = [0, 354, 708, 1064, 1418, 1776]
for index, name in enumerate(names):
    portrait = source.crop((edges[index], 0, edges[index + 1], 887))
    portrait.thumbnail((480, 720), Image.Resampling.LANCZOS)
    portrait.save(OUT / name, "WEBP", quality=88, method=6)
