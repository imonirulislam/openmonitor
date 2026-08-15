import { db, eq, schema } from "@openmonitor/db";
import {
  Button,
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardFooterInfo,
  FormCardHeader,
  FormCardTitle,
  Input,
  Label,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@openmonitor/ui";
import { createWorkspace, deleteWorkspace, renameWorkspace } from "~/lib/actions/workspace";
import { getCurrentWorkspace } from "~/lib/workspace";

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: showCreate } = await searchParams;
  const ws = await getCurrentWorkspace();
  const [workspace] = await db()
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, ws.workspaceId))
    .limit(1);
  if (!workspace) throw new Error("workspace not found");
  const isAdmin = ws.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader>
        <SectionTitle>Workspace</SectionTitle>
        <SectionDescription>
          Name and slug for the current workspace, plus creating and deleting workspaces. The slug
          appears in URL paths.
        </SectionDescription>
      </SectionHeader>
      <div className="flex max-w-2xl flex-col gap-6">
        <FormCard asForm action={renameWorkspace}>
          <FormCardHeader>
            <FormCardTitle>Identity</FormCardTitle>
            <FormCardDescription>
              Identity and slug. The slug is used in URL paths and for the public status page.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardContent>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={workspace.name}
                required
                disabled={!isAdmin}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={workspace.slug}
                required
                disabled={!isAdmin}
                pattern="[a-z0-9-]+"
                minLength={2}
                maxLength={80}
                title="Lowercase letters, numbers, and dashes only (e.g. game-studio)"
              />
              <p className="font-mono text-[10px] text-muted-foreground">
                lowercase, dashes only — used in URLs
              </p>
            </div>
          </FormCardContent>
          <FormCardFooter>
            <FormCardFooterInfo>
              {isAdmin ? "Both fields are admin-only." : "Read-only — only admins can edit."}
            </FormCardFooterInfo>
            <Button type="submit" disabled={!isAdmin}>
              Save
            </Button>
          </FormCardFooter>
        </FormCard>

        {showCreate ? (
          <FormCard asForm action={createWorkspace}>
            <FormCardHeader>
              <FormCardTitle>New workspace</FormCardTitle>
              <FormCardDescription>
                You'll become the admin of the new workspace and switch to it immediately.
              </FormCardDescription>
            </FormCardHeader>
            <FormCardContent>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-name">Name</Label>
                <Input id="new-name" name="name" required placeholder="Game Studio" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-slug">Slug</Label>
                <Input
                  id="new-slug"
                  name="slug"
                  required
                  placeholder="game-studio"
                  pattern="[a-z0-9-]+"
                />
              </div>
            </FormCardContent>
            <FormCardFooter>
              <FormCardFooterInfo>Lowercase, dashes only.</FormCardFooterInfo>
              <Button type="submit">Create workspace</Button>
            </FormCardFooter>
          </FormCard>
        ) : null}

        {isAdmin ? (
          <FormCard className="border-destructive/30">
            <FormCardHeader>
              <FormCardTitle className="text-destructive">Danger zone</FormCardTitle>
              <FormCardDescription>
                Deletes this workspace and all its monitors, incidents, channels, and audit logs.
                You can't undo this. Refused if it's your only workspace.
              </FormCardDescription>
            </FormCardHeader>
            <FormCardFooter className="bg-destructive/5">
              <FormCardFooterInfo>This action cannot be undone.</FormCardFooterInfo>
              <form action={deleteWorkspace}>
                <Button variant="destructive" type="submit">
                  Delete workspace
                </Button>
              </form>
            </FormCardFooter>
          </FormCard>
        ) : null}
      </div>
    </div>
  );
}
