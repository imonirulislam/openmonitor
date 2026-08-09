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
  LocalTime,
} from "@openmonitor/ui";
import { changeOwnPassword } from "~/lib/actions/users";
import { getCurrentWorkspace } from "~/lib/workspace";

export default async function AccountSettingsPage() {
  const ws = await getCurrentWorkspace();
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, ws.userId))
    .limit(1);
  if (!user) throw new Error("user not found");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <FormCard>
        <FormCardHeader>
          <FormCardTitle>Profile</FormCardTitle>
          <FormCardDescription>Identity and current workspace role.</FormCardDescription>
        </FormCardHeader>
        <FormCardContent>
          <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <Detail label="Email" value={user.email} mono />
            <Detail label="Name" value={user.name ?? "—"} />
            <Detail label="Role here" value={ws.role} mono />
            <Detail
              label="Last login"
              value={
                user.lastLoginAt ? <LocalTime date={user.lastLoginAt.toISOString()} /> : "—"
              }
              mono
            />
            <Detail
              label="Joined"
              value={<LocalTime date={user.createdAt.toISOString()} format="LLL d, y" />}
              mono
            />
          </dl>
        </FormCardContent>
      </FormCard>

      <FormCard asForm action={changeOwnPassword}>
        <FormCardHeader>
          <FormCardTitle>Change password</FormCardTitle>
          <FormCardDescription>
            We don't store the new password in plaintext. Existing sessions stay valid.
          </FormCardDescription>
        </FormCardHeader>
        <FormCardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirm</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>Minimum 8 characters.</FormCardFooterInfo>
          <Button type="submit">Update password</Button>
        </FormCardFooter>
      </FormCard>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="col-span-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`col-span-2 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </>
  );
}
