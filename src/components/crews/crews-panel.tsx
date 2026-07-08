"use client";

import { HardHat, Pencil, Plus, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { inviteMember } from "@/app/city/[slug]/members/actions";
import {
  createCrew,
  deleteCrew,
  saveCrewType,
  setCrewMembers,
  updateCrew,
} from "@/app/city/[slug]/members/crew-actions";
import {
  CONTROL_CLASS,
  FormError,
  humanizeMemberError,
  MemberModalShell,
} from "@/components/members/member-modal";
import { Button } from "@/components/ui/button";
import { MenuSelect } from "@/components/ui/menu-select";
import {
  type CrewTypeDef,
  DEFAULT_CREW_TYPES,
  descriptionWordCount,
  MIN_TYPE_DESCRIPTION_WORDS,
  normalizeCrewTypeKey,
} from "@/lib/crew-types";
import type { CrewRow } from "@/lib/db/crews";
import { isValidTeamId, TEAM_LIST, TEAMS } from "@/lib/teams";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Crews panel — the org level below a division. Lives on the members
   page (same admin gate as invite/edit member); team dashboards read
   the same crews but management happens here, next to the people it
   assigns.

   Crews group by division in TEAM_LIST order. The dialog reuses the
   member-modal chrome so create/edit crew feels identical to
   invite/edit member.
   ================================================================== */

/** Roster candidate — a city member as the crew dialog sees them. */
export interface CrewCandidate {
  id: string;
  displayName: string | null;
  teamKey: string | null;
  role: string;
}

const FIELD_LABEL_CLASS = "text-[12px] font-medium text-subtle";

const TEAM_OPTIONS = TEAM_LIST.filter((t) => t.id !== "all");

/** Catalog label for a type key; orphan keys (deleted catalog row) fall back
 *  to a humanized raw key so the crew still renders honestly. */
function typeLabel(key: string, crewTypes: CrewTypeDef[]): string {
  return crewTypes.find((t) => t.key === key)?.label ?? key.replace(/_/g, " ");
}

function teamShortLabel(teamKey: string): string {
  return isValidTeamId(teamKey) ? TEAMS[teamKey].shortLabel : teamKey;
}
function teamColor(teamKey: string): string {
  return isValidTeamId(teamKey) ? TEAMS[teamKey].color : "#9a9aa0";
}

type DialogState = { mode: "create" } | { mode: "edit"; crew: CrewRow } | null;

export function CrewsPanel({
  slug,
  crews,
  members,
  canManage,
  crewTypes = DEFAULT_CREW_TYPES,
}: {
  slug: string;
  crews: CrewRow[];
  members: CrewCandidate[];
  canManage: boolean;
  /** The city's crew-type catalog (031) — feeds the type select and the type
   *  badges. Defaults to the built-in list for pre-031 DBs. */
  crewTypes?: CrewTypeDef[];
}) {
  const [dialog, setDialog] = useState<DialogState>(null);

  // Division sections in canonical team order; a division appears only when
  // it has crews.
  const groups = useMemo(() => {
    const byTeam = new Map<string, CrewRow[]>();
    for (const c of crews) {
      const list = byTeam.get(c.teamKey) ?? [];
      list.push(c);
      byTeam.set(c.teamKey, list);
    }
    const ordered: { teamKey: string; crews: CrewRow[] }[] = [];
    for (const t of TEAM_OPTIONS) {
      const list = byTeam.get(t.id);
      if (list) {
        ordered.push({ teamKey: t.id, crews: list });
        byTeam.delete(t.id);
      }
    }
    // Anything with an unknown team key still renders (data beats layout).
    for (const [teamKey, list] of byTeam)
      ordered.push({ teamKey, crews: list });
    return ordered;
  }, [crews]);

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            Crews
          </h2>
          <span className="text-[13px] tabular-nums text-faint">
            {crews.length}
          </span>
        </div>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New crew
          </Button>
        )}
      </div>

      {crews.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-12 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm font-medium text-foreground">No crews yet</p>
          <p className="mt-1.5 text-[13px] text-faint">
            Crews are the units inside a division that work orders get assigned
            to — “North Paving Crew”, “Sign Shop”.
            {canManage
              ? " Create the first one to start assigning people and work."
              : " An admin can create them from this page."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.teamKey} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: teamColor(group.teamKey) }}
                  aria-hidden
                />
                <h3 className="text-[13px] font-medium text-subtle">
                  {teamShortLabel(group.teamKey)}
                </h3>
                <span className="text-[12px] tabular-nums text-faint">
                  {group.crews.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.crews.map((crew) => (
                  <div
                    key={crew.id}
                    className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 shadow-[var(--shadow-card)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <HardHat
                          className="h-4 w-4 flex-shrink-0 text-subtle"
                          strokeWidth={1.75}
                        />
                        <span className="truncate text-[14px] font-medium text-foreground">
                          {crew.name}
                        </span>
                        {!crew.active && (
                          <span className="flex-shrink-0 rounded-md border border-hairline bg-overlay px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-faint">
                            Inactive
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          aria-label={`Edit ${crew.name}`}
                          onClick={() => setDialog({ mode: "edit", crew })}
                          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-faint outline-none transition-colors duration-150 hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      )}
                    </div>
                    {crew.crewType && (
                      <span
                        className="w-fit rounded-md border border-hairline bg-overlay px-1.5 py-0.5 text-[11px] font-medium text-subtle"
                        title={
                          crewTypes.find((t) => t.key === crew.crewType)
                            ?.description
                        }
                      >
                        {typeLabel(crew.crewType, crewTypes)}
                      </span>
                    )}
                    <div className="text-[12px] leading-relaxed text-faint">
                      {crew.members.length === 0
                        ? "No members yet — work can still route here"
                        : crew.members.map((m, i) => (
                            <span key={m.userId}>
                              {i > 0 && ", "}
                              <span
                                className={
                                  m.isLead
                                    ? "font-medium text-subtle"
                                    : undefined
                                }
                              >
                                {m.displayName ?? "Unnamed"}
                                {m.isLead && (
                                  <Star
                                    className="ml-0.5 inline h-3 w-3 -translate-y-px"
                                    strokeWidth={2}
                                    aria-label="Crew lead"
                                  />
                                )}
                              </span>
                            </span>
                          ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && dialog && (
        <CrewDialog
          key={dialog.mode === "edit" ? dialog.crew.id : "create"}
          slug={slug}
          state={dialog}
          members={members}
          crewTypes={crewTypes}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function CrewDialog({
  slug,
  state,
  members,
  crewTypes,
  onClose,
}: {
  slug: string;
  state: NonNullable<DialogState>;
  members: CrewCandidate[];
  crewTypes: CrewTypeDef[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editing = state.mode === "edit" ? state.crew : null;

  const [teamKey, setTeamKey] = useState<string>(
    editing?.teamKey ?? TEAM_OPTIONS[0].id,
  );
  const [name, setName] = useState(editing?.name ?? "");
  const [crewType, setCrewType] = useState<string | null>(
    editing?.crewType ?? null,
  );
  const [active, setActive] = useState(editing?.active ?? true);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [roster, setRoster] = useState<string[]>(
    editing ? editing.members.map((m) => m.userId) : [],
  );
  const [leadId, setLeadId] = useState<string | null>(
    editing?.members.find((m) => m.isLead)?.userId ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Inline "New type…" sub-form: an admin can mint a custom crew type without
  // leaving the dialog. Created types persist server-side (saveCrewType) and
  // join the dropdown for this session (localTypes) so they're immediately
  // selectable before the page refetches.
  const [localTypes, setLocalTypes] = useState<CrewTypeDef[]>([]);
  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDesc, setNewTypeDesc] = useState("");
  const [typeError, setTypeError] = useState<string | null>(null);
  const [typePending, startTypeTransition] = useTransition();

  // Inline "Invite by email" sub-form: an admin can invite someone with no
  // account straight onto the crew's division. The invite fires immediately
  // (real email + pending member row); crew-roster membership only persists on
  // crew submit (setCrewMembers).
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitePending, startInviteTransition] = useTransition();
  // People invited from this dialog — appended to the candidate list so they
  // can sit on the roster before the page refetches.
  const [invited, setInvited] = useState<CrewCandidate[]>([]);

  const teamId = useId();
  const nameId = useId();
  const typeId = useId();
  const activeId = useId();

  // A crew's roster comes from its own division — the fetched division members
  // plus anyone just invited from this dialog (same teamKey, deduped by id).
  const candidates = useMemo(() => {
    const base = members.filter((m) => m.teamKey === teamKey);
    const known = new Set(base.map((m) => m.id));
    return [
      ...base,
      ...invited.filter((m) => m.teamKey === teamKey && !known.has(m.id)),
    ];
  }, [members, invited, teamKey]);

  // Dropdown options: the city's catalog (prop) plus any type created in this
  // session (localTypes), de-duped by key; then the current value if it's now
  // unknown — its catalog row was deleted after the crew was typed — so editing
  // a crew never silently drops its own type.
  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string; hint?: string }[] = [];
    for (const t of [...crewTypes, ...localTypes]) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      opts.push({ value: t.key, label: t.label, hint: t.description });
    }
    if (crewType && !seen.has(crewType))
      opts.push({
        value: crewType,
        label: typeLabel(crewType, crewTypes),
        hint: "removed type",
      });
    return opts;
  }, [crewTypes, localTypes, crewType]);

  // Gate for adding a custom type: a name that normalizes to a valid key and a
  // description that meets the AI-routing word minimum (the same checks the
  // server's create path enforces).
  const canAddType =
    normalizeCrewTypeKey(newTypeName) !== null &&
    descriptionWordCount(newTypeDesc) >= MIN_TYPE_DESCRIPTION_WORDS;

  // Both fields required. Also gates the guard in handleInvite so a bare Enter
  // in either input can't slip past and submit the outer crew form.
  const canInvite =
    inviteEmail.trim().length > 0 && inviteName.trim().length > 0;

  function handleAddType() {
    if (!canAddType || typePending) return;
    const key = normalizeCrewTypeKey(newTypeName);
    if (!key) return;
    const label = newTypeName.trim();
    const description = newTypeDesc.trim();
    setTypeError(null);
    startTypeTransition(async () => {
      const res = await saveCrewType({
        slug,
        id: null,
        key,
        label,
        description,
        active: true,
      });
      if (!res.ok) {
        setTypeError(humanizeMemberError(res.error));
        return;
      }
      // Append the freshly-created type so it's immediately selectable, then
      // select it and reset the sub-form.
      setLocalTypes((prev) => [...prev, { key, label, description }]);
      setCrewType(key);
      setTypeFormOpen(false);
      setNewTypeName("");
      setNewTypeDesc("");
    });
  }

  function handleInvite() {
    // Guard: both fields present and no invite in flight. This is what stops a
    // bare Enter in the email/name inputs from bubbling to the crew form's
    // submit (the same fix the New-type sub-form needed).
    if (!canInvite || invitePending) return;
    setInviteError(null);
    const email = inviteEmail.trim();
    const displayName = inviteName.trim();
    startInviteTransition(async () => {
      const res = await inviteMember({
        slug,
        email,
        displayName,
        role: "staff_dispatcher", // crew members get console access for their division
        teamKey, // the crew's division — always a real team in this dialog
        phone: null,
        crewIds: [], // roster membership lands on crew submit via setCrewMembers
      });
      if (!res.ok) {
        setInviteError(humanizeMemberError(res.error));
        return;
      }
      // Surface them immediately: add to candidates and pre-check onto the roster.
      setInvited((prev) => [
        ...prev,
        { id: res.userId, displayName, teamKey, role: "staff_dispatcher" },
      ]);
      setRoster((prev) => [...prev, res.userId]);
      setInviteEmail("");
      setInviteName("");
      setInviteOpen(false);
    });
  }

  function handleTeamChange(next: string) {
    setTeamKey(next);
    setRoster([]);
    setLeadId(null);
  }

  function toggleMember(id: string) {
    setRoster((prev) => {
      if (prev.includes(id)) {
        if (leadId === id) setLeadId(null);
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length === 0) {
      setError("Give the crew a name.");
      return;
    }
    startTransition(async () => {
      let crewId = editing?.id ?? null;
      if (editing) {
        const res = await updateCrew({
          slug,
          crewId: editing.id,
          name: name.trim(),
          crewType,
          active,
          description: description.trim(),
        });
        if (!res.ok) {
          setError(humanizeMemberError(res.error));
          return;
        }
      } else {
        const res = await createCrew({
          slug,
          teamKey,
          name: name.trim(),
          crewType,
          description: description.trim(),
        });
        if (!res.ok) {
          setError(humanizeMemberError(res.error));
          return;
        }
        crewId = res.crewId;
      }
      if (crewId) {
        const res = await setCrewMembers({
          slug,
          crewId,
          memberIds: roster,
          leadId,
        });
        if (!res.ok) {
          setError(humanizeMemberError(res.error));
          return;
        }
      }
      router.refresh();
      onClose();
    });
  }

  function handleDelete() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteCrew({ slug, crewId: editing.id });
      if (!res.ok) {
        setError(humanizeMemberError(res.error));
        setConfirmDelete(false);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <MemberModalShell
      title={editing ? editing.name : "New crew"}
      subtitle={
        editing
          ? `${teamShortLabel(editing.teamKey)} crew`
          : "A unit inside a division that work gets assigned to"
      }
      icon={<HardHat className="h-4 w-4" strokeWidth={1.75} />}
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar p-5">
          {error && <FormError message={error} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor={nameId} className="flex flex-col gap-1.5">
              <span className={FIELD_LABEL_CLASS}>
                Name<span className="text-faint"> *</span>
              </span>
              <input
                id={nameId}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="North Paving Crew"
                autoComplete="off"
                className={CONTROL_CLASS}
              />
            </label>
            {/* Division is fixed after creation — moving a crew would silently
                orphan member assignments scoped to the old division. */}
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL_CLASS}>Division</span>
                <span className="flex h-9 items-center rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 text-[13px] text-subtle">
                  {teamShortLabel(editing.teamKey)}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={teamId} className={FIELD_LABEL_CLASS}>
                  Division
                </label>
                <MenuSelect
                  id={teamId}
                  value={teamKey}
                  onChange={(v) => v !== null && handleTeamChange(v)}
                  options={TEAM_OPTIONS.map((t) => ({
                    value: t.id,
                    label: t.shortLabel,
                    swatch: t.color,
                  }))}
                />
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={typeId} className={FIELD_LABEL_CLASS}>
                Crew type
              </label>
              <MenuSelect
                id={typeId}
                value={crewType}
                onChange={setCrewType}
                placeholder="No type"
                options={typeOptions}
                action={{
                  label: "New type…",
                  onSelect: () => setTypeFormOpen(true),
                }}
              />
            </div>
            {editing && (
              <label
                htmlFor={activeId}
                className="flex cursor-pointer items-center gap-2 self-end pb-2 text-[13px] text-foreground"
              >
                <input
                  id={activeId}
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Active — offered when assigning work
              </label>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL_CLASS}>
              Description{" "}
              <span className="font-normal text-faint">
                optional — helps the AI pick between same-type crews
              </span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. North side arterial roads and school zones"
              rows={2}
              maxLength={500}
              className={cn(CONTROL_CLASS, "h-auto min-h-[72px] resize-y py-2")}
              aria-label="Crew description"
            />
          </label>

          {typeFormOpen && (
            <div className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-hairline bg-overlay p-3">
              <p className="text-[12px] font-medium text-subtle">
                New crew type
              </p>
              {typeError && <FormError message={typeError} />}
              <input
                type="text"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                onKeyDown={(e) => {
                  // Enter here would implicitly submit the OUTER crew form and
                  // discard the half-entered type; add the type instead.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddType();
                  }
                }}
                placeholder="e.g. street lights"
                autoComplete="off"
                className={CONTROL_CLASS}
                aria-label="Type name"
              />
              <textarea
                value={newTypeDesc}
                onChange={(e) => setNewTypeDesc(e.target.value)}
                placeholder="What does this crew do? The AI uses this to route matching work orders here."
                rows={3}
                maxLength={500}
                className={cn(
                  CONTROL_CLASS,
                  "h-auto min-h-[72px] resize-y py-2",
                )}
                aria-label="What this crew does"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] tabular-nums text-faint">
                  {(() => {
                    const words = descriptionWordCount(newTypeDesc);
                    return words >= MIN_TYPE_DESCRIPTION_WORDS
                      ? `${words} words`
                      : `${MIN_TYPE_DESCRIPTION_WORDS - words} more word${MIN_TYPE_DESCRIPTION_WORDS - words === 1 ? "" : "s"} needed`;
                  })()}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTypeFormOpen(false);
                      setTypeError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isPending={typePending}
                    disabled={typePending || !canAddType}
                    onClick={handleAddType}
                  >
                    Add type
                  </Button>
                </div>
              </div>
            </div>
          )}

          <fieldset className="flex flex-col gap-1.5">
            <legend className={FIELD_LABEL_CLASS}>
              Members{" "}
              <span className="font-normal text-faint">
                (from {teamShortLabel(teamKey)} — optional; create the crew now
                and staff it later, work can still route here)
              </span>
            </legend>
            {candidates.length === 0 ? (
              <p className="text-[12px] text-faint">
                No members are assigned to this division yet — set a member's
                team first, then add them to a crew.
              </p>
            ) : (
              <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto custom-scrollbar rounded-[var(--radius-md)] border border-hairline bg-overlay p-1.5">
                {candidates.map((m) => {
                  const checked = roster.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 rounded-[calc(var(--radius-md)-2px)] px-2 py-1.5 text-[13px] text-foreground transition-colors duration-150 hover:bg-overlay-strong"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(m.id)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="min-w-0 truncate">
                          {m.displayName ?? "Unnamed"}
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={!checked}
                        aria-pressed={leadId === m.id}
                        aria-label={`Make ${m.displayName ?? "member"} crew lead`}
                        onClick={() =>
                          setLeadId((cur) => (cur === m.id ? null : m.id))
                        }
                        className={[
                          "inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md outline-none transition-colors duration-150",
                          "focus-visible:ring-2 focus-visible:ring-accent/60",
                          leadId === m.id
                            ? "text-foreground"
                            : "text-faint hover:text-subtle disabled:opacity-30",
                        ].join(" ")}
                        title={leadId === m.id ? "Crew lead" : "Set as lead"}
                      >
                        <Star
                          className="h-3.5 w-3.5"
                          strokeWidth={2}
                          fill={leadId === m.id ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {!inviteOpen ? (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="flex w-fit items-center gap-1.5 rounded-[var(--radius-md)] px-1 py-0.5 text-[12px] font-medium text-subtle outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Invite by email
              </button>
            ) : (
              <div className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-hairline bg-overlay p-3">
                <p className="text-[12px] font-medium text-subtle">
                  Invite to {teamShortLabel(teamKey)} &amp; this crew
                </p>
                {inviteError && <FormError message={inviteError} />}
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter here would implicitly submit the OUTER crew form;
                    // send the invite instead.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleInvite();
                    }
                  }}
                  placeholder="name@city.gov"
                  autoComplete="off"
                  inputMode="email"
                  className={CONTROL_CLASS}
                  aria-label="Email"
                />
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter here would implicitly submit the OUTER crew form;
                    // send the invite instead.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleInvite();
                    }
                  }}
                  placeholder="Full name"
                  autoComplete="off"
                  className={CONTROL_CLASS}
                  aria-label="Name"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-faint">
                    They get an email invite &amp; dispatcher access
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setInviteOpen(false);
                        setInviteError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isPending={invitePending}
                      disabled={invitePending || !canInvite}
                      onClick={handleInvite}
                    >
                      Send invite
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </fieldset>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-hairline px-5 py-4">
          <div>
            {editing && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                disabled={pending}
                className="text-[var(--status-danger-fg)]"
              >
                {confirmDelete ? "Confirm delete" : "Delete crew"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              isPending={pending}
              disabled={pending || name.trim().length === 0}
            >
              {editing ? "Save changes" : "Create crew"}
            </Button>
          </div>
        </div>
      </form>
    </MemberModalShell>
  );
}
