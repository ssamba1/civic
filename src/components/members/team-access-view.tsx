"use client";

import { Pencil, Users } from "lucide-react";
import { useMemo } from "react";
import { MemberNameLink, RoleBadge } from "@/components/members/member-badges";
import { teamIcon } from "@/components/teams/team-icon";
import type { MemberRow } from "@/lib/db/members";
import { TEAM_LIST, TEAMS, type TeamId } from "@/lib/teams";

/* ==================================================================
   By-team access view, answers "who can access the team portals".
   Residents are excluded entirely (they have no portal). Each section
   is one team that has members; admins and any un-scoped staff collect
   in a top "All-teams access" group, since an admin reaches every
   portal regardless of a team_key.
   ================================================================== */

const ALL_ACCESS = "__all_access__" as const;
type GroupKey = TeamId | typeof ALL_ACCESS;

// A member sits under a team only when their teamKey names a real team (not the
// synthetic "all"). Everyone else non-resident. Admins, "all", null, or an
// unrecognized key. Lands in the all-teams-access bucket.
function groupKeyFor(m: MemberRow): GroupKey {
  const key = m.teamKey;
  if (key && key !== "all" && key in TEAMS) return key as TeamId;
  return ALL_ACCESS;
}

interface TeamAccessViewProps {
  members: MemberRow[];
  slug: string;
  canManage: boolean;
  onEdit: (member: MemberRow) => void;
}

export function TeamAccessView({
  members,
  slug,
  canManage,
  onEdit,
}: TeamAccessViewProps) {
  const sections = useMemo(() => {
    const byGroup = new Map<GroupKey, MemberRow[]>();
    for (const m of members) {
      if (m.role === "resident") continue; // portals only
      const key = groupKeyFor(m);
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(m);
      else byGroup.set(key, [m]);
    }
    // All-teams access first, then real teams in canonical TEAM_LIST order.
    const ordered: GroupKey[] = [
      ALL_ACCESS,
      ...TEAM_LIST.filter((t) => t.id !== "all").map((t) => t.id),
    ];
    return ordered
      .map((key) => ({ key, members: byGroup.get(key) ?? [] }))
      .filter((s) => s.members.length > 0);
  }, [members]);

  if (sections.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium text-foreground">No portal access</p>
        <p className="mt-1.5 text-[13px] text-faint">
          No dispatchers, supervisors, or admins have been added yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map(({ key, members: rows }) => {
        const isAllAccess = key === ALL_ACCESS;
        const team = isAllAccess ? null : TEAMS[key];
        const Icon = team ? teamIcon(team.icon) : Users;
        const label = team ? team.shortLabel : "All-teams access";
        return (
          <section
            key={key}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]"
          >
            <header className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-overlay text-subtle">
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[13px] font-medium leading-tight text-foreground">
                  {label}
                </h3>
                {isAllAccess && (
                  <p className="text-[11px] leading-tight text-faint">
                    Admins can access every team portal
                  </p>
                )}
              </div>
              <span className="ml-auto tabular-nums text-[11px] text-faint">
                {rows.length}
              </span>
            </header>

            <ul>
              {rows.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-overlay"
                >
                  <div className="min-w-0 flex-1">
                    <MemberNameLink
                      slug={slug}
                      id={m.id}
                      name={m.displayName}
                    />
                    <div className="truncate text-[12px] text-faint">
                      {m.email ?? "-"}
                    </div>
                  </div>
                  <div className="hidden w-36 flex-shrink-0 truncate text-[13px] text-subtle tabular-nums sm:block">
                    {m.phone ?? "-"}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <RoleBadge role={m.role} />
                    {m.isShared && (
                      <span className="hidden items-center rounded-[var(--radius-md)] border border-hairline bg-overlay px-2 py-0.5 text-[11px] font-medium text-faint lg:inline-flex">
                        Shared login
                      </span>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        aria-label={`Edit ${m.displayName ?? "member"}`}
                        onClick={() => onEdit(m)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-faint outline-none transition-colors duration-150 hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
