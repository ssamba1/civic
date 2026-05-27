"use client";

import type { Classification } from "@/lib/types";

interface SubmissionConfirmationProps {
  reportId: string;
  classification: Classification;
}

const categoryLabels: Record<string, string> = {
  pothole: "Pothole",
  streetlight: "Streetlight Issue",
  downed_sign: "Downed Sign",
  graffiti: "Graffiti",
  illegal_dump: "Illegal Dumping",
  water_leak: "Water Leak",
  sidewalk_damage: "Sidewalk Damage",
  tree_down: "Fallen Tree",
  debris: "Debris",
  drainage: "Drainage Issue",
  faded_signage: "Faded Signage",
  other: "Other",
};

export default function SubmissionConfirmation({
  reportId,
  classification,
}: SubmissionConfirmationProps) {
  const confidencePct = Math.round(classification.confidence * 100);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-white px-6 py-12 text-center">
      {/* Success animation - green check */}
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100 animate-[scale-in_0.3s_ease-out]">
        <svg
          className="h-12 w-12 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-zinc-900 mb-1">
        Report Submitted
      </h1>
      <p className="text-zinc-500 text-sm mb-8">
        Your report has been submitted and will be reviewed.
      </p>

      {/* Report details card */}
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-zinc-50 p-5 mb-8 text-left space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Report ID
          </span>
          <span className="text-sm font-mono text-zinc-700">
            {reportId.slice(0, 8)}
          </span>
        </div>
        <div className="h-px bg-zinc-200" />
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Category
          </span>
          <span className="text-sm font-semibold text-zinc-900">
            {categoryLabels[classification.category] ?? classification.category}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Confidence
          </span>
          <span className="text-sm text-zinc-700">{confidencePct}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Severity
          </span>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`w-2.5 h-2.5 rounded-full ${
                  i < classification.severity ? "bg-orange-500" : "bg-zinc-200"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-sm space-y-3">
        <a
          href="/report"
          className="block w-full rounded-full bg-blue-600 py-3.5 text-center text-sm font-semibold text-white active:bg-blue-700 transition-colors"
        >
          Submit Another Report
        </a>
        <a
          href="/"
          className="block w-full rounded-full border border-zinc-300 py-3.5 text-center text-sm font-semibold text-zinc-700 active:bg-zinc-100 transition-colors"
        >
          View Dashboard
        </a>
      </div>
    </div>
  );
}
