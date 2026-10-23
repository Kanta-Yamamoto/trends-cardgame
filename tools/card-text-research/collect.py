"""
ハースストーン・MTG・遊戯王OCG の日本語の効果文を、公式（とそれに準じる）データから集める。

使い方：
  python3 -I tools/card-text-research/collect.py <raw のフォルダ>

raw のフォルダはリポジトリの外に置く（効果文の全文は著作物なので、リポジトリには入れない）。
ほかの 4 ゲーム（デュエル・マスターズ・ONE PIECE・ポケモンカード・Shadowverse）は collect_others.py。

出典：
  ハースストーン … HearthstoneJSON（公式のゲームデータを書き出したもの）https://api.hearthstonejson.com/v1/latest/jaJP/cards.collectible.json
  MTG          … Scryfall の日本語版の印刷文 https://api.scryfall.com/（lang:ja）
  遊戯王OCG     … 公式カードデータベース https://www.db.yugioh-card.com/yugiohdb/
"""

import html
import json
import os
import random
import re
import sys
import time
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"


def get(url: str, accept: str = "*/*") -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def hearthstone(out: str):
    data = json.loads(get("https://api.hearthstonejson.com/v1/latest/jaJP/cards.collectible.json"))
    # 基本セット（CORE）と、新しい拡張から
    sets = {"CORE": 90, "EVENT": 40, "WHIZBANGS_WORKSHOP": 40, "ISLAND_VACATION": 40, "SPACE": 40, "EMERALD_DREAM": 40, "THE_LOST_CITY": 40, "TIME_TRAVEL": 40}
    random.seed(1)
    picked = []
    for s, n in sets.items():
        cs = [c for c in data if c.get("set") == s and c.get("text") and c.get("type") in ("MINION", "SPELL")]
        random.shuffle(cs)
        picked += cs[:n]

    def clean(t: str) -> str:
        t = re.sub(r"\[x\]|</?[bi]>", "", t).replace("$", "").replace("#", "").replace("_", " ").replace("&", "")
        return re.sub(r"\n(?=[^\n])", "", t).strip()

    rows = [
        {"game": "ハースストーン", "name": c["name"], "url": f"https://hearthstone.blizzard.com/ja-jp/cards/{c['dbfId']}", "kind": {"MINION": "ミニオン", "SPELL": "呪文"}[c["type"]], "text": clean(c["text"])}
        for c in picked
    ]
    json.dump(rows, open(os.path.join(out, "hs.json"), "w"), ensure_ascii=False)
    return len(rows)


def mtg(out: str):
    rows = []
    for s in ["fdn", "blb", "dsk", "dft", "tdm"]:
        q = urllib.parse.quote(f"lang:ja set:{s} -type:land")
        d = json.loads(get(f"https://api.scryfall.com/cards/search?q={q}&unique=cards", "application/json"))
        for c in d["data"]:
            t = c.get("printed_text")
            if t:
                rows.append({"game": "MTG", "name": c.get("printed_name") or c["name"], "url": c["scryfall_uri"].split("?")[0], "kind": c.get("printed_type_line") or c["type_line"], "text": t})
        time.sleep(0.3)
    random.seed(1)
    random.shuffle(rows)
    rows = rows[:300]
    json.dump(rows, open(os.path.join(out, "mtg.json"), "w"), ensure_ascii=False)
    return len(rows)


def yugioh(out: str):
    rows, seen = [], set()
    base = "https://www.db.yugioh-card.com"
    for p in (1, 2, 3):
        t = get(f"{base}/yugiohdb/card_search.action?ope=1&sess=1&rp=100&page={p}&sort=21&stype=1&othercon=2&request_locale=ja").decode("utf-8")
        time.sleep(1)
        for blk in t.split('<div class="t_row c_normal')[1:]:
            name = re.search(r"class=\"cnm\" value='([^']*)'", blk)
            tx = re.search(r'<dd class="box_card_text[^"]*">(.*?)</dd>', blk, re.S)
            link = re.search(r'class="link_value" value="([^"]+)"', blk)
            kind = re.search(r'<span class="card_info_species_and_other_item"><span>(.*?)</span>', blk, re.S)
            if not (name and tx and link):
                continue
            k = re.sub(r"<!--.*?-->|\s|【|】", "", kind.group(1), flags=re.S) if kind else "魔法・罠"
            n = html.unescape(name.group(1))
            # 通常モンスターの文はフレーバーなので除く
            if n in seen or ("通常" in k and "魔法" not in k):
                continue
            seen.add(n)
            text = re.sub(r"<[^>]+>", "", html.unescape(re.sub(r"&lt;br&gt;|<br\s*/?>", "\n", tx.group(1))))
            rows.append({"game": "遊戯王OCG", "name": n, "url": base + link.group(1), "kind": k, "text": re.sub(r"[ \t]+", "", text).strip()})
    json.dump(rows, open(os.path.join(out, "ygo.json"), "w"), ensure_ascii=False)
    return len(rows)


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    print("hs", hearthstone(out), "mtg", mtg(out), "ygo", yugioh(out))
