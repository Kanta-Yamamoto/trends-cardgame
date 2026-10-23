"""
代表的なカードゲームの日本語の効果文から、書き方の型を数える。

使い方：
  python3 -I tools/card-text-research/analyze.py <raw のフォルダ> docs/research/card-text

raw のフォルダには、集めた効果文（README.md の手順で作る。リポジトリには入れない）を
ゲームごとに JSON で置く：[{"game", "name", "url", "kind", "text"}]。TRENDS の今の文は cards.json から読む

出力（リポジトリに入れる。効果文の全文は入れず、カードごとのタグと、型に直した短い句だけ）：
  cards.csv      … 1 枚 1 行。ゲーム・カード名・出典 URL・種類・長さ・文の数・動きのタグ・対象のタグ・きっかけ・型の句
  summary.json   … ゲームごとの集計（下の表の元）
"""

import collections
import csv
import json
import os
import re
import subprocess
import sys

ZEN = str.maketrans("０１２３４５６７８９＋－", "0123456789+-")

# 動きの種類ごとに、各ゲームの言い回しを拾う正規表現（型の句として、数字を N に直して残す）
ACTIONS = {
    "引く": [r"カード(?:を)?\s?N\s?枚(?:を)?引", r"N\s?枚(?:を)?ドロー", r"山札を\s?N\s?枚引", r"N\s?枚(?:を)?引(?:く|き)"],
    "ダメージ": [r"N\s?点のダメージ", r"N\s?ダメージ", r"ダメージカウンターを\s?N\s?個"],
    "破壊": [r"破壊(?:する|し|され)", r"KOする|KOし", r"きぜつさせ", r"死亡させ"],
    "回復": [r"回復", r"N\s?点のライフを得"],
    "強化": [r"\+N/\+N", r"\+N\s?/\s?\+N", r"パワー\s?\+N", r"攻撃力(?:は|を)?\s?N\s?アップ", r"攻撃力\s?\+N", r"\+N\s?/\s?\+N\s?の修整", r"\+N/\+Nを獲得", r"攻撃力と体力を\s?\+N"],
    "弱体": [r"-N/-N", r"-N\s?/\s?-N", r"パワー\s?-N", r"攻撃力(?:は|を)?\s?N\s?ダウン", r"攻撃力\s?-N"],
    "出す・トークン": [r"トークン", r"(?<!特殊)召喚する|(?<!特殊)召喚し(?!た)", r"生成する|生成し", r"(?:場|バトル場|ベンチ)に出す"],
    "戻す": [r"手札に戻", r"持ち主の手札", r"オーナーの手札"],
    "奪う": [r"コントロールを得", r"奪う|奪い", r"自分の場に移"],
    "状態": [r"凍結", r"レスト(?:に|にする|にし)", r"タップ(?:する|し)", r"ねむり|マヒ|まひ|どく|やけど|こんらん", r"眠り|眠ら", r"沈黙", r"無効(?:に|化)"],
    "キーワード付与": [r"(?<!/\+N)(?<!/-N)を付与", r"(?<!ライフ)(?<!コントロール)を得る|(?<!ライフ)(?<!コントロール)を得て|(?<!コントロール)を得、", r"を持つ(?!.*カード)"],
    "探す": [r"(?:デッキ|山札|ライブラリー)から.{0,30}(?:手札に加え|探)"],
    "コスト補正": [r"コスト(?:が|を|は)?\s?[(（]?N[)）]?\s?(?:減|少な|下が|-)", r"コスト\s?-N"],
}

# きっかけ（ゲームの言い回し → まとめた呼び名）
TRIGGERS = [
    ("場に出たとき", r"雄叫び|ファンファーレ|【登場時】|戦場に出たとき|が出た時|召喚(?:・特殊召喚)?(?:に成功)?した(?:場合|時)|場に出たとき|出したとき|バトル場に出したとき"),
    ("破壊されたとき", r"断末魔|ラストワード|【KO時】|破壊された(?:とき|時|場合)|墓地に置かれたとき|死亡した時|きぜつしたとき|破壊されたとき|離れたとき|離れた時"),
    ("攻撃したとき", r"【アタック時】|攻撃時|攻撃するたび|攻撃する時|攻撃したとき|攻撃宣言時|アタックする時"),
    ("ターンの始め", r"開始時|ターン開始時|ターンのはじめ|自分のターンの始めに|アップキープの開始時"),
    ("ターンの終わり", r"終了時に|ターン終了時、|エンドフェイズ|【ターン終了時】|ターンの終わりに|終了時、"),
    ("〜するたび", r"たび|度に|たびに|するごと"),
]

