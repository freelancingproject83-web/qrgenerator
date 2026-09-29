CREATE TYPE "public"."code_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "code_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"unit_id" uuid,
	"actor_id" uuid NOT NULL,
	"action" varchar(40) NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"reference" varchar(80),
	"quantity" integer NOT NULL,
	"options" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_jobs_quantity_range" CHECK ("code_jobs"."quantity" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "code_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"token" varchar(26) NOT NULL,
	"position" integer NOT NULL,
	"scan_url" text NOT NULL,
	"matrix" jsonb NOT NULL,
	"print_report" jsonb NOT NULL,
	"status" "code_status" DEFAULT 'active' NOT NULL,
	"revoke_reason" varchar(300),
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_units_token_shape" CHECK ("code_units"."token" ~ '^[A-Z2-7]{25}[AEIMQUY4]$'),
	CONSTRAINT "code_units_position_range" CHECK ("code_units"."position" between 1 and 50),
	CONSTRAINT "code_units_revocation_state" CHECK (("code_units"."status" = 'active' and "code_units"."revoked_at" is null and "code_units"."revoke_reason" is null) or ("code_units"."status" = 'revoked' and "code_units"."revoked_at" is not null and "code_units"."revoke_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "code_events" ADD CONSTRAINT "code_events_job_id_code_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."code_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_events" ADD CONSTRAINT "code_events_unit_id_code_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."code_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_events" ADD CONSTRAINT "code_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_jobs" ADD CONSTRAINT "code_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_units" ADD CONSTRAINT "code_units_job_id_code_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."code_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_events_job_idx" ON "code_events" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_jobs_owner_idempotency_unique" ON "code_jobs" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "code_units_token_unique" ON "code_units" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "code_units_job_position_unique" ON "code_units" USING btree ("job_id","position");