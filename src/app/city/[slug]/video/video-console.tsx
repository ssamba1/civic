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
    <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
          Upload
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
          aria-label="Video clip file"
          className="min-w-0 flex-1 text-[13px]"
        />
        <input
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="Lat"
          aria-label="Clip start latitude"
          className="h-8 w-24 rounded-md border border-hairline-strong bg-transparent px-2 text-[13px] text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60"
        />
        <input
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="Lng"
          aria-label="Clip start longitude"
          className="h-8 w-24 rounded-md border border-hairline-strong bg-transparent px-2 text-[13px] text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60"
        />
        <button
          type="button"
          onClick={upload}
          disabled={busy}
          className="inline-flex h-8 flex-shrink-0 items-center rounded-md bg-accent px-3 text-[13px] font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload & process"}
        </button>
      </div>
      {message && <p className="mt-1.5 text-[13px] text-subtle">{message}</p>}
      <p className="mt-1.5 text-[11px] text-faint">
        Without a start location (or GPS track) detections can only be grouped
        visually and cannot auto-dispatch.
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
          className="inline-flex h-7 items-center rounded-md border border-hairline-strong px-2 text-xs text-subtle transition-colors hover:bg-overlay hover:text-foreground disabled:opacity-50"
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
          className="inline-flex h-7 items-center rounded-md border border-hairline-strong px-2 text-xs text-subtle transition-colors hover:bg-overlay hover:text-foreground"
        >
          View frame
        </button>
      )}
      {error && (
        <span className="text-xs text-[var(--status-danger-fg)]">{error}</span>
      )}
    </span>
  );
}
