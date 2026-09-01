"use client";

import { useMemo, useState } from "react";
import {
  CLAIM_STATES,
  type ClaimQueueRow,
  type ClaimState,
} from "@/components/liability/queue-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  type CurrencyConfig,
  formatCost,
  formatLocalDate,
} from "@/lib/currency";
import {
  approveClaims,
  dismissClaim,
  resolveClaim,
} from "@/lib/liability/claims-actions";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   /admin/claims review queue (spec 5.2, 5.3).

   Approval is the one irreversible outward action in the whole
   liability pipeline: it assigns a work order and mails a packet to an
   external vendor. So approve is always two steps, select, then a
   confirmation dialog that names every recipient and the exact claim
   count before anything leaves the building.

   Batching is the economic argument (5.3): one letter, N defects. The
   dialog therefore groups the selection by contractor, which is also
   how the delivery batches.
   ================================================================== */

const FILTERS = ["all", ...CLAIM_STATES] as const;
type Filter = (typeof FILTERS)[number];

const STATE_VARIANT: Record<
  ClaimState,
  "default" | "info" | "success" | "warning" | "danger"
> = {
  draft: "default",
  approved: "info",
  sent: "info",
  accepted: "success",
  declined: "danger",
  disputed: "warning",
  resolved: "success",
  dismissed: "default",
};

const titleize = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface Props {
  rows: ClaimQueueRow[];
  currency: CurrencyConfig;
}

