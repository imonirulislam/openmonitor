"use client";

import { Select } from "@openmonitor/ui";

type Template = {
  id: string;
  name: string;
  titleTemplate: string;
  messageTemplate: string;
};

/**
 * Drop-in client component for the "Apply template" dropdown on the new-
 * incident form. Selecting a template fills the title and message fields by
 * id — works alongside the server form action without taking ownership of
 * form state.
 */
export function TemplatePicker({
  templates,
  titleFieldId,
  messageFieldId,
}: {
  templates: Template[];
  titleFieldId: string;
  messageFieldId: string;
}) {
  if (templates.length === 0) return null;

  return (
    <Select
      defaultValue=""
      onChange={(e) => {
        const id = e.target.value;
        if (!id) return;
        const t = templates.find((x) => x.id === id);
        if (!t) return;
        const title = document.getElementById(titleFieldId) as HTMLInputElement | null;
        const message = document.getElementById(messageFieldId) as HTMLTextAreaElement | null;
        if (title) title.value = t.titleTemplate;
        if (message) message.value = t.messageTemplate;
        e.target.value = "";
      }}
    >
      <option value="">Apply template…</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}
