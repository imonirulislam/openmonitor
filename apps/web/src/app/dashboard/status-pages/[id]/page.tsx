import { redirect } from "next/navigation";

/** Tab landing — bounce to status-reports (the openstatus default). */
export default async function StatusPageDetailIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/status-pages/${id}/status-reports`);
}
