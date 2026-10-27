"""アプリのアイコン（PWA・ホーム画面・favicon）を『演出家』の切り抜きから作る。

使い方:
  pip install pillow
  python tools/app-icon.py
  Android だけ大きさを変えるときは MASKABLE の箱を広げる・狭める（広げるほど小さく見える）

真紅の地に目元まで寄せた絵（10月27日にオーナーが B を選んだ）。
Android（maskable）は丸に切られて中央の約 67% しか見えない（Pixel の Chrome で実測）ので、引いた絵にする。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "apps/web/public/assets/cards/c17-subject.webp"
OUT = ROOT / "apps/web/public/icons"
RED = (207, 27, 16)  # 『演出家』の主色（元の絵の背景色）

# 切り抜きの中の正方形（左, 上, 右, 下）。画像の外は真紅で埋まる
FACE = (90, 120, 730, 760)
MASKABLE = (-25, 5, 845, 875)

subj = Image.open(SRC).convert("RGBA")


def icon(box, size):
    im = Image.new("RGBA", (size, size), RED + (255,))
    im.alpha_composite(subj.crop(box).resize((size, size), Image.LANCZOS))
    return im.convert("RGB")


for name, box, size in [
    ("icon-512", FACE, 512),
    ("icon-192", FACE, 192),
    ("apple-touch-icon", FACE, 180),
    ("favicon-64", FACE, 64),
    ("icon-maskable-512", MASKABLE, 512),
]:
    icon(box, size).save(OUT / f"{name}.png", optimize=True)
