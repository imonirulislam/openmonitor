import { db, eq, schema } from "@openmonitor/db";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@openmonitor/ui";
import { ActivityIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { acceptInvite } from "~/lib/actions/users";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [row] = await db()
    .select()
    .from(schema.verificationTokens)
    .where(eq(schema.verificationTokens.token, token))
    .limit(1);

  if (!row) notFound();
  if (row.expires < new Date()) {
    return <Expired />;
  }

  const parts = row.identifier.split(":");
  if (parts.length !== 4 || parts[0] !== "invite") notFound();
  const [_prefix, workspaceId, userId, role] = parts;

  // Pull workspace name + invitee email so the page reads naturally.
  const [workspace] = await db()
    .select({ name: schema.workspaces.name })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId!))
    .limit(1);
  const [user] = await db()
    .select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId!))
    .limit(1);

  if (!workspace || !user) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-foreground text-background">
          <ActivityIcon className="size-5" />
        </div>
        <div className="flex flex-col">
          <h1 className="font-semibold text-base leading-none">OpenMonitor</h1>
          <p className="text-muted-foreground text-xs">Accept invitation</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Join {workspace.name}</CardTitle>
          <p className="text-muted-foreground text-sm">
            You've been invited as <span className="font-mono">{role}</span>. Set a password and
            you're in.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <form action={acceptInvite.bind(null, token)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} disabled readOnly />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={user.name ?? ""}
                placeholder="Your name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <Button type="submit">Create account</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function Expired() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite expired</CardTitle>
          <p className="text-muted-foreground text-sm">
            This invite link is no longer valid. Ask your workspace admin to send a new one.
          </p>
        </CardHeader>
      </Card>
    </main>
  );
}
