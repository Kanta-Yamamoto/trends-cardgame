output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "workload_identity_provider" {
  description = "GitHub の Variables に GCP_WIF_PROVIDER として登録する"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  description = "GitHub の Variables に GCP_DEPLOYER_SA として登録する"
  value       = google_service_account.deployer.email
}
