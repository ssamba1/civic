"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface Step {
  id: string;
  label: string;
}

export type StepState = "complete" | "current" | "upcoming";

/** Pure state derivation (unit-tested). */
export function stepState(index: number, current: number): StepState {
  if (index < current) return "complete";
  if (index === current) return "current";
  return "upcoming";
}

interface StepperProps {
  steps: Step[];
  current: number;
  /** When set, completed steps become keyboard-reachable buttons. */
  onStepClick?: (index: number) => void;
  className?: string;
}

/** Horizontal step indicator. Semantic <nav><ol>; aria-current on the active
 *  step; completed steps optionally clickable to revisit. */
export function Stepper({
  steps,
  current,
  onStepClick,
  className,
}: StepperProps) {
  return (
    <nav
      aria-label="Onboarding steps"
      className={cn("w-full overflow-x-auto", className)}
    >
      <ol className="flex min-w-max items-center gap-2">
        {steps.map((step, i) => {
          const state = stepState(i, current);
          const clickable = !!onStepClick && state === "complete";
          const content = (
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                  state === "complete" &&
                    "border-[var(--color-primary)] bg-[var(--color-primary)] text-white",
                  state === "current" &&
                    "border-[var(--color-primary)] text-[var(--color-primary)] ring-2 ring-[color-mix(in_srgb,var(--color-primary)_25%,transparent)]",
                  state === "upcoming" &&
                    "border-[var(--color-border)] text-[var(--color-muted)]",
                )}
              >
                {state === "complete" ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  state === "upcoming"
                    ? "text-[var(--color-muted)]"
                    : "text-[var(--color-foreground)]",
                )}
              >
                {step.label}
              </span>
            </span>
          );
          return (
            <li
              key={step.id}
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-center gap-2"
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(i)}
                  className="rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
                >
                  {content}
                </button>
              ) : (
                content
              )}
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="h-px w-6 bg-[var(--color-border)]"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
