"use client";

import { useState } from "react";
import { deleteWebhookAction, toggleWebhookAction } from "@/app/admin/webhooks/actions";
import type { WebhookEndpointRow } from "@/app/admin/webhooks/actions";

interface Props {
  endpoints: WebhookEndpointRow[];
}

export function WebhooksTable({ endpoints: initial }: Props) {
  const [endpoints, setEndpoints] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this webhook endpoint?")) return;
    setBusy(id);
    const result = await deleteWebhookAction(id);
    if (result.ok) setEndpoints((prev) => prev.filter((e) => e.id !== id));
    setBusy(null);
  }

  async function handleToggle(id: string, current: boolean) {
    setBusy(id);
    const result = await toggleWebhookAction(id, !current);
    if (result.ok)
      setEndpoints((prev) =>
        prev.map((e) => (e.id === id ? { ...e, active: !current } : e)),
      );
    setBusy(null);
  }

  if (endpoints.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No endpoints registered yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left">
            <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Label</th>
            <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">URL</th>
            <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Events</th>
            <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Status</th>
            <th className="pb-2 font-medium text-zinc-600 dark:text-zinc-400" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {endpoints.map((ep) => (
            <tr key={ep.id} className="py-2">
              <td className="py-2 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                {ep.label ?? "—"}
              </td>
              <td className="py-2 pr-4 max-w-[180px] truncate text-zinc-600 dark:text-zinc-400">
                <span title={ep.url}>{ep.url}</span>
              </td>
              <td className="py-2 pr-4">
                <div className="flex flex-wrap gap-1">
                  {ep.events.map((ev) => (
                    <span
                      key={ev}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      {ev}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 pr-4">
                <button
                  type="button"
                  disabled={busy === ep.id}
                  onClick={() => handleToggle(ep.id, ep.active)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    ep.active
                      ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800"
                  }`}
                >
                  {ep.active ? "active" : "paused"}
                </button>
              </td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  disabled={busy === ep.id}
                  onClick={() => handleDelete(ep.id)}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
