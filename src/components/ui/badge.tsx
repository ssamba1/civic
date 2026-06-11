import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em]",
  {
    variants: {
      // Color-mix tints keep the fill quiet (status chip, not a button) while
      // borrowing the semantic tokens already defined in globals.css.
      variant: {
        default:
          "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]",
        success:
          "border-[color-mix(in_srgb,var(--fg-emerald-glow)_35%,transparent)] bg-[color-mix(in_srgb,var(--fg-emerald-glow)_12%,transparent)] text-[var(--fg-emerald-glow)]",
        warning:
          "border-[color-mix(in_srgb,var(--fg-amber-pulse)_35%,transparent)] bg-[color-mix(in_srgb,var(--fg-amber-pulse)_12%,transparent)] text-[var(--fg-amber-pulse)]",
        danger:
          "border-[color-mix(in_srgb,var(--fg-neon-coral)_35%,transparent)] bg-[color-mix(in_srgb,var(--fg-neon-coral)_12%,transparent)] text-[var(--fg-neon-coral)]",
        info:
          "border-[color-mix(in_srgb,var(--fg-electric-indigo)_35%,transparent)] bg-[color-mix(in_srgb,var(--fg-electric-indigo)_12%,transparent)] text-[var(--fg-electric-indigo)]",
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
