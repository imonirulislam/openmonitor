"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type Assertion,
  assertion as assertionSchema,
  type HeaderEntry,
  type MonitorKind,
  monitorKinds,
  numberCompareDictionary,
  recordCompareDictionary,
  stringCompareDictionary,
} from "@openmonitor/db/assertions";
import {
  Button,
  cn,
  Form,
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardFooterInfo,
  FormCardHeader,
  FormCardSeparator,
  FormCardTitle,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@openmonitor/ui";
import { GlobeIcon, NetworkIcon, PlusIcon, ServerIcon, XIcon } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const HTTP_METHODS = ["GET", "POST", "HEAD", "PUT", "DELETE", "PATCH"] as const;

// Form-level Zod. Mirrors openstatus's `form-general.tsx` schema, plus the
// fields we need server-side that openstatus stores elsewhere (slug,
// description, intervalSeconds, retries, degradedAfterMs, timeoutMs).
const formSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, and dashes only"),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  kind: z.enum(monitorKinds),
  active: z.boolean(),
  // HTTP fields
  url: z.string().optional().default(""),
  method: z.enum(HTTP_METHODS).optional().default("GET"),
  headers: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  body: z.string().optional().default(""),
  // TCP fields (single host:port string)
  hostPort: z.string().optional().default(""),
  // DNS field
  dnsHost: z.string().optional().default(""),
  followRedirects: z.boolean().default(true),
  // Assertions live in a discriminated array. Reuse the canonical schema so
  // the form, server action, and DB type stay in lockstep — including
  // jsonBody (no UI button yet but schema-supported).
  assertions: z.array(assertionSchema).default([]),
});

export type MonitorFormValues = z.output<typeof formSchema>;
export type MonitorFormInput = z.input<typeof formSchema>;

type Mode = "create" | "edit";

const TYPE_OPTIONS: Array<{
  value: MonitorKind;
  icon: typeof GlobeIcon;
  label: string;
  enabled: boolean;
  hint: string;
}> = [
  {
    value: "http",
    icon: GlobeIcon,
    label: "HTTP",
    enabled: true,
    hint: "HTTP/HTTPS endpoint probe.",
  },
  { value: "tcp", icon: NetworkIcon, label: "TCP", enabled: true, hint: "TCP port probe." },
  { value: "dns", icon: ServerIcon, label: "DNS", enabled: true, hint: "DNS record probe." },
];

const HTTP_ASSERTION_TYPES = ["status", "header", "textBody"] as const;
const DNS_ASSERTION_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"] as const;

