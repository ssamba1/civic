import type { Metadata } from "next";
import {
  RAW_PHOTO_TTL_DAYS,
  RETENTION_CRON_SCHEDULE,
} from "@/lib/privacy/retention";

/* ==================================================================
   Data-retention policy view (NEXT_100 #99, partial).

   Surfaces the active retention policy — raw-photo TTL + cleanup schedule —
   from lib/privacy/retention.ts so operators can see exactly what's kept and
   for how long. NOTE: this is read-only. Per-city EDITABLE policies need a
   config table (migration) and are tracked as follow-up; the /admin layout
   gates this to admins.
   ================================================================== */

export const metadata: Metadata = { title: "Data retention | Civic Admin" };

export default function RetentionPage() {
  const rows: { label: string; value: string; note: string }[] = [
    {
      label: "Raw photo retention",
      value: `${RAW_PHOTO_TTL_DAYS} days`,
      note: "Unblurred originals in the restricted photos-raw bucket are deleted after this window. Blurred public copies are permanent.",
    },
    {
      label: "Cleanup schedule",
      value: RETENTION_CRON_SCHEDULE,
      note: "Cron expression for the daily retention sweep (UTC).",
    },
    {
      label: "Public photos",
      value: "Retained",
      note: "Blurred, privacy-safe images shown on the public dashboard are kept for the historical record.",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 text-zinc-900 dark:text-zinc-100">
      <h1 className="text-xl font-semibold tracking-tight">
        Data-retention policy
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        The active policy for how long resident data is kept. Read-only —
        per-city editable policies are a planned follow-up.
      </p>

      <dl className="mt-6 flex flex-col gap-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[14px] font-medium">{r.label}</dt>
              <dd className="font-mono text-[13px] text-zinc-700 dark:text-zinc-300">
                {r.value}
              </dd>
            </div>
            <p className="mt-1 text-[12px] text-zinc-500">{r.note}</p>
          </div>
        ))}
      </dl>
    </main>
  );
}
