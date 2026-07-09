"use client";

import { useId, useState } from "react";
import { registerWebhookAction } from "@/app/admin/webhooks/actions";

const ALL_EVENTS = [
  "report.created",
  "report.status_changed",
  "report.closed",
] as const;

interface City {
  id: string;
  label: string;
}

interface Props {
  cities: City[];
  onCreated?: (id: string, secret: string) => void;
}

export function WebhookForm({ cities, onCreated }: Props) {
  const formId = useId();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [events, setEvents] = useState<string[]>([...ALL_EVENTS]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  function toggleEvent(event: string) {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await registerWebhookAction({
        label,
        url,
        cityId: cityId || null,
        events,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setNewSecret(result.data.secret);
        onCreated?.(result.data.id, result.data.secret);
        setLabel("");
        setUrl("");
        setCityId("");
        setEvents([...ALL_EVENTS]);
      }
    } finally {
      setSaving(false);
    }
  }

  if (newSecret) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
        <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-100">
          Webhook registered. Copy the secret now — it will not be shown again.
        </p>
        <code className="block break-all rounded bg-white p-3 text-xs font-mono text-amber-800 dark:bg-zinc-900 dark:text-amber-300">
          {newSecret}
        </code>
        <button
          type="button"
          className="mt-3 text-xs text-amber-700 underline dark:text-amber-400"
          onClick={() => setNewSecret(null)}
        >
          Register another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div>
        <label
          htmlFor={`${formId}-label`}
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Label
        </label>
        <input
          id={`${formId}-label`}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="My Zapier integration"
        />
      </div>

      <div>
        <label
          htmlFor={`${formId}-url`}
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Endpoint URL (HTTPS)
        </label>
        <input
          id={`${formId}-url`}
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="https://hooks.zapier.com/..."
        />
      </div>

      <div>
        <label
          htmlFor={`${formId}-city`}
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          City scope (optional — blank = all cities)
        </label>
        <select
          id={`${formId}-city`}
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Events
        </span>
        <div className="mt-2 space-y-1">
          {ALL_EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={events.includes(ev)}
                onChange={() => toggleEvent(ev)}
                className="rounded"
              />
              <code className="text-xs">{ev}</code>
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || events.length === 0}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Registering…" : "Register endpoint"}
      </button>
    </form>
  );
}
