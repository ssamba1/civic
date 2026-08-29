import { existsSync } from "node:fs";
import { join } from "node:path";
import { HelpCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_META, KNOWN_CITIES } from "@/lib/dashboard-data";
import { createServerClient } from "@/lib/db/client";
import { getStaffAccessForCity } from "@/lib/staff-access";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { VIDEO_PIPELINE } from "@/lib/video/config";
import {
  ClipList,
  ClipStage,
  ClipStudioProvider,
  type TheaterClip,
  type TheaterEvent,
} from "./clip-theater";
import { type DetectionBox, EvidenceFrameButton } from "./evidence-frame";
import { type GeneratedReport, ReportInline } from "./report-inline";
import { ClusterRowActions, UploadClip } from "./video-console";

// Staff-gated per-request surface (cookies) — never prerender or cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "Civic | Video damage mapping",
};

interface ClipRow {
  id: string;
  status: string;
  created_at: string;
  storage_path: string;
  frames_sampled: number | null;
  detections_found: number | null;
  error: string | null;
}

interface ClusterRow {
  id: string;
  class: string;
  max_confidence: number;
  frame_count: number;
  status: string;
  decision: string | null;
  decision_rationale: string | null;
  best_detection_id: string | null;
  report_id: string | null;
  merged_report_id: string | null;
}

interface DetectionRow {
  id: string;
  frame_path: string;
  /** jsonb — normalized 0..1 top-left, `{x,y,w,h,conf}`. */
  bbox: unknown;
  class: string;
  confidence: number;
}

/** Evidence a cluster's frame carries: signed URL + the box drawn on it. */
interface FrameEvidence {
  url: string;
  box: DetectionBox | null;
  label: string;
}

/**
 * `bbox` is jsonb: a legacy or half-written row can hold null, a string, or
 * partial keys. Anything that isn't four finite numbers yields no box at all —
 * a NaN-positioned overlay would be worse than showing the bare frame.
 */
function parseBox(raw: unknown): DetectionBox | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const nums = (["x", "y", "w", "h"] as const).map((k) => Number(b[k]));
  if (!nums.every((n) => Number.isFinite(n))) return null;
  const [x, y, w, h] = nums as [number, number, number, number];
  const conf = Number(b.conf);
  return { x, y, w, h, conf: Number.isFinite(conf) ? conf : undefined };
}

const STATUS_LABEL: Record<string, string> = {
  candidate: "Candidate",
  escalated: "Needs manual dispatch",
  dispatched: "Dispatched",
  monitoring: "Monitoring",
  dismissed: "Dismissed",
  merged: "Merged",
};

const EYEBROW =
  "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint";

// Per-index divider classes for the 5-cell strip: 2-col mobile grid folds to a
// single 5-col row on desktop. Cells share one surface; dividers, not gaps.
const KPI_BORDERS = [
  "border-r border-b lg:border-b-0 border-hairline",
  "border-b lg:border-b-0 lg:border-r border-hairline",
  "border-r border-b lg:border-b-0 border-hairline",
  "border-b lg:border-b-0 lg:border-r border-hairline",
  "",
];

