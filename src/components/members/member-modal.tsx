"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MemberRole } from "@/app/city/[slug]/members/actions";
import { Button } from "@/components/ui/button";
import { MenuSelect } from "@/components/ui/menu-select";
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
// generic line so a new server-side error never surfaces as a raw token. The
// map covers the union across every humanizeMemberError caller (invite/edit
// member, crews panel, crew-types panel).
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
  // Crew management + member crew-assignment codes.
  crew_name_taken: "This division already has a crew with that name.",
  crew_not_found: "That crew no longer exists.",
  invalid_crew: "One of the selected crews no longer exists.",
  crew_team_mismatch: "Crews must belong to the member's own division.",
  crew_sync_failed:
    "The member was saved but crew assignments failed — retry from Edit member.",
  lead_not_on_crew: "The crew lead must be on the crew.",
  member_not_in_city: "Someone selected is not a member of this city.",
  crew_create_failed: "Couldn't create the crew. Please try again.",
  crew_update_failed: "Couldn't update the crew. Please try again.",
  crew_delete_failed: "Couldn't delete the crew. Please try again.",
  crew_members_failed: "Couldn't save the crew roster. Please try again.",
  // Crew-type catalog codes (saveCrewType / deleteCrewType).
  type_description_too_short:
    "Describe what this crew does in at least 10 words.",
  crew_type_key_taken: "This city already has a crew type with that name.",
  crew_type_save_failed: "Couldn't save the crew type. Please try again.",
  crew_type_not_found: "That crew type no longer exists.",
  crew_type_delete_failed: "Couldn't delete the crew type. Please try again.",
  // Invite-flow codes.
  invite_failed: "Couldn't send the invite. Please try again.",
  member_row_failed: "The invite was sent but the profile failed — try again.",
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        Role
      </label>
      <MenuSelect
        id={id}
        value={value}
        // Role options are exactly the MemberRole union, so the cast is total.
        onChange={(v) => onChange(v as MemberRole)}
        options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        disabled={disabled}
      />
    </div>
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        Team{required && <span className="text-faint"> *</span>}
      </label>
      <MenuSelect
        id={id}
        value={value}
        onChange={onChange}
        placeholder="No team"
        options={TEAM_OPTIONS.map((t) => ({
          value: t.id,
          label: t.shortLabel,
          swatch: t.color,
        }))}
      />
    </div>
  );
}

/** Crew as the member dialogs see it — id/name/division only (no roster). */
export interface CrewOption {
  id: string;
  teamKey: string;
  name: string;
  crewType: string | null;
  /** Display label from the city's crew_types catalog; falls back to the raw
   *  key when the catalog has no row (orphan key or pre-031 DB). */
  crewTypeLabel?: string | null;
  /** Catalog description — surfaced as a tooltip so the inviter knows what
   *  kind of work they're assigning someone to. */
  crewTypeDescription?: string | null;
}

/**
 * Crew membership checklist, scoped to the selected division. Renders nothing
 * without a team — a crew assignment only exists inside one — and an inline
 * empty line when the division has no crews yet (created from the Crews panel
 * on the members page).
 */
export function CrewChecklist({
  crews,
  teamKey,
  selected,
  onChange,
}: {
  crews: CrewOption[];
  teamKey: string | null;
  selected: string[];
  onChange: (crewIds: string[]) => void;
}) {
  if (teamKey === null) return null;
  const options = crews.filter((c) => c.teamKey === teamKey);

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={FIELD_LABEL_CLASS}>Crews</legend>
      {options.length === 0 ? (
        <p className="text-[12px] text-faint">
          No crews in this division yet — create one from the Crews panel.
        </p>
      ) : (
        <div className="flex flex-col gap-0.5 rounded-[var(--radius-md)] border border-hairline bg-overlay p-1.5">
          {options.map((c) => {
            const checked = selected.includes(c.id);
            return (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-[calc(var(--radius-md)-2px)] px-2 py-1.5 text-[13px] text-foreground transition-colors duration-150 hover:bg-overlay-strong"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== c.id)
                        : [...selected, c.id],
                    )
                  }
                  className="h-3.5 w-3.5 accent-[var(--color-accent,currentColor)]"
                />
                <span className="min-w-0 truncate">{c.name}</span>
                {c.crewType && (
                  <span
                    className="ml-auto flex-shrink-0 rounded-md border border-hairline bg-overlay-strong px-1.5 py-0.5 text-[11px] text-faint"
                    title={c.crewTypeDescription ?? undefined}
                  >
                    {c.crewTypeLabel ?? c.crewType.replace(/_/g, " ")}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
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
