"use client";

import { useState, useMemo, useEffect } from "react";
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

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const previewUrl = useMemo(() => URL.createObjectURL(photo), [photo]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Captured photo preview"
          className="w-full h-full object-cover"
        />

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
                  className={`rounded-full px-3 py-2 text-xs font-medium transition-colors min-h-[44px] flex items-center ${
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

          {/* Optional description */}
          {!showDescription ? (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="w-full text-left text-sm text-zinc-400 min-h-[44px] px-3 rounded-lg border border-zinc-800 active:bg-zinc-800 transition-colors flex items-center"
            >
              + Add description (optional)
            </button>
          ) : (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue..."
              rows={3}
              maxLength={500}
              autoFocus
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
            />
          )}

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
              onClick={() => onSubmit(description.trim() || null, tags, issueType)}
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
