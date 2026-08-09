import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * FormCard — a settings-style card for a single form section. Pattern from
 * OpenStatus: each conceptual config slice gets its own card with its own
 * submit button so users can save piecemeal.
 *
 * Compose:
 *   <FormCard>
 *     <FormCardHeader>
 *       <FormCardTitle>General</FormCardTitle>
 *       <FormCardDescription>Basic monitor info.</FormCardDescription>
 *     </FormCardHeader>
 *     <FormCardContent>{fields}</FormCardContent>
 *     <FormCardFooter>
 *       <FormCardFooterInfo>Auto-saved on submit.</FormCardFooterInfo>
 *       <Button type="submit">Save</Button>
 *     </FormCardFooter>
 *   </FormCard>
 */
type FormCardProps =
  | (ComponentProps<"section"> & { asForm?: false })
  | (ComponentProps<"form"> & { asForm: true });

export function FormCard(props: FormCardProps) {
  // Some sections are forms themselves (with their own submit handler); others
  // are pure presentational. asForm switches between <section> and <form> so
  // server actions can be passed via `action={...}` when needed.
  const className = cn(
    "flex flex-col rounded-lg border border-border bg-card text-card-foreground",
    props.className,
  );
  if (props.asForm) {
    const { asForm: _asForm, className: _cn, ...rest } = props;
    return <form className={className} {...rest} />;
  }
  const { asForm: _asForm, className: _cn, ...rest } = props;
  return <section className={className} {...rest} />;
}

export function FormCardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
}

export function FormCardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3 className={cn("font-semibold text-base leading-tight", className)} {...props} />
  );
}

export function FormCardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export function FormCardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-4 px-5 pb-5", className)} {...props} />;
}

export function FormCardSeparator({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("h-px w-full bg-border", className)} {...props} />;
}

export function FormCardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function FormCardFooterInfo({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cn("font-mono text-[11px] text-muted-foreground", className)}>{children}</p>
  );
}
