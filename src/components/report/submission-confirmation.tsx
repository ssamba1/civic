"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import Link from "next/link";

import { teamIcon } from "@/components/teams/team-icon";
import {
  resolveIssueTypeMeta,
  resolveIssueTypeTeam,
  useCustomCategories,
} from "@/lib/custom-categories";
import { useCategoryOverrides } from "@/lib/category-overrides";
import { TEAMS } from "@/lib/teams";
import type { Classification } from "@/lib/types";

interface SubmissionConfirmationProps {
  reportId: string;
  classification: Classification;
  /** Manual issue-type pick (built-in category or custom id), or null. */
  manualIssueType?: string | null;
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
  manualIssueType = null,
}: SubmissionConfirmationProps) {
  const confidencePct = Math.round(classification.confidence * 100);
  // confidence === 0 is the offline/fallback sentinel: hide AI details and the
  // synthetic-ID-dependent "Track this report" link (it would 404).
  const hasAiResult = classification.confidence > 0;

  // Resolve a manual issue-type pick to its routing team. Subscribing to both
  // stores keeps this in sync with custom types and any staff re-routes.
  const { categories: customCats } = useCustomCategories();
  useCategoryOverrides();
  const manualMeta = manualIssueType
    ? resolveIssueTypeMeta(manualIssueType, customCats)
    : null;
  const manualTeam = manualIssueType
    ? resolveIssueTypeTeam(manualIssueType, customCats)
    : null;
  const ManualTeamIcon = manualTeam ? teamIcon(TEAMS[manualTeam].icon) : null;

  // Orchestrated reveal after the multi-second submit wait: container fades up,
  // checkmark pops with a soft overshoot, then detail rows stagger in. Wrapped
  // in matchMedia so reduced-motion users get instant content (opacity reset).
  const rootRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { motion } = ctx.conditions as { motion: boolean };
          if (!motion) {
            gsap.set("[data-confirm-fx]", { opacity: 1, y: 0, scale: 1 });
            return;
          }
          // expo.out closely matches cubic-bezier(0.22,1,0.36,1) without needing
          // the CustomEase plugin (GSAP core doesn't parse raw cubic-bezier).
          const ease = "expo.out";
          const tl = gsap.timeline();
          tl.from("[data-confirm-root]", {
            opacity: 0,
            y: 16,
            duration: 0.35,
            ease,
          })
            .from(
              "[data-confirm-check]",
              { opacity: 0, scale: 0.5, duration: 0.34, ease: "back.out(1.7)" },
              "-=0.1",
            )
            .from(
              "[data-confirm-row]",
              {
                opacity: 0,
                y: 8,
                duration: 0.3,
                ease,
                stagger: 0.05,
              },
              "-=0.15",
            );
        },
      );
    },
    { scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      data-confirm-root
      className="flex flex-col items-center justify-center h-full min-h-dvh bg-white px-6 text-center overflow-y-auto pt-safe pb-safe"
    >
      {/* Safe-area inner wrapper so content doesn't clip on notched phones */}
      <div className="flex flex-col items-center w-full max-w-sm py-12">
        {/* Success animation - green check (GSAP back-out pop on mount) */}
        <div
          data-confirm-check
          data-confirm-fx
          className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100"
        >
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
          Thanks for submitting!
        </h1>
        <p className="text-zinc-500 text-sm mb-8">
          We&apos;ll notify you when it&apos;s solved.
        </p>

        {/* Manual issue-type card — shown when the resident picked a type,
            making its routing rule visible (bypasses the AI classifier). */}
        {manualMeta && manualTeam && ManualTeamIcon && (
          <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-5 mb-4 text-left space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Issue type
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: manualMeta.color }}
                  aria-hidden
                />
                {manualMeta.label}
                {manualMeta.isCustom && (
                  <span className="rounded-sm bg-zinc-200 px-1 text-[9px] uppercase tracking-wider text-zinc-500">
                    custom
                  </span>
                )}
              </span>
            </div>
            <div className="h-px bg-zinc-200" />
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Routed to
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium"
                style={{
                  background: `${TEAMS[manualTeam].color}1a`,
                  color: TEAMS[manualTeam].color,
                }}
              >
                <ManualTeamIcon className="h-3.5 w-3.5" strokeWidth={2} />
                {TEAMS[manualTeam].shortLabel}
              </span>
            </div>
          </div>
        )}

        {/* Report details card — only on a real AI result */}
        {hasAiResult && (
          <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-5 mb-8 text-left space-y-3">
            <div data-confirm-row data-confirm-fx className="flex justify-between items-center">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Report ID
              </span>
              <span className="text-sm font-mono text-zinc-700">
                {reportId.slice(0, 8)}
              </span>
            </div>
            <div className="h-px bg-zinc-200" />
            <div data-confirm-row data-confirm-fx className="flex justify-between items-center">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Category
              </span>
              <span className="text-sm font-semibold text-zinc-900">
                {categoryLabels[classification.category] ?? classification.category}
              </span>
            </div>
            <div data-confirm-row data-confirm-fx className="flex justify-between items-center">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Confidence
              </span>
              <span className="text-sm text-zinc-700">{confidencePct}%</span>
            </div>
            <div data-confirm-row data-confirm-fx className="flex justify-between items-center">
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
        )}

        {/* Actions — min-h-[56px] for thumb-reachable targets */}
        <div className="w-full space-y-3">
          {hasAiResult && (
            <Link
              href={`/user/my-reports/${reportId}`}
              className="w-full rounded-full bg-blue-600 min-h-[56px] flex items-center justify-center text-center text-sm font-semibold text-white active:bg-blue-700 transition-colors"
            >
              Track this report
            </Link>
          )}
          <a
            href="/report"
            className="w-full rounded-full border border-zinc-300 min-h-[56px] flex items-center justify-center text-center text-sm font-semibold text-zinc-700 active:bg-zinc-100 transition-colors"
          >
            Submit Another Report
          </a>
          <a
            href="/city/cumming/browse"
            className="w-full rounded-full border border-zinc-300 min-h-[56px] flex items-center justify-center text-center text-sm font-semibold text-zinc-700 active:bg-zinc-100 transition-colors"
          >
            View Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
