import "server-only";

import QRCode from "qrcode";

/* ==================================================================
   QR walk-up reporting (NEXT_100 #16).

   A printed QR on a bus stop, park sign, or failing asset encodes a deep-link
   into the report flow with the location pre-tagged, so a resident scans and
   files without typing an address or fighting flaky GPS — and without an
   account. No competitor turns physical infrastructure into intake points.
   Server-only: `qrcode` is a Node lib, and QR generation is an operator task.
   ================================================================== */

export interface WalkupTarget {
  lat: number;
  lng: number;
  /** Optional asset/site id, echoed into the URL for later attribution. */
  asset?: string | null;
}

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

/**
 * Build the deep-link a walk-up QR encodes: the report flow with lat/lng (and
 * optional asset id) pre-filled. Coordinates are rounded to ~1m precision.
 */
export function buildWalkupUrl(target: WalkupTarget): string {
  const qs = new URLSearchParams({
    lat: target.lat.toFixed(5),
    lng: target.lng.toFixed(5),
  });
  if (target.asset?.trim()) qs.set("asset", target.asset.trim());
  return `${siteBase()}/report?${qs.toString()}`;
}

/**
 * Render a walk-up QR as a self-contained SVG string (crisp at any print size,
 * no image host needed). Throws only on an invalid payload — callers guard the
 * coordinates first.
 */
export async function renderWalkupQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
  });
}
