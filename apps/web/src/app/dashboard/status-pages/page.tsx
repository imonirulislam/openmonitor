import { db, desc, eq, schema } from "@openmonitor/db";
import { Button, Card, SectionGroupTitle } from "@openmonitor/ui";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { StatusPagesTable } from "~/components/status-pages-table";
import { getCurrentWorkspaceId } from "~/lib/workspace";

export default async function StatusPagesIndex() {
  const workspaceId = await getCurrentWorkspaceId();

  const pages = await db()
    .select({
      id: schema.statusPages.id,
      slug: schema.statusPages.slug,
      name: schema.statusPages.name,
      logoUrl: schema.statusPages.logoUrl,
      customDomain: schema.statusPages.customDomain,
    })
    .from(schema.statusPages)
    .where(eq(schema.statusPages.workspaceId, workspaceId))
    .orderBy(desc(schema.statusPages.createdAt));

  const baseUrl = process.env.NEXT_PUBLIC_STATUS_PAGE_URL ?? "http://localhost:5003";
  // Pre-compute the public URL server-side so the row component doesn't need
  // the env var.
  const rows = pages.map((p) => ({
    ...p,
    publicUrl: p.customDomain ? `https://${p.customDomain}` : `${baseUrl}/${p.slug}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <SectionGroupTitle>Status Pages</SectionGroupTitle>
          <p className="mt-1 text-muted-foreground text-sm">Create and manage your status pages.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/status-pages/new">
            <PlusIcon /> Create Status Page
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          No status pages yet.{" "}
          <Link href="/dashboard/status-pages/new" className="underline">
            Create one
          </Link>
          .
        </Card>
      ) : (
        <StatusPagesTable rows={rows} />
      )}
    </div>
  );
}
