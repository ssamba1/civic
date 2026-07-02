import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em]",
  {
    variants: {
      // Soft-tinted chip pattern: no border, just a quiet fill + theme-aware
      // text color so each variant clears AA on both light and dark surfaces.
      variant: {
        default: "bg-overlay text-subtle",
        success: "bg-accent-soft text-accent-text",
        warning:
          "bg-[color-mix(in_srgb,var(--fg-amber-pulse)_12%,transparent)] text-[var(--status-warning-fg)]",
        danger:
          "bg-[color-mix(in_srgb,var(--fg-neon-coral)_12%,transparent)] text-[var(--status-danger-fg)]",
        info: "bg-[color-mix(in_srgb,var(--fg-electric-indigo)_12%,transparent)] text-[var(--status-info-fg)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
