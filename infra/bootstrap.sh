#!/usr/bin/env bash
# 最初の1回だけ、GCP の Cloud Shell で実行する準備。
# - Terraform の state を置くバケット
# - GitHub Actions（main ブランチだけ）が鍵ファイルなしで Terraform を動かすための連携とサービスアカウント
# - DB の接続文字列を Secret Manager に入れる（入力は画面に表示されない）
# これ以降の GCP の変更は、GitHub Actions（.github/workflows/infra.yml）が Terraform で行う。
set -euo pipefail

PROJECT="${PROJECT:-trends-cardgame}"
REPO="${REPO:-Kanta-Yamamoto/trends-cardgame}"
REGION="${REGION:-asia-northeast1}"
SA="terraform@${PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com serviceusage.googleapis.com storage.googleapis.com \
  secretmanager.googleapis.com

# Terraform の state 置き場
gcloud storage buckets describe "gs://${PROJECT}-tfstate" >/dev/null 2>&1 ||
  gcloud storage buckets create "gs://${PROJECT}-tfstate" --location="$REGION" --uniform-bucket-level-access

# Terraform を動かすサービスアカウント（このプロジェクトの中だけを管理する）
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create terraform --display-name="Terraform (GitHub Actions)"
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${SA}" --role=roles/owner --condition=None >/dev/null

# GitHub Actions との連携（このリポジトリの main ブランチからだけ使える）
gcloud iam workload-identity-pools describe github-bootstrap --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create github-bootstrap --location=global --display-name="GitHub (Terraform)"
gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github-bootstrap >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc github --location=global \
    --workload-identity-pool=github-bootstrap \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${REPO}' && assertion.ref=='refs/heads/main'"
PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PN}/locations/global/workloadIdentityPools/github-bootstrap/attribute.repository/${REPO}" >/dev/null

# DB の接続文字列（Neon の画面でコピーしたもの）
gcloud secrets describe database-url >/dev/null 2>&1 || gcloud secrets create database-url --replication-policy=automatic
if [ "$(gcloud secrets versions list database-url --format='value(name)' | wc -l)" -eq 0 ]; then
  read -r -s -p "Neon の接続文字列を貼り付けて Enter（画面には表示されません）: " DBURL
  echo
  printf '%s' "$DBURL" | gcloud secrets versions add database-url --data-file=-
fi

echo
echo "準備できました。次の行を Claude に伝えてください（秘密の値ではありません）："
echo "PROJECT_NUMBER=${PN}"
