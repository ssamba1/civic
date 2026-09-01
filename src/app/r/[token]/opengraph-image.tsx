import { ImageResponse } from "next/og";
import { resolvePublicReport } from "@/lib/public-report";

// OUTFLANK #22, shareable social card per report. Auto-wired by Next.js as the
// og:image / twitter:image for /r/[token]. A resolved report reads "Fixed in N
// days" (organic accountability marketing, every fix advertises the platform);
// an open one shows its live status.
export const runtime = "nodejs";
export const alt = "Civic report status";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
}

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await resolvePublicReport(token);

  const isResolved = report?.publicStatus === "resolved";
  const headline =
    report && isResolved && report.resolvedAt
      ? `Fixed in ${daysBetween(report.filedAt, report.resolvedAt)} days`
      : (report?.statusLabel ?? "Report status");
  const category = report?.categoryLabel ?? "Civic report";
  const accent = report?.categoryColor ?? "#4f46e5";

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0b0b0f",
        color: "#fafafa",
        padding: "72px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 9999,
            background: accent,
          }}
        />
        <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>
          Civic
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ fontSize: 30, color: "#a1a1aa" }}>{category}</div>
        <div
          style={{
            fontSize: isResolved ? 100 : 76,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.05,
            color: isResolved ? "#4ade80" : "#fafafa",
          }}
        >
          {headline}
        </div>
      </div>

      <div style={{ fontSize: 26, color: "#71717a" }}>
        Residents photograph it. AI files the work order. The city fixes it.
      </div>
    </div>,
    { ...size },
  );
}
