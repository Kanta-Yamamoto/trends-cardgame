"""イラストから人物を切り抜き、枠からはみ出させる用の WebP を作る。

使い方:
  pip install "rembg[cpu]" pillow
  python tools/cutout.py assets/original/c1-shirogane.png assets/cards/c1-subject.webp --fade-from 0.52
  人ではない絵（クサハミのカマキリなど）で抜けないときは --model birefnet-general
"""
import argparse
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from rembg import new_session, remove

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("--fade-from", type=float, default=1.0, help="この高さ(0-1)から下を透明にフェード。1.0でフェードなし")
ap.add_argument("--fade-len", type=float, default=0.10)
ap.add_argument("--model", default="isnet-anime", help="rembg のモデル。人物は isnet-anime、それ以外は birefnet-general")
a = ap.parse_args()

im = Image.open(a.src).convert("RGB")
out = remove(im, session=new_session(a.model)).convert("RGBA")
alpha = out.split()[3]
# 本体から離れた半透明のゴミを除去
core = alpha.point(lambda v: 255 if v > 210 else 0).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.GaussianBlur(4))
alpha = ImageChops.multiply(alpha, core)
if a.fade_from < 1:
    w, h = out.size
    g = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = 1.0 if y < h * a.fade_from else max(0.0, 1 - (y - h * a.fade_from) / (h * a.fade_len))
        d.line([(0, y), (w, y)], fill=int(255 * t))
    alpha = ImageChops.multiply(alpha, g)
out.putalpha(alpha.point(lambda v: 0 if v < 25 else v))
out.save(a.dst, quality=88, method=6)
print("saved", a.dst)
