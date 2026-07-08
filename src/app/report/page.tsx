"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureResidentProfile } from "@/app/user/actions";
import CameraCapture from "@/components/report/camera-capture";
import DuplicateCheck from "@/components/report/duplicate-check";
import EmergencyInterstitial from "@/components/report/emergency-interstitial";
import { ensureAnonSession } from "@/components/report/ensure-anon-session";
import PhotoPreview from "@/components/report/photo-preview";
import SubmissionConfirmation from "@/components/report/submission-confirmation";
import { ASYNC_CLASSIFY } from "@/lib/ai/config";
import { createBrowserSupabase } from "@/lib/db/browser-client";
import { blurFacesAndPlates } from "@/lib/privacy/blur";
import type { Classification } from "@/lib/types";
import { computeAHash } from "@/lib/utils/phash";
import type { DuplicateCandidate } from "./actions";
import {
  checkPotentialDuplicate,
  linkAsDuplicate,
  reverseGeocode,
  submitReport,
} from "./actions";

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
      name: "duplicate_check";
      photo: File;
      photoBlurred: string;
      photoOriginal: string;
      phash: string;
      newPhotoDataUrl: string;
      description: string | null;
      tags: string[];
      issueType: string | null;
      candidate: DuplicateCandidate;
    }
  | { name: "confirming_link"; primaryReportId: string }
  | { name: "linked"; primaryReportId: string }
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
  // Reuses a persisted session (cookies/localStorage) when present and only
  // signs up an anonymous guest when there genuinely is none — the shared
  // Supabase project's signup rate limit (429) trips fast if every /report load
  // mints a new session. ensureAnonSession dedupes concurrent callers and backs
  // off on 429; surface an honest, specific error on failure so the resident
  // isn't left to discover it at submit time. Best-effort here — the submit
  // handler re-checks and retries, so a transient failure now isn't terminal.
  useEffect(() => {
    let active = true;
    ensureAnonSession().then((res) => {
      if (active && !res.ok) setError(res.error);
      // Self-heal the resident's public.users row so the status-change
      // notification trigger has a row to write against — a /report-only
      // reporter never visits /user (where AnonBootstrap does this), so
      // without it a first-time filer gets no resolution email. Idempotent,
      // best-effort, and a silent no-op when Supabase is unconfigured.
      if (res.ok) void ensureResidentProfile();
    });
    return () => {
      active = false;
    };
  }, []);

  // Reverse-geocode the acquired GPS fix into a human-readable address and
  // pre-fill the editable manual-address field — never clobbering a value the
  // resident has already typed. Keyed on the coordinate so it runs once per fix.
  const reverseGeocodedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!location) return;
    const key = `${location.lat},${location.lng}`;
    if (reverseGeocodedFor.current === key) return;
    reverseGeocodedFor.current = key;
    let active = true;
    reverseGeocode({ lat: location.lat, lng: location.lng }).then((res) => {
      if (!active || !res.ok) return;
      setAddress((prev) => (prev?.trim() ? prev : res.data.address));
    });
    return () => {
      active = false;
    };
  }, [location]);

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

  const doSubmit = useCallback(
    async (
      photo: File,
      photoBlurred: string,
      photoOriginal: string,
      phash: string,
      description: string | null,
      tags: string[],
    ) => {
      try {
        const result = await submitReport({
          photoBlurred,
          photoOriginal,
          location,
          address,
          description,
          tags,
          phash,
        });

        if (!result.ok) {
          // Stay on preview so the user can retry; surface the server error.
          // Map the raw "unauthenticated" tag to something actionable — it means
          // the session didn't reach the server (cookie not yet written / rate
          // limited), not that the resident did anything wrong.
          setError(
            result.error === "unauthenticated"
              ? "Session not ready yet. Please tap Submit again in a moment."
              : (result.error ?? "Submission failed. Please try again."),
          );
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
    [location, address],
  );

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

      let photoBlurred: string;
      let photoOriginal: string;
      try {
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

      const session = await ensureAnonSession();
      if (!session.ok) {
        setError(session.error);
        setStep({ name: "preview", photo });
        return;
      }

      const phash = await computeAHash(
        `data:image/webp;base64,${photoBlurred}`,
      );

      if (location) {
        const dupResult = await checkPotentialDuplicate({
          lat: location.lat,
          lng: location.lng,
          phash,
          category: issueType,
        });
        if (dupResult.ok && dupResult.data.length > 0) {
          setStep({
            name: "duplicate_check",
            photo,
            photoBlurred,
            photoOriginal,
            phash,
            newPhotoDataUrl: `data:image/webp;base64,${photoBlurred}`,
            description,
            tags,
            issueType,
            candidate: dupResult.data[0],
          });
          return;
        }
      }

      await doSubmit(
        photo,
        photoBlurred,
        photoOriginal,
        phash,
        description,
        tags,
      );
    },
    [step, location, doSubmit],
  );

  const handleConfirmDuplicate = useCallback(async () => {
    if (step.name !== "duplicate_check") return;
    const primaryId = step.candidate.id;
    setStep({ name: "confirming_link", primaryReportId: primaryId });
    await linkAsDuplicate(primaryId);
    setStep({ name: "linked", primaryReportId: primaryId });
  }, [step]);

  const handleDenyDuplicate = useCallback(async () => {
    if (step.name !== "duplicate_check") return;
    const { photo, photoBlurred, photoOriginal, phash, description, tags } =
      step;
    setStep({ name: "submitting", photo });
    await doSubmit(
      photo,
      photoBlurred,
      photoOriginal,
      phash,
      description,
      tags,
    );
  }, [step, doSubmit]);

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

      {/* Camera-step address fallback — clears notch via pt-safe. Left padding
          leaves room for the back button. On the preview/review step the address
          field lives inside PhotoPreview (always editable + privacy notice), so
          this overlay is scoped to the camera step to avoid a duplicate input. */}
      {gpsStatus === "manual" && step.name === "camera" && (
        <div className="absolute top-0 left-0 right-0 z-30 pt-safe pl-16 pr-4">
          <input
            type="text"
            value={address ?? ""}
            onChange={(e) => setAddress(e.target.value || null)}
            aria-label="Address or intersection"
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
          address={address}
          onAddressChange={setAddress}
          onRetake={handleRetake}
          onSubmit={handleSubmit}
          submitting={step.name === "submitting"}
        />
      )}

      {step.name === "duplicate_check" && (
        <DuplicateCheck
          newPhotoDataUrl={step.newPhotoDataUrl}
          candidate={step.candidate}
          onConfirm={handleConfirmDuplicate}
          onDeny={handleDenyDuplicate}
          confirming={false}
        />
      )}

      {step.name === "confirming_link" && (
        <DuplicateCheck
          newPhotoDataUrl=""
          candidate={{
            id: step.primaryReportId,
            photo_public_url: "",
            address: null,
            category: null,
            created_at: new Date().toISOString(),
            distance_m: 0,
            score: 1,
          }}
          onConfirm={() => {}}
          onDeny={() => {}}
          confirming={true}
        />
      )}

      {step.name === "linked" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center pb-safe">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
            <svg
              className="h-8 w-8 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Thanks!</h1>
          <p className="text-base text-faint">
            Your sighting has been noted and will boost the priority of the
            existing report so staff address it sooner.
          </p>
        </div>
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
