"use client";

import { useState } from "react";
import { generateWalkupQr } from "./actions";

/**
 * Operator tool to mint a printable walk-up QR (NEXT_100 #16). Enter a location
 * (and optional asset id), generate the SVG, then print. Stick it on the sign,
 * bus stop, or failing asset. Scanning opens the report flow with the location
 * pre-tagged, no account required.
 */
export function QrTool() {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [asset, setAsset] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; svg: string } | null>(
    null,
  );

  async function handleGenerate() {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || latN < -90 || latN > 90) {
      setError("Enter a valid latitude (-90 to 90).");
      return;
    }
    if (!Number.isFinite(lngN) || lngN < -180 || lngN > 180) {
      setError("Enter a valid longitude (-180 to 180).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await generateWalkupQr({ lat: latN, lng: lngN, asset });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Walk-up QR codes
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Print a QR for a physical location. Residents scan it to file a report
        with the spot pre-tagged, no typing, no account.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Latitude
          </span>
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            inputMode="decimal"
            placeholder="34.207"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Longitude
          </span>
          <input
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            inputMode="decimal"
            placeholder="-84.140"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Asset id (optional)
          </span>
          <input
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="bus-stop-42"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy}
        className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Generating…" : "Generate QR"}
      </button>

      {result && (
        <div className="mt-8 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <div
            className="mx-auto w-[320px] max-w-full [&_svg]:h-auto [&_svg]:w-full"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated SVG from the qrcode lib, not user HTML.
            dangerouslySetInnerHTML={{ __html: result.svg }}
          />
          <p className="mt-4 break-all text-center text-xs text-zinc-500">
            {result.url}
          </p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Print
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
