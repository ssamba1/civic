"use client";

/**
 * Client console for the video damage-mapping pipeline: clip upload (direct
 * PUT to a signed storage URL — the file never transits a server action) and
 * per-cluster decision controls. Deliberately utilitarian — this is a staff
 * ops surface, not a resident page.
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  escalateClusterNow,
  finalizeClip,
  getFrameUrl,
  registerClipUpload,
} from "./actions";

export function UploadClip({ slug }: { slug: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage("Choose a video file first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const registered = await registerClipUpload({
        slug,
        fileName: file.name,
        sizeBytes: file.size,
      });
      if (!registered.ok) {
        setMessage(`Upload refused: ${registered.error}`);
        return;
      }
      const put = await fetch(registered.data.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });
      if (!put.ok) {
        setMessage(`Storage upload failed (${put.status}).`);
        return;
      }
      const latN = Number.parseFloat(lat);
      const lngN = Number.parseFloat(lng);
      const finalized = await finalizeClip({
        slug,
        storagePath: registered.data.storagePath,
        startLat: Number.isFinite(latN) ? latN : null,
        startLng: Number.isFinite(lngN) ? lngN : null,
      });
      if (!finalized.ok) {
        setMessage(`Clip registration failed: ${finalized.error}`);
        return;
      }
      setMessage("Clip uploaded — processing started.");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">Upload a clip</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
          aria-label="Video clip file"
          className="text-sm"
        />
        <input
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="Start lat (optional)"
          aria-label="Clip start latitude"
          className="w-40 rounded-lg border border-border bg-transparent px-2 py-1 text-sm"
        />
        <input
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="Start lng (optional)"
          aria-label="Clip start longitude"
          className="w-40 rounded-lg border border-border bg-transparent px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={upload}
          disabled={busy}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload & process"}
        </button>
      </div>
      {message && <p className="mt-2 text-sm">{message}</p>}
      <p className="mt-2 text-xs opacity-70">
        Without a start location (or GPS track) detections can only be grouped
        visually and cannot auto-dispatch — a location is strongly recommended.
      </p>
    </div>
  );
}

export function ClusterRowActions({
  slug,
  clusterId,
  status,
  framePath,
}: {
  slug: string;
  clusterId: string;
  status: string;
  framePath: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canDecide =
    status === "candidate" || status === "monitoring" || status === "escalated";

  return (
    <span className="inline-flex items-center gap-2">
      {canDecide && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await escalateClusterNow({ slug, clusterId });
              if (!result.ok) setError(result.error);
              router.refresh();
            })
          }
          className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-50"
        >
          {pending ? "Deciding…" : "Run decision"}
        </button>
      )}
      {framePath && (
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              const signed = await getFrameUrl({ slug, framePath });
              if (signed.ok) window.open(signed.data.url, "_blank", "noopener");
              else setError(signed.error);
            })
          }
          className="rounded-lg border border-border px-2 py-1 text-xs"
        >
          View frame
        </button>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </span>
  );
}
