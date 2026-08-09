CREATE TABLE IF NOT EXISTS "heartbeat_monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"expected_interval_seconds" integer DEFAULT 300 NOT NULL,
	"grace_seconds" integer DEFAULT 60 NOT NULL,
	"token" varchar(80) NOT NULL,
	"last_ping_at" timestamp with time zone,
	"current_status" "monitor_status" DEFAULT 'unknown' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "heartbeat_monitors" ADD CONSTRAINT "heartbeat_monitors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "heartbeat_monitors_workspace_slug_unique" ON "heartbeat_monitors" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "heartbeat_monitors_token_unique" ON "heartbeat_monitors" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heartbeat_monitors_status_idx" ON "heartbeat_monitors" USING btree ("enabled","last_ping_at");