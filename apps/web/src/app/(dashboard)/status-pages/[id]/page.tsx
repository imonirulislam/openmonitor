import { redirect } from "next/navigation";
import { statusPageIdFrom } from "~/lib/resolve-entity";
import { getCurrentWorkspaceId } from "~/lib/workspace";

/** Tab landing — bounce to status-reports (the openstatus default). */
export default async function StatusPageDetailIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idOrSlug } = await params;
  const workspaceId = await getCurrentWorkspaceId();
  const id = await statusPageIdFrom(idOrSlug, workspaceId);
  redirect(`/status-pages/${idOrSlug}/status-reports`);
}
