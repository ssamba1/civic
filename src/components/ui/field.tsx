import type * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface FieldProps {
  label: string;
  /** Must match the control's id for label association (a11y). */
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error wrapper. Errors use role="alert" so screen
 *  readers announce them (web a11y guideline). */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-[var(--color-foreground)]"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="text-[var(--color-danger)]">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
