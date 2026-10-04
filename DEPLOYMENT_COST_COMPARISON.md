# Deployment Options and Cost Comparison

**Prepared:** 4 October 2026  
**Application:** Medicine QR and Data Matrix Registry

> All prices are estimates based on publicly available pricing as of October 2026. Actual billing can vary with region, exchange rate, GST, bandwidth, database usage, and provider pricing changes.

## Assumptions

The estimates assume:

- Low traffic during testing or the initial pilot.
- Mumbai GCP region (`asia-south1`).
- PostgreSQL database below 10 GB.
- One backend API service.
- Two static frontend applications: the admin portal and public scan website.
- No custom domain.
- Approximate conversion of `$1 = ₹96`.
- Indian GST of 18% where applicable.

## Executive Cost Comparison

| Option                    | Architecture                                        |      Estimated monthly cost | Recommended use                  |
| ------------------------- | --------------------------------------------------- | --------------------------: | -------------------------------- |
| Fully free cloud          | Free static hosting + Render API + Neon PostgreSQL  |                          ₹0 | Client demonstration and testing |
| Free DB + desktop backend | Free static hosting + desktop API + Neon PostgreSQL | ₹0 hosting plus electricity | Short internal testing           |
| Minimum managed GCP       | Free static hosting + Cloud Run + Cloud SQL         | ₹1,350–₹1,700 including GST | Small managed pilot              |
| GCP + commercial Vercel   | Vercel Pro + Cloud Run + Cloud SQL                  | ₹3,600–₹4,000 including GST | Commercial pilot using Vercel    |

## Option 1: Minimum-Cost Managed GCP Deployment

### Architecture

```text
Public Scan Website ─────┐
                         ├── Google Cloud Run API ── Cloud SQL PostgreSQL
Admin Portal ────────────┘
```

### Services

- **Backend:** Google Cloud Run
- **Database:** Google Cloud SQL for PostgreSQL 17
- **Database machine:** `db-f1-micro`
- **Storage:** 10 GB SSD
- **Region:** Mumbai (`asia-south1`)
- **Cloud Run minimum instances:** `0`
- **Cloud Run maximum instances:** `2`
- **Frontend:** Cloudflare Pages, Render Static Sites, or Vercel
- **Secrets:** Google Secret Manager
- **Container storage:** Google Artifact Registry

### Estimated Monthly GCP Cost

| Resource                                |    Estimated cost |
| --------------------------------------- | ----------------: |
| Cloud SQL `db-f1-micro`                 |            $9–$10 |
| 10 GB SSD storage                       |       $1.70–$2.20 |
| Approximately 10 GB backup storage      |       Up to $0.80 |
| Cloud Run API under low traffic         |        Usually $0 |
| Secret Manager within free allowance    |        Usually $0 |
| Artifact Registry within free allowance |        Usually $0 |
| **Estimated GCP total**                 |       **$12–$15** |
| INR before GST                          |     ₹1,150–₹1,440 |
| **INR after 18% GST**                   | **₹1,350–₹1,700** |

For safe budgeting, the client should keep **₹1,500–₹2,000 per month** available.

### Why Cloud Run Can Remain Almost Free

Cloud Run includes a monthly free allowance for:

- Up to 2 million requests.
- 180,000 vCPU-seconds using request-based billing.
- 360,000 GiB-seconds of memory.

When the minimum instance count is zero, the backend can scale down when it is not receiving requests.

Official references:

