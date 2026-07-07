"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MemberRole } from "@/app/city/[slug]/members/actions";
import { Button } from "@/components/ui/button";
import { TEAM_LIST } from "@/lib/teams";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";

/* ==================================================================
   Shared chrome + controls for the invite / edit member dialogs.

   Mirrors team-setup-modal's overlay conventions: a portal to <body>,
   an escape/scroll-lock/focus-trap effect, and the grayscale surface
   register. Rendered only while open (the parent conditionally mounts
   it), so "mounted" here is purely the SSR/hydration portal gate.
   ================================================================== */

// Shared control skins — same hairline/overlay register and ring-accent focus
// pattern as the members table controls.
export const CONTROL_CLASS =
  "h-9 w-full rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 text-[13px] text-foreground placeholder:text-faint outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

const FIELD_LABEL_CLASS = "text-[12px] font-medium text-subtle";

// Role options in request-defaulting order (Dispatcher first — the common
// staff grant). Values are the canonical MemberRole union.
export const ROLE_OPTIONS: ReadonlyArray<{ value: MemberRole; label: string }> =
  [
    { value: "staff_dispatcher", label: "Dispatcher" },
    { value: "staff_supervisor", label: "Supervisor" },
    { value: "admin", label: "Admin" },
    { value: "resident", label: "Resident" },
  ];

// Team is portal scoping: mandatory for the two staff roles, optional for
// admins (all-team access) and residents (no portal).
export function roleRequiresTeam(role: MemberRole): boolean {
  return role === "staff_dispatcher" || role === "staff_supervisor";
}

// TEAM_LIST minus the synthetic "all" bucket — a member is scoped to one team
// or none, never the admin meta-team.
const TEAM_OPTIONS = TEAM_LIST.filter((t) => t.id !== "all");

// Server-action error codes → human sentences. Unknown codes fall back to a
// generic line so a new server-side error never surfaces as a raw token.
const ERROR_COPY: Record<string, string> = {
  email_already_member: "That email is already a member.",
  cannot_change_own_role: "You can't change your own role.",
  invalid_email: "Enter a valid email address.",
  invalid_input: "Something in the form looks off — double-check the fields.",
  missing_fields: "Fill in the required fields.",
  team_required: "Pick a team for this staff role.",
  not_authorized: "You don't have permission to do that.",
  forbidden: "You don't have permission to do that.",
  member_not_found: "That member no longer exists.",
  city_not_found: "Couldn't resolve this city.",
};

export function humanizeMemberError(code: string): string {
  return ERROR_COPY[code] ?? "Something went wrong. Please try again.";
}

export function RoleSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASS}>Role</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        // Options are exactly the MemberRole union, so the cast is total.
        onChange={(e) => onChange(e.target.value as MemberRole)}
        className={cn(CONTROL_CLASS, "disabled:opacity-60")}
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TeamSelect({
  id,
  value,
  onChange,
  required,
}: {
  id: string;
  value: string | null;
  onChange: (teamKey: string | null) => void;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASS}>
        Team
        {required && <span className="text-faint"> *</span>}
      </span>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value)
        }
        className={CONTROL_CLASS}
      >
        <option value="">No team</option>
        {TEAM_OPTIONS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.shortLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  required,
  placeholder,
  autoComplete,
  inputMode,
}: {
  id: string;
  label: string;
  type?: "text" | "email" | "tel";
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel";
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASS}>
        {label}
        {required && <span className="text-faint"> *</span>}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={CONTROL_CLASS}
      />
    </label>
  );
}

// Inline error banner. Hue is used only as a functional error signal (muted
// danger tint), keeping the surface otherwise monochrome.
export function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-3 py-2 text-[12px] text-foreground"
    >
      {message}
    </p>
  );
}

export function MemberModalShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  // Portal mount gate — SSR + first CSR render both return null so the
  // hydration trees match before createPortal runs on the second commit.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dialogRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  // Escape-to-close + scroll lock + focus trap. aria-modal alone doesn't keep
  // keyboard focus inside the dialog; trap Tab/Shift+Tab at the boundaries,
  // move focus in on open, and restore it to the opener on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const unlock = lockBodyScroll();
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 animate-backdrop-in">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/75"
      />
      {/* Centering wrapper is inert so clicks in the gutter fall through to the
          backdrop button behind it; the dialog re-enables pointer events. */}
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-2 sm:items-center sm:p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          tabIndex={-1}
          className={cn(
            "pointer-events-auto flex w-full max-h-[calc(100dvh-1rem)] flex-col overflow-hidden text-foreground sm:max-w-lg sm:max-h-[calc(100dvh-2rem)]",
            "rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-pop)]",
            "origin-center animate-[city-pop_120ms_ease-out]",
          )}
        >
          <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-overlay text-subtle">
                {icon}
              </span>
              <div className="min-w-0">
                <h2
                  id={labelId}
                  className="text-[16px] font-semibold leading-tight text-foreground"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className="truncate text-[12px] leading-tight text-faint">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="-m-1.5"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </Button>
          </header>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
