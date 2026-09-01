"use client";

import { Loader2, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OrgUnitProposal } from "@/lib/ai/org-tree-ai";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Org-tree builder (advanced routing, migration 042).

   Admin describes city operations in prose → POST /api/ai/org-tree
   {generate} returns a proposed tree → admin reviews/prunes → {commit}
   persists it for their own city. The model NEVER writes; this human
   approval step is the gate (rule 1 + the route's admin auth).
   ================================================================== */

type Proposal = { units: OrgUnitProposal[]; notes: string };

const KIND_BADGE: Record<OrgUnitProposal["kind"], string> = {
  team: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  subteam:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  crew: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  contractor:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

/** Depth of a unit by walking parentKey, for indented tree rendering. */
function depthOf(
  u: OrgUnitProposal,
  byKey: Map<string, OrgUnitProposal>,
): number {
  let d = 0;
  let cur = u.parentKey ? byKey.get(u.parentKey) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.key)) {
    seen.add(cur.key);
    d += 1;
    cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined;
  }
  return d;
}

export function OrgTreeBuilder() {
  const [description, setDescription] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<"generate" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);

  const byKey = useMemo(
    () => new Map((proposal?.units ?? []).map((u) => [u.key, u])),
    [proposal],
  );

  async function generate() {
    setBusy("generate");
    setError(null);
    setCommitted(null);
    try {
      const res = await fetch("/api/ai/org-tree", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate", description }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setProposal(json.proposal as Proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Drop a unit and, to keep the tree valid, every descendant of it.
  function removeUnit(key: string) {
    if (!proposal) return;
    const drop = new Set<string>([key]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const u of proposal.units) {
        if (u.parentKey && drop.has(u.parentKey) && !drop.has(u.key)) {
          drop.add(u.key);
          grew = true;
        }
      }
    }
    setProposal({
      ...proposal,
      units: proposal.units.filter((u) => !drop.has(u.key)),
    });
  }

  async function commit() {
    if (!proposal) return;
    setBusy("commit");
    setError(null);
    try {
      const res = await fetch("/api/ai/org-tree", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "commit", units: proposal.units }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Commit failed (${res.status})`);
        return;
      }
      setCommitted(Object.keys(json.idByKey ?? {}).length);
      setProposal(null);
      setDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="space-y-2">
        <label
          htmlFor="ops-desc"
          className="text-sm font-medium text-[var(--color-foreground)]"
        >
          Describe your operations
        </label>
        <textarea
          id="ops-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="e.g. Public works has two paving crews (North, South) and one drainage crew. We contract out tree removal to GreenLeaf at ~$800/job. The sign shop is shared with the county and handles ~5 jobs at a time."
          className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700"
        />
        <Button
          onClick={generate}
          disabled={busy !== null || description.trim().length < 10}
        >
          {busy === "generate" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          Generate tree
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {committed !== null && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          Committed {committed} org unit{committed === 1 ? "" : "s"} to your
          city.
        </p>
      )}

      {proposal && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-[var(--color-muted)] dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Categories</th>
                  <th className="px-3 py-2 font-medium">Skills</th>
                  <th className="px-3 py-2 font-medium">Cap</th>
                  <th className="px-3 py-2 font-medium">Cost/job</th>
                  <th className="px-3 py-2 font-medium">SLA h</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {proposal.units.map((u) => {
                  const depth = depthOf(u, byKey);
                  return (
                    <tr
                      key={u.key}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2">
                        <span style={{ paddingLeft: `${depth * 16}px` }}>
                          {u.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-xs font-medium",
                            KIND_BADGE[u.kind],
                          )}
                        >
                          {u.kind}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-muted)]">
                        {u.categories?.join(", ") || "-"}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-muted)]">
                        {u.skills.join(", ") || "any"}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-muted)]">
                        {u.capacity ?? "∞"}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-muted)]">
                        {u.costPerJob ? `$${u.costPerJob}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-muted)]">
                        {u.slaHours ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeUnit(u.key)}
                          aria-label={`Remove ${u.label}`}
                          className="text-zinc-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {proposal.notes && (
            <p className="text-sm text-[var(--color-muted)]">
              <span className="font-medium">AI notes:</span> {proposal.notes}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={commit}
              disabled={busy !== null || proposal.units.length === 0}
            >
              {busy === "commit" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Approve &amp; commit {proposal.units.length} unit
              {proposal.units.length === 1 ? "" : "s"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setProposal(null)}
              disabled={busy !== null}
            >
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
