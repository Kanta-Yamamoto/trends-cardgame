import glob
import json
import re
import sys

src, out = sys.argv[1], sys.argv[2]
KIND = {1: "フォロワー", 2: "アミュレット", 3: "アミュレット", 4: "スペル"}


def clean(t):
    t = t.replace("\r\n", "\n")
    t = re.sub(r"\n?<hr>\n?", "\n", t)
    t = re.sub(r"<color=[^>]*>(.*?)</color>", r"\1", t)
    t = re.sub(r"</?[a-zA-Z]+(=[^>]*)?>", "", t)
    t = re.sub(r"\n{2,}", "\n", t)
    return t.strip()


res, seen = [], set()
for s in ["10009", "10008", "10007"]:
    files = sorted(glob.glob(f"{src}/s{s}_*.json"), key=lambda f: int(f.rsplit("_", 1)[1][:-5]))
    for f in files:
        dd = json.load(open(f, encoding="utf-8"))["data"]
        for cid in dd["sort_card_id_list"]:
            c = dd["card_details"].get(str(cid))
            if not c:
                continue
            co = c["common"]
            name = co["name"]
            text = clean(co.get("skill_text") or "")
            if not text or name in seen:
                continue
            seen.add(name)
            res.append({
                "game": "Shadowverse",
                "name": name,
                "url": f"https://shadowverse-wb.com/ja/deck/cardslist/card/?card_id={cid}",
                "kind": KIND.get(co["type"], str(co["type"])),
                "text": text,
            })
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False)
print(len(res))
