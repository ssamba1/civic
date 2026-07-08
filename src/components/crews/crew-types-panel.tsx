"use client";

import { Pencil, Plus, Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  deleteCrewType,
  saveCrewType,
} from "@/app/city/[slug]/members/crew-actions";
import {
  CONTROL_CLASS,
  FormError,
  humanizeMemberError,
  MemberModalShell,
} from "@/components/members/member-modal";
import { Button } from "@/components/ui/button";
import { CREW_TYPE_KEY_PATTERN, DEFAULT_CREW_TYPES } from "@/lib/crew-types";
import type { CrewTypeRow } from "@/lib/db/crew-types";

/* ==================================================================
   Crew types panel — the city's catalog of crew labor types. Lives on
   the members page next to the Crews panel it feeds. The description
   is what the work-order AI reads when picking a crew_type for a new
   report, so this panel is effectively "teach the AI our org chart".
   ================================================================== */

const FIELD_LABEL_CLASS = "text-[12px] font-medium text-subtle";

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; row: CrewTypeRow }
  | null;

export function CrewTypesPanel({
  slug,
  types,
  canManage,
  catalogAvailable,
}: {
  slug: string;
  types: CrewTypeRow[];
  canManage: boolean;
  /** False when the crew_types table isn't readable (pre-031 DB) — the app
   *  is running on the built-in defaults and editing would go nowhere. */
  catalogAvailable: boolean;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);

  // Pre-031 fallback: show the built-in defaults read-only so the panel still
  // tells the truth about what the AI is choosing from.
  const rows: CrewTypeRow[] = catalogAvailable
    ? types
    : DEFAULT_CREW_TYPES.map((t) => ({
        id: `default-${t.key}`,
        key: t.key,
        label: t.label,
        description: t.description,
        active: true,
      }));

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            Crew types
          </h2>
          <span className="text-[13px] tabular-nums text-faint">
            {rows.length}
          </span>
        </div>
        {canManage && catalogAvailable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New type
          </Button>
        )}
      </div>

      <p className="-mt-2 text-[13px] text-faint">
        The kinds of labor this city fields. When AI work-order generation is
        enabled, the model reads each description to pick a crew type for new
        work orders — write what the crew physically does.
        {!catalogAvailable &&
          " Showing the built-in defaults — the per-city catalog isn't available on this database yet."}
      </p>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-12 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm font-medium text-foreground">
            No crew types yet
          </p>
          <p className="mt-1.5 text-[13px] text-faint">
            {canManage
              ? "Create the first one — the AI falls back to the built-in defaults until the catalog has active entries."
              : "An admin can create them from this page."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Tags
                    className="h-4 w-4 flex-shrink-0 text-subtle"
                    strokeWidth={1.75}
                  />
                  <span className="truncate text-[14px] font-medium text-foreground">
                    {row.label}
                  </span>
                  {!row.active && (
                    <span className="flex-shrink-0 rounded-md border border-hairline bg-overlay px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-faint">
                      Inactive
                    </span>
                  )}
                </div>
                {canManage && catalogAvailable && (
                  <button
                    type="button"
                    aria-label={`Edit ${row.label}`}
                    onClick={() => setDialog({ mode: "edit", row })}
                    className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-faint outline-none transition-colors duration-150 hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
              <span className="w-fit rounded-md border border-hairline bg-overlay px-1.5 py-0.5 font-mono text-[11px] text-subtle">
                {row.key}
              </span>
              <p className="text-[12px] leading-relaxed text-faint">
                {row.description ||
                  "No description — the AI only sees the key."}
              </p>
            </div>
          ))}
        </div>
      )}

      {canManage && catalogAvailable && dialog && (
        <CrewTypeDialog
          key={dialog.mode === "edit" ? dialog.row.id : "create"}
          slug={slug}
          state={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function CrewTypeDialog({
  slug,
  state,
  onClose,
}: {
  slug: string;
  state: NonNullable<DialogState>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editing = state.mode === "edit" ? state.row : null;

  const [key, setKey] = useState(editing?.key ?? "");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [active, setActive] = useState(editing?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const keyId = useId();
  const labelId = useId();
  const descriptionId = useId();
  const activeId = useId();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (label.trim().length === 0) {
      setError("Give the type a label.");
      return;
    }
    if (!editing && !CREW_TYPE_KEY_PATTERN.test(key)) {
      setError(
        "Key must be 2–40 characters of lowercase letters, digits, or underscores.",
      );
      return;
    }
    startTransition(async () => {
      const res = await saveCrewType({
        slug,
        id: editing?.id ?? null,
        key: editing?.key ?? key,
        label: label.trim(),
        description: description.trim(),
        active,
      });
      if (!res.ok) {
        setError(humanizeMemberError(res.error));
        return;
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
      const res = await deleteCrewType({ slug, id: editing.id });
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
      title={editing ? editing.label : "New crew type"}
      subtitle={
        editing
          ? `Key: ${editing.key}`
          : "A kind of labor the AI can route work to"
      }
      icon={<Tags className="h-4 w-4" strokeWidth={1.75} />}
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar p-5">
          {error && <FormError message={error} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor={labelId} className="flex flex-col gap-1.5">
              <span className={FIELD_LABEL_CLASS}>
                Label<span className="text-faint"> *</span>
              </span>
              <input
                id={labelId}
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Night Paving"
                autoComplete="off"
                className={CONTROL_CLASS}
              />
            </label>
            {/* Key is fixed after creation — crews and work orders reference
                it softly; renaming would orphan those references. */}
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL_CLASS}>Key</span>
                <span className="flex h-9 items-center rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 font-mono text-[13px] text-subtle">
                  {editing.key}
                </span>
              </div>
            ) : (
              <label htmlFor={keyId} className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL_CLASS}>
                  Key<span className="text-faint"> *</span>
                </span>
                <input
                  id={keyId}
                  type="text"
                  value={key}
                  onChange={(e) =>
                    setKey(e.target.value.toLowerCase().replace(/[\s-]+/g, "_"))
                  }
                  placeholder="night_paving"
                  autoComplete="off"
                  className={`${CONTROL_CLASS} font-mono`}
                />
              </label>
            )}
          </div>

          <label htmlFor={descriptionId} className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL_CLASS}>
              Description{" "}
              <span className="font-normal text-faint">
                (what the AI matches against)
              </span>
            </span>
            <textarea
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Asphalt work after dark — pothole patching and resurfacing on arterial roads that can't close during the day."
              className="w-full rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 py-2 text-[13px] text-foreground placeholder:text-faint outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            />
          </label>

          {editing && (
            <label
              htmlFor={activeId}
              className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground"
            >
              <input
                id={activeId}
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Active — offered to the AI and in crew forms
            </label>
          )}
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
                {confirmDelete ? "Confirm delete" : "Delete type"}
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
              disabled={pending || label.trim().length === 0}
            >
              {editing ? "Save changes" : "Create type"}
            </Button>
          </div>
        </div>
      </form>
    </MemberModalShell>
  );
}
