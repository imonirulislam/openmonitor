ALTER TABLE "monitor_runs" ADD COLUMN "latency_dns_ms" integer;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "latency_connect_ms" integer;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "latency_tls_ms" integer;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "latency_ttfb_ms" integer;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "latency_transfer_ms" integer;
