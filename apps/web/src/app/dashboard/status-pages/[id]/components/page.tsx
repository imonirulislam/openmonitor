import { asc, db, eq, schema } from "@openmonitor/db";
import {
  type LoadedComponent,
  type LoadedGroup,
  PageComponentsForm,
} from "~/components/page-components-form";
import { updatePageComponentsTree } from "~/lib/actions/page-components";
import { getCurrentWorkspaceId } from "~/lib/workspace";

export default async function StatusPageComponents({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspaceId = await getCurrentWorkspaceId();
  const conn = db();

  const components = await conn
    .select({
      id: schema.pageComponents.id,
      type: schema.pageComponents.type,
      monitorId: schema.pageComponents.monitorId,
      monitorName: schema.monitors.name,
      monitorSlug: schema.monitors.slug,
      monitorStatus: schema.monitors.currentStatus,
      name: schema.pageComponents.name,
      description: schema.pageComponents.description,
      staticStatus: schema.pageComponents.staticStatus,
      groupId: schema.pageComponents.groupId,
      position: schema.pageComponents.position,
      groupPosition: schema.pageComponents.groupPosition,
    })
    .from(schema.pageComponents)
    .leftJoin(schema.monitors, eq(schema.monitors.id, schema.pageComponents.monitorId))
    .where(eq(schema.pageComponents.statusPageId, id))
    .orderBy(asc(schema.pageComponents.position));

  const groups = await conn
    .select()
    .from(schema.pageComponentGroups)
    .where(eq(schema.pageComponentGroups.statusPageId, id))
    .orderBy(asc(schema.pageComponentGroups.position));

  const allMonitors = await conn
    .select({
      id: schema.monitors.id,
      name: schema.monitors.name,
      slug: schema.monitors.slug,
      description: schema.monitors.description,
      currentStatus: schema.monitors.currentStatus,
    })
    .from(schema.monitors)
    .where(eq(schema.monitors.workspaceId, workspaceId))
    .orderBy(asc(schema.monitors.name));

  return (
    <PageComponentsForm
      pageId={id}
      initialComponents={components as LoadedComponent[]}
      initialGroups={groups as LoadedGroup[]}
      monitors={allMonitors}
      action={updatePageComponentsTree.bind(null, id)}
    />
  );
}
