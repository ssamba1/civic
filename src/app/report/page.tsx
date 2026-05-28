"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import CameraCapture from "@/components/report/camera-capture";
import PhotoPreview from "@/components/report/photo-preview";
import EmergencyInterstitial from "@/components/report/emergency-interstitial";
import SubmissionConfirmation from "@/components/report/submission-confirmation";
import { submitReport } from "./actions";
import { blurFacesAndPlates } from "@/lib/privacy/blur";
import type { Classification } from "@/lib/types";

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type GpsStatus = "acquiring" | "found" | "manual";

type Step =
  | { name: "camera" }
  | { name: "preview"; photo: File }
  | { name: "submitting"; photo: File }
  | { name: "emergency"; photo: File; classification: Classification; description: string | null; reportId: string }
  | { name: "done"; reportId: string; classification: Classification };

export default function ReportPage() {
  const [step, setStep] = useState<Step>({ name: "camera" });
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("acquiring");
  const [location, setLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref to avoid re-requesting GPS on re-renders
  const gpsRequested = useRef(false);

  // Auto-acquire GPS on mount
  useEffect(() => {
    if (gpsRequested.current) return;
    gpsRequested.current = true;

    if (!navigator.geolocation) {
      setGpsStatus("manual");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        setGpsStatus("found");
      },
      () => {
        setGpsStatus("manual");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleCapture = useCallback((file: File) => {
    setStep({ name: "preview", photo: file });
  }, []);

  const handleRetake = useCallback(() => {
    setStep({ name: "camera" });
  }, []);

  const handleSubmit = useCallback(
    async (description: string | null, tags: string[]) => {
      if (step.name !== "preview") return;

      const photo = step.photo;
      setStep({ name: "submitting", photo });
      setError(null);

      try {
        // Blur faces/plates on-device, then send both versions:
        // blurred → public bucket, original → raw bucket (staff-only).
        const { blurred, original } = await blurFacesAndPlates(photo);
        const [photoBlurred, photoOriginal] = await Promise.all([
          blobToBase64(blurred),
          blobToBase64(original),
        ]);

        const result = await submitReport({
          photoBlurred,
          photoOriginal,
          location,
          address,
          description,
          tags,
        });

        if (!result.ok) {
          setError(result.error);
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

        setStep({ name: "done", reportId: id, classification });
      } catch {
        setError("Something went wrong. Please try again.");
        setStep({ name: "preview", photo });
      }
    },
    [step, location, address]
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

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      {/* Error toast */}
      {error && (
        <div className="absolute top-4 left-4 right-4 z-40 rounded-xl bg-red-500/90 backdrop-blur-sm px-4 py-3 text-sm text-white font-medium shadow-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="absolute top-2 right-3 text-white/70 text-lg"
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {/* Address fallback input */}
      {gpsStatus === "manual" &&
        step.name !== "done" &&
        step.name !== "emergency" && (
          <div className="absolute top-4 left-4 right-4 z-30">
            <input
              type="text"
              value={address ?? ""}
              onChange={(e) => setAddress(e.target.value || null)}
              placeholder="Enter address or intersection..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900/90 backdrop-blur-sm px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
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
        />
      )}
    </div>
  );
}
