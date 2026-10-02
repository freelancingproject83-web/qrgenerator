CREATE TABLE "batches" (
	"batch_number" varchar(48) PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"slug" varchar(300) NOT NULL,
	"medicine_name" varchar(160) NOT NULL,
	"medicine_type" varchar(120) NOT NULL,
	"manufacture_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"cautions" jsonb NOT NULL,
	"variants" jsonb NOT NULL,
	"usages" jsonb NOT NULL,
	"dosages" jsonb NOT NULL,
	"eligible_users" jsonb NOT NULL,
	"side_effects" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_date_order" CHECK ("batches"."expiry_date" > "batches"."manufacture_date")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_jobs" ADD COLUMN "batch_number" varchar(48);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
INSERT INTO "tenants" ("id", "name")
VALUES ('00000000-0000-4000-8000-000000000001', 'Default workspace');--> statement-breakpoint
UPDATE "users"
SET "tenant_id" = '00000000-0000-4000-8000-000000000001'
WHERE "role" <> 'super_admin' AND "tenant_id" IS NULL;--> statement-breakpoint
INSERT INTO "batches" (
	"batch_number", "tenant_id", "created_by", "slug", "medicine_name",
	"medicine_type", "manufacture_date", "expiry_date", "cautions",
	"variants", "usages", "dosages", "eligible_users", "side_effects", "created_at"
)
SELECT
	'LEGACY-' || replace(j."id"::text, '-', ''),
	coalesce(u."tenant_id", '00000000-0000-4000-8000-000000000001'::uuid),
	j."owner_id", 'legacy_imported_batch', 'Legacy imported batch',
	coalesce(j."reference", 'Imported medicine'), j."created_at"::date,
	(j."created_at"::date + interval '10 years')::date,
	'["Review and complete this imported batch before further use."]'::jsonb,
	'["Not recorded"]'::jsonb, '["Not recorded"]'::jsonb,
	'["Follow approved packaging and professional advice."]'::jsonb,
	'["Not recorded"]'::jsonb, '["Not recorded"]'::jsonb, j."created_at"
FROM "code_jobs" j
INNER JOIN "users" u ON u."id" = j."owner_id";--> statement-breakpoint
UPDATE "code_jobs"
SET "batch_number" = 'LEGACY-' || replace("id"::text, '-', '');--> statement-breakpoint
ALTER TABLE "code_jobs" ALTER COLUMN "batch_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batches_tenant_created_idx" ON "batches" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "batches_slug_idx" ON "batches" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_name_lower_unique" ON "tenants" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "code_jobs" ADD CONSTRAINT "code_jobs_batch_number_batches_batch_number_fk" FOREIGN KEY ("batch_number") REFERENCES "public"."batches"("batch_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_jobs_batch_number_idx" ON "code_jobs" USING btree ("batch_number");--> statement-breakpoint
CREATE INDEX "users_tenant_id_idx" ON "users" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "code_jobs" DROP COLUMN "reference";