KEYWORDS = {
    "TRENDS（今）": ["ガード", "速攻", "突進", "連撃", "注目", "コンボ"],
    "ハースストーン": ["挑発", "突撃", "急襲", "聖なる盾", "隠れ身", "生命奪取", "猛毒", "疾風", "呪文ダメージ", "再誕", "休眠", "秘策", "超電磁", "発見"],
    "MTG": ["飛行", "到達", "速攻", "警戒", "接死", "絆魂", "トランプル", "先制攻撃", "二段攻撃", "瞬速", "威迫", "防衛", "呪禁", "破壊不能", "護法"],
    "Shadowverse": ["【守護】", "【疾走】", "【突進】", "【必殺】", "【ドレイン】", "【潜伏】", "【オーラ】", "【威圧】", "【バリア】"],
    "デュエル・マスターズ": ["ブロッカー", "スピードアタッカー", "W・ブレイカー", "T・ブレイカー", "S・トリガー", "シールド・トリガー", "マッハファイター", "ジャストダイバー", "ガードマン", "パワーアタッカー"],
    "ONE PIECE": ["【ブロッカー】", "【速攻】", "【ダブルアタック】", "【バニッシュ】", "【突進】", "【トリガー】", "【カウンター】"],
}

OWN = {"自分の": r"自分の", "相手の": r"相手の", "あなたの": r"あなたの|あなたが", "対戦相手": r"対戦相手", "味方の": r"味方の", "敵の": r"敵の", "お互い": r"お互い|両方の|すべてのプレイヤー|各プレイヤー"}

TARGETS = {
    "選ぶ": r"(?:N\s?(?:体|枚|つ|匹|人)(?:まで)?(?:を)?(?:選|対象)|を選び|を選ぶ|対象とする|対象として|選んで)",
    "数を付ける": r"N\s?(?:体|枚|つ|匹|人|個)",
    "ランダム": r"ランダム",
    "すべて": r"すべて|全て|全員|各(?:クリーチャー|ミニオン|フォロワー|対戦相手)",
    "条件で絞る": r"(?:パワー|攻撃力|体力|コスト|レベル)(?:が)?\s?N\s?(?:以下|以上)の",
    "いちばん": r"(?:一番|いちばん|最も)(?:高い|低い|大きい|小さい)",
}

CONDITION = {"なら": r"なら[、,]?", "場合": r"場合[、,]", "いれば": r"いれば|あれば", "かぎり": r"かぎり|限り"}

PUNCT = {
    "「」": r"[「」]",
    "『』": r"[『』]",
    "（）": r"[（）()]",
    "【】": r"[【】]",
    "：": r"[：:]",
    "・": r"・",
    "×": r"×",
    "全角の数字": r"[０-９]",
    "半角の数字": r"[0-9]",
}

