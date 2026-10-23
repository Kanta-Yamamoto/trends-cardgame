import html
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

RAW = Path(sys.argv[1])
D = RAW / "dm_html"
PRODUCTS = ["26rp3", "26rp2", "26rp1", "25rp4"]
QUOTA = {"26rp3": 65, "26rp2": 65, "26rp1": 60, "25rp4": 60}
ICON = Counter()

CATS = {
    "draw": r"引",
    "destroy": r"破壊",
    "shield": r"シールド",
    "plus": r"パワー\+|パワーを\+",
    "minus": r"パワーを?[-－]",
    "bounce": r"手札に戻",
    "mana": r"マナゾーンに置",
    "grave": r"墓地",
    "tap": r"タップ",
    "kw": r"を与える|を得る",
    "cond": r"なら|場合",
    "etb": r"出た時",
    "attack": r"攻撃する時",
    "leave": r"離れる時|破壊された時",
    "strig": r"S・トリガー",
    "block": r"ブロッカー",
    "replace": r"かわりに",
    "cost": r"コスト",
    "unblock": r"ブロックされない",
}


def icon(m):
    src = m.group(1)
    alt = m.group(2)
    ICON[src.rsplit("/", 1)[-1]] += 1
    return f"【{alt}】" if alt else ""


def clean_li(t):
    t = t.replace("\r", "").replace("\n", "")
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"<img[^>]*src=['\"]([^'\"]*)['\"][^>]*alt=['\"]([^'\"]*)['\"][^>]*/?>", icon, t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    t = t.replace("{xB}", "【スーパーボーナス】")
    t = re.sub(r"\{(\w+)\}", r"【\1】", t)
    lines = [x.strip(" \t　") for x in t.split("\n")]
    return "\n".join(x for x in lines if x)


def parse(path):
    s = path.read_text(encoding="utf-8")
    cid = path.stem[2:]
    parts = s.split("<div class='card-itself'>")[1:]
    names, kinds, texts = [], [], []
    for b in parts:
        nm = re.search(r"<h3 class='card-name'>(.*?)<span", b, re.S)
        kd = re.search(r"<td class='type'>(.*?)</td>", b, re.S)
        sk = re.search(r"<td class='skills full'>(.*?)</td>", b, re.S)
        if not nm:
            continue
        names.append(html.unescape(re.sub(r"<[^>]+>", "", nm.group(1))).strip())
        kinds.append(html.unescape(kd.group(1)).strip() if kd else "")
        lis = re.findall(r"<li>(.*?)(?=<li>|$)", sk.group(1), re.S) if sk else []
        txt = "\n".join(t for t in (clean_li(x) for x in lis) if t)
        texts.append(txt)
    if not names or not any(texts):
        return None
    return {
        "game": "デュエル・マスターズ",
        "name": names[0] if len(set(names)) == 1 else "／".join(names),
        "url": f"https://dm.takaratomy.co.jp/card/detail/?id={cid}",
        "kind": "／".join(kinds),
        "text": "\n".join(t for t in texts if t),
        "_id": cid,
        "_n": len(names),
    }


seen = set()
per = {}
for p in PRODUCTS:
    ids = (D / f"ids_{p}.txt").read_text(encoding="utf-8").split()
    items = []
    for cid in ids:
        f = D / f"d_{cid}.html"
        if not f.exists():
            continue
        it = parse(f)
        if not it:
            continue
        key = unicodedata.normalize("NFKC", it["name"]).replace(" ", "")
        if key in seen:
            continue
        seen.add(key)
        items.append(it)
    per[p] = items

cover = {k: 0 for k in CATS}
result = []
for p in PRODUCTS:
    pool = list(per[p])
    chosen = []
    while pool and len(chosen) < QUOTA[p]:
        def score(it):
            return sum(1.0 / (1 + cover[k]) for k, pat in CATS.items() if re.search(pat, it["text"]))
        best = max(pool, key=score)
        pool.remove(best)
        chosen.append(best)
        for k, pat in CATS.items():
            if re.search(pat, best["text"]):
                cover[k] += 1
    chosen.sort(key=lambda x: x["_id"])
    result.extend(chosen)

for it in result:
    del it["_id"], it["_n"]
(RAW / "dm.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
print(len(result), {p: len(per[p]) for p in PRODUCTS})
print(cover)
print(Counter(x["kind"] for x in result))
print(ICON)
