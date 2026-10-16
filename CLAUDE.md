# TRENDS カードゲーム

AIで描いたイラストを立体感のあるキラカードにして遊ぶ、オリジナルカードゲーム。Web とスマホアプリ（Capacitor）で出す予定。

## 構成（pnpm workspaces + Turborepo）

- `apps/web` — React 19 + Vite + TypeScript。カード表示（`src/cards`）、CPU 対戦（`src/pages/Play.tsx`、CPU は `planTurn`）。`public/prototypes` に HTML だけで作った試作（ガチャ演出・対戦フィールド）を同梱
- `apps/api` — NestJS 11 + Drizzle ORM + PostgreSQL。`GET /cards`、`GET /health`
- `packages/cards` — カードデータ（`src/cards.json`）と型。web・api・game-core の共通の元データ
- `packages/game-core` — ゲームのルール。画面に依存しない純粋な関数（`applyAction(state, action, catalog)`）と CPU の思考（`planTurn`）。ルールの説明は `docs/rules.md`
- `infra/terraform` — GCP（Cloud Run・Artifact Registry・Secret Manager・Workload Identity）の雛形。未 apply
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

環境変数は `.env.example` を参照（`apps/api/.env` に `DATABASE_URL`）。

## ルール

- ゲームのルールは必ず `packages/game-core` に書き、テストを付ける。画面側にルールを書かない
- `applyAction` は元の state を変更しない。反則は `RuleError`（日本語のメッセージ）を投げる
- 新しいカード：`packages/cards/src/cards.json` に追加 → 効果があれば `packages/game-core/src/abilities.ts` にカード ID で登録 → 表示は `apps/web/src/cards/faces/` にデザインを追加して `HoloCard.tsx` の `FACES` に登録
- DB スキーマを変えたら `pnpm db:generate` でマイグレーションを作り、`apps/api/drizzle/` ごとコミットする
- 画像は `apps/web/public/assets/cards/` に `cN-art.jpg`（背景）と `cN-subject.webp`（切り抜き）を置く
- リント・整形は Biome。コミット前に `pnpm lint` を通す
- CI（`.github/workflows/ci.yml`）はリント・型・テスト（実 PostgreSQL）・ビルド・API の Docker ビルド・Terraform の検証を行う
