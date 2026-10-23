import html
import json
import re
import sys
import unicodedata
from pathlib import Path

RAW = Path(sys.argv[1])  # raw dir
SERIES = ["550117", "550116", "550115", "550114", "550204"]
KIND = {"CHARACTER": "キャラ", "EVENT": "イベント", "STAGE": "ステージ", "LEADER": "リーダー", "DON!!": "ドン!!"}

CATS = {
    "draw": r"引く",
    "ko": r"KOする|KOされ",
    "life": r"ライフ",
    "plus": r"パワー\+",
    "minus": r"パワー-|コスト-",
    "bounce": r"手札に戻す",
    "trash": r"トラッシュ",
    "rest": r"レスト|アクティブ",
    "kw": r"を得る",
    "cond": r"場合",
    "on_play": r"【登場時】",
    "attack": r"【アタック時】",
    "ko_trig": r"【KO時】",
    "trigger": r"【トリガー】",
    "counter": r"【カウンター】",
    "main": r"【メイン】|【起動メイン】",
    "don": r"ドン!!",
    "deck": r"デッキの上から",
    "play": r"登場させる",
}


def clean(t):
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"<img[^>]*alt=\"([^\"]*)\"[^>]*>", r"【\1】", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    return "\n".join(x.strip() for x in t.strip().split("\n"))


per_series = {}
for sid in SERIES:
    s = (RAW / "op_html" / f"s{sid}.html").read_text(encoding="utf-8")
    url = f"https://www.onepiece-cardgame.com/cardlist/?search=true&series={sid}"
    items = []
    for m in re.finditer(r'<dl class="modalCol" id="([^"]+)">(.*?)</dl>', s, re.S):
        cid, body = m.groups()
        if "_p" in cid:
            continue
        info = re.search(r'<div class="infoCol">\s*<span>([^<]*)</span> \| <span>[^<]*</span> \| <span>([^<]*)</span>', body)
        name = clean(re.search(r'<div class="cardName">(.*?)</div>', body, re.S).group(1))
        kind = KIND.get(info.group(2), info.group(2))
        tx = re.search(r'<div class="text"><h3>[^<]*</h3>(.*?)</div>', body, re.S)
        tr = re.search(r'<div class="trigger"><h3>[^<]*</h3>(.*?)</div>', body, re.S)
        text = clean(tx.group(1)) if tx else ""
        if text in ("-", "−"):
            text = ""
        trig = clean(tr.group(1)) if tr else ""
        if trig and trig not in ("-", "−"):
            text = (text + "\n" + trig) if text else trig
        if not text:
            continue
        items.append({"game": "ONE PIECE", "name": name, "url": url, "kind": kind, "text": text, "_id": cid})
    per_series[sid] = items

# dedupe by name across all (newest first)
seen = set()
for sid in SERIES:
    out = []
    for it in per_series[sid]:
        key = unicodedata.normalize("NFKC", it["name"]).replace(" ", "")
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    per_series[sid] = out

# select: per series quota, greedy coverage of categories
QUOTA = {"550117": 60, "550116": 55, "550115": 55, "550114": 55, "550204": 45}
cover = {k: 0 for k in CATS}
result = []
for sid in SERIES:
    pool = list(per_series[sid])
    chosen = []
    while pool and len(chosen) < QUOTA[sid]:
        def score(it):
            sc = 0.0
            for k, p in CATS.items():
                if re.search(p, it["text"]):
                    sc += 1.0 / (1 + cover[k])
            return sc
        best = max(pool, key=score)
        pool.remove(best)
        chosen.append(best)
        for k, p in CATS.items():
            if re.search(p, best["text"]):
                cover[k] += 1
    chosen.sort(key=lambda x: x["_id"])
    result.extend(chosen)

for it in result:
    del it["_id"]
(RAW / "op.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
print(len(result), {sid: len(per_series[sid]) for sid in SERIES})
print(cover)
from collections import Counter
print(Counter(x["kind"] for x in result))
