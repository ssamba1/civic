import type { Metadata } from "next";
import { PrintButton } from "@/components/print-button";

/* ==================================================================
   Compliance report (NEXT_100 #98).

   A printable public-trust artifact summarizing the privacy/security controls
   Civic runs, mapped to what they protect. Static content backed by the real
   controls in the codebase (client-side blur, RLS, audit log, TTL raw bucket);
   the /admin layout gates it to admins. Print-to-PDF, no dependency.
   ================================================================== */

export const metadata: Metadata = { title: "Compliance report | Civic Admin" };

const CONTROLS: { area: string; control: string; status: string }[] = [
  {
    area: "Photo privacy",
    control: "Client-side face + license-plate blur before upload",
    status: "Enforced",
  },
  {
    area: "Raw media",
    control: "Originals in a restricted bucket, ~30-day TTL, never public",
    status: "Enforced",
  },
  {
    area: "Access control",
    control: "Row-level security (default deny) on every table",
    status: "Enforced",
  },
  {
    area: "Auditability",
    control: "Append-only audit log on reports, work orders, and storage",
    status: "Enforced",
  },
  {
    area: "Data in transit",
    control: "No PII in URLs or query strings",
    status: "Enforced",
  },
  {
    area: "AI safety",
    control: "All model calls server-side; keys never exposed to the client",
    status: "Enforced",
  },
  {
    area: "Interoperability",
    control: "Open311 GeoReport v2 export (XML + JSON)",
    status: "Enforced",
  },
  {
    area: "SOC 2 Type II",
    control: "Controls mapped; formal audit engagement",
    status: "In progress",
  },
];

export default function CompliancePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 text-zinc-900 dark:text-zinc-100 print:py-0">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-[12px] uppercase tracking-[0.08em] text-zinc-500">
            Trust &amp; compliance
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Civic controls summary
          </h1>
        </div>
        <PrintButton />
      </div>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
            <th className="py-2 pr-4 font-medium">Area</th>
            <th className="py-2 pr-4 font-medium">Control</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {CONTROLS.map((c) => (
            <tr
              key={`${c.area}-${c.control}`}
              className="border-b border-zinc-100 dark:border-zinc-900"
            >
              <td className="py-2.5 pr-4 align-top font-medium">{c.area}</td>
              <td className="py-2.5 pr-4 align-top text-zinc-600 dark:text-zinc-400">
                {c.control}
              </td>
              <td className="py-2.5 align-top">
                <span
                  className={
                    c.status === "Enforced"
                      ? "text-green-600 dark:text-green-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {c.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-8 text-[12px] text-zinc-500">
        Generated {new Date().toISOString().slice(0, 10)} · Civic · Open311
        compatible
      </p>
    </main>
  );
}
