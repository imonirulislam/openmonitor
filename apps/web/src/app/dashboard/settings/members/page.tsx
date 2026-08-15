import { db, desc, eq, schema } from "@openmonitor/db";
import {
  Button,
  Card,
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardFooterInfo,
  FormCardHeader,
  FormCardTitle,
  Input,
  Label,
  SectionLabel,
  Select,
} from "@openmonitor/ui";
import { headers } from "next/headers";
import { CopyButton } from "~/components/copy-button";
import { MembersTable } from "~/components/members-table";
import { inviteMember } from "~/lib/actions/users";
import { getCurrentWorkspace } from "~/lib/workspace";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; token?: string }>;
}) {
  const { invited, token } = await searchParams;
  const ws = await getCurrentWorkspace();
  const isAdmin = ws.role === "admin";

  const members = await db()
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isActive: schema.users.isActive,
      lastLoginAt: schema.users.lastLoginAt,
      role: schema.workspaceMembers.role,
      memberSince: schema.workspaceMembers.createdAt,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, ws.workspaceId))
    .orderBy(desc(schema.workspaceMembers.createdAt));

  // Build the invite link from the request host so it works on whatever
  // hostname the admin app is served from (localhost, custom domain, etc).
  let inviteUrl: string | null = null;
  if (invited && token) {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("host") ?? "localhost:5001";
    inviteUrl = `${proto}://${host}/invite/${token}`;
  }

  return (
    <div className="flex flex-col gap-6">
      {inviteUrl ? (
        <Card className="border-success/30 bg-success/5 p-4">
          <p className="font-medium text-sm">Invite link ready</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Share this link with the new member. It expires in 7 days. They'll set their own
            password on first visit.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background p-2 font-mono text-xs">
            <span className="flex-1 truncate">{inviteUrl}</span>
            <CopyButton value={inviteUrl} />
          </div>
        </Card>
      ) : null}

      {isAdmin ? (
        <FormCard asForm action={inviteMember} className="max-w-2xl">
          <FormCardHeader>
            <FormCardTitle>Invite member</FormCardTitle>
            <FormCardDescription>
              Adds the user to this workspace. If they already have an account, they're added
              immediately at the role you choose. If not, you'll get a one-time link to share.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role">Role</Label>
                <Select id="role" name="role" defaultValue="viewer">
                  <option value="viewer">Viewer (read-only)</option>
                  <option value="editor">Editor (manage monitors / incidents)</option>
                  <option value="admin">Admin (workspace + members)</option>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Display name (optional)</Label>
              <Input id="name" name="name" placeholder="Leave blank to let them choose" />
            </div>
          </FormCardContent>
          <FormCardFooter>
            <FormCardFooterInfo>Invite links expire in 7 days.</FormCardFooterInfo>
            <Button type="submit">Send invite</Button>
          </FormCardFooter>
        </FormCard>
      ) : null}

      <div className="flex flex-col gap-3">
        <SectionLabel>Members ({members.length})</SectionLabel>
        <MembersTable
          rows={members.map((m) => ({
            userId: m.userId,
            email: m.email,
            name: m.name ?? null,
            role: m.role as "admin" | "editor" | "viewer",
            isActive: m.isActive ?? false,
            lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
            isSelf: m.userId === ws.userId,
            canEdit: isAdmin && m.userId !== ws.userId,
          }))}
        />
      </div>
    </div>
  );
}
