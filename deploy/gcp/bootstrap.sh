#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  GCP_PROJECT_ID
  GCP_REGION
  GCP_SQL_INSTANCE
  GCP_DATABASE
  GCP_DATABASE_USER
  GCP_ARTIFACT_REPOSITORY
  GCP_SERVICE_ACCOUNT
  GCP_DATABASE_SECRET
  GCP_JWT_SECRET
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Missing required environment variable: ${variable_name}" >&2
    exit 1
  fi
done

gcloud config set project "${GCP_PROJECT_ID}"
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com

if ! gcloud artifacts repositories describe "${GCP_ARTIFACT_REPOSITORY}" \
  --location "${GCP_REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${GCP_ARTIFACT_REPOSITORY}" \
    --repository-format docker \
    --location "${GCP_REGION}" \
    --description "QR Generator container images"
fi

if ! gcloud iam service-accounts describe \
  "${GCP_SERVICE_ACCOUNT}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${GCP_SERVICE_ACCOUNT}" \
    --display-name "QR Generator API"
fi

service_account="${GCP_SERVICE_ACCOUNT}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member "serviceAccount:${service_account}" \
  --role roles/cloudsql.client \
  --condition=None >/dev/null

if ! gcloud sql instances describe "${GCP_SQL_INSTANCE}" >/dev/null 2>&1; then
  gcloud sql instances create "${GCP_SQL_INSTANCE}" \
    --database-version POSTGRES_17 \
    --edition ENTERPRISE \
    --tier db-f1-micro \
    --region "${GCP_REGION}" \
    --availability-type zonal \
    --storage-type SSD \
    --storage-size 10GB \
    --no-storage-auto-increase
fi

if ! gcloud sql databases describe "${GCP_DATABASE}" \
  --instance "${GCP_SQL_INSTANCE}" >/dev/null 2>&1; then
  gcloud sql databases create "${GCP_DATABASE}" \
    --instance "${GCP_SQL_INSTANCE}"
fi

read -r -s -p "Database password for ${GCP_DATABASE_USER}: " database_password
echo

if [[ -z "${database_password}" ]]; then
  echo "Database password cannot be empty." >&2
  exit 1
fi

if gcloud sql users list --instance "${GCP_SQL_INSTANCE}" \
  --filter "name=${GCP_DATABASE_USER}" --format 'value(name)' | grep -qx "${GCP_DATABASE_USER}"; then
  gcloud sql users set-password "${GCP_DATABASE_USER}" \
    --instance "${GCP_SQL_INSTANCE}" \
    --password "${database_password}"
else
  gcloud sql users create "${GCP_DATABASE_USER}" \
    --instance "${GCP_SQL_INSTANCE}" \
    --password "${database_password}"
fi

encoded_password="$({ DATABASE_PASSWORD="${database_password}" node -e \
  "process.stdout.write(encodeURIComponent(process.env.DATABASE_PASSWORD ?? ''))"; })"
connection_name="${GCP_PROJECT_ID}:${GCP_REGION}:${GCP_SQL_INSTANCE}"
database_url="postgresql://${GCP_DATABASE_USER}:${encoded_password}@localhost/${GCP_DATABASE}?host=/cloudsql/${connection_name}"

if ! gcloud secrets describe "${GCP_DATABASE_SECRET}" >/dev/null 2>&1; then
  gcloud secrets create "${GCP_DATABASE_SECRET}" --replication-policy automatic
fi

printf '%s' "${database_url}" | gcloud secrets versions add \
  "${GCP_DATABASE_SECRET}" --data-file=-
unset database_password encoded_password database_url

if ! gcloud secrets describe "${GCP_JWT_SECRET}" >/dev/null 2>&1; then
  jwt_secret="$(openssl rand -base64 48)"
  gcloud secrets create "${GCP_JWT_SECRET}" --replication-policy automatic
  printf '%s' "${jwt_secret}" | gcloud secrets versions add \
    "${GCP_JWT_SECRET}" --data-file=-
  unset jwt_secret
fi

gcloud secrets add-iam-policy-binding "${GCP_DATABASE_SECRET}" \
  --member "serviceAccount:${service_account}" \
  --role roles/secretmanager.secretAccessor \
  --condition=None >/dev/null

gcloud secrets add-iam-policy-binding "${GCP_JWT_SECRET}" \
  --member "serviceAccount:${service_account}" \
  --role roles/secretmanager.secretAccessor \
  --condition=None >/dev/null

echo "GCP bootstrap complete. You can now run deploy/gcp/deploy-api.sh."