# 書き方の分かれ目。ゲームごとに、それぞれの書き方の文が何枚に出るかを数える
STYLE = {
    "ダメージ：「Nダメージ」で止める": r"N\s?ダメージ(?:[。、]|$)",
    "ダメージ：「〜を与える」まで書く": r"ダメージを与え",
    "対象：「〜N体に／N体を」（数を名詞のあとに）": r"(?:キャラクター|キャラ|クリーチャー|ミニオン|フォロワー|モンスター|ポケモン|カード|種族)N\s?(?:体|枚|匹)(?:まで)?(?:に|を|の)",
    "対象：「〜をN体選び」（選ぶを書く）": r"N\s?(?:体|枚|匹)(?:まで)?選(?:び|ぶ|んで)",
    "対象：「〜を対象とする／対象として」": r"対象と(?:する|して)",
    "続け：「〜し、〜する」でつなぐ": r"(?:し|え|せ|け|げ|め)、(?:その|それ|そのキャラ|自分|相手|カード)",
    "続け：「その〜」「それ」で前の対象を指す": r"(?:。|、)(?:その(?:キャラ|クリーチャー|ミニオン|フォロワー|モンスター|ポケモン|カード)|それ)",
    "強化：「+N/+N」": r"\+N\s?/\s?\+N",
    "強化：「攻撃力+N」などステータス名": r"(?:攻撃力|体力|パワー|HP)\s?[+＋]\s?N",
    "強化：「〜はNアップ」": r"N\s?アップ",
    "条件：「〜なら、」": r"なら、",
    "条件：「〜場合、」": r"場合、",
    "条件：「〜いれば、」「〜あれば、」": r"(?:いれば|あれば)、",
    "条件：「〜かぎり」": r"かぎり|限り",
    "自分を指す：「このカード」": r"このカード",
    "自分を指す：「この〜（種類）」": r"この(?:キャラ|クリーチャー|ミニオン|フォロワー|モンスター|ポケモン)",
    "自分を指す：「自身」「これ」": r"自身|これ(?:は|を|に|の)",
    "期間：「このターン」": r"このターン",
    "期間：「ターン終了時まで」": r"ターン終了時まで",
    "数：「N体」「N枚」と単位を付ける": r"N\s?(?:体|枚|匹|つ|個)",
    "すべて：「すべて」": r"すべて",
    "すべて：「全て」": r"全て",
    "すべて：「各〜」": r"各(?:クリーチャー|ミニオン|フォロワー|対戦相手|プレイヤー)",
    "ランダム：「ランダムな〜」「ランダムに」": r"ランダム",
    "きっかけ：「〜とき、」": r"とき、",
    "きっかけ：「〜時、」": r"時、",
    "きっかけ：記号で書く（雄叫び:・【登場時】など）": r"^.{0,12}?(?:[:：]|】)",
    "引く：「カードをN枚引く」": r"カードをN\s?枚引",
    "引く：「カードN枚を引く」": r"カードN\s?枚を引",
    "引く：「N枚ドロー」": r"N\s?枚ドロー",
    "引く：「山札を／デッキからN枚引く」": r"(?:山札を|デッキから)N\s?枚(?:を)?引",
    "自分の強化：主語を書かない（「攻撃力+N」「+N/+Nを獲得する」）": r"(?:^|[:：】、。\n])\s*(?:攻撃力\s?\+N|\+N/\+Nを獲得|パワー\s?\+N)",
    "自分の強化：主語を書く（「これは+N/+N」「このキャラは」）": r"(?:これ|自身|このカード|この(?:キャラ|クリーチャー|ミニオン|フォロワー|モンスター|ポケモン))(?:は|に|の攻撃力は|のパワー)\s?(?:\+N|、?このターン中|ターン終了時まで|N\s?アップ)",
    "続け：動詞の連用形「〜し、」で次の動きへ": r"(?:破壊し|回復し|引き|戻し|出し|与え|にし)、",
    "文の終わり：「〜する。」": r"(?:する|る|す|う|く|ぐ|む|ぶ|つ)。",
    "文の終わり：名詞・数で止める（「破壊。」「3ダメージ。」）": r"(?:破壊|ダメージ|\+N|-N|回復)。",
}

GAME_FILES = {
    "trends": "TRENDS（今）",
    "hs": "ハースストーン",
    "mtg": "MTG",
    "ygo": "遊戯王OCG",
    "dm": "デュエル・マスターズ",
    "op": "ONE PIECE",
    "pk": "ポケモンカード",
    "sv": "Shadowverse",
}


def norm(text: str) -> str:
    t = text.translate(ZEN)
    t = re.sub(r"\d+", "N", t)
    return t


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r"[。\n]", text) if s.strip()]


def phrase(t: str, m: re.Match) -> str:
    """型の句：見つかった言い回しの前後を少しだけ残す（全文は残さない）"""
    s = max(0, m.start() - 8)
    e = min(len(t), m.end() + 4, s + 24)
    return re.sub(r"\s+", " ", t[s:e]).strip("、。 ")


