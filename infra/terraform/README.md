# GCP インフラ

API と Web を1つの Cloud Run で動かします（API が Web のビルドも配る）。手順の全体は [docs/deploy.md](../../docs/deploy.md)。

## 作るもの

- Cloud Run `trends-api`（使わないときは0台。オンライン対戦の部屋をメモリで持つので最大1台、WebSocket 用にセッションアフィニティと1時間のタイムアウト）
- Artifact Registry `trends`（Docker イメージ置き場）
- Secret Manager `database-url`（DB の接続文字列。値は人が画面で入れる）
- GitHub Actions 用の Workload Identity 連携とデプロイ用サービスアカウント（鍵ファイルなしでデプロイ）
- 予算アラート（`billing_account` を指定したときだけ）

DB はここでは作りません。Neon などの無料枠の PostgreSQL を使い、その接続文字列を `database-url` に入れます。ログインのトークンに署名する鍵は、アプリが初回起動時に作って DB に保存します。

## 手順

```sh
cd infra/terraform
gcloud storage buckets create gs://YOUR_PROJECT-tfstate --location=asia-northeast1
terraform init -backend-config="bucket=YOUR_PROJECT-tfstate"
terraform apply -var project_id=YOUR_PROJECT_ID -var billing_account=XXXXXX-XXXXXX-XXXXXX \
  -var google_client_id=XXXX.apps.googleusercontent.com
```

apply 後に出る `workload_identity_provider` と `deployer_service_account` を、GitHub リポジトリの Variables に `GCP_WIF_PROVIDER` / `GCP_DEPLOYER_SA` として、プロジェクト ID を `GCP_PROJECT_ID` として登録すると、main へのマージで自動デプロイされます（`.github/workflows/deploy.yml`）。
