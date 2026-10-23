# TRENDS カードゲーム

AIで描いたイラストを立体感のあるキラカードにして遊ぶ、オリジナルカードゲーム。Web とスマホアプリ（Capacitor）で出す予定。

作業の前に [`docs/working-agreement.md`](docs/working-agreement.md)（オーナーからの指示・進め方）と [`docs/history.md`](docs/history.md)（経緯）を読む。カード面・演出を触るときは [`docs/design-standard-director.md`](docs/design-standard-director.md)（カード面の基準）と [`docs/attack-motion-standard.md`](docs/attack-motion-standard.md)（攻撃モーションの基準）も読み、新しい演出は入れる前に動くモックで見せる。公開前のあいだは、CI が通ったら Claude が自分でマージする（オーナーの許可は要らない。公開したら、オーナーの一言でマージする形に戻す）。オーナーや友人が対戦中と分かっているときは本番に出さない。

## 構成（pnpm workspaces + Turborepo）

- `apps/web` — React 19 + Vite + TypeScript。画面はスマホの縦の形1つだけで、アプリ全体を画面の枠（`src/frame.ts`。PC でも幅 480px まで・中の `position: fixed` は枠いっぱい）に入れてある。カード表示（`src/cards`）、CPU 対戦（`src/pages/Play.tsx`、CPU は `planTurnSearch`）、オンライン対戦（`src/pages/Online.tsx`）。`public/prototypes/cards` にキラカードの HTML 試作（参照用）。書体は Fontsource で同梱（画面の文字＝M PLUS 1、数字・ロゴ＝Lilita One、共通カードの名前＝Dela Gothic One、演出の中の文字（対戦開始の VS など）＝Zen Old Mincho。`src/main.tsx` で読み込む。★5 の専用デザインはカードごとの書体のまま）。PWA（`public/manifest.webmanifest`・`public/sw.js`・`src/pwa.ts`。サービスワーカーの中身を変えたら `sw.js` の `VERSION` を上げる。今ある絵を同じ名前で差し替えたときも上げる）
- `apps/api` — NestJS 11 + Drizzle ORM + PostgreSQL。`GET /cards`、`GET /health`、Google ログイン（`/auth/*`）、自分で組んだデッキの保存（`GET`・`PUT /me/decks`。ログインしたアカウントごと）、オンライン対戦（`POST /matches` と Socket.IO。ランダムマッチ・持ち時間・レーティング・ランキング `GET /rankings` も。仕組みは `docs/online.md`）
- `packages/cards` — カードデータ（`src/cards.json`）と型。web・api・game-core の共通の元データ
- `packages/game-core` — ゲームのルール。画面に依存しない純粋な関数（`applyAction(state, action, catalog)`）と CPU の思考（`planTurnSearch`：1ターン分をビームサーチで先読みし、相手の殴り返しまで試して盤面の点数で選ぶ。`planTurn` は採点ルールだけの貪欲法で、探索の候補と相手の読みに使う）。ルールの説明は `docs/rules.md`
- `infra/terraform` — GCP（Cloud Run・Artifact Registry・Secret Manager・Workload Identity）。API が Web も配る1つの Cloud Run 構成。公開の手順は `docs/deploy.md`
- `legacy/prototype-src` — 試作の元ソース（参照用、ビルド対象外）
- `assets/original` — 生成した元イラスト（印刷用）
- `tools/cutout.py` — 元イラストから人物を切り抜く

## コマンド

```sh
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed   # PostgreSQL（docker compose）
pnpm dev        # web: http://localhost:5173 / api: http://localhost:3001
pnpm lint       # Biome
pnpm typecheck
pnpm test       # api のテストは PostgreSQL が必要
pnpm build
```

環境変数は `.env.example` を参照（`apps/api/.env` に `DATABASE_URL`。手元でオンライン対戦を試すときは `AUTH_DEV_LOGIN=true` で名前だけのログインが使える）。

## ルール

- ゲームのルールは必ず `packages/game-core` に書き、テストを付ける。画面側にルールを書かない
- 画面・効果文の用語は `docs/rules.md` の「用語」にそろえる（マスター・ライフ・アイコン・攻撃力・体力・話題力）。攻撃力は赤、体力は青で表示する
- 効果文の言い回し（引く・出す・回復・対象の書き方など）は `docs/rules.md` の「効果文の書き方」にそろえる
- `applyAction` は元の state を変更しない。反則は `RuleError`（日本語のメッセージ）を投げる
- 新しいカード：`packages/cards/src/cards.json` に追加 → 効果があれば `packages/game-core/src/abilities.ts` にカード ID で登録 → 表示は `apps/web/src/cards/faces/` にデザインを追加して `HoloCard.tsx` の `FACES` に登録
- DB スキーマを変えたら `pnpm db:generate` でマイグレーションを作り、`apps/api/drizzle/` ごとコミットする
- 画像は `apps/web/public/assets/cards/` に `cN-art.jpg`（背景）と `cN-subject.webp`（切り抜き）を置く。イラストの依頼は `docs/card-art-prompt.md`（★が低いほどシンプルに）のフォーマットを使い、カードごとの注文は `docs/card-art-orders.md` に残す
- リント・整形は Biome。コミット前に `pnpm lint` を通す
- CI（`.github/workflows/ci.yml`）はリント・型・テスト（実 PostgreSQL）・ビルド・API の Docker ビルド・Terraform の検証を行う。main で CI が通ると `deploy.yml` が Cloud Run にデプロイする（GitHub の Variables が登録されているときだけ）