def analyze(game: str, cards: list[dict]):
    rows = []
    for c in cards:
        raw = c["text"].replace("&", "").strip()
        t = norm(raw)
        body = re.sub(r"\s", "", raw)
        tags, phrases = [], []
        for a, pats in ACTIONS.items():
            for p in pats:
                m = re.search(p, t)
                if m:
                    tags.append(a)
                    phrases.append(f"{a}:{phrase(t, m)}")
                    break
        trig = [name for name, p in TRIGGERS if re.search(p, t)]
        pos = {name: m.start() for name, p in TRIGGERS if (m := re.search(p, t))}
        order = sorted(pos, key=pos.get)
        tgt = [name for name, p in TARGETS.items() if re.search(p, t)]
        own = [name for name, p in OWN.items() if re.search(p, t)]
        cond = [name for name, p in CONDITION.items() if re.search(p, t)]
        punct = {name: len(re.findall(p, raw)) for name, p in PUNCT.items()}
        kws = [k for k in KEYWORDS.get(game, []) if k in raw]
        # キーワードが先頭にあるか（キーワードとほかの文の両方があるカードだけ見る）
        kw_first = None
        alone = [k for k in kws if re.search(r"(?:^|\n|、|。)\s*" + re.escape(k) + r"\s*(?:$|\n|、|。|（|\()", raw)]
        if alone and len(body) > sum(len(k) for k in alone) + 4:
            first = min(raw.find(k) for k in alone)
            kw_first = first <= 2
        ss = sentences(raw)
        rows.append(
            {
                "game": game,
                "name": c["name"],
                "url": c["url"],
                "kind": c.get("kind", ""),
                "length": len(body),
                "sentences": len(ss),
                "commas_per_sentence": round(raw.count("、") / max(1, len(ss)), 2),
                "ends_with_maru": raw.rstrip().endswith(("。", "）", ")")),
                "actions": tags,
                "targets": tgt,
                "owners": own,
                "triggers": trig,
                "conditions": cond,
                "keywords": kws,
                "keyword_first": kw_first,
                "punct": punct,
                "phrases": phrases,
                "trigger_order": order,
                "style": [k for k, p in STYLE.items() if re.search(p, t, re.M)],
            }
        )
    return rows


