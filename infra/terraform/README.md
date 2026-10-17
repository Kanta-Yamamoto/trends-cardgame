# GCP インフラ

API と Web を1つの Cloud Run で動かします（API が Web のビルドも配る）。手順の全体は [docs/deploy.md](../../docs/deploy.md)。

## 作るもの

- Cloud Run `trends-api`（使わないときは0台。オンライン対戦の部屋をメモリで持つので最大1台、WebSocket 用にセッションアフィニティと1時間のタイムアウト）
- Artifact Registry `trends`（Docker イメージ置き場）
- Secret Manager `database-url` の読み取り権限（シークレット自体と値は bootstrap.sh で人が入れる）
- GitHub Actions 用の Workload Identity 連携とデプロイ用サービスアカウント（鍵ファイルなしでデプロイ）
- 予算アラート（`billing_account` を指定したときだけ）

DB はここでは作りません。Neon などの無料枠の PostgreSQL を使い、その接続文字列を `database-url` に入れます。ログインのトークンに署名する鍵は、アプリが初回起動時に作って DB に保存します。

## 手順

最初の1回だけ、Cloud Shell で [../bootstrap.sh](../bootstrap.sh) を実行する（state のバケット、GitHub Actions 用の連携、DB の接続文字列）。以降は GitHub Actions（`.github/workflows/infra.yml`）が `terraform apply` する。全体の流れは [docs/deploy.md](../../docs/deploy.md)。

手元で動かすときは:

```sh
terraform init -backend-config="bucket=YOUR_PROJECT-tfstate"
terraform apply -var project_id=YOUR_PROJECT_ID
```
