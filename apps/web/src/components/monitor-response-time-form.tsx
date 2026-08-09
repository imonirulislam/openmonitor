"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Form,
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardFooterInfo,
  FormCardHeader,
  FormCardTitle,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  toast,
} from "@openmonitor/ui";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  degradedAfterMs: z.coerce.number().int().min(0).max(120_000).optional(),
  timeoutMs: z.coerce.number().int().min(500).max(120_000),
});

export type ResponseTimeFormValues = z.infer<typeof schema>;
export type ResponseTimeFormInput = z.input<typeof schema>;

export function MonitorResponseTimeForm({
  defaultValues,
  action,
}: {
  defaultValues?: Partial<ResponseTimeFormInput>;
  action: (formData: FormData) => Promise<void>;
}) {
  const form = useForm<ResponseTimeFormInput, unknown, ResponseTimeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      degradedAfterMs: undefined,
      timeoutMs: 10_000,
      ...defaultValues,
    },
  });
  const [pending, startTransition] = useTransition();

  function onSubmit(values: ResponseTimeFormValues) {
    if (pending) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("payload", JSON.stringify(values));
      try {
        await action(fd);
      } catch (err) {
        if (err && typeof err === "object" && "digest" in err) throw err;
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormCard>
          <FormCardHeader>
            <FormCardTitle>Response Time Thresholds</FormCardTitle>
            <FormCardDescription>
              Configure your degraded and timeout thresholds.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="degradedAfterMs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Degraded (in ms.)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="optional"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        field.onChange(raw === "" ? undefined : Number.parseInt(raw, 10));
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Time after which the endpoint is considered degraded. Leave blank to
                    disable latency-based degradation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timeoutMs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timeout (in ms.)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="10000" {...field} />
                  </FormControl>
                  <FormDescription>
                    Max time allowed for the request to complete.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormCardContent>
          <FormCardFooter>
            <FormCardFooterInfo>
              Both apply to HTTP, TCP, and DNS probes.
            </FormCardFooterInfo>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </FormCardFooter>
        </FormCard>
      </form>
    </Form>
  );
}
