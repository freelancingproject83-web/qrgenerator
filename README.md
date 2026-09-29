# QR Generator monorepo

Frontend and API consumers should use [`API.md`](./API.md) as the complete endpoint and payload reference.

This repository contains three independently deployable TypeScript applications:

| Workspace    | Purpose                           | Local address           |
| ------------ | --------------------------------- | ----------------------- |
| `apps/api`   | Fastify API and PostgreSQL access | `http://127.0.0.1:3000` |
| `apps/web`   | Public scan-result site           | `http://127.0.0.1:5173` |
| `apps/admin` | Authenticated code generator      | `http://127.0.0.1:5174` |

`packages/contracts` contains shared runtime schemas and inferred TypeScript types. Each app has its own `package.json`, build command, and environment example.

## Local development

Use Node.js 24 LTS and npm 11. Docker is needed only to run the local PostgreSQL container.

```sh
npm ci
docker compose up -d postgres
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/admin/.env.example apps/admin/.env
npm run dev
```

The API exposes `/health` for process health and `/ready` for database readiness. The admin app provides the authenticated generation workflow; the public web app resolves scanned identifiers. The development database password in `compose.yaml` is for local use only.

## Authentication API

All endpoints are under `/api/v1`. Public account creation always assigns the `tenant_user` role; clients cannot submit a role during registration.

| Method  | Endpoint                    | Authentication | Purpose                                       |
| ------- | --------------------------- | -------------- | --------------------------------------------- |
| `POST`  | `/auth/register`            | Public         | Create a tenant user and start a session      |
| `POST`  | `/auth/login`               | Public         | Verify credentials and start a session        |
| `POST`  | `/auth/refresh`             | Refresh cookie | Rotate the refresh token and get access token |
| `POST`  | `/auth/logout`              | Refresh cookie | Revoke the session and clear the cookie       |
| `GET`   | `/users/me`                 | Bearer token   | Return the current database user              |
| `PATCH` | `/admin/users/:userId/role` | Super admin    | Promote a tenant user to an admin role        |

Registration and login accept:

```json
{
  "email": "person@example.com",
  "password": "at-least-8-characters"
}
```

They return a 15-minute access token in JSON and set the rotating refresh token as an `HttpOnly` cookie. Send the access token as `Authorization: Bearer ACCESS_TOKEN`. Browser calls to login, refresh, and logout must use `credentials: 'include'`.

Promoting a user requires a currently valid super-admin account and one of these bodies:

```json
{ "role": "tenant_admin" }
```

```json
{ "role": "super_admin" }
```

After registering the first account, bootstrap only that account directly in PostgreSQL:

```sql
UPDATE users
SET role = 'super_admin', updated_at = now()
WHERE email = 'owner@example.com';
```

Passwords use Argon2id. Raw refresh tokens are never stored in PostgreSQL; only SHA-256 hashes are stored. Reuse of a rotated refresh token revokes all active refresh sessions for that user.

## Checks and builds

```sh
npm run check
npm run build
npm run start -w @qrgenerator/api
```

The user and admin static builds are in their respective `dist` directories. The API build is in `apps/api/dist` and requires `DATABASE_URL`, `CORS_ORIGINS`, `HOST`, and `PORT` from its runtime environment. Run `npm run build -w @qrgenerator/contracts` before building an app in isolation.

The production API image is defined in `apps/api/Dockerfile` and must be built with the repository root as its Docker context:

```sh
docker build -f apps/api/Dockerfile -t qrgenerator-api .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL='postgres://...' \
  -e CORS_ORIGINS='https://web.example.com,https://admin.example.com' \
  qrgenerator-api
```

## Database changes

Define tables in `apps/api/src/db/schema.ts`. Then create and apply a migration:

```sh
npm run db:generate
npm run db:migrate
```

Run migrations as a separate release step before starting a new API version. Do not use schema push against a production database. No product tables have been invented in this initial scaffold.

## Low-cost GCP deployment

The checked-in GCP scripts create and deploy this demo architecture:

- one zonal `db-f1-micro` Cloud SQL for PostgreSQL 17 instance with 10 GB SSD;
- one Artifact Registry repository;
- one dedicated API service account with only Cloud SQL and database-secret access;
- one Cloud Run migration job; and
- one public Cloud Run API with request-based billing, zero minimum instances, and a two-instance maximum.

Install the Google Cloud CLI, authenticate with `gcloud auth login`, and select a billing-enabled project. Do not download or commit a service-account key. From the repository root, load the non-secret configuration and run the bootstrap once:

```sh
cp deploy/gcp/.env.example deploy/gcp/.env
# Edit deploy/gcp/.env, then:
set -a
source deploy/gcp/.env
set +a
bash deploy/gcp/bootstrap.sh
```

The bootstrap prompts for the application database password, creates or rotates the database user, and writes the connection URL directly to Secret Manager. It does not store the password in a repository file. Creating Cloud SQL starts billable usage.

The bootstrap also generates the JWT signing secret and saves it directly in Secret Manager. The API refuses to start in production with its development signing secret.

After entering the final Vercel domains in `CORS_ORIGINS`, deploy or update the backend with:

```sh
set -a
source deploy/gcp/.env
set +a
bash deploy/gcp/deploy-api.sh
```

Every API deployment builds a fresh image, executes committed Drizzle migrations as a Cloud Run job, and only then deploys the API service. The command prints the API URL. Use `/health` for the Cloud Run process check and `/ready` to verify PostgreSQL connectivity.

The demo database is intentionally single-zone, has no SLA on the shared-core tier, and disables automatic storage growth to prevent an unexpected cost increase. Before real production traffic, use a dedicated-core/HA instance, enable bounded storage growth, increase the Cloud Run maximum deliberately, and configure monitoring and backup retention.

## Separate Vercel deployments

Create two Vercel projects connected to the same Git repository:

| Vercel project   | Root Directory | Environment variable                         |
| ---------------- | -------------- | -------------------------------------------- |
| Public scan site | `apps/web`     | `VITE_API_BASE_URL=https://YOUR_API.run.app` |
| Generator admin  | `apps/admin`   | `VITE_API_BASE_URL=https://YOUR_API.run.app` |

Keep **Include source files outside of the Root Directory** enabled for both projects because both apps import `packages/contracts`. The `vercel.json` inside each app contains its independent install, build, and output settings. Add the production and preview frontend domains to the API's `CORS_ORIGINS`, separated by commas, and redeploy the API after those domains are known.

## Identifier workflow

The admin frontend implements account creation and login, refresh-cookie session restoration, QR/Data Matrix size previews, idempotent batch issuance, authenticated SVG/PDF downloads, and revocation. The public web frontend is intentionally separate: issued codes point to it, and it displays the current registry status after a scan.

Issued artwork is digitally decoded before it is persisted, but that is not physical print qualification. Validate the selected symbol, printer, substrate, ink, production process, and target scanning devices before using codes on saleable products. A registered identifier can be copied and does not by itself establish medicine authenticity or safety.

The code API is documented in [`API.md`](./API.md). Its authenticated endpoints enforce ownership server-side; public lookup exposes only identifier status and intentionally does not publish medicine details.
