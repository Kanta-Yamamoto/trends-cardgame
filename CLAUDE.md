# TRENDS カードゲーム

AIで描いたイラストを立体感のあるキラカードにして遊ぶ、オリジナルカードゲーム。Web とスマホアプリ（Capacitor）で出す予定。

**使う言語は日本語**。オーナーへの返事・確認の問い・ボタン・コミット・PR・ドキュメント・コードのコメントは、すべて日本語で書く（オーナーが英語で書いてきたときも日本語で返す）。

作業の前に [`docs/working-agreement.md`](docs/working-agreement.md)（オーナーからの指示・進め方）と [`docs/history.md`](docs/history.md)（経緯）を読む。何を作るか・どの順でやるかを決めるときは [`docs/product.md`](docs/product.md)（プロダクトの考え方）に沿う。カード・属性・闇堕ちの設計を決めるときは [`docs/design-mainline.md`](docs/design-mainline.md)（10月24日の決定事項と理由。王道＝推し属性・闇堕ちの決まり・ほかの属性を作るときの前提）を読む。カード面・演出を触るときは [`docs/design-standard-director.md`](docs/design-standard-director.md)（カード面の基準）と [`docs/attack-motion-standard.md`](docs/attack-motion-standard.md)（攻撃モーションの基準）も読み、新しい演出は入れる前に動くモックで見せる。変更は手元で `pnpm verify` を通して `dev` ブランチに溜め、キリのいいところ・オーナーが遊びたいときに **`dev` → main の PR を作り、GitHub の CI が通ったらマージして**本番に出す（この流れは外さない。作業ごとの PR は作らない。git と Claude Code のフックが、verify を通していない dev への push・main への直接の push・dev → main 以外の PR・CI が通っていない PR のマージを止める）。公開前のあいだは、Claude が自分で出す（オーナーの許可は要らない。公開したら、オーナーの一言で出す形に戻す）。オーナーや友人が対戦中と分かっているときは本番に出さない。

## 構成（pnpm workspaces + Turborepo）

- `apps/web` — React 19 + Vite + TypeScript。サービス全体で Google ログインが要る（ログインしていなければ、どのページでもログインの画面だけ。`src/App.tsx`・`src/auth/Login.tsx`。プレイヤー名を決めるまでは初期登録の画面だけ。`src/auth/Register.tsx`）。画面はスマホの縦の形1つだけで、アプリ全体を画面の枠（`src/frame.ts`。PC でも幅 480px まで・中の `position: fixed` は枠いっぱい）に入れてある。最初に開くのはホーム画面（`src/pages/Home.tsx`。お知らせは `src/home/news.ts`。開いている間は音楽が流れ、右上のボタンの小さな窓で音楽と効果音の大きさを 0〜5 で変える。曲はガチャ・カード一覧・デッキを組む・デッキ選び・対戦の盤面にもあり、`src/sound/music.ts` でまとめて流す。効果音は `src/sound/se.ts`、注文は `docs/sound-effects.md`）。配色は ①ソーダ（白 × 水色。色の元は `src/styles/app.css` の `:root`。対戦の盤面の地だけ濃い青）。カード表示（`src/cards`）、カード一覧（`/cards`。3 列の文字なしの絵の下に名前。持っていないカードは灰色、持っているカードは枚数。押すと画面に重ねる小窓 `src/game/CardPopup.tsx` で拡大。デッキを組む画面も同じ小窓）、CPU 対戦（`src/pages/Play.tsx`、CPU は `planTurnSearch`）、オンライン対戦（`src/pages/Online.tsx`）、マイページ（`/me`。ホームの左上の札から。名前を変える）、友だちを招待（ホームのメニュー・マイページ。合言葉付きのリンクを共有・コピー。`src/invite.ts`・`src/InviteFriends.tsx`）、ガチャ（`/gacha`・`src/gacha/`。開ける演出は `Opening.tsx`。本物のガチャはまだ押せず、画面の中だけのデモで引ける）・提供割合（`/gacha/rates`）・ジェムを買う（`/shop`。決済の準備ができるまでは買えない状態で画面だけ）、チュートリアル（`/tutorial`・`src/tutorial/`。初めてプレイヤー名を決めた人に、ちびミナモが案内する：導入 → 1 ターンだけの対戦 → ホーム → ガチャ。案内は押してほしい場所だけを光らせ、ほかは押せない。ホームのメニューからもう一度見られる）。`public/prototypes/cards` にキラカードの HTML 試作（参照用）。書体は Fontsource で同梱（画面の文字＝M PLUS 1、数字・ロゴ＝Lilita One、共通カードの名前＝Dela Gothic One、演出の中の文字（対戦開始の VS など）＝Zen Old Mincho。`src/main.tsx` で読み込む。★5 の専用デザインはカードごとの書体のまま）。PWA（`public/manifest.webmanifest`・`public/sw.js`・`src/pwa.ts`。サービスワーカーの中身を変えたら `sw.js` の `VERSION` を上げる。今ある絵を同じ名前で差し替えたときも上げる。新しい版を出すと、開いたままの画面も、ホームにいるときに黙って読み直す。ビルドごとの版の印 `version.json`（`vite.config.ts`）と比べる）
- `apps/api` — NestJS 11 + Drizzle ORM + PostgreSQL。`GET /cards`、`GET /health`、Google ログイン（`/auth/*`）、プレイヤー名（`PUT /me/name`。初めて決めたときに無償のジェムを配る）、ガチャ（`POST /gacha/open`。`GACHA_OPEN=true` のときだけ開ける）・ジェム（`GET /me/wallet`）・持っているカード（`GET /me/cards`。CPU 戦・オンライン対戦のデッキ選びで、持っていないカードが入ったデッキはレンタルデッキ）、自分で組んだデッキの保存（`GET`・`PUT /me/decks`。ログインしたアカウントごと）、リンクのプレビュー（OGP。画面の `<head>` に差し込む。`src/ogp.ts`、絵は `apps/web/public/ogp.jpg`）、招待リンクの合言葉（`GET /auth/invite`。招待済みの人だけ）、オンライン対戦（`POST /matches` と Socket.IO。ランダムマッチ・持ち時間・レーティング・ランキング `GET /rankings`・通信が切れた対戦に戻る `GET /me/match` も。仕組みは `docs/online.md`）、CPU 対戦の記録（`POST`・`GET /logs/cpu-games`。オーナーとの対戦を一手ずつ残し、Claude が読み返して CPU を強くする。最終の目的はカードのバランス調整。`docs/cpu-logs.md`）
- `packages/cards` — カードデータ（`src/cards.json`）と型。web・api・game-core の共通の元データ
- `packages/game-core` — ゲームのルール。画面に依存しない純粋な関数（`applyAction(state, action, catalog)`）と CPU の思考（`planTurnSearch`：1ターン分をビームサーチで先読みし、相手の殴り返しまで試して盤面の点数で選ぶ。`planTurn` は採点ルールだけの貪欲法で、探索の候補と相手の読みに使う）。ルールの説明は `docs/rules.md`。ガチャのパックの中身（`gacha.ts`）とプレイヤー名の決まり（`player.ts`）、チュートリアルの盤面（`tutorial.ts`）もここ
- `infra/terraform` — GCP（Cloud Run・Artifact Registry・Secret Manager・Workload Identity）。API が Web も配る1つの Cloud Run 構成。公開の手順は `docs/deploy.md`
- `legacy/prototype-src` — 試作の元ソース（参照用、ビルド対象外）
- `assets/original` — 生成した元イラスト（印刷用）
- `tools/cutout.py` — 元イラストから人物を切り抜く
- `tools/app-icon.py` — アプリのアイコン（『演出家』）を `apps/web/public/icons/` に作る。Android（maskable）だけ引いた絵
- `tools/promo-video.mjs` — SNS に出す、カード 1 枚を傾けて見せる短い動画を `sns/` に作る（撮影用のページは `apps/web/promo.html`。`docs/promo-video.md`）

