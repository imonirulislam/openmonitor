import { and, db, eq, schema } from "@openmonitor/db";
import { Badge, SectionGroupTitle } from "@openmonitor/ui";
import { ExternalLinkIcon } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StatusPageTabs } from "~/components/status-page-tabs";
import { getCurrentWorkspaceId } from "~/lib/workspace";

export default async function StatusPageDetailLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  const workspaceId = await getCurrentWorkspaceId();

  const [page] = await db()
    .select({
      id: schema.statusPages.id,
      slug: schema.statusPages.slug,
      name: schema.statusPages.name,
      isPublic: schema.statusPages.isPublic,
      customDomain: schema.statusPages.customDomain,
    })
    .from(schema.statusPages)
    .where(and(eq(schema.statusPages.id, id), eq(schema.statusPages.workspaceId, workspaceId)))
    .limit(1);
  if (!page) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_STATUS_PAGE_URL ?? "http://localhost:5003";
  const publicUrl = page.customDomain ? `https://${page.customDomain}` : `${baseUrl}/${page.slug}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SectionGroupTitle>{page.name}</SectionGroupTitle>
            <Badge variant={page.isPublic ? "success" : "default"}>
              {page.isPublic ? "public" : "private"}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-muted-foreground text-xs">{page.slug}</p>
        </div>
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-muted-foreground text-xs uppercase tracking-wide hover:text-foreground"
        >
          View public page <ExternalLinkIcon className="size-3" />
        </a>
      </header>

      <StatusPageTabs pageId={id} />

      {children}
    </div>
  );
}
