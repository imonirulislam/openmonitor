-- Who actually runs the box. @openmonitor/regions infers a provider from the
-- region code, which is right for a hosted fleet and wrong for a self-hosted
-- one: a Contabo box named `sin` was being labelled "fly". The catalogue is a
-- suggestion; this column is the answer, and NULL means "don't claim one".
ALTER TABLE "probe_locations" ADD COLUMN IF NOT EXISTS "provider" varchar(50);