export function MonitorConfigForm({
  mode,
  defaultValues,
  action,
}: {
  mode: Mode;
  defaultValues?: Partial<MonitorFormInput>;
  /** Server action receiving the JSON-serialized payload via FormData["payload"]. */
  action: (formData: FormData) => Promise<void>;
}) {
  const form = useForm<MonitorFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodResolver's
    // inferred type (built from `formSchema`'s output) loses our explicit
    // TFieldValues argument. Runtime is correct; the cast quiets TS.
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      slug: "",
      name: "",
      description: "",
      kind: "http",
      active: true,
      url: "",
      method: "GET",
      headers: [],
      body: "",
      hostPort: "",
      dnsHost: "",
      followRedirects: true,
      assertions: [{ version: "v1", type: "status", compare: "eq", target: 200 }],
      ...defaultValues,
    },
  });
  const [pending, startTransition] = useTransition();
  const watchKind = form.watch("kind");
  const watchMethod = form.watch("method");
  const headers = form.watch("headers") ?? [];
  const assertions = form.watch("assertions") ?? [];
  const kindLocked = mode === "edit";

  function onSubmit(values: MonitorFormValues) {
    if (pending) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("payload", JSON.stringify(values));
      try {
        await action(fd);
      } catch (err) {
        // Server actions that redirect throw NEXT_REDIRECT — let those bubble.
        if (err && typeof err === "object" && "digest" in err) throw err;
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <TooltipProvider>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <FormCard>
            <FormCardHeader>
              <FormCardTitle>Monitor Configuration</FormCardTitle>
              <FormCardDescription>
                Configure your monitor settings and endpoints.
              </FormCardDescription>
            </FormCardHeader>

            {/* Section A — name + active */}
            <FormCardContent className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Production API" {...field} />
                    </FormControl>
                    <FormDescription>Displayed on the status page.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-3">
                    <FormLabel className="!mt-0">Active</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem className="sm:col-span-3">
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input placeholder="production-api" {...field} />
                    </FormControl>
                    <FormDescription>
                      Used in URLs and incident affected-monitor lists. lowercase, dashes only.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-3">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="What this monitor checks." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormCardContent>

            <FormCardSeparator />

            {/* Section B — kind picker */}
            <FormCardContent>
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monitoring Type</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {TYPE_OPTIONS.map((opt) => {
                          const checked = field.value === opt.value;
                          const disabled = !opt.enabled || (kindLocked && !checked);
                          const Icon = opt.icon;
                          return (
                            <Tooltip key={opt.value}>
                              <TooltipTrigger asChild>
                                <label
                                  className={cn(
                                    "relative flex cursor-pointer flex-row items-center gap-3 rounded-md border border-input bg-background px-3 py-3 text-center shadow-xs outline-none transition-[color,box-shadow,background-color]",
                                    "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
                                    checked && "border-primary/50 bg-primary/5",
                                    disabled && "pointer-events-none opacity-50",
                                  )}
                                >
                                  <input
                                    type="radio"
                                    value={opt.value}
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => field.onChange(opt.value)}
                                    className="sr-only"
                                  />
                                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                                  <span className="font-medium text-sm">{opt.label}</span>
                                </label>
                              </TooltipTrigger>
                              <TooltipContent>
                                {kindLocked
                                  ? "Monitor type cannot be changed after creation."
                                  : opt.hint}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </FormControl>
                    <FormDescription>
                      Cannot be changed after the monitor is created.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormCardContent>

            <FormCardSeparator />

            {/* Section C — per-kind */}
            {watchKind === "http" ? (
              <FormCardContent className="grid grid-cols-4 gap-4">
                <div className="col-span-1">
                  <FormField
                    control={form.control}
                    name="method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Method</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                          >
                            {HTTP_METHODS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-3">
                  <FormField
                    control={form.control}
                    name="url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://api.example.com/health"
                            type="url"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="headers"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Request Headers</FormLabel>
                      <div className="flex flex-col gap-2">
                        {(field.value ?? []).map((h, idx) => (
                          <div key={idx} className="grid gap-2 sm:grid-cols-5">
                            <Input
                              placeholder="Key"
                              className="sm:col-span-2 font-mono text-xs"
                              value={h.key}
                              onChange={(e) => {
                                const next = [...(field.value ?? [])];
                                next[idx] = { ...next[idx], key: e.target.value } as HeaderEntry;
                                field.onChange(next);
                              }}
                            />
                            <Input
                              placeholder="Value"
                              className="sm:col-span-2 font-mono text-xs"
                              value={h.value}
                              onChange={(e) => {
                                const next = [...(field.value ?? [])];
                                next[idx] = { ...next[idx], value: e.target.value } as HeaderEntry;
                                field.onChange(next);
                              }}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              type="button"
                              onClick={() => {
                                field.onChange((field.value ?? []).filter((_, i) => i !== idx));
                              }}
                              aria-label="Remove header"
                            >
                              <XIcon className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() =>
                          field.onChange([...(field.value ?? []), { key: "", value: "" }])
                        }
                      >
                        <PlusIcon className="size-4" />
                        Add Header
                      </Button>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {["POST", "PUT", "PATCH", "DELETE"].includes(watchMethod ?? "") ? (
                  <FormField
                    control={form.control}
                    name="body"
                    render={({ field }) => (
                      <FormItem className="col-span-full">
                        <FormLabel>Body</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={4} className="font-mono text-xs" />
                        </FormControl>
                        <FormDescription>Request payload.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                <FormField
                  control={form.control}
                  name="followRedirects"
                  render={({ field }) => (
                    <FormItem className="col-span-full flex flex-row items-center gap-3">
                      <FormLabel className="!mt-0">Follow redirects</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </FormCardContent>
            ) : null}

            {watchKind === "tcp" ? (
              <FormCardContent className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="hostPort"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Host:Port</FormLabel>
                      <FormControl>
                        <Input placeholder="127.0.0.1:8080" {...field} />
                      </FormControl>
                      <FormMessage />
                      <FormDescription>Supports both IPv4 and IPv6 addresses.</FormDescription>
                    </FormItem>
                  )}
                />
                <div className="col-span-full text-muted-foreground text-sm">
                  Examples:
                  <ul className="list-inside list-disc">
                    <li>
                      Domain: <span className="font-mono text-foreground">example.com:443</span>
                    </li>
                    <li>
                      IPv4: <span className="font-mono text-foreground">192.168.1.1:443</span>
                    </li>
                    <li>
                      IPv6:{" "}
                      <span className="font-mono text-foreground">
                        [2001:db8:85a3:8d3:1319:8a2e:370:7348]:443
                      </span>
                    </li>
                  </ul>
                </div>
              </FormCardContent>
            ) : null}

            {watchKind === "dns" ? (
              <FormCardContent className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="dnsHost"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>URI</FormLabel>
                      <FormControl>
                        <Input placeholder="example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                      <FormDescription>Domain name to resolve.</FormDescription>
                    </FormItem>
                  )}
                />
              </FormCardContent>
            ) : null}

            {/* Section D — assertions (HTTP + DNS) */}
            {watchKind === "http" || watchKind === "dns" ? (
              <>
                <FormCardSeparator />
                <FormCardContent>
                  <FormField
                    control={form.control}
                    name="assertions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assertions</FormLabel>
                        <FormDescription>
                          Validate the response to ensure your service is working as expected.
                          <br />
                          {watchKind === "http"
                            ? "Add body, header, or status assertions."
                            : "Add DNS record assertions."}
                        </FormDescription>
                        <div className="flex flex-col gap-2">
                          {(field.value ?? []).map((a, idx) =>
                            renderAssertionRow(form, a, idx, () => {
                              field.onChange((field.value ?? []).filter((_, i) => i !== idx));
                            }),
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {watchKind === "http" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                onClick={() =>
                                  field.onChange([
                                    ...(field.value ?? []),
                                    {
                                      version: "v1",
                                      type: "status",
                                      compare: "eq",
                                      target: 200,
                                    },
                                  ])
                                }
                              >
                                <PlusIcon className="size-4" />
                                Add Status Assertion
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                onClick={() =>
                                  field.onChange([
                                    ...(field.value ?? []),
                                    {
                                      version: "v1",
                                      type: "header",
                                      compare: "eq",
                                      key: "",
                                      target: "",
                                    },
                                  ])
                                }
                              >
                                <PlusIcon className="size-4" />
                                Add Header Assertion
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                onClick={() =>
                                  field.onChange([
                                    ...(field.value ?? []),
                                    {
                                      version: "v1",
                                      type: "textBody",
                                      compare: "contains",
                                      target: "",
                                    },
                                  ])
                                }
                              >
                                <PlusIcon className="size-4" />
                                Add Body Assertion
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={() =>
                                field.onChange([
                                  ...(field.value ?? []),
                                  {
                                    version: "v1",
                                    type: "dnsRecord",
                                    compare: "eq",
                                    key: "A",
                                    target: "",
                                  },
                                ])
                              }
                            >
                              <PlusIcon className="size-4" />
                              Add DNS Record Assertion
                            </Button>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormCardContent>
              </>
            ) : null}

            <FormCardFooter>
              <FormCardFooterInfo>
                Picked up by the checker within ~1s via pg_notify.
              </FormCardFooterInfo>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : mode === "create" ? "Create monitor" : "Save"}
              </Button>
            </FormCardFooter>
          </FormCard>
        </form>
      </Form>
    </TooltipProvider>
  );
}

/**
 * Renders a single assertion row. Field shape varies by `type`; we read the
 * row out of the form state and re-write the whole row on each edit so RHF
 * tracks it properly inside a discriminated array.
 */
function renderAssertionRow(
  form: ReturnType<typeof useForm<MonitorFormValues>>,
  assertion: Assertion,
  idx: number,
  onRemove: () => void,
) {
  const update = (next: Assertion) => {
    const list = form.getValues("assertions") ?? [];
    const copy = [...list];
    copy[idx] = next;
    form.setValue("assertions", copy, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div key={idx} className="grid gap-2 sm:grid-cols-6">
      {/* Type column — for HTTP shows the disabled type label; DNS uses the record-key dropdown. */}
      {assertion.type === "dnsRecord" ? (
        <Select
          value={assertion.key}
          onChange={(e) =>
            update({
              ...assertion,
              key: e.target.value as Assertion extends { key: infer K } ? K : never,
            })
          }
        >
          {DNS_ASSERTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      ) : (
        <Select value={assertion.type} disabled>
          {HTTP_ASSERTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      )}

      {/* Compare operator — varies by assertion kind. */}
      <Select
        value={assertion.compare}
        onChange={(e) => {
          const next = e.target.value;
          update({ ...assertion, compare: next } as Assertion);
        }}
      >
        {(assertion.type === "status"
          ? Object.entries(numberCompareDictionary)
          : assertion.type === "dnsRecord"
            ? Object.entries(recordCompareDictionary)
            : Object.entries(stringCompareDictionary)
        ).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>

      {/* Header key input — only for header assertions. */}
      {assertion.type === "header" ? (
        <Input
          placeholder="Header key"
          value={assertion.key}
          onChange={(e) => update({ ...assertion, key: e.target.value })}
        />
      ) : null}

      {/* JSONPath — only for jsonBody assertions. */}
      {assertion.type === "jsonBody" ? (
        <Input
          placeholder="$.path.to.value"
          value={assertion.path}
          onChange={(e) => update({ ...assertion, path: e.target.value })}
        />
      ) : null}

      {/* Target input. Status uses a number input, others text. */}
      <Input
        placeholder="Target value"
        type={assertion.type === "status" ? "number" : "text"}
        value={String(assertion.target ?? "")}
        onChange={(e) => {
          const raw = e.target.value;
          if (assertion.type === "status") {
            const num = Number.parseInt(raw, 10);
            update({ ...assertion, target: Number.isFinite(num) ? num : 0 });
          } else {
            update({ ...assertion, target: raw } as Assertion);
          }
        }}
      />

      <Button
        size="icon"
        variant="ghost"
        type="button"
        onClick={onRemove}
        aria-label="Remove assertion"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
