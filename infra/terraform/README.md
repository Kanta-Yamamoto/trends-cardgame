# GCP インフラ（雛形）

まだ apply していません。GCP プロジェクトと請求先を用意したあとに使います。

## 作るもの

- Cloud Run（API、使わないときは0台）
- Artifact Registry（Docker イメージ置き場）
- Secret Manager（`database-url`）
- GitHub Actions 用の Workload Identity 連携とデプロイ用サービスアカウント
- 予算アラート（`billing_account` を指定したときだけ）

DB はここでは作りません。最初は Neon や Supabase の無料枠の PostgreSQL を使い、その接続文字列を Secret Manager の `database-url` に入れる想定です。

## 手順

```sh
cd infra/terraform
gsutil mb -l asia-northeast1 gs://YOUR_PROJECT_ID-tfstate   # 初回だけ
terraform init -backend-config="bucket=YOUR_PROJECT_ID-tfstate"
terraform apply -var project_id=YOUR_PROJECT_ID -var billing_account=XXXXXX-XXXXXX-XXXXXX
# DB の接続文字列を登録
echo -n "postgresql://..." | gcloud secrets versions add database-url --data-file=-
```

apply 後に出る `workload_identity_provider` と `deployer_service_account` を、GitHub リポジトリの Settings → Variables に `GCP_WIF_PROVIDER` / `GCP_DEPLOYER_SA` として登録すると、デプロイ用のワークフローを追加できます。
