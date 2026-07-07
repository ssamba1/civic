import Link from "next/link";
import type { MemberRow } from "@/lib/db/members";
import { TEAMS, type TeamId } from "@/lib/teams";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Shared member presentation — role badge + team label. Lives apart
   from members-table so both the People table and the By-team view
   render an identical badge without a members-table ↔ team-access-view
   import cycle.
   ================================================================== */

// Grayscale role badges — differentiation is carried by fill weight and outline,
// never hue, so the enterprise register stays monochrome.
export const ROLE_META: Record<
  MemberRow["role"],
  { label: string; badge: string }
> = {
  admin: {
    label: "Admin",
    badge: "border-transparent bg-accent text-accent-contrast",
  },
  staff_supervisor: {
    label: "Supervisor",
    badge: "border-hairline-strong bg-overlay-strong text-foreground",
  },
  staff_dispatcher: {
    label: "Dispatcher",
    badge: "border-hairline bg-overlay text-subtle",
  },
  resident: {
    label: "Resident",
    badge: "border-transparent bg-transparent text-faint",
  },
};

export function RoleBadge({ role }: { role: MemberRow["role"] }) {
  const meta = ROLE_META[role];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-md)] border px-2 py-0.5 text-[11px] font-medium",
        meta.badge,
      )}
    >
      {meta.label}
    </span>
  );
}

export function teamLabel(key: string | null): string {
  if (!key) return "—";
  const meta = TEAMS[key as TeamId];
  return meta ? meta.shortLabel : key;
}

// Member name → per-member analytics page. Shared so the People table and the
// By-team view link identically. No PII in the path — the id is a uuid.
export function MemberNameLink({
  slug,
  id,
  name,
}: {
  slug: string;
  id: string;
  name: string | null;
}) {
  return (
    <Link
      href={`/city/${slug}/members/${id}`}
      className="rounded-sm font-medium text-foreground underline-offset-2 outline-none transition-colors hover:text-accent-text hover:underline focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
    >
      {name ?? "Unnamed"}
    </Link>
  );
}