function KpiStrip({ cells }: { cells: { label: string; value: number }[] }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
      <div className="grid grid-cols-2 lg:grid-cols-5">
        {cells.map((cell, idx) => (
          <div
            key={cell.label}
            className={`px-4 py-4 sm:px-5 sm:py-5 min-h-[80px] transition-colors hover:bg-overlay ${KPI_BORDERS[idx]}`}
          >
            <span
              className={`${EYEBROW} mb-2.5 block tracking-[0.08em] leading-none`}
            >
              {cell.label}
            </span>
            <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
              {cell.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Local demo: the detector's rendered overlay clip, if present. The 42 MB mp4
 * is a gitignored local artifact (public/demo/ — see .gitignore), so this card
 * simply disappears on deploys that don't carry it.
 */
function DemoClipCard() {
  const demoPath = join(process.cwd(), "public", "demo", "civic-demo-clip.mp4");
  if (!existsSync(demoPath)) return null;
  return (
    <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 sm:p-5">
      <h2 className={`${EYEBROW} mb-1`}>Demo clip</h2>
      <p className="mb-3 text-xs text-subtle">
        Sample dashcam pass with the detector&apos;s damage overlays rendered in
        — click play to watch the pipeline&apos;s output. Seed matching table
        rows with <code>node scripts/seed-demo-video.mjs</code>.
      </p>
      {/* biome-ignore lint/a11y/useMediaCaption: synthetic demo footage has no dialogue */}
      <video
        src="/demo/civic-demo-clip.mp4"
        controls
        preload="metadata"
        className="aspect-video w-full rounded-[var(--radius-lg)] border border-hairline"
      />
    </section>
  );
}

export default async function VideoPipelinePage({ params }: PageProps) {
  const { slug } = await params;
  if (!VIDEO_PIPELINE) notFound();
  const access = await getStaffAccessForCity(slug);
  if (access !== "real") notFound();

  // DB first (provisioned cities), then the KNOWN_CITIES fallback (demo
  // deploy / local dev without a database) — same convention as the team
  // pages. Without a DB row there is no city id, so the tables render empty
  // and uploads fail with a visible error rather than the page 404ing.
  const db = createServerClient();
  const { data: dbCity } = await db
    .from("cities")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle<{ id: string; name: string }>();
  const known = KNOWN_CITIES[slug];
  if (!dbCity && !known) notFound();
  const city = dbCity ?? { id: null, name: known.name };

  const [{ data: clips }, { data: clusters }] = city.id
    ? await Promise.all([
        db
          .from("video_clips")
          .select(
            "id, status, created_at, storage_path, frames_sampled, detections_found, error",
          )
          .eq("city_id", city.id)
          .order("created_at", { ascending: false })
          .limit(20),
        db
          .from("video_detection_clusters")
          .select(
            "id, class, max_confidence, frame_count, status, decision, decision_rationale, best_detection_id, report_id, merged_report_id",
          )
          .eq("city_id", city.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ])
    : [{ data: [] }, { data: [] }];

  const clipRows = (clips ?? []) as ClipRow[];
  const clusterRows = (clusters ?? []) as ClusterRow[];

  // Resolve the evidence-frame path of each cluster's best detection.
  const bestIds = clusterRows
    .map((c) => c.best_detection_id)
    .filter((id): id is string => !!id);
  const framePathById = new Map<string, string>();
  // Detector box + label per best detection, so the modal can draw the box on
  // the frame it actually belongs to (the cluster's max_confidence can come
  // from a different frame than the one being shown).
  const evidenceByDetection = new Map<
    string,
    { box: DetectionBox | null; label: string }
  >();
  if (bestIds.length > 0) {
    const { data: dets } = await db
      .from("damage_detections")
      .select("id, frame_path, bbox, class, confidence")
      .in("id", bestIds);
    for (const d of (dets ?? []) as DetectionRow[]) {
      framePathById.set(d.id, d.frame_path);
      evidenceByDetection.set(d.id, {
        box: parseBox(d.bbox),
        label: `${d.class} · ${Number(d.confidence).toFixed(2)}`,
      });
    }
  }

  // Evidence frames live in the private video-frames bucket. Mint a
  // short-lived signed URL for EVERY cluster that has one — the row renders it
  // as a thumbnail, so an operator never has to click through to see it.
  const frameByCluster = new Map<string, FrameEvidence>();
  await Promise.all(
    clusterRows.map(async (cluster) => {
      const detectionId = cluster.best_detection_id;
      const path = detectionId ? framePathById.get(detectionId) : undefined;
      if (!path || !detectionId) return;
      const { data: signed } = await db.storage
        .from("video-frames")
        .createSignedUrl(path, 600);
      if (!signed?.signedUrl) return;
      const evidence = evidenceByDetection.get(detectionId);
      frameByCluster.set(cluster.id, {
        url: signed.signedUrl,
        box: evidence?.box ?? null,
        label:
          evidence?.label ??
          `${cluster.class} · ${cluster.max_confidence.toFixed(2)}`,
      });
    }),
  );

  // Reports generated by dispatch decisions. Read straight off `reports`
  // (not dashboard_reports_view, which drops `description` for PII reasons) —
  // safe here because this page is gated on staff access === "real".
  const reportIds = clusterRows
    .map((c) => c.report_id)
    .filter((id): id is string => !!id);
  const reportById = new Map<string, GeneratedReport>();
  if (reportIds.length > 0) {
    const { data: reportRows } = await db
      .from("reports")
      .select(
        "id, address, description, status, created_at, photo_public_url, classifications(category, severity)",
      )
      .in("id", reportIds);

    const frameUrlByReport = new Map<string, string>();
    for (const cluster of clusterRows) {
      const evidence = frameByCluster.get(cluster.id);
      if (cluster.report_id && evidence)
        frameUrlByReport.set(cluster.report_id, evidence.url);
    }

    type Classification = { category: string; severity: number };
    type ReportRow = {
      id: string;
      address: string | null;
      description: string | null;
      status: ReportStatus;
      created_at: string;
      photo_public_url: string | null;
      // PostgREST returns a one-to-one embed as an object or a single-element
      // array depending on how it resolves the relationship — handle both.
      classifications: Classification | Classification[] | null;
    };
    for (const row of (reportRows ?? []) as ReportRow[]) {
      const cls = Array.isArray(row.classifications)
        ? (row.classifications[0] ?? null)
        : row.classifications;
      const category = (cls?.category ?? "other") as ReportCategory;
      reportById.set(row.id, {
        id: row.id,
        address: row.address,
        description: row.description,
        status: row.status,
        created_at: row.created_at,
        category: CATEGORY_META[category] ? category : "other",
        severity: ((cls?.severity ?? 3) as 1 | 2 | 3 | 4 | 5) ?? 3,
        imageUrl: frameUrlByReport.get(row.id) ?? row.photo_public_url ?? null,
      });
    }
  }

  // ---- Clip theater -------------------------------------------------------
  // Playable source for each clip. `createSignedUrl` fails for a path with no
  // object behind it, which is exactly the "no playable media" case.
  const videoUrlByClip = new Map<string, string>();
  await Promise.all(
    clipRows.map(async (clip) => {
      const { data: signed } = await db.storage
        .from("video-clips")
        .createSignedUrl(clip.storage_path, 3600);
      if (signed?.signedUrl) videoUrlByClip.set(clip.id, signed.signedUrl);
    }),
  );

  // Which cluster fires at which second of which clip — one query for all
  // clips, folded to the earliest sampled frame per cluster.
  const clusterById = new Map(clusterRows.map((c) => [c.id, c]));
  const eventsByClip = new Map<string, TheaterEvent[]>();
  if (clipRows.length > 0) {
    const { data: detRows } = await db
      .from("damage_detections")
      .select("clip_id, cluster_id, frame_ts_s, class, confidence")
      .in(
        "clip_id",
        clipRows.map((c) => c.id),
      )
      .not("cluster_id", "is", null);

    type DetRow = {
      clip_id: string;
      cluster_id: string;
      frame_ts_s: number | string;
      class: string;
      confidence: number;
    };
    // Keyed `clipId|clusterId` — a cluster can only belong to one clip, but
    // keeping the clip in the key keeps the grouping honest either way.
    const firstByKey = new Map<string, TheaterEvent & { clipId: string }>();
    for (const row of (detRows ?? []) as DetRow[]) {
      const ts = Number(row.frame_ts_s);
      if (!Number.isFinite(ts)) continue;
      const key = `${row.clip_id}|${row.cluster_id}`;
      const existing = firstByKey.get(key);
      if (existing && existing.tsSeconds <= ts) continue;
      const cluster = clusterById.get(row.cluster_id);
      const reportId = cluster?.report_id ?? null;
      const evidence = frameByCluster.get(row.cluster_id) ?? null;
      firstByKey.set(key, {
        clipId: row.clip_id,
        clusterId: row.cluster_id,
        tsSeconds: ts,
        class: cluster?.class ?? row.class,
        confidence: cluster?.max_confidence ?? row.confidence,
        frameUrl: evidence?.url ?? null,
        frameBox: evidence?.box ?? null,
        frameLabel: evidence?.label ?? null,
        report: reportId ? (reportById.get(reportId) ?? null) : null,
      });
    }
    for (const { clipId, ...event } of firstByKey.values()) {
      const list = eventsByClip.get(clipId);
      if (list) list.push(event);
      else eventsByClip.set(clipId, [event]);
    }
    for (const list of eventsByClip.values())
      list.sort((a, b) => a.tsSeconds - b.tsSeconds);
  }

  const theaterClips: TheaterClip[] = clipRows.map((clip) => ({
    id: clip.id,
    createdAt: clip.created_at,
    status: clip.status,
    framesSampled: clip.frames_sampled,
    detectionsFound: clip.detections_found,
    error: clip.error,
    videoUrl: videoUrlByClip.get(clip.id) ?? null,
    // The committed per-frame track belongs to the seeded demo pass only —
    // drawing it over any other clip would map boxes onto the wrong road.
    detectionsUrl: clip.storage_path.endsWith("demo-sample.mp4")
      ? "/demo/detections.json"
      : null,
    events: eventsByClip.get(clip.id) ?? [],
  }));
  const hasPlayableClip = theaterClips.some((c) => c.videoUrl);

  const kpis = [
    { label: "Clips", value: clipRows.length },
    {
      label: "Frames scanned",
      value: clipRows.reduce((sum, c) => sum + (c.frames_sampled ?? 0), 0),
    },
    {
      label: "Detections",
      value: clipRows.reduce((sum, c) => sum + (c.detections_found ?? 0), 0),
    },
    { label: "Clusters", value: clusterRows.length },
    { label: "Reports created", value: reportIds.length },
  ];

  return (
    <ClipStudioProvider clips={theaterClips} slug={slug}>
      {/* Same page shell as the Teams/Analytics tabs: 1800px content column,
          pt-city-content for the mobile fixed-header offset, hairline footer. */}
      <div className="flex flex-col min-h-dvh bg-background">
        <div className="flex-grow mx-auto w-full max-w-[1800px] space-y-4 px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
          {/* Compact page header — single slim row, like every other tab. */}
          <section className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Video
            </h1>
            <p className="max-w-[80ch] text-[13px] text-faint">
              Clips are scanned by a local detector (no AI-model cost); only
              confident detection clusters trigger an AI decision run, and only
              dispatch decisions create reports.
            </p>
          </section>

          <KpiStrip cells={kpis} />

          <ClipStage />

          {/* The pre-rendered overlay reel is only worth showing when no clip in
          the table has a playable object to drive the live theater. */}
          {!hasPlayableClip && <DemoClipCard />}

          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className={EYEBROW}>Detections</h2>
              <span className="font-mono text-[11px] tabular-nums text-faint">
                {clusterRows.length} clusters
              </span>
            </div>
            {clusterRows.length > 0 ? (
              // Cards, not one long list: past ~1500px a single full-width row
              // strands its middle column, so the grid folds to two.
              <div className="grid gap-3 2xl:grid-cols-2">
                {clusterRows.map((cluster) => {
                  const evidence = frameByCluster.get(cluster.id) ?? null;
                  const report = cluster.report_id
                    ? (reportById.get(cluster.report_id) ?? null)
                    : null;
                  const thumbUrl = evidence?.url ?? report?.imageUrl ?? null;
                  return (
                    <div
                      key={cluster.id}
                      className="flex flex-wrap items-start gap-3 rounded-[var(--radius-lg)] border border-hairline bg-surface p-3 transition-colors hover:bg-overlay sm:flex-nowrap"
                    >
                      <div className="relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-hairline bg-overlay">
                        {thumbUrl ? (
                          // Click opens the WHOLE frame with the detector's box
                          // drawn back on it — the thumbnail crops away the
                          // context that makes the box readable.
                          <EvidenceFrameButton
                            src={thumbUrl}
                            box={evidence?.box ?? null}
                            label={evidence?.label}
                            alt={`Evidence frame for ${cluster.class}`}
                            title={cluster.class}
                            subtitle={`${cluster.max_confidence.toFixed(2)} confidence · ${cluster.frame_count} frames`}
                            className="h-full w-full"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-faint">
                            <HelpCircle
                              className="h-5 w-5"
                              strokeWidth={1.75}
                            />
                          </span>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-foreground leading-tight">
                          <span className="font-medium">{cluster.class}</span>
                          <span className="tabular-nums text-subtle">
                            {cluster.max_confidence.toFixed(2)} conf
                          </span>
                          <span className="tabular-nums text-faint">
                            {cluster.frame_count} frames
                          </span>
                          <span className={EYEBROW}>
                            {STATUS_LABEL[cluster.status] ?? cluster.status}
                          </span>
                        </p>
                        {report && <ReportInline report={report} />}
                      </div>

                      <div className="flex w-full flex-shrink-0 flex-col items-start gap-1.5 sm:w-64 sm:items-end">
                        <ClusterRowActions
                          slug={slug}
                          clusterId={cluster.id}
                          status={cluster.status}
                          // Thumbnail already shows the frame; the pop-out button
                          // only earns its place when no URL could be minted.
                          framePath={
                            thumbUrl || !cluster.best_detection_id
                              ? null
                              : (framePathById.get(cluster.best_detection_id) ??
                                null)
                          }
                        />
                        {cluster.decision && (
                          <div className="text-xs sm:text-right">
                            <span className="font-medium text-subtle">
                              {cluster.decision}
                            </span>
                            {cluster.decision_rationale && (
                              <p className="mt-0.5 line-clamp-3 text-faint">
                                {cluster.decision_rationale}
                              </p>
                            )}
                          </div>
                        )}
                        {cluster.report_id && (
                          // No per-report detail route exists yet — the grid is the
                          // canonical staff surface for dispatched work orders.
                          <Link
                            className="text-xs text-faint underline transition-colors hover:text-foreground"
                            href={`/city/${slug}/grid`}
                          >
                            Open in grid →
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 text-[13px] text-subtle">
                No detections yet.
              </p>
            )}
          </section>

          {/* Ingest sits beside the run log rather than stacked above it —
              both are narrow, and the log's table wants the wider half. */}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
            <UploadClip slug={slug} />
            <ClipList />
          </div>
        </div>

        <footer className="border-t border-hairline mt-10 pb-safe">
          <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-between gap-3 px-3 py-6 text-[13px] text-faint sm:flex-row sm:px-4 lg:px-6">
            <span>Civic</span>
            <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
          </div>
        </footer>
      </div>
    </ClipStudioProvider>
  );
}
