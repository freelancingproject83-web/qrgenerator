#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  GCP_PROJECT_ID
  GCP_REGION
  GCP_SQL_INSTANCE
  GCP_ARTIFACT_REPOSITORY
  GCP_CLOUD_RUN_SERVICE
  GCP_MIGRATION_JOB
  GCP_SERVICE_ACCOUNT
  GCP_DATABASE_SECRET
  GCP_JWT_SECRET
  CORS_ORIGINS
  PUBLIC_SCAN_ORIGIN
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Missing required environment variable: ${variable_name}" >&2
    exit 1
  fi
done

image="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_ARTIFACT_REPOSITORY}/api:latest"
connection_name="${GCP_PROJECT_ID}:${GCP_REGION}:${GCP_SQL_INSTANCE}"
service_account="${GCP_SERVICE_ACCOUNT}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

gcloud builds submit . \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --config apps/api/cloudbuild.yaml \
  --substitutions "_IMAGE=${image}"

gcloud run jobs deploy "${GCP_MIGRATION_JOB}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --image "${image}" \
  --service-account "${service_account}" \
  --set-cloudsql-instances "${connection_name}" \
  --set-secrets "DATABASE_URL=${GCP_DATABASE_SECRET}:latest,JWT_ACCESS_SECRET=${GCP_JWT_SECRET}:latest" \
  --command node \
  --args apps/api/dist/migrate.js \
  --max-retries 1 \
  --task-timeout 5m

gcloud run jobs execute "${GCP_MIGRATION_JOB}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --wait

gcloud run deploy "${GCP_CLOUD_RUN_SERVICE}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --image "${image}" \
  --service-account "${service_account}" \
  --allow-unauthenticated \
  --set-cloudsql-instances "${connection_name}" \
  --set-secrets "DATABASE_URL=${GCP_DATABASE_SECRET}:latest,JWT_ACCESS_SECRET=${GCP_JWT_SECRET}:latest" \
  --set-env-vars "^@^NODE_ENV=production@HOST=0.0.0.0@CORS_ORIGINS=${CORS_ORIGINS}@PUBLIC_SCAN_ORIGIN=${PUBLIC_SCAN_ORIGIN}" \
  --port 8080 \
  --cpu 1 \
  --memory 512Mi \
  --concurrency 40 \
  --min 0 \
  --max 2 \
  --cpu-throttling

gcloud run services describe "${GCP_CLOUD_RUN_SERVICE}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --format 'value(status.url)'
