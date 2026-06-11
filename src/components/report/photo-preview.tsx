"use client";

import { useState, useEffect, useRef } from "react";
import { useCategoryOverrides } from "@/lib/category-overrides";
import {
  builtinIssueTypeOptions,
  customIssueTypeOptions,
  resolveIssueTypeTeam,
  useCustomCategories,
} from "@/lib/custom-categories";
import { TEAMS } from "@/lib/teams";
import { teamIcon } from "@/components/teams/team-icon";

type GpsStatus = "acquiring" | "found" | "manual";

interface PhotoPreviewProps {
  photo: File;
  gpsStatus: GpsStatus;
  onRetake: () => void;
  onSubmit: (
    description: string | null,
    tags: string[],
    issueType: string | null,
  ) => void;
  submitting: boolean;
}

const PRESET_TAGS = ["School zone", "Blocking road", "Recurring", "Safety hazard"];
const BUILTIN_ISSUE_TYPES = builtinIssueTypeOptions();

export default function PhotoPreview({
  photo,
  gpsStatus,
  onRetake,
  onSubmit,
  submitting,
}: PhotoPreviewProps) {
  const [showDescription, setShowDescription] = useState(false);
  const [description, setDescription] = useState("");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [issueType, setIssueType] = useState<string | null>(null);

  // Manual issue-type picker (bypasses the AI classifier). Subscribe to both
  // stores so the "routes to" chip reflects custom types and any staff re-route.
  const { categories: customCats } = useCustomCategories();
  useCategoryOverrides();
  const customIssueTypes = customIssueTypeOptions(customCats);
  const routedTeam = issueType
    ? resolveIssueTypeTeam(issueType, customCats)
    : null;
  const RoutedTeamIcon = routedTeam ? teamIcon(TEAMS[routedTeam].icon) : null;

  // Focus the textarea after it expands (replaces the removed autoFocus, which
  // no longer fits now that the textarea is always mounted for the height anim).
  useEffect(() => {
    if (showDescription) descriptionRef.current?.focus();
  }, [showDescription]);

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Create the object URL inside an effect so React Strict Mode's double-mount
  // doesn't revoke a memoized URL that's still in use. The cleanup revokes only
  // when photo changes or on unmount — never while the <img> is still rendered.
  useEffect(() => {
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [photo]);

  const gpsIndicator: Record<GpsStatus, { label: string; color: string }> = {
    acquiring: { label: "Getting location...", color: "bg-yellow-400" },
    found: { label: "Location attached", color: "bg-green-500" },
    manual: { label: "Enter address below", color: "bg-orange-400" },
  };

  const gps = gpsIndicator[gpsStatus];

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Photo preview */}
      <div className="relative flex-1 min-h-0">
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Captured photo preview"
            className="w-full h-full object-cover"
          />
        )}

        {/* Processing overlay — the on-device blur + upload pipeline can take
            2–5s; this gives clear feedback that work is happening on the photo. */}
        {submitting && (
          <div className="report-processing-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px]">
            <span className="h-9 w-9 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            <span className="report-processing-label text-sm font-medium text-white">
              Processing photo…
            </span>
          </div>
        )}
        <style>{`
          @keyframes report-fade-in-overlay {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .report-processing-overlay {
            animation: report-fade-in-overlay 200ms ease-out both;
          }
          @keyframes report-label-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.55; }
          }
          @media (prefers-reduced-motion: no-preference) {
            .report-processing-label {
              animation: report-label-pulse 1.4s ease-in-out infinite;
            }
          }
        `}</style>

        {/* GPS status badge — offset by safe-area-inset-top so it clears the notch */}
        <div
          className="absolute left-4 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5"
          style={{ top: "max(1rem, calc(1rem + env(safe-area-inset-top, 0px)))" }}
        >
          <span className={`w-2 h-2 rounded-full ${gps.color} ${gpsStatus === "acquiring" ? "animate-pulse" : ""}`} />
          <span className="text-xs text-white font-medium">{gps.label}</span>
        </div>
      </div>

      {/* Bottom controls — pb-safe clears home indicator */}
      <div className="shrink-0 bg-zinc-950 px-4 pt-4 pb-safe">
        <div className="pb-8 space-y-3">
          {/* Issue type — optional manual pick. Skipping it lets the AI
              classify; picking one (incl. custom types) routes by that rule. */}
          <div className="space-y-1.5">
            <label
              htmlFor="issue-type"
              className="block text-xs font-medium text-zinc-400"
            >
              Issue type{" "}
              <span className="text-zinc-600">(optional — AI decides if skipped)</span>
            </label>
            <select
              id="issue-type"
              value={issueType ?? ""}
              onChange={(e) => setIssueType(e.target.value || null)}
              className="w-full min-h-[44px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-white focus:outline-none focus:border-zinc-500"
            >
              <option value="">Let AI decide</option>
              <optgroup label="Standard">
                {BUILTIN_ISSUE_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              {customIssueTypes.length > 0 && (
                <optgroup label="Custom">
                  {customIssueTypes.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {routedTeam && RoutedTeamIcon && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span>Routes to</span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-medium"
                  style={{
                    background: `${TEAMS[routedTeam].color}1a`,
                    color: TEAMS[routedTeam].color,
                  }}
                >
                  <RoutedTeamIcon className="h-3 w-3" strokeWidth={2} />
                  {TEAMS[routedTeam].shortLabel}
                </span>
              </div>
            )}
          </div>

          {/* Quick tags */}
          <div className="flex flex-wrap gap-2">
            {PRESET_TAGS.map((t) => {
              const active = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className={`rounded-full px-3 py-2 text-xs font-medium transition-[color,background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:active:scale-95 min-h-[44px] flex items-center ${
                    active
                      ? "bg-blue-600 text-white"
                      : "border border-zinc-700 text-zinc-300 active:bg-zinc-800"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Optional description — grid-rows height transition avoids the
              instant layout jump when the textarea expands. */}
          {!showDescription && (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="w-full text-left text-sm text-zinc-400 min-h-[44px] px-3 rounded-lg border border-zinc-800 active:bg-zinc-800 transition-colors flex items-center"
            >
              + Add description (optional)
            </button>
          )}
          <div
            className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              showDescription ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <textarea
                ref={descriptionRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue..."
                rows={3}
                maxLength={500}
                tabIndex={showDescription ? 0 : -1}
                aria-hidden={!showDescription}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
              />
            </div>
          </div>

          {/* Action buttons — min-h-[56px] ensures thumb-reachable targets */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onRetake}
              disabled={submitting}
              className="flex-1 rounded-full border border-zinc-700 min-h-[56px] text-sm font-semibold text-white active:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={() => {
                if (submitting) return;
                onSubmit(description.trim() || null, tags, issueType);
              }}
              disabled={submitting}
              className="flex-1 rounded-full bg-blue-600 min-h-[56px] text-sm font-semibold text-white active:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
