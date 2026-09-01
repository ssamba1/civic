import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Styled native <select>. Keeps full keyboard + mobile-picker behavior. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-10 min-h-11 w-full appearance-none rounded-[var(--radius-md)] border bg-[var(--color-background)] px-3 pr-9 text-base text-[var(--color-foreground)] outline-none transition-[border-color,box-shadow] md:min-h-10 md:text-sm",
          "border-[var(--color-border)] focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_30%,transparent)]",
          invalid &&
            "border-[var(--color-danger)] focus-visible:border-[var(--color-danger)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]"
      />
    </div>
  ),
);
Select.displayName = "Select";