- [Google Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Google Cloud free tier](https://docs.cloud.google.com/free/docs/free-cloud-features)

### Main GCP Expense

Cloud SQL is the primary permanent expense because the database remains provisioned continuously.

The proposed configuration uses the smallest shared-core Cloud SQL machine:

- Shared CPU.
- Approximately 0.6 GB RAM.
- Zonal deployment.
- 10 GB SSD storage.
- No high availability.

The `db-f1-micro` shared-core machine is not covered by a Cloud SQL SLA.

Official reference:

- [Google Cloud SQL pricing](https://cloud.google.com/sql/pricing)

### Other GCP Free Allowances

Google Secret Manager includes six active secret versions and 10,000 secret access operations per month.

- [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing)

Google Artifact Registry includes the first 0.5 GB of stored artifacts.

- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)

### Advantages

- The backend does not depend on a personal computer.
- Automatic HTTPS.
- Automatic backend scaling.
- Cloud Run can scale down to zero.
- Managed PostgreSQL database.
- Automated database backups.
- Secure management of database credentials and JWT secrets.
- Better logging and monitoring.
- The repository already contains GCP deployment scripts.
- Capacity can be increased later.

### Disadvantages

- A billing-enabled GCP account is required.
- Cloud SQL is charged continuously.
- The cheapest database uses shared CPU.
- The proposed `db-f1-micro` configuration has no SLA.
- The database is not highly available.
- Database maintenance can cause temporary interruption.
- Network traffic and excessive logging can create additional charges.
- Pricing can change with regional SKUs, exchange rate, and GST.
- Budget alerts must be configured to reduce billing risk.

### Recommended GCP Billing Alerts

Configure alerts at:

- ₹1,000
- ₹1,500
- ₹2,000

The client should not rely only on a budget alert to stop services automatically. GCP budget alerts primarily provide notifications.

## Vercel Pricing Consideration

Vercel Hobby costs `$0`, but it is restricted to personal and non-commercial use.

A client application developed by a paid freelancer or business may qualify as commercial usage.

Official references:

- [Vercel fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- [Vercel pricing](https://vercel.com/pricing)

### Commercial Vercel Cost

| Item              |       Estimated cost |
| ----------------- | -------------------: |
| Vercel Pro        |            $20/month |
| INR before GST    | Approximately ₹1,920 |
| INR after 18% GST | Approximately ₹2,266 |

Both frontend projects can normally be hosted under the same Vercel Pro team if only one paid team member is required. Additional team seats or usage can increase the cost.

### Total With Vercel Pro

| Component          | Estimated monthly cost |
| ------------------ | ---------------------: |
| GCP infrastructure |          ₹1,350–₹1,700 |
| Vercel Pro         |   Approximately ₹2,266 |
| **Combined total** |      **₹3,600–₹4,000** |

### Lower-Cost Frontend Alternative

Instead of Vercel Pro, the two static frontends can be hosted on:

- Cloudflare Pages.
- Render Static Sites.

This can keep the managed pilot cost close to **₹1,500–₹2,000 per month**.

## Option 2: Free Database With Backend Running on a Desktop

### Architecture

```text
Public Scan Website / Admin Portal
                 │
        Cloudflare Tunnel
                 │
      Office or Home Desktop
            Fastify API
                 │
        Neon PostgreSQL
```

### Services

- **Database:** Neon Free PostgreSQL
- **Backend:** Existing office or home desktop
- **Secure public URL:** Cloudflare Tunnel
- **Frontend:** Cloudflare Pages or Render Static Sites
- **HTTPS:** Provided through Cloudflare

### Estimated Monthly Cost

| Resource                |               Estimated cost |
| ----------------------- | ---------------------------: |
| Neon PostgreSQL         |        ₹0 within free limits |
| Cloudflare Tunnel       |                           ₹0 |
| Static frontend hosting |                           ₹0 |
| Backend hosting bill    |                           ₹0 |
| Electricity             |   Approximately ₹200–₹1,000+ |
| Internet connection     | Existing connection required |

The provider bill can be ₹0, but the desktop still consumes electricity.

The exact electricity cost depends on:

- Desktop idle power consumption.
- Number of hours it remains powered on.
- Local electricity rate.
- Monitor and UPS consumption.
- Cooling requirements.

### Neon Free Database

Neon's current free plan provides:

- 1 GB PostgreSQL storage per free project.
- Free monthly compute allowance.
- Automatic scale-to-zero.
- Database branches.
- Limited restore history.

Official reference:

- [Neon Free plan](https://neon.com/blog/neon-free-plan-1-gb-per-project)

### Cloudflare Tunnel

Cloudflare Tunnel provides:

- Public HTTPS access.
- No router port forwarding.
- No public static IP requirement.
- Outbound-only encrypted connection.
- Protection through Cloudflare's network.

Official references:

- [Cloudflare Tunnel documentation](https://developers.cloudflare.com/tunnel/)
- [Cloudflare Zero Trust pricing](https://www.cloudflare.com/plans/zero-trust-services/)

### Advantages

- No backend cloud-compute bill.
- No Render API cold start.
- Full control over backend logs and processes.
- Useful for temporary office demonstrations.
- The database remains on a managed PostgreSQL provider.
- Cloudflare Tunnel avoids opening inbound router ports.

### Disadvantages

- The API stops when the desktop shuts down.
- The API stops during power cuts.
- The API stops if the internet connection fails.
- Desktop sleep mode must be disabled.
- Operating-system restarts and updates can interrupt the service.
- The backend process and tunnel must automatically restart after failure.
- No infrastructure SLA.
- Performance depends on office or home internet upload speed.
- Someone must monitor the desktop continuously.
- Higher security exposure if the desktop is also used for personal work.
- Electricity and UPS costs are not zero.
- QR codes stop resolving while the desktop is offline.

### Recommendation

Use this option only for:

- Internal testing.
- Temporary office demonstrations.
- Short development reviews.

Do not use it for:

- Production.
- Public medicine packaging.
- Long-term client access.
- Any deployment requiring reliable QR scans.

## Option 3: Completely Free Cloud Deployment

### Architecture

```text
Cloudflare Pages or Render Static Sites
                    │
            Render Free API
                    │
          Neon Free PostgreSQL
```

### Services

- **Public frontend:** Cloudflare Pages or Render Static Site
- **Admin frontend:** Cloudflare Pages or Render Static Site
- **Backend:** Render Free Web Service
- **Database:** Neon Free PostgreSQL
- **HTTPS:** Included
- **Platform subdomains:** Included

### Estimated Monthly Cost

> **₹0 per month**

This assumes:

- No custom domain purchase.
- Traffic remains within free limits.
- Build minutes remain within free limits.
- The database remains within Neon limits.
- The Render service remains within free compute and bandwidth limits.

### Render Free Backend Limits

Render Free currently provides:

- 0.1 CPU.
- 512 MB RAM.
- 750 free instance hours per workspace each month.
- Automatic HTTPS.
- Public `onrender.com` URL.
- Git-based deployment.
- Docker support.

Important limitations:

- The API sleeps after 15 minutes without inbound traffic.
- The first request after sleeping can take approximately one minute.
- Local filesystem changes are not permanent.
- The service can be restarted at any time.
- There is no SLA.
- There is no horizontal scaling.
- There is no SSH access on the free service.
- Excessive bandwidth can suspend the service.
- Excessive external database traffic can suspend the service.
- Render states that free services are intended for testing and previews, not production.

Official references:

- [Render Free documentation](https://render.com/docs/free)
- [Render compute plans](https://render.com/docs/compute-plans)
- [Render pricing](https://render.com/pricing)

### Neon Free Database Limits

Neon Free currently provides:

- 1 GB storage per project.
- Free monthly compute allocation.
- Scale-to-zero database compute.
- Limited restore history.
- Limited data transfer.
- No production SLA comparable to paid managed databases.

Official reference:

- [Neon Free plan](https://neon.com/blog/neon-free-plan-1-gb-per-project)

### Free Frontend Hosting

#### Cloudflare Pages

Cloudflare Pages Free currently includes:

- 500 builds per month.
- Up to 100 projects per account.
- Up to 100 custom domains per project.
- Static site hosting through Cloudflare's global network.
- Automatic HTTPS.

Official reference:

- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

#### Render Static Sites

Render Static Sites include:

- Free static hosting.
- Automatic HTTPS.
- CDN delivery.
- Git-based deployment.
- Free platform subdomain.
- Custom-domain support.
- Shared workspace bandwidth and build-minute limits.

Official reference:

- [Render Static Sites documentation](https://render.com/docs/static-sites)

### Advantages

- No monthly infrastructure payment.
- Does not depend on a personal desktop.
- Everything is available through public HTTPS URLs.
- Automatic deployment from Git.
- Suitable for client testing.
- Suitable for demonstrating the complete QR and Data Matrix workflow.
- Can be migrated to paid infrastructure later.
- No domain purchase is required for testing.

### Disadvantages

- The first API request can take approximately one minute.
- The database and backend may both be sleeping.
- QR and PDF generation will be slower on 0.1 CPU.
- Password hashing can be slower on free CPU.
- There is no uptime guarantee.
- Free-tier rules and limits can change.
- The service may be suspended after reaching usage limits.
- It is not suitable for a production medicine verification system.
- It is not suitable for guaranteed real-time QR scanning.
- Free services may be unavailable during provider maintenance.

### Recommendation

Use this option for:

- Client demonstration.
- User acceptance testing.
- Workflow testing.
- Design review.
- Limited temporary access.

Do not use it as the final production architecture.

## Optional Low-Cost Upgrade From the Free Stack

If Render's cold start becomes a problem, the API can be moved to Render's smallest paid service.

Current entry-level paid Render API compute:

- 0.5 CPU.
- 512 MB RAM.
- Approximately `$7/month`.
- Approximately ₹672 before GST.
- Approximately ₹793 after GST.

This can provide an always-running API while keeping Neon PostgreSQL and static frontend hosting on free plans.

Official reference:

- [Render pricing](https://render.com/pricing)

This creates an intermediate architecture costing approximately **₹800–₹1,000 per month**. Neon would still be on a free database plan.

## Custom Domain Cost

A custom domain is not included in the estimates.

Typical annual domain cost depends on the extension and registrar.

| Domain type    |        Typical annual range |
| -------------- | --------------------------: |
| `.com`         |            ₹900–₹1,500/year |
| `.in`          |            ₹500–₹1,000/year |
| Premium domain | Can be significantly higher |

Without a custom domain, the platforms provide free subdomains such as:

- `project.pages.dev`
- `project.onrender.com`
- `project.vercel.app`
- `project.run.app`

## Final Recommendation

### For Client Demonstration Right Now

Use:

- Cloudflare Pages or Render Static Sites for both frontends.
- Render Free for the backend.
- Neon Free for PostgreSQL.

Estimated cost:

> **₹0 per month**

Expected limitation:

> The first request after inactivity may take approximately one minute.

### For a Small Managed Pilot

Use:

- Cloudflare Pages for both frontends.
- Google Cloud Run for the backend.
- Google Cloud SQL PostgreSQL.
- Google Secret Manager.
- Google Artifact Registry.

Estimated cost:

> **₹1,500–₹2,000 per month including GST**

This is the recommended minimum-cost managed option.

### For a Commercial Pilot Using Vercel

Use:

- Vercel Pro for both frontends.
- Google Cloud Run for the backend.
- Google Cloud SQL PostgreSQL.

Estimated cost:

> **₹3,600–₹4,000 per month including GST**

### For Production

A real production medicine registry should eventually include:

- Dedicated or high-availability PostgreSQL.
- Automated backups with tested restoration.
- Monitoring and uptime alerts.
- Security logging.
- Error tracking.
- A custom domain.
- Production support.
- Rate-limit monitoring.
- A disaster recovery plan.
- A database retention policy.
- Regular security reviews.

The free and `db-f1-micro` configurations should be treated as demo or pilot infrastructure, not highly available production infrastructure.

## Client Decision Summary

| Requirement                        | Recommended option                          |                                   Budget |
| ---------------------------------- | ------------------------------------------- | ---------------------------------------: |
| Show the system to the client      | Fully free cloud                            |                                 ₹0/month |
| Temporary office testing           | Desktop backend + free DB                   |              ₹0 hosting plus electricity |
| Small managed pilot                | Cloud Run + Cloud SQL + free static hosting |                      ₹1,500–₹2,000/month |
| Commercial deployment using Vercel | Vercel Pro + Cloud Run + Cloud SQL          |                      ₹3,600–₹4,000/month |
| Reliable production deployment     | Managed GCP with an upgraded database       | Requires a final traffic-based quotation |

## Suggested Decision

Start with the **fully free cloud deployment** for testing.

Once the client approves the workflow, move to the **minimum managed GCP deployment** with a budget of approximately **₹1,500–₹2,000 per month**.

Do not use the desktop-hosted backend for long-term public QR codes because every printed code depends on the backend remaining continuously reachable.
