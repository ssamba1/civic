"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import CameraCapture from "@/components/report/camera-capture";
import EmergencyInterstitial from "@/components/report/emergency-interstitial";
import PhotoPreview from "@/components/report/photo-preview";
import SubmissionConfirmation from "@/components/report/submission-confirmation";
import { ASYNC_CLASSIFY } from "@/lib/ai/config";
import { createBrowserSupabase } from "@/lib/db/browser-client";
import { blurFacesAndPlates } from "@/lib/privacy/blur";
import type { Classification } from "@/lib/types";
import { submitReport } from "./actions";

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Offline/backend-failure fallback. confidence === 0 signals SubmissionConfirmation
// to hide the AI-details card and the (would-404) "Track this report" link.
const FALLBACK_CLASSIFICATION: Classification = {
  category: "other",
  subcategory: "unclassified",
  severity: 3,
  hazard_radius_m: 0,
  visible_size_estimate: "unknown",
  is_emergency: false,
  confidence: 0,
  reasoning: "",
  no_issue_detected: false,
  alternate_categories: [],
};

// Async-classify path only: if the background job never lands a result (e.g. an
// UNHANDLED throw in the fire-and-forget pipeline), resolve the pending spinner
// to a terminal manual-review state after this deadline so the resident never
// dead-ends on an infinite spinner.
const CLASSIFY_PENDING_TIMEOUT_MS = 20000;

type GpsStatus = "acquiring" | "found" | "manual";

type Step =
  | { name: "camera" }
  | { name: "preview"; photo: File }
  | { name: "submitting"; photo: File }
  | {
      name: "emergency";
      photo: File;
      classification: Classification;
      description: string | null;
      reportId: string;
    }
  // `pending` is only ever set on the async-classify path (flag ON); on the
  // default path it stays undefined so behavior is byte-identical to before.
  | {
      name: "done";
      reportId: string;
      classification: Classification;
      pending?: boolean;
    };

