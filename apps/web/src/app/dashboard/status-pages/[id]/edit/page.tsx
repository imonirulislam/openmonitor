import { and, db, eq, schema } from "@openmonitor/db";
import {
  Badge,
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
  Textarea,
} from "@openmonitor/ui";
import { notFound } from "next/navigation";
import {
  deleteStatusPage,
  setStatusPagePassword,
  updateStatusPage,
  updateStatusPageBranding,
  updateStatusPageLinks,
} from "~/lib/actions/status-pages";
import { getCurrentWorkspace } from "~/lib/workspace";

export default async function StatusPageSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getCurrentWorkspace();
  const [page] = await db()
    .select()
    .from(schema.statusPages)
    .where(and(eq(schema.statusPages.id, id), eq(schema.statusPages.workspaceId, ws.workspaceId)))
    .limit(1);
  if (!page) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_STATUS_PAGE_URL ?? "http://localhost:5003";
  const publicUrl = page.customDomain ? `https://${page.customDomain}` : `${baseUrl}/${page.slug}`;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader>
        <SectionTitle>Settings</SectionTitle>
        <SectionDescription>
          Identity, branding, links, and access for this status page.
        </SectionDescription>
      </SectionHeader>
      <div className="flex max-w-2xl flex-col gap-6">
        <FormCard asForm action={updateStatusPage.bind(null, id)}>
          <FormCardHeader>
            <FormCardTitle>Identity</FormCardTitle>
            <FormCardDescription>Slug, name, visibility, custom domain.</FormCardDescription>
          </FormCardHeader>
          <FormCardContent>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={page.name} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={page.slug}
                required
                pattern="[a-z0-9-]+"
                minLength={2}
                maxLength={80}
                title="Lowercase letters, numbers, and dashes only"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={2}
                defaultValue={page.description ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customDomain">Custom domain</Label>
              <Input
                id="customDomain"
                name="customDomain"
                defaultValue={page.customDomain ?? ""}
                placeholder="status.example.com"
                maxLength={255}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isPublic"
                value="true"
                defaultChecked={page.isPublic}
                className="size-4 rounded border-border"
              />
              Public
            </label>
          </FormCardContent>
          <FormCardFooter>
            <FormCardFooterInfo>
              Public URL: <span className="font-mono">{publicUrl}</span>
            </FormCardFooterInfo>
            <Button type="submit">Save identity</Button>
          </FormCardFooter>
        </FormCard>

        <FormCard asForm action={updateStatusPageBranding.bind(null, id)}>
          <FormCardHeader>
            <FormCardTitle>Branding</FormCardTitle>
            <FormCardDescription>
              Logo, icon (favicon), color, and optional CSS shown on the public page.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardContent>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                name="logoUrl"
                type="url"
                defaultValue={page.logoUrl ?? ""}
                placeholder="https://cdn.example.com/logo.svg"
                maxLength={2000}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iconUrl">
                Icon URL{" "}
                <span className="font-normal text-muted-foreground">
                  (favicon — defaults to the app default if blank)
                </span>
              </Label>
              <div className="flex items-center gap-3">
                {page.iconUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={page.iconUrl}
                    alt="Icon preview"
                    className="size-9 rounded border border-border bg-muted"
                  />
                ) : (
                  <span className="flex size-9 items-center justify-center rounded border border-dashed border-border text-muted-foreground text-xs">
                    —
                  </span>
                )}
                <Input
                  id="iconUrl"
                  name="iconUrl"
                  type="url"
                  defaultValue={page.iconUrl ?? ""}
                  placeholder="https://cdn.example.com/favicon.png"
                  maxLength={2000}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="primaryColor">Primary color</Label>
              <Input
                id="primaryColor"
                name="primaryColor"
                defaultValue={page.primaryColor ?? ""}
                placeholder="#2563eb or oklch(0.62 0.19 260)"
                maxLength={64}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customCss">Custom CSS</Label>
              <Textarea
                id="customCss"
                name="customCss"
                rows={6}
                defaultValue={page.customCss ?? ""}
                placeholder=":root { --my-accent: hotpink; }"
                maxLength={20000}
                className="font-mono text-xs"
              />
            </div>
          </FormCardContent>
          <FormCardFooter>
            <FormCardFooterInfo>
              CSS is injected verbatim into a &lt;style&gt; tag on the public page.
            </FormCardFooterInfo>
            <Button type="submit">Save branding</Button>
          </FormCardFooter>
        </FormCard>

        <FormCard asForm action={updateStatusPageLinks.bind(null, id)}>
          <FormCardHeader>
            <FormCardTitle>Links</FormCardTitle>
            <FormCardDescription>Configure the links for the status page.</FormCardDescription>
          </FormCardHeader>
          <FormCardContent>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="homepageUrl">Homepage URL</Label>
              <Input
                id="homepageUrl"
                name="homepageUrl"
                type="url"
                defaultValue={page.homepageUrl ?? ""}
                placeholder="https://acme.com"
                maxLength={2000}
              />
              <p className="text-muted-foreground text-xs">
                What URL should the logo link to? Leave empty to hide.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contactUrl">Contact URL</Label>
              <Input
                id="contactUrl"
                name="contactUrl"
                defaultValue={page.contactUrl ?? ""}
                placeholder="https://acme.com/contact"
                maxLength={2000}
              />
              <p className="text-muted-foreground text-xs">
                Page or <span className="font-mono">mailto:</span> URL for contact. Leave empty to
                hide.
              </p>
            </div>
          </FormCardContent>
          <FormCardFooter>
            <FormCardFooterInfo>Both links are optional.</FormCardFooterInfo>
            <Button type="submit">Save links</Button>
          </FormCardFooter>
        </FormCard>

        <FormCard asForm action={setStatusPagePassword.bind(null, id)}>
          <FormCardHeader>
            <FormCardTitle>Password protection</FormCardTitle>
            <FormCardDescription>
              Optional. When set, visitors must enter the password before they see status data.
              Submit a blank field to remove protection.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardContent>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">
                Password{" "}
                {page.passwordHash ? (
                  <Badge variant="success">currently set</Badge>
                ) : (
                  <Badge variant="default">not set</Badge>
                )}
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                maxLength={200}
                placeholder={page.passwordHash ? "Replace with a new password…" : "Set a password…"}
              />
            </div>
          </FormCardContent>
          <FormCardFooter>
            <FormCardFooterInfo>
              Stored as a scrypt hash. Submitting blank clears protection.
            </FormCardFooterInfo>
            <Button type="submit">Save password</Button>
          </FormCardFooter>
        </FormCard>

        <FormCard className="border-destructive/30">
          <FormCardHeader>
            <FormCardTitle className="text-destructive">Danger zone</FormCardTitle>
            <FormCardDescription>
              Deletes this status page. Underlying monitors are not affected.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardFooter className="bg-destructive/5">
            <FormCardFooterInfo>This action cannot be undone.</FormCardFooterInfo>
            <form action={deleteStatusPage.bind(null, id)}>
              <Button variant="destructive" type="submit">
                Delete status page
              </Button>
            </form>
          </FormCardFooter>
        </FormCard>
      </div>
    </div>
  );
}
