import { db, desc, eq, schema } from "@openmonitor/db";
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
  Textarea,
} from "@openmonitor/ui";
import { getCurrentWorkspaceId } from "~/lib/workspace";
import {
  createIncidentTemplate,
  deleteIncidentTemplate,
  updateIncidentTemplate,
} from "~/lib/actions/incident-templates";
import { RowActionAction, RowActions } from "~/components/row-actions";

export default async function IncidentTemplatesPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const templates = await db()
    .select()
    .from(schema.incidentTemplates)
    .where(eq(schema.incidentTemplates.workspaceId, workspaceId))
    .orderBy(desc(schema.incidentTemplates.createdAt));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <FormCard asForm action={createIncidentTemplate}>
        <FormCardHeader>
          <FormCardTitle>New incident template</FormCardTitle>
          <FormCardDescription>
            Saved title and message text you can paste into a new incident.
          </FormCardDescription>
        </FormCardHeader>
        <FormCardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Internal name</Label>
            <Input id="name" name="name" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titleTemplate">Title</Label>
            <Input
              id="titleTemplate"
              name="titleTemplate"
              required
              maxLength={300}
              placeholder="Investigating elevated 5xx on the API"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="messageTemplate">Message</Label>
            <Textarea
              id="messageTemplate"
              name="messageTemplate"
              required
              rows={5}
              maxLength={5000}
              placeholder="We're seeing a spike in 5xx responses from the API. Investigating now."
            />
          </div>
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>Plain text. No interpolation in v1.</FormCardFooterInfo>
          <Button type="submit">Save template</Button>
        </FormCardFooter>
      </FormCard>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium text-sm tracking-tight">Saved templates</h2>
        {templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No templates yet. Create one above.
          </p>
        ) : (
          templates.map((t) => (
            <FormCard key={t.id} asForm action={updateIncidentTemplate.bind(null, t.id)}>
              <FormCardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <FormCardTitle>{t.name}</FormCardTitle>
                  </div>
                  <RowActions>
                    <RowActionAction
                      action={deleteIncidentTemplate.bind(null, t.id)}
                      destructive
                    >
                      Delete
                    </RowActionAction>
                  </RowActions>
                </div>
              </FormCardHeader>
              <FormCardContent>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`name-${t.id}`}>Internal name</Label>
                  <Input id={`name-${t.id}`} name="name" defaultValue={t.name} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`title-${t.id}`}>Title</Label>
                  <Input
                    id={`title-${t.id}`}
                    name="titleTemplate"
                    defaultValue={t.titleTemplate}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`message-${t.id}`}>Message</Label>
                  <Textarea
                    id={`message-${t.id}`}
                    name="messageTemplate"
                    rows={4}
                    defaultValue={t.messageTemplate}
                    required
                  />
                </div>
              </FormCardContent>
              <FormCardFooter>
                <FormCardFooterInfo>Edit and save to update.</FormCardFooterInfo>
                <Button type="submit" variant="outline">
                  Save changes
                </Button>
              </FormCardFooter>
            </FormCard>
          ))
        )}
      </div>
    </div>
  );
}