def summarize(rows: list[dict]):
    n = len(rows)
    out = {"cards": n}
    lens = sorted(r["length"] for r in rows)
    out["length_median"] = lens[n // 2] if n else 0
    out["length_p25"] = lens[n // 4] if n else 0
    out["length_p75"] = lens[(3 * n) // 4] if n else 0
    out["sentences_median"] = sorted(r["sentences"] for r in rows)[n // 2] if n else 0
    out["commas_per_sentence_avg"] = round(sum(r["commas_per_sentence"] for r in rows) / max(1, n), 2)
    out["ends_with_maru"] = round(sum(r["ends_with_maru"] for r in rows) / max(1, n), 2)
    for key in ("actions", "targets", "owners", "triggers", "conditions"):
        cnt = collections.Counter(x for r in rows for x in r[key])
        out[key] = {k: round(v / max(1, n), 3) for k, v in cnt.most_common()}
    kf = [r["keyword_first"] for r in rows if r["keyword_first"] is not None]
    out["keyword_first"] = {"cards": len(kf), "rate": round(sum(kf) / len(kf), 2) if kf else None}
    pairs = collections.Counter()
    for r in rows:
        o = r["trigger_order"]
        for i in range(len(o)):
            for j in range(i + 1, len(o)):
                pairs[f"{o[i]}→{o[j]}"] += 1
    out["trigger_pairs"] = dict(pairs.most_common())
    st = collections.Counter(x for r in rows for x in r["style"])
    out["style"] = {k: round(st[k] / max(1, n), 3) for k in STYLE}
    out["punct_cards"] = {
        k: round(sum(1 for r in rows if r["punct"][k] > 0) / max(1, n), 3) for k in PUNCT
    }
    # 動きごとに、よく出る型の句（数字は N）
    by = collections.defaultdict(collections.Counter)
    for r in rows:
        for p in r["phrases"]:
            a, s = p.split(":", 1)
            core = s
            for pat in ACTIONS[a]:
                m = re.search(pat, s)
                if m:
                    # 句の前の 6 文字までを残す（「〜に」「〜を」などの助詞が見える長さ）
                    core = s[max(0, m.start() - 6) : m.end() + 3]
                    break
            by[a][core] += 1
    out["top_phrases"] = {a: c.most_common(6) for a, c in by.items()}
    return out


def trends_cards() -> list[dict]:
    """TRENDS の今の効果文（お蔵入り・トークンは除く。闇堕ちの姿も 1 枚に数える）"""
    here = os.path.dirname(os.path.abspath(__file__))
    data = json.load(open(os.path.join(here, "../../packages/cards/src/cards.json"), encoding="utf-8"))
    rows = []
    for c in data:
        if c.get("retired") or c.get("token"):
            continue
        base = "packages/cards/src/cards.json#" + c["id"]
        kind = "キャラクター" if c["type"] == "icon" else "呪文"
        if c["effect"]:
            rows.append({"game": "TRENDS（今）", "name": c["name"], "url": base, "kind": kind, "text": c["effect"]})
        if c.get("dark"):
            rows.append({"game": "TRENDS（今）", "name": c["dark"]["name"], "url": base + ".dark", "kind": "闇堕ち", "text": c["dark"]["effect"]})
    return rows


def write_table(summary: dict, path: str):
    """ゲームを列にした表（%は、その書き方の文が出るカードの割合）"""
    games = list(summary)
    lines = ["| 項目 | " + " | ".join(games) + " |", "|---|" + "---|" * len(games)]

    def row(label, f):
        lines.append(f"| {label} | " + " | ".join(f(summary[g]) for g in games) + " |")

    row("集めた枚数", lambda s: str(s["cards"]))
    row("1 枚の長さ（字・中央値）", lambda s: str(s["length_median"]))
    row("1 枚の長さ（字・25〜75%）", lambda s: f"{s['length_p25']}〜{s['length_p75']}")
    row("文の数（中央値）", lambda s: str(s["sentences_median"]))
    row("1 文あたりの「、」", lambda s: str(s["commas_per_sentence_avg"]))
    row("「。」で終わる", lambda s: f"{int(100 * s['ends_with_maru'])}%")
    row("キーワードが先頭（キーワードとほかの文があるカード）", lambda s: "-" if s["keyword_first"]["rate"] is None else f"{int(100 * s['keyword_first']['rate'])}%（{s['keyword_first']['cards']}枚）")
    for k in STYLE:
        row(k, lambda s, k=k: f"{int(round(100 * s['style'][k]))}%")
    for k in PUNCT:
        row(f"記号：{k}", lambda s, k=k: f"{int(round(100 * s['punct_cards'][k]))}%")
    for k in ACTIONS:
        row(f"動き：{k}", lambda s, k=k: f"{int(round(100 * s['actions'].get(k, 0)))}%")
    for name, _ in TRIGGERS:
        row(f"きっかけ：{name}", lambda s, n=name: f"{int(round(100 * s['triggers'].get(n, 0)))}%")
    for k in TARGETS:
        row(f"対象：{k}", lambda s, k=k: f"{int(round(100 * s['targets'].get(k, 0)))}%")
    for k in OWN:
        row(f"誰の：{k}", lambda s, k=k: f"{int(round(100 * s['owners'].get(k, 0)))}%")
    open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")


def main():
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    all_rows, summary = [], {}
    for f, game in GAME_FILES.items():
        path = os.path.join(src, f"{f}.json")
        if f == "trends":
            cards = trends_cards()
        elif os.path.exists(path):
            cards = json.load(open(path, encoding="utf-8"))
        else:
            print(f"skip {f}", file=sys.stderr)
            continue
        rows = analyze(game, cards)
        all_rows += rows
        summary[game] = summarize(rows)
    with open(os.path.join(dst, "cards.csv"), "w", encoding="utf-8", newline="") as fp:
        w = csv.writer(fp)
        w.writerow(["game", "name", "url", "kind", "length", "sentences", "actions", "targets", "owners", "triggers", "conditions", "keywords", "keyword_first", "phrases"])
        for r in all_rows:
            w.writerow([r["game"], r["name"], r["url"], r["kind"], r["length"], r["sentences"], "|".join(r["actions"]), "|".join(r["targets"]), "|".join(r["owners"]), "|".join(r["triggers"]), "|".join(r["conditions"]), "|".join(r["keywords"]), "" if r["keyword_first"] is None else int(r["keyword_first"]), " / ".join(r["phrases"])])
    json.dump(summary, open(os.path.join(dst, "summary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    write_table(summary, os.path.join(dst, "table.md"))
    # リポジトリの整形（Biome）に合わせる。CI の lint は summary.json の形も見る
    biome = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../node_modules/.bin/biome")
    if os.path.exists(biome):
        subprocess.run([biome, "format", "--write", dst], check=False, capture_output=True)
    else:
        print("biome が無いので整形していない（pnpm install のあと pnpm exec biome format --write で整形する）", file=sys.stderr)
    print(json.dumps({g: s["cards"] for g, s in summary.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
