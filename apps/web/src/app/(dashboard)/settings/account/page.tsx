import {
  Avatar,
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
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@openmonitor/ui";
import { changeOwnPassword, updateOwnProfile } from "~/lib/actions/users";
import { getCurrentUser, getCurrentWorkspace } from "~/lib/workspace";

export default async function AccountSettingsPage() {
  const [ws, user] = await Promise.all([getCurrentWorkspace(), getCurrentUser()]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader>
        <SectionTitle>Account</SectionTitle>
        <SectionDescription>
          Your identity and password. These follow you across every workspace you belong to.
        </SectionDescription>
      </SectionHeader>

      <div className="flex flex-col gap-6">
        <FormCard asForm action={updateOwnProfile}>
          <FormCardHeader>
            <FormCardTitle>Profile</FormCardTitle>
            <FormCardDescription>
              Your name is what teammates see next to your actions in audit logs and incidents.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardContent>
            <div className="flex items-start gap-4">
              <Avatar
                size="lg"
                name={user.name}
                email={user.email}
                image={user.image}
                className="mt-6"
              />
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">Display name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={user.name ?? ""}
                    maxLength={200}
                    placeholder={user.email.split("@")[0]}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={user.email} readOnly disabled />
                  <p className="text-muted-foreground text-xs">
                    Your sign-in identity — it can't be changed here.
                  </p>
                </div>
              </div>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 border-border border-t pt-4 text-xs">
              <Meta label="Role here" value={ws.role} />
              <Meta
                label="Last login"
                value={user.lastLoginAt ? <LocalTime date={user.lastLoginAt.toISOString()} /> : "—"}
              />
              <Meta
                label="Joined"
                value={<LocalTime date={user.createdAt.toISOString()} format="LLL d, y" />}
              />
            </dl>
          </FormCardContent>
          <FormCardFooter>
            <FormCardFooterInfo>Visible to everyone in your workspaces.</FormCardFooterInfo>
            <Button type="submit">Save profile</Button>
          </FormCardFooter>
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
            <div className="grid gap-3 sm:grid-cols-2">
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
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
