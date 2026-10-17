variable "project_id" {
  type        = string
  description = "GCP のプロジェクト ID"
}

variable "region" {
  type    = string
  default = "asia-northeast1"
}

variable "github_repository" {
  type    = string
  default = "Kanta-Yamamoto/trends-cardgame"
}

variable "api_image" {
  type        = string
  description = "最初は公開イメージで作り、以降は CI がデプロイする"
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "cors_origin" {
  type        = string
  description = "API を呼べる Web のオリジン（カンマ区切り）"
  default     = "http://localhost:5173"
}

variable "billing_account" {
  type        = string
  description = "予算アラート用の請求先アカウント ID。空なら予算は作らない"
  default     = ""
}

variable "monthly_budget_jpy" {
  type    = number
  default = 3000
}

variable "google_client_id" {
  type        = string
  description = "Google ログインの OAuth クライアント ID（Google Cloud コンソールの「認証情報」で作る。公開してよい値）"
  default     = ""
}
