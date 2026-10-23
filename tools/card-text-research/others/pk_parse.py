import html
import json
import os
import re
import sys

src, out, idfile = sys.argv[1], sys.argv[2], sys.argv[3]
ICON = {
    "grass": "草", "fire": "炎", "water": "水", "electric": "雷", "lightning": "雷",
    "psychic": "超", "fighting": "闘", "dark": "悪", "darkness": "悪", "steel": "鋼",
    "metal": "鋼", "dragon": "竜", "fairy": "フェアリー", "none": "無色", "colorless": "無色",
}
TRAINER = {"グッズ", "サポート", "スタジアム", "ポケモンのどうぐ", "特殊エネルギー"}
unknown_icons = set()


def clean(t):
    def icon(m):
        k = m.group(1)
        if k not in ICON:
            unknown_icons.add(k)
        return "【" + ICON.get(k, k) + "】"

    t = re.sub(r'<span class="icon-([a-z]+) icon"></span>', icon, t)
    t = re.sub(r"<img[^>]*alt=\"([^\"]*)\"[^>]*>", r"【\1】", t)
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t).replace("\xa0", " ")
    t = re.sub(r"[ \t]*\n\s*", "\n", t)
    return t.strip()


res, seen = [], set()
for cid in open(idfile).read().split():
    p = os.path.join(src, f"d{cid}.html")
    if not os.path.exists(p):
        continue
    s = open(p, encoding="utf-8").read()
    m = re.search(r'<h1 class="Heading1 mt20">(.*?)</h1>', s, re.S)
    name = clean(m.group(1))
    a = s.find("RightBox-inner")
    b = s.find("<table", a)
    c = s.find('<div class="clear">', a)
    body = s[a: b if 0 < b < c else c]
    body = re.sub(r'<h2 class="mt20">進化</h2>.*', "", body, flags=re.S)
    secs = re.split(r'<h2 class="mt20">(.*?)</h2>', body)
    kind, parts = None, []
    for i in range(1, len(secs), 2):
        h, cont = secs[i].strip(), secs[i + 1]
        if h in ("特性", "ワザ"):
            kind = "ポケモン"
            for nm, desc in re.findall(r"<h4>(.*?)</h4>\s*<p>(.*?)</p>", cont, re.S):
                nm = re.sub(r'<span class="f_right[^"]*">.*?</span>', "", nm)
                nm = re.sub(r'<span class="icon-[a-z]+ icon"></span>', "", nm)
                nm, desc = clean(nm), clean(desc)
                if desc:
                    parts.append(f"{h}「{nm}」：{desc}")
        elif h in TRAINER:
            kind = h
            ps = [clean(x) for x in re.findall(r"<p>(.*?)</p>", cont, re.S)]
            parts.extend(x for x in ps if x)
        elif h == "基本エネルギー":
            kind = h
    if not parts or name in seen or kind == "基本エネルギー":
        continue
    seen.add(name)
    res.append({
        "game": "ポケモンカード",
        "name": name,
        "url": f"https://www.pokemon-card.com/card-search/details.php/card/{cid}/regu/all",
        "kind": kind,
        "text": "\n".join(parts),
    })
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False)
print(len(res), "unknown icons:", unknown_icons)