export default function ReportPage() {
  const [step, setStep] = useState<Step>({ name: "camera" });
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("acquiring");
  const [location, setLocation] = useState<{ lng: number; lat: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Manual issue-type pick from the preview (built-in or custom id), or null
  // when the resident let the AI classify. Surfaced on the confirmation so a
  // custom type's routing rule is visible without touching the classifier.
  const [manualIssueType, setManualIssueType] = useState<string | null>(null);

  // Ensure a session exists so submit isn't rejected as unauthenticated.
  // New visitors get a silent anonymous session (guest) — keeps the 2-tap goal.
  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        // Surface the failure now — otherwise an unauthenticated submit falls
        // through to the fake-success `done` screen (handleSubmit's catch), so a
        // dropped session looks like a saved report. supabase-js returns the
        // error in-band rather than rejecting, so check `error`, not `.catch`.
        supabase.auth.signInAnonymously().then(({ error }) => {
          if (error) {
            setError(
              "Could not start a session. Check your connection and refresh.",
            );
          }
        });
      }
    });
  }, []);

  // Auto-acquire GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus("manual");
      return;
    }

    // getCurrentPosition isn't cancellable, so guard the callbacks from running
    // setState after unmount (user navigates away during the 10s timeout).
    let active = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!active) return;
        setLocation({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        setGpsStatus("found");
      },
      () => {
        if (active) setGpsStatus("manual");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
    return () => {
      active = false;
    };
  }, []);

  const handleCapture = useCallback((file: File) => {
    setStep({ name: "preview", photo: file });
  }, []);

  const handleRetake = useCallback(() => {
    setStep({ name: "camera" });
  }, []);

  const handleSubmit = useCallback(
    async (
      description: string | null,
      tags: string[],
      issueType: string | null,
    ) => {
      if (step.name !== "preview") return;

      const photo = step.photo;
      setStep({ name: "submitting", photo });
      setManualIssueType(issueType);
      setError(null);

      // Decode + blur on-device. This can FAIL before anything is submitted —
      // most commonly when the user picks a HEIC from the library on desktop
      // Chrome / Android Chrome, where createImageBitmap rejects (blur.ts:136).
      // That failure must NOT fall through to the success screen (no report was
      // created): show a recoverable error and return to preview so the user can
      // retake or pick a JPEG/PNG. Only genuine POST-submit failures use the
      // fallback-to-done path below.
      let photoBlurred: string;
      let photoOriginal: string;
      try {
        // Blur faces/plates on-device, then send both versions:
        // blurred → public bucket, original → raw bucket (staff-only).
        const { blurred, original } = await blurFacesAndPlates(photo);
        [photoBlurred, photoOriginal] = await Promise.all([
          blobToBase64(blurred),
          blobToBase64(original),
        ]);
      } catch {
        setError(
          "Could not process that image format. Please try a JPEG/PNG or retake the photo.",
        );
        setStep({ name: "preview", photo });
        return;
      }

      try {
        const result = await submitReport({
          photoBlurred,
          photoOriginal,
          location,
          address,
          description,
          tags,
        });

        if (!result.ok) {
          // Stay on preview so the user can retry; surface the server error.
          setError(result.error ?? "Submission failed. Please try again.");
          setStep({ name: "preview", photo });
          return;
        }

        const { id, classification } = result.data;

        // Emergency check
        if (classification.is_emergency) {
          setStep({
            name: "emergency",
            photo,
            classification,
            description,
            reportId: id,
          });
          return;
        }

        // Async-classify path (flag ON): the action returns immediately with a
        // neutral pending sentinel (confidence 0) before the background job
        // runs. Tag the step `pending` so the Realtime effect below subscribes
        // for the real classification. Flag OFF → never pending → unchanged.
        const pending = ASYNC_CLASSIFY && classification.confidence === 0;
        setStep({ name: "done", reportId: id, classification, pending });
      } catch (e) {
        // Network/unexpected error — stay on preview, allow retry.
        setError(
          e instanceof Error
            ? e.message
            : "Unexpected error. Please try again.",
        );
        setStep({ name: "preview", photo });
      }
    },
    [step, location, address],
  );

  const handleEmergencyOverride = useCallback(() => {
    if (step.name !== "emergency") return;
    // Already submitted — just proceed to confirmation with the real report ID
    setStep({
      name: "done",
      reportId: step.reportId,
      classification: step.classification,
    });
  }, [step]);

  // OPTIONAL async-classify path (NEXT_PUBLIC_ASYNC_CLASSIFY=1). When the action
  // returned a pending sentinel, subscribe to Supabase Realtime for the
  // classifications INSERT on this report and upgrade the confirmation UI in
  // place when the background job lands. The INSERT payload carries the full
  // classification, so no follow-up fetch is needed. RLS (classifications_select_own)
  // authorizes the reporter; the table is added to supabase_realtime in
  // migration 007.
  //
  // Fully gated: when the flag is OFF this entire effect is inert (the guard
  // returns immediately and `pending` is never set), so the default path is
  // unchanged. Existing fallback-on-error behavior is untouched — the !result.ok
  // and catch branches never set `pending`, so they never subscribe.
  const isPendingStep = step.name === "done" && step.pending === true;
  const pendingReportId = isPendingStep ? step.reportId : null;
  useEffect(() => {
    if (!ASYNC_CLASSIFY || !pendingReportId) return;

    const supabase = createBrowserSupabase();

    // Guards the inflight one-shot fetch (and any late Realtime payload) from
    // calling setStep after the effect cleans up on unmount.
    let active = true;

    // Terminal/timeout backstop: if neither the Realtime INSERT nor the one-shot
    // fetch lands a real classification within the deadline (the pipeline threw
    // and never persisted a row), stop the pending spinner and settle on the
    // neutral fallback. confidence 0 keeps the AI-details card and the would-404
    // "Track this report" link hidden — the report is already persisted and sits
    // in the staff manual-triage queue, so this is a graceful terminal state, not
    // a dead-end. Cleared on a real result or on unmount.
    const timeout = setTimeout(() => {
      setStep({
        name: "done",
        reportId: pendingReportId,
        classification: FALLBACK_CLASSIFICATION,
        pending: false,
      });
    }, CLASSIFY_PENDING_TIMEOUT_MS);

    // Normalize a classifications row (Realtime payload OR initial fetch) into a
    // Classification and apply it. Ignores the pipeline's neutral fallback
    // (confidence 0) so the pending thanks screen stays up rather than flashing
    // an empty card.
    const applyRow = (
      row: (Partial<Classification> & { confidence?: number }) | null,
    ) => {
      if (!active) return;
      if (!row || typeof row.confidence !== "number" || row.confidence <= 0)
        return;
      clearTimeout(timeout);
      const classification: Classification = {
        category: (row.category as Classification["category"]) ?? "other",
        subcategory: row.subcategory ?? "unclassified",
        severity: (row.severity as Classification["severity"]) ?? 3,
        hazard_radius_m: row.hazard_radius_m ?? 0,
        visible_size_estimate: row.visible_size_estimate ?? "unknown",
        is_emergency: row.is_emergency ?? false,
        confidence: row.confidence,
        reasoning: row.reasoning ?? "",
        no_issue_detected: row.no_issue_detected ?? false,
        alternate_categories: row.alternate_categories ?? [],
      };
      setStep({
        name: "done",
        reportId: pendingReportId,
        classification,
        pending: false,
      });
    };

    const channel = supabase
      .channel(`classify_${pendingReportId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "classifications",
          filter: `report_id=eq.${pendingReportId}`,
        },
        (payload) =>
          applyRow(
            payload.new as Partial<Classification> & { confidence?: number },
          ),
      )
      .subscribe(() => {
        // Subscribe-after-fire race: the background classify is fired server-side
        // before this client subscribes, so an INSERT may land before the channel
        // is live and be lost. Mirror work-order-comments: once subscribed, do a
        // one-shot fetch in case the result already exists. RLS scopes this to the
        // reporter's own report.
        supabase
          .from("classifications")
          .select(
            "category, subcategory, severity, hazard_radius_m, visible_size_estimate, is_emergency, confidence, reasoning",
          )
          .eq("report_id", pendingReportId)
          .maybeSingle()
          .then(({ data }) =>
            applyRow(
              data as
                | (Partial<Classification> & { confidence?: number })
                | null,
            ),
          );
      });

    return () => {
      active = false;
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [pendingReportId]);

  return (
    <div className="fixed inset-0 h-dvh flex flex-col bg-background">
      {/* Error toast — clears notch via pt-safe. Slides down on mount so it
          doesn't hard-pop at the top of the screen mid-submit. */}
      {error && (
        <div className="absolute top-0 left-0 right-0 z-40 pt-safe px-4">
          <style>{`
            @keyframes report-toast-in {
              from { opacity: 0; transform: translateY(-8px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @media (prefers-reduced-motion: no-preference) {
              .report-toast {
                animation: report-toast-in 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
              }
            }
          `}</style>
          <div className="report-toast mt-3 rounded-xl bg-[var(--color-danger)]/90 backdrop-blur-sm px-4 py-3 text-sm text-white font-medium shadow-lg relative">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="absolute top-2 right-3 text-white/70 text-lg min-tap flex items-center justify-center"
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Back-to-home — top-left, clears notch via pt-safe. Camera step only:
          preview has its own Retake, and done/emergency have their own nav. */}
      {step.name === "camera" && (
        <div className="absolute top-0 left-0 z-40 pt-safe pl-4">
          <Link
            href="/"
            aria-label="Back to home"
            className="mt-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm active:scale-90 transition-transform"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.75}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </Link>
        </div>
      )}

      {/* Address fallback input — clears notch via pt-safe. Left padding leaves
          room for the back button. */}
      {gpsStatus === "manual" &&
        step.name !== "done" &&
        step.name !== "emergency" && (
          <div className="absolute top-0 left-0 right-0 z-30 pt-safe pl-16 pr-4">
            <input
              type="text"
              value={address ?? ""}
              onChange={(e) => setAddress(e.target.value || null)}
              placeholder="Enter address or intersection..."
              className="w-full mt-3 rounded-xl border border-hairline bg-glass backdrop-blur-sm px-4 py-3 text-base text-foreground placeholder:text-faint focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        )}

      {/* Step views */}
      {step.name === "camera" && <CameraCapture onCapture={handleCapture} />}

      {(step.name === "preview" || step.name === "submitting") && (
        <PhotoPreview
          photo={step.photo}
          gpsStatus={gpsStatus}
          onRetake={handleRetake}
          onSubmit={handleSubmit}
          submitting={step.name === "submitting"}
        />
      )}

      {step.name === "emergency" && (
        <EmergencyInterstitial onOverride={handleEmergencyOverride} />
      )}

      {step.name === "done" && (
        <SubmissionConfirmation
          reportId={step.reportId}
          classification={step.classification}
          manualIssueType={manualIssueType}
        />
      )}
    </div>
  );
}
