import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-hairline bg-overlay px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em]",
  {
    variants: {
      // Outline chip: quiet overlay fill + hairline border, in both themes. For
      // status variants a 6px dot carries the hue while the label stays in the
      // AA-tuned --status-*-fg token. Replaces the old solid/tinted pill fills.
      variant: {
        default: "text-subtle",
        success: "text-[var(--status-success-fg)]",
        warning: "text-[var(--status-warning-fg)]",
        danger: "text-[var(--status-danger-fg)]",
        info: "text-[var(--status-info-fg)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// Dot fill per status variant — the single spot of hue on an otherwise
// grayscale chip. success/warning/danger use the muted status FILL tokens;
// info uses the same slate-blue as the status.ts info tint (a state signal,
// not Apple blue).
const DOT_FILL: Record<string, string> = {
  success: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  danger: "bg-[var(--color-danger)]",
  info: "bg-[#5b6b8c]",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  const dot = variant && variant !== "default" ? DOT_FILL[variant] : null;
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? (
        <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      ) : null}
      {children}
    </span>
  );
}

export { badgeVariants };
