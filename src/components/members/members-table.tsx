"use client";

import { LayoutGrid, Pencil, Search, Users } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { EditMemberModal } from "@/components/members/edit-member-modal";
import {
  MemberNameLink,
  RoleBadge,
  teamLabel,
} from "@/components/members/member-badges";
import type { CrewOption } from "@/components/members/member-modal";
import { TeamAccessView } from "@/components/members/team-access-view";
import type { ContractorListRow } from "@/lib/db/contractors";
import type { MemberRow } from "@/lib/db/members";
import { cn } from "@/lib/utils/cn";

interface MembersTableProps {
  members: MemberRow[];
  slug: string;
  canManage: boolean;
  crews: CrewOption[];
  /** City vendors — rendered as their own roster under the Contractors chip. */
  contractors?: ContractorListRow[];
}

type RoleFilter = "all" | MemberRow["role"] | "contractors";
type ViewMode = "people" | "team";

const FILTERS: ReadonlyArray<{ key: RoleFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admins" },
  { key: "staff_supervisor", label: "Supervisors" },
  { key: "staff_dispatcher", label: "Dispatchers" },
  { key: "resident", label: "Residents" },
  { key: "contractors", label: "Contractors" },
];

function formatDateOnly(isoDate: string | null): string {
  if (!isoDate) return "—";
  const t = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return isoDate;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const VIEWS: ReadonlyArray<{
  key: ViewMode;
  label: string;
  Icon: typeof Users;
}> = [
  { key: "people", label: "People", Icon: Users },
  { key: "team", label: "By team", Icon: LayoutGrid },
];

// Coarse relative time — "just now" / "3d ago" / "2mo ago". Small enough to keep
// local; no date library dependency.
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function MembersTable({
  members,
  slug,
  canManage,
  crews,
  contractors = [],
}: MembersTableProps) {
  const [view, setView] = useState<ViewMode>("people");
  const [role, setRole] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const searchId = useId();

  // Crew names render under the Team cell — resolve ids once per crews prop.
  const crewNameById = useMemo(
    () => new Map(crews.map((c) => [c.id, c.name])),
    [crews],
  );

  const counts = useMemo(() => {
    const map: Record<RoleFilter, number> = {
      all: 0,
      admin: 0,
      staff_supervisor: 0,
      staff_dispatcher: 0,
      resident: 0,
      contractors: contractors.length,
    };
    for (const m of members) {
      map[m.role] += 1;
      // "All" is the operators view — residents are counted only under their
      // own chip, never rolled into All.
      if (m.role !== "resident") map.all += 1;
    }
    return map;
  }, [members, contractors]);

  const filtered = useMemo(() => {
    if (role === "contractors") return [];
    const needle = query.trim().toLowerCase();
    return members.filter((m) => {
      if (role === "all") {
        if (m.role === "resident") return false;
      } else if (m.role !== role) {
        return false;
      }
      if (!needle) return true;
      return (
        (m.displayName ?? "").toLowerCase().includes(needle) ||
        (m.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [members, role, query]);

  // Vendor roster under the Contractors chip — same search box applies.
  const filteredContractors = useMemo(() => {
    if (role !== "contractors") return [];
    const needle = query.trim().toLowerCase();
    return contractors.filter(
      (c) =>
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle),
    );
  }, [contractors, role, query]);

  // Member, Phone, Role, Team, Reports, Last active, Last sign-in (+ Actions).
  const colCount = canManage ? 8 : 7;

  return (
    <div className="flex flex-col gap-4">
      {/* Top controls — view toggle + (People-only) search. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="toolbar"
          aria-label="Switch member view"
          aria-orientation="horizontal"
          className="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-hairline bg-overlay p-0.5"
        >
          {VIEWS.map(({ key, label, Icon }) => {
            const active = view === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-2.5 h-7 text-[13px] font-medium",
                  "transition-colors duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  active
                    ? "bg-surface text-foreground shadow-[var(--shadow-card)]"
                    : "text-subtle hover:text-foreground",
                )}
              >
                <Icon
                  className="h-3.5 w-3.5"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {label}
              </button>
            );
          })}
        </div>

        {view === "people" && (
          <div className="relative sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
              strokeWidth={2}
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search members by name or email"
              className={[
                "h-8 w-full rounded-[var(--radius-md)] border border-hairline bg-surface pl-8 pr-2.5 text-[13px] text-foreground",
                "placeholder:text-faint outline-none transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              ].join(" ")}
            />
          </div>
        )}
      </div>

      {/* Role chips — People view only; By-team groups by team and drops
          residents, so a role filter there would be redundant. */}
      {view === "people" && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="toolbar"
          aria-label="Filter members by role"
          aria-orientation="horizontal"
        >
          {FILTERS.map(({ key, label }) => {
            const active = role === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setRole(key)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 h-8 text-[13px] font-medium",
                  "transition-colors duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  active
                    ? "border-transparent bg-accent-soft text-accent-text"
                    : "border-hairline bg-overlay text-subtle hover:bg-overlay-strong hover:text-foreground",
                ].join(" ")}
              >
                {label}
                <span
                  className={[
                    "tabular-nums text-[11px]",
                    active ? "text-accent-text/70" : "text-faint",
                  ].join(" ")}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {view === "team" ? (
        <TeamAccessView
          members={members}
          slug={slug}
          canManage={canManage}
          onEdit={setEditing}
        />
      ) : role === "contractors" ? (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-faint">
                <th scope="col" className="px-4 py-3 font-medium">
                  Contractor
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Jobs
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Live warranties
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Next expiry
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Documents
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Attributed reports
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredContractors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-foreground">
                      {contractors.length === 0
                        ? "No contractors on file"
                        : "No contractors match"}
                    </p>
                    <p className="mt-1 text-[13px] text-faint">
                      {contractors.length === 0
                        ? "Vendors appear here once a paving schedule or contract import creates them."
                        : "Clear the search to see every vendor."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredContractors.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-hairline last:border-b-0 transition-colors duration-150 hover:bg-overlay"
                  >
                    <td className="px-4 py-3 align-middle">
                      <Link
                        href={`/city/${slug}/contractors/${c.id}`}
                        className="rounded-sm font-medium text-foreground underline-offset-2 outline-none transition-colors hover:text-accent-text hover:underline focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                      >
                        {c.name}
                      </Link>
                      <div className="text-[12px] text-faint">
                        {c.email ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-[var(--radius-md)] border px-2 py-0.5 text-[11px] font-medium",
                          c.active
                            ? "border-hairline-strong bg-overlay-strong text-foreground"
                            : "border-hairline bg-overlay text-faint",
                        )}
                      >
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                      {c.jobCount}
                    </td>
                    <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                      {c.liveWarranties}
                    </td>
                    <td className="px-4 py-3 align-middle tabular-nums text-subtle">
                      {formatDateOnly(c.nextExpiry)}
                    </td>
                    <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                      {c.documentCount}
                    </td>
                    <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                      {c.liableReports}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-faint">
                <th scope="col" className="px-4 py-3 font-medium">
                  Member
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Phone
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Team
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Reports
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Last active
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Last sign-in
                </th>
                {canManage && (
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-foreground">
                      No members match
                    </p>
                    <p className="mt-1 text-[13px] text-faint">
                      Try a different role filter or clear the search.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const pendingInvite =
                    m.lastSignInAt === null && m.role !== "resident";
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-hairline last:border-b-0 transition-colors duration-150 hover:bg-overlay"
                    >
                      <td className="px-4 py-3 align-middle">
                        <MemberNameLink
                          slug={slug}
                          id={m.id}
                          name={m.displayName}
                        />
                        <div className="text-[12px] text-faint">
                          {m.email ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle tabular-nums text-subtle">
                        {m.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <RoleBadge role={m.role} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="text-subtle">
                          {teamLabel(m.teamKey)}
                        </div>
                        {m.crewIds.length > 0 && (
                          <div className="text-[11px] text-faint">
                            {m.crewIds
                              .map((id) => crewNameById.get(id))
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                        )}
                        {m.isShared && (
                          <div className="text-[11px] text-faint">
                            Shared login
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                        {m.reportCount}
                      </td>
                      <td className="px-4 py-3 align-middle text-subtle">
                        {relativeTime(m.lastActiveAt)}
                      </td>
                      <td className="px-4 py-3 align-middle text-subtle">
                        {pendingInvite ? (
                          <span className="inline-flex items-center rounded-[var(--radius-md)] border border-hairline bg-overlay px-2 py-0.5 text-[11px] font-medium text-faint">
                            Pending invite
                          </span>
                        ) : (
                          relativeTime(m.lastSignInAt)
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 align-middle text-right">
                          <button
                            type="button"
                            aria-label={`Edit ${m.displayName ?? "member"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(m);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-faint outline-none transition-colors duration-150 hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <EditMemberModal
          member={editing}
          slug={slug}
          crews={crews}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
