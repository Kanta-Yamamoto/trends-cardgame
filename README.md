# TRENDS カードゲーム（開発中）

AIで描いたイラストを、立体感のあるキラカードにして遊ぶオリジナルカードゲーム。

## 必要なもの

- Node.js 22 以上、pnpm（`corepack enable` で入る）
- Docker（PostgreSQL をローカルで動かす）

## はじめかた

```sh
pnpm install
cp .env.example apps/api/.env
pnpm db:up          # PostgreSQL を起動
pnpm db:migrate     # テーブル作成
pnpm db:seed        # カードデータを投入
pnpm dev            # Web: http://localhost:5173 / API: http://localhost:3001
```

## 中身

| 場所 | 内容 |
|---|---|
| `apps/web` | React のアプリ。カード一覧（`/`）、ルール確認用の対戦（`/play`）、試作ページ（`/prototypes/...`） |
| `apps/api` | NestJS の API。カードを PostgreSQL から返す |
| `packages/cards` | カードデータと型 |
| `packages/game-core` | ゲームのルールとテスト |
| `infra/terraform` | GCP の構成（雛形） |
| `assets/original` | 元イラスト（印刷用） |
| `tools/cutout.py` | 人物の切り抜きスクリプト |

## スマホアプリ（Mac で）

```sh
cd apps/web
npx cap add ios        # 初回だけ。Android は npx cap add android
pnpm cap:sync          # Web をビルドしてネイティブ側に反映
npx cap open ios       # Xcode で開いて実機・シミュレーターで確認
```

## カードの作り方

1. ChatGPT でイラストを生成（縦長2:3、魚眼や前に突き出す手など奥行きのある構図、下35%は文字を載せるため情報量を減らす）
2. `python tools/cutout.py <元画像> apps/web/public/assets/cards/cN-subject.webp` で人物を切り抜く
3. `packages/cards/src/cards.json` にデータを追加し、`apps/web/src/cards/faces/` にデザインを追加
