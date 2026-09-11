import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const avatarVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center overflow-hidden border border-border bg-muted font-medium text-foreground uppercase",
  {
    variants: {
      size: {
        sm: "size-6 rounded-full text-[10px]",
        md: "size-8 rounded-full text-xs",
        lg: "size-12 rounded-full text-sm",
      },
      // Square and inverted marks a workspace, so a user never reads as one.
      shape: {
        circle: "",
        square: "rounded-md border-transparent bg-foreground text-background",
      },
    },
    defaultVariants: { size: "md", shape: "circle" },
  },
);

/** Two letters from a display name, falling back to the email's local part. */
export function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0]?.replace(/[._-]+/g, " ") || "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`;
  return source.slice(0, 2);
}

export function Avatar({
  name,
  email,
  image,
  size,
  shape,
  className,
}: VariantProps<typeof avatarVariants> & {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  className?: string;
}) {
  const label = initials(name, email);
  return (
    <span aria-hidden className={cn(avatarVariants({ size, shape }), className)}>
      {image ? (
        // biome-ignore lint/performance/noImgElement: shared package, no next/image
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        label
      )}
    </span>
  );
}
