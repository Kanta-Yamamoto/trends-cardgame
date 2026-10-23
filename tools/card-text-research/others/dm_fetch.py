import re
import subprocess
import sys
import time
from pathlib import Path

OUT = Path(sys.argv[1])  # raw/dm_html
PRODUCTS = ["26rp3", "26rp2", "26rp1", "25rp4"]
PER_PRODUCT = 80
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36"


def curl(args, dest):
    if dest.exists() and dest.stat().st_size > 1000:
        return False
    subprocess.run(["curl", "-sSL", "-A", UA, *args, "-o", str(dest)], check=True)
    time.sleep(1.1)
    return True


for p in PRODUCTS:
    ids = []
    page = 1
    while True:
        dest = OUT / f"p{p}_{page}.html"
        curl(["-X", "POST", "-d", f"products={p}&pagenum={page}", "https://dm.takaratomy.co.jp/card/"], dest)
        s = dest.read_text(encoding="utf-8")
        new = [x for x in dict.fromkeys(re.findall(r"detail/\?id=([\w-]+)", s)) if x not in ids]
        ids += new
        pages = [int(x) for x in re.findall(r'data-page="(\d+)"', s)]
        if not new or page >= max(pages or [1]):
            break
        page += 1
    # main numbered cards only (exclude secret/special prefixed variants), spread evenly
    main = [x for x in ids if re.fullmatch(rf"dm{p}-\d+", x)]
    rest = [x for x in ids if x not in main]
    pool = main or ids
    step = max(1, len(pool) / PER_PRODUCT)
    pick = [pool[int(i * step)] for i in range(min(PER_PRODUCT, len(pool)))]
    print(p, "ids", len(ids), "main", len(main), "pick", len(pick), flush=True)
    (OUT / f"ids_{p}.txt").write_text("\n".join(pick), encoding="utf-8")
    for cid in pick:
        curl([f"https://dm.takaratomy.co.jp/card/detail/?id={cid}"], OUT / f"d_{cid}.html")
print("done")
