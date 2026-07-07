"use client";

import { cn } from "@/lib/utils/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  /** Accessible name when not paired with a visible <label htmlFor>. */
  label?: string;
  className?: string;
}

/** Accessible toggle (role="switch"). Color is not the sole state signal —
 *  aria-checked + thumb position both convey it. */
export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  label,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