export function ClaimsQueue({ rows: initial, currency }: Props) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.state === filter)),
    [rows, filter],
  );

  // Only drafts can be approved. A selection made before a filter change stays
  // intact, so a stale id is filtered out here rather than silently sent.
  const selectableIds = useMemo(
    () => new Set(rows.filter((r) => r.state === "draft").map((r) => r.id)),
    [rows],
  );
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id) && selectableIds.has(r.id)),
    [rows, selected, selectableIds],
  );

  /** Selection grouped by recipient, mirrors how delivery batches (5.3). */
  const recipients = useMemo(() => {
    const byContractor = new Map<
      string,
      { name: string; email: string | null; count: number }
    >();
    for (const r of selectedRows) {
      const key = r.liable_contractor_id ?? "unassigned";
      const existing = byContractor.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byContractor.set(key, {
          name: r.contractor_name ?? "Unassigned contractor",
          email: r.contractor_email,
          count: 1,
        });
      }
    }
    return [...byContractor.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [selectedRows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const ids = visible.filter((r) => selectableIds.has(r.id)).map((r) => r.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function handleApprove() {
    const ids = selectedRows.map((r) => r.id);
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    const result = await approveClaims(ids);
    setBusy(false);
    if (!result.ok) {
      setError(String(result.error).replace(/_/g, " "));
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        ids.includes(r.id)
          ? { ...r, state: "sent", sent_at: new Date().toISOString() }
          : r,
      ),
    );
    setSelected(new Set());
    setConfirmOpen(false);
  }

  async function handleDismiss(id: string) {
    const reason = dismissReason.trim();
    if (!reason) {
      setError("A dismissal reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await dismissClaim(id, reason);
    setBusy(false);
    if (!result.ok) {
      setError(String(result.error).replace(/_/g, " "));
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, state: "dismissed" } : r)),
    );
    setDismissing(null);
    setDismissReason("");
  }

  async function handleResolve(id: string, dollars: string) {
    const amount = Number(dollars);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter the recovered amount in whole currency units.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await resolveClaim(id, Math.round(amount * 100));
    setBusy(false);
    if (!result.ok) {
      setError(String(result.error).replace(/_/g, " "));
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              state: "resolved",
              recovered_value_cents: Math.round(amount * 100),
            }
          : r,
      ),
    );
  }

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([["all", rows.length]]);
    for (const s of CLAIM_STATES) {
      map.set(
        s,
        rows.reduce((n, r) => (r.state === s ? n + 1 : n), 0),
      );
    }
    return map;
  }, [rows]);

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-[var(--radius-sm)] border border-hairline bg-overlay px-3 py-2 text-sm text-[var(--status-danger-fg)]">
          {error}
        </p>
      )}

      {/* State filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] transition-colors",
              filter === f
                ? "border-hairline-strong bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "border-hairline bg-overlay text-subtle hover:text-foreground",
            )}
          >
            {f === "all" ? "All" : titleize(f)}
            <span className="ml-1.5 tabular-nums opacity-70">
              {counts.get(f) ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Batch bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline pb-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleAllVisible}
          disabled={visible.every((r) => !selectableIds.has(r.id))}
        >
          Select all drafts shown
        </Button>
        <span className="text-[12px] text-subtle tabular-nums">
          {selectedRows.length} selected
        </span>
        <Button
          type="button"
          size="sm"
          disabled={selectedRows.length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          Approve &amp; send…
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-hairline bg-surface px-4 py-10 text-center">
          <p className="text-sm text-subtle">No claims in this state.</p>
          <p className="mt-1 text-[12px] text-faint">
            Claims are drafted automatically for reports whose liability verdict
            is not city cost. Add a paving schedule under Liability to start
            attributing defects.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-hairline bg-surface">
          <table className="w-full min-w-[52rem] text-left text-[13px]">
            <thead className="border-b border-hairline text-[11px] uppercase tracking-wider text-faint">
              <tr>
                <th className="w-8 px-3 py-2" scope="col">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-3 py-2" scope="col">
                  Defect
                </th>
                <th className="px-3 py-2" scope="col">
                  Contractor
                </th>
                <th className="px-3 py-2" scope="col">
                  Basis
                </th>
                <th className="px-3 py-2" scope="col">
                  Window
                </th>
                <th className="px-3 py-2 text-right" scope="col">
                  Value
                </th>
                <th className="px-3 py-2" scope="col">
                  State
                </th>
                <th className="px-3 py-2 text-right" scope="col">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <ClaimRow
                  key={row.id}
                  row={row}
                  currency={currency}
                  selectable={selectableIds.has(row.id)}
                  checked={selected.has(row.id)}
                  busy={busy}
                  dismissing={dismissing === row.id}
                  dismissReason={dismissReason}
                  onToggle={() => toggle(row.id)}
                  onStartDismiss={() => {
                    setDismissing(row.id);
                    setDismissReason("");
                  }}
                  onCancelDismiss={() => setDismissing(null)}
                  onDismissReason={setDismissReason}
                  onDismiss={() => handleDismiss(row.id)}
                  onResolve={(v) => handleResolve(row.id, v)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Send these claims?"
        description="Approving assigns each report's work order to the contractor and emails the packet. This leaves the city and cannot be recalled."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" isPending={busy} onClick={handleApprove}>
              Send {selectedRows.length} claim
              {selectedRows.length === 1 ? "" : "s"}
            </Button>
          </div>
        }
      >
        <ul className="space-y-2">
          {recipients.map((r) => (
            <li
              key={r.name}
              className="flex items-center justify-between gap-4 rounded-[var(--radius-sm)] border border-hairline bg-overlay px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {r.name}
                </span>
                <span className="block truncate text-[11px] text-faint">
                  {r.email ?? "No email on file. Delivery will fail"}
                </span>
              </span>
              <span className="flex-shrink-0 text-[12px] tabular-nums text-subtle">
                {r.count} claim{r.count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-faint">
          One batched letter per contractor, listing every defect above.
        </p>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ClaimRow({
  row,
  currency,
  selectable,
  checked,
  busy,
  dismissing,
  dismissReason,
  onToggle,
  onStartDismiss,
  onCancelDismiss,
  onDismissReason,
  onDismiss,
  onResolve,
}: {
  row: ClaimQueueRow;
  currency: CurrencyConfig;
  selectable: boolean;
  checked: boolean;
  busy: boolean;
  dismissing: boolean;
  dismissReason: string;
  onToggle: () => void;
  onStartDismiss: () => void;
  onCancelDismiss: () => void;
  onDismissReason: (v: string) => void;
  onDismiss: () => void;
  onResolve: (dollars: string) => void;
}) {
  const [recovered, setRecovered] = useState("");
  const ref = row.contract_ref ?? row.permit_ref;
  const canResolve =
    row.state === "sent" ||
    row.state === "accepted" ||
    row.state === "disputed";

  return (
    <>
      <tr className="border-b border-hairline last:border-b-0 align-top">
        <td className="px-3 py-2.5">
          {selectable ? (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              aria-label={`Select claim for ${row.report_address ?? row.report_id.slice(0, 8)}`}
              className="size-4 accent-[var(--accent)]"
            />
          ) : null}
        </td>
        <td className="px-3 py-2.5">
          <span className="block font-medium text-foreground">
            {row.report_category ? titleize(row.report_category) : "Defect"}
          </span>
          <span className="block text-[12px] text-subtle">
            {row.report_address ?? "No address on file"}
          </span>
          <span className="block text-[11px] text-faint tabular-nums">
            {row.report_id.slice(0, 8)} ·{" "}
            {formatLocalDate(row.created_at, currency)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-subtle">
          <span className="block text-foreground">
            {row.contractor_name ?? "-"}
          </span>
          {ref && <span className="block text-[11px] text-faint">#{ref}</span>}
        </td>
        <td className="px-3 py-2.5 text-subtle">{titleize(row.basis)}</td>
        <td className="px-3 py-2.5 text-subtle tabular-nums">
          {row.window_ends_on
            ? formatLocalDate(row.window_ends_on, currency)
            : "-"}
          {row.confidence != null && (
            <span className="block text-[11px] text-faint">
              {Math.round(row.confidence * 100)}% confidence
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-subtle">
          {row.estimated_value_cents != null
            ? formatCost(row.estimated_value_cents / 100, currency)
            : "-"}
          {row.recovered_value_cents != null && (
            <span className="block text-[11px] text-[var(--status-success-fg)]">
              {formatCost(row.recovered_value_cents / 100, currency)} recovered
            </span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <Badge variant={STATE_VARIANT[row.state]}>{row.state}</Badge>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="flex flex-col items-end gap-1.5">
            {row.state === "draft" && !dismissing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onStartDismiss}
              >
                Dismiss
              </Button>
            )}
            {canResolve && (
              <div className="flex items-center gap-1.5">
                <input
                  value={recovered}
                  onChange={(e) => setRecovered(e.target.value)}
                  inputMode="decimal"
                  placeholder="Recovered"
                  aria-label="Recovered amount"
                  className="w-24 rounded-[var(--radius-sm)] border border-hairline bg-surface px-2 py-1 text-right text-[12px] text-foreground placeholder:text-faint"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onResolve(recovered)}
                >
                  Resolve
                </Button>
              </div>
            )}
          </div>
        </td>
      </tr>
      {dismissing && (
        <tr className="border-b border-hairline bg-overlay">
          <td colSpan={8} className="px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor={`dismiss-${row.id}`}
                className="text-[12px] text-subtle"
              >
                Reason for dismissal (recorded on the claim)
              </label>
              <input
                id={`dismiss-${row.id}`}
                value={dismissReason}
                onChange={(e) => onDismissReason(e.target.value)}
                placeholder="e.g. defect predates the resurfacing job"
                className="min-w-[18rem] flex-1 rounded-[var(--radius-sm)] border border-hairline bg-surface px-2 py-1 text-[12px] text-foreground placeholder:text-faint"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                isPending={busy}
                onClick={onDismiss}
              >
                Dismiss claim
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancelDismiss}
              >
                Cancel
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
