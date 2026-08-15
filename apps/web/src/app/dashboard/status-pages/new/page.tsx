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
  Separator,
  Textarea,
} from "@openmonitor/ui";
import { createStatusPage } from "~/lib/actions/status-pages";

export default function NewStatusPagePage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-semibold text-xl tracking-tight">New status page</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          A status page collects monitors into a public view. Pick which monitors appear on it after
          creating.
        </p>
      </header>
      <Separator />

      <FormCard asForm action={createStatusPage}>
        <FormCardHeader>
          <FormCardTitle>Basic info</FormCardTitle>
          <FormCardDescription>
            The slug appears in URLs (e.g. <span className="font-mono">/&lt;slug&gt;</span>).
          </FormCardDescription>
        </FormCardHeader>
        <FormCardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="Public Status" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              required
              pattern="[a-z0-9-]+"
              minLength={2}
              maxLength={80}
              placeholder="public"
              title="Lowercase letters, numbers, and dashes only"
            />
            <p className="font-mono text-[10px] text-muted-foreground">lowercase, dashes only</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              maxLength={2000}
              placeholder="What this status page covers."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customDomain">Custom domain (optional)</Label>
            <Input
              id="customDomain"
              name="customDomain"
              placeholder="status.example.com"
              maxLength={255}
            />
            <p className="text-[10px] text-muted-foreground">
              CNAME this hostname to the status-page deployment to serve it directly.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPublic"
              value="true"
              defaultChecked
              className="size-4 rounded border-border"
            />
            Public — visible to anyone with the URL
          </label>
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>You can change all of these later.</FormCardFooterInfo>
          <Button type="submit">Create</Button>
        </FormCardFooter>
      </FormCard>
    </div>
  );
}
