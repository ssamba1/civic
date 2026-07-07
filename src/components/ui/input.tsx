import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/** Text/number/email input matching the Apple-dark token set. 16px text on
 *  mobile (no iOS zoom), 44px min tap height. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 min-h-11 w-full rounded-[var(--radius-md)] border bg-[var(--color-background)] px-3 text-base text-[var(--color-foreground)] outline-none transition-[border-color,box-shadow] md:min-h-10 md:text-sm",
        "placeholder:text-[var(--color-muted)]",
        "border-[var(--color-border)] focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_30%,transparent)]",
        invalid &&
          "border-[var(--color-danger)] focus-visible:border-[var(--color-danger)] focus-visible:ring-[color-mix(in_srgb,var(--color-danger)_30%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
