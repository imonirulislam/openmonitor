-- The status page slug becomes its subdomain under STATUS_PAGE_ROOT_DOMAIN, so
-- it has to be unique across workspaces, not within one.

-- Existing collisions first, or the index can't be created. Oldest row keeps
-- the slug; the rest get a workspace-id suffix. Rows sharing a slug are always
-- in different workspaces (the old index made that true), so the suffixes
-- differ. Renamed pages change URL — unavoidable, and the alternative is a
-- migration that refuses to run.
UPDATE "status_pages" sp
SET "slug" = sp."slug" || '-' || substr(sp."workspace_id"::text, 1, 8)
WHERE EXISTS (
  SELECT 1 FROM "status_pages" other
  WHERE other."slug" = sp."slug"
    AND other."id" <> sp."id"
    AND (other."created_at", other."id") < (sp."created_at", sp."id")
);
--> statement-breakpoint
DROP INDEX IF EXISTS "status_pages_workspace_slug_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "status_pages_slug_unique" ON "status_pages" USING btree ("slug");
