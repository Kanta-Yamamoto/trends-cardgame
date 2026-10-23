# 効果文の書き方の調べ（道具）

代表的なカードゲームの日本語の効果文を集めて、書き方の型を数える。結果と考察は [docs/research/card-text/](../../docs/research/card-text/README.md)、決まりは [docs/card-text.md](../../docs/card-text.md)。

集めた効果文の全文は著作物なので、**リポジトリの外のフォルダ**（例 `~/card-text-raw`）に置く。リポジトリに入れるのは `analyze.py` が書き出す集計・タグ・短い型の句だけ。

## 1. 集める

各ゲームの JSON は `[{"game", "name", "url", "kind", "text"}]` の形で、`<raw>/<略号>.json` に置く。アクセスは 1 秒に 1 回くらいに抑える。

| 略号 | ゲーム | 取り方 |
|---|---|---|
| hs・mtg・ygo | ハースストーン・MTG・遊戯王OCG | `python3 -I tools/card-text-research/collect.py <raw>` |
| dm | デュエル・マスターズ | `python3 -I others/dm_fetch.py <raw>/dm_html`（公式検索に `products=<弾>&pagenum=<N>` を POST → 詳細ページ `/card/detail/?id=`）→ `python3 -I others/dm_parse.py <raw>` |
| op | ONE PIECE | 公式の弾の一覧 `https://www.onepiece-cardgame.com/cardlist/?search=true&series=<弾ID>` を `<raw>/op_html/s<弾ID>.html` に保存 → `python3 -I others/op_parse.py <raw>` |
| pk | ポケモンカード | 一覧 API `https://www.pokemon-card.com/card-search/resultAPI.php?keyword=&regulation_sidebar_form=all&sm_and_keyword=true&page=<N>`（新しい順・39 枚ずつ）でカード ID を `ids.txt` に → 詳細ページ `details.php/card/<ID>/regu/all` を `<raw>/pk_html/` に保存 → `python3 -I others/pk_parse.py <raw>/pk_html <raw>/pk.json <raw>/pk_html/ids.txt` |
| sv | Shadowverse（Worlds Beyond） | 一覧 API `https://shadowverse-wb.com/web/CardList/cardList?card_set=<弾ID>&offset=<0,30,…>`（ヘッダー `Lang: ja` と Referer `https://shadowverse-wb.com/ja/deck/cardslist/`）を `<raw>/sv_html/s<弾ID>_<offset>.json` に保存 → `python3 -I others/sv_parse.py <raw>/sv_html <raw>/sv.json` |

`others/` の中は、10月24日の調べで使ったものをそのまま置いた（弾の ID・枚数はスクリプトの先頭）。

## 2. 数える

```sh
python3 -I tools/card-text-research/analyze.py <raw> docs/research/card-text
```

TRENDS の今の効果文は `packages/cards/src/cards.json` から読んで、同じ表に並べる。書き出すもの：`table.md`（ゲームを列にした表）・`summary.json`（集計）・`cards.csv`（1 枚 1 行のタグ）。