## コマンド

```sh
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed   # PostgreSQL（docker compose）
pnpm dev        # web: http://localhost:5173 / api: http://localhost:3001
pnpm lint       # Biome
pnpm typecheck
pnpm test       # api のテストは PostgreSQL が必要
pnpm build
pnpm verify     # CI と同じ確かめ（先に pnpm db:up）。dev に取り込む前に通す
TRENDS_INVITE=合言葉 pnpm logs:cpu fetch   # 本番から CPU 対戦の記録を取り出す（pnpm logs:cpu summary で一覧）
pnpm promo:video c17 8.1   # SNS 用のカードの動画を sns/c17.mp4 に作る（先に pnpm dev）
```

環境変数は `.env.example` を参照（`apps/api/.env` に `DATABASE_URL`。手元でオンライン対戦を試すときは `AUTH_DEV_LOGIN=true` で名前だけのログインが使える）。

## ルール

- ゲームのルールは必ず `packages/game-core` に書き、テストを付ける。画面側にルールを書かない
- **画面・効果文・docs の用語は `docs/glossary.md`（用語集・ユビキタス言語）の呼び名だけを使い、効果文は `docs/card-text.md` の文の型で書く**（プレイヤー・ライフ・コスト・キャラクター・呪文・墓地・破壊・界隈・攻撃力・体力 など）。元は `packages/cards/src/glossary.ts` で、使わない呼び名が効果文・画面の文字に入るとテストで落ちる。新しい語は、用語集と `glossary.ts` に足してから使う。攻撃力は赤、体力は青で表示する
- `applyAction` は元の state を変更しない。反則は `RuleError`（日本語のメッセージ）を投げる
- 新しいカード：`packages/cards/src/cards.json` に追加（`effect` は `effects` から `effectText`（`packages/cards/src/text.ts`）で作った文と同じにする。違うとテストで落ちる。作れない動きは `text.ts` に型を足す。肩書き・フレーバーは書かない）→ 効果があれば `packages/game-core/src/abilities.ts` にカード ID で登録 → 表示は `apps/web/src/cards/faces/` にデザインを追加して `HoloCard.tsx` の `FACES` に登録
- DB スキーマを変えたら `pnpm db:generate` でマイグレーションを作り、`apps/api/drizzle/` ごとコミットする
- 画像は `apps/web/public/assets/cards/` に `cN-art.jpg`（背景）と `cN-subject.webp`（切り抜き）を置く。イラストの依頼は `docs/card-art-prompt.md`（★が低いほどシンプルに）のフォーマットを使い、カードごとの注文は `docs/card-art-orders.md` に残す
- リント・整形は Biome。コミット前に `pnpm lint` を通す
- CI（`.github/workflows/ci.yml`）は PR と手動のときだけ、リント・型・テスト（実 PostgreSQL）・ビルド・API の Docker ビルド・Terraform の検証を 1 ジョブで行う。確かめの本番は手元の `pnpm verify`。main に入ると `deploy.yml` が Cloud Run にデプロイする（docs だけの変更では動かない）
