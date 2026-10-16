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
  # state は GCS に置く。バケット名は init 時に渡す:
  #   terraform init -backend-config="bucket=<PROJECT_ID>-tfstate"
  backend "gcs" {
    prefix = "trends"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  # 予算 API などをユーザーの認証で呼ぶときに、このプロジェクトの割り当てを使う
  user_project_override = true
  billing_project       = var.project_id
}

data "google_project" "this" {}

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

# DB 接続文字列（値は Secret Manager の画面か gcloud で入れる）
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# API が動くときのサービスアカウント
resource "google_service_account" "api" {
  account_id   = "trends-api"
  display_name = "TRENDS API (Cloud Run)"
}

resource "google_secret_manager_secret_iam_member" "api_reads_db_url" {
  secret_id = google_secret_manager_secret.database_url.id
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
    scaling {
      # 費用の上限を作るため最大1台（アクセスが増えたら上げる）
      min_instance_count = 0
      max_instance_count = 1
    }
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
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }
    }
  }
  depends_on = [google_project_service.apis]
}

# 誰でも API を呼べるようにする（公開ゲーム用）
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
  attribute_condition = "assertion.repository == \"${var.github_repository}\""
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
  for_each = toset(["roles/run.admin", "roles/artifactregistry.writer"])
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
  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
}
