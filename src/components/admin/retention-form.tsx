"use client";

import { useState, useTransition } from "react";
import { updateRetentionSettings } from "@/app/admin/retention/actions";
import {
  type RetentionSettings,
  validateRetention,
} from "@/app/admin/retention/validate";

interface RetentionFormProps {
  cityId: string;
  initial: RetentionSettings;
}

export function RetentionForm({ cityId, initial }: RetentionFormProps) {
  const [rawDays, setRawDays] = useState(String(initial.raw_photo_ttl_days));
  const [freetextDays, setFreetextDays] = useState(String(initial.freetext_ttl_days));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const input = {
      raw_photo_ttl_days: Number(rawDays),
      freetext_ttl_days: Number(freetextDays),
    };
    const validation = validateRetention(input);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    startTransition(async () => {
      const result = await updateRetentionSettings(cityId, input);
      if (result.ok) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="raw_photo_ttl_days"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Raw photo TTL (days)
          </label>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Original (unblurred) photos are deleted after this many days.
            Default: 30.
          </p>
          <input
            id="raw_photo_ttl_days"
            type="number"
            min={1}
            max={3650}
            value={rawDays}
            onChange={(e) => setRawDays(e.target.value)}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            required
          />
        </div>

        <div>
          <label
            htmlFor="freetext_ttl_days"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Free-text retention (days)
          </label>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Report descriptions are cleared of free-text after this many days.
            Default: 365.
          </p>
          <input
            id="freetext_ttl_days"
            type="number"
            min={1}
            max={3650}
            value={freetextDays}
            onChange={(e) => setFreetextDays(e.target.value)}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            required
          />
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {success && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          Retention settings saved.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
