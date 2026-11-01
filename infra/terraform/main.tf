# GCP の土台（雛形）。まだ apply していない。
# 使い方: infra/terraform/README.md
terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  # state は GCS に置く。バケットは init のときに渡す:
  #   terraform init -backend-config="bucket=YOUR_PROJECT-tfstate"
  backend "gcs" {
    prefix = "trends"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "billingbudgets.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

# Docker イメージ置き場
resource "google_artifact_registry_repository" "images" {
  repository_id = "trends"
  format        = "DOCKER"
  location      = var.region
  depends_on    = [google_project_service.apis]
}

# DB 接続文字列。秘密の値なので Terraform では作らず、最初の準備（infra/bootstrap.sh）で人が入れる
data "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
}

# 公開前の招待リンクの合言葉（https://…/?invite=合言葉）。最初の値は Terraform が決まった形のない文字列で作り、
# あとはオーナーが Secret Manager で新しい版を足して変える（変え方は docs/deploy.md の「招待リンク」）
resource "google_secret_manager_secret" "invite_code" {
  secret_id = "invite-code"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "invite_code_first" {
  secret      = google_secret_manager_secret.invite_code.id
  secret_data = replace(uuid(), "-", "")
  # 作ったあとは追わない（uuid() は毎回変わるため。値を変えるのはオーナーが足す新しい版）
  lifecycle {
    ignore_changes = [secret_data]
  }
}

# API が動くときのサービスアカウント
resource "google_service_account" "api" {
  account_id   = "trends-api"
  display_name = "TRENDS API (Cloud Run)"
}

resource "google_secret_manager_secret_iam_member" "api_reads_db_url" {
  secret_id = data.google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_reads_invite_code" {
  secret_id = google_secret_manager_secret.invite_code.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "api" {
  name                = "trends-api"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.api.email
    # オンライン対戦（WebSocket）の部屋は1台のメモリで管理しているので、台数は1に固定する。
    # 増やすときは Socket.IO の Redis アダプターなどで台数間をつなぐ
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    # 同じ人の接続を同じ台に、WebSocket は最長1時間つなぎっぱなしにできるように
    session_affinity = true
    timeout          = "3600s"
    containers {
      image = var.api_image
      ports {
        container_port = 8080
      }
      env {
        name  = "CORS_ORIGIN"
        value = var.cors_origin
      }
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }
      env {
        name  = "APPLE_APP_ID"
        value = var.apple_app_id
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      # 招待リンクの守り（これが入っていると、招待済みのクッキーが無い人には「準備中」だけを出す）
      env {
        name = "INVITE_CODE"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.invite_code.secret_id
            version = "latest"
          }
        }
      }
      resources {
        limits = { cpu = "1", memory = "512Mi" }

        # 起動のときだけ CPU を増やす（眠っていたサーバーが起きるまでの白い画面を短くする。起動の間の分だけ課金）
        startup_cpu_boost = true
      }
    }
  }
  # イメージは GitHub Actions（deploy.yml）が差し替えるので、Terraform では追わない
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.invite_code_first,
    google_secret_manager_secret_iam_member.api_reads_invite_code,
  ]
}

# 誰でも API を呼べるようにする（公開ゲーム用。公開前は、アプリの中の招待リンクの守りで絞る）
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# GitHub Actions から鍵ファイルなしでデプロイするための Workload Identity 連携
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }
  # このリポジトリの main からの実行だけ（ほかのブランチや PR からはデプロイ用の権限を借りられない）
  attribute_condition = "assertion.repository == \"${var.github_repository}\" && assertion.ref == \"refs/heads/main\""
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions deployer"
}

resource "google_service_account_iam_member" "github_impersonates_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_project_iam_member" "deployer_roles" {
  # run.developer：デプロイはできるが、公開範囲（IAM）は変えられない。IAM は Terraform（main だけ）が持つ
  for_each = toset(["roles/run.developer", "roles/artifactregistry.writer"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_acts_as_api" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# 予算アラート（billing_account を入れたときだけ作る）
resource "google_billing_budget" "monthly" {
  count           = var.billing_account == "" ? 0 : 1
  billing_account = var.billing_account
  display_name    = "trends monthly budget"
  amount {
    specified_amount {
      currency_code = "JPY"
      units         = tostring(var.monthly_budget_jpy)
    }
  }
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }
}
