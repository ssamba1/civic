import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { createServerClient } from "@/lib/db/client";
import { getStaffAccessForCity } from "@/lib/staff-access";
import { VIDEO_PIPELINE } from "@/lib/video/config";
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

const STATUS_LABEL: Record<string, string> = {
  candidate: "Candidate",
  escalated: "Needs manual dispatch",
  dispatched: "Dispatched",
  monitoring: "Monitoring",
  dismissed: "Dismissed",
  merged: "Merged",
};

/**
 * Local demo: the detector's rendered overlay clip, if present. The 42 MB mp4
 * is a gitignored local artifact (public/demo/ — see .gitignore), so this card
 * simply disappears on deploys that don't carry it.
 */
function DemoClipCard() {
  const demoPath = join(process.cwd(), "public", "demo", "civic-demo-clip.mp4");
  if (!existsSync(demoPath)) return null;
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-1 text-sm font-semibold">Demo clip</h2>
      <p className="mb-3 text-xs opacity-70">
        Sample dashcam pass with the detector&apos;s damage overlays rendered in
        — click play to watch the pipeline&apos;s output. Seed matching table
        rows with <code>node scripts/seed-demo-video.mjs</code>.
      </p>
      {/* biome-ignore lint/a11y/useMediaCaption: synthetic demo footage has no dialogue */}
      <video
        src="/demo/civic-demo-clip.mp4"
        controls
        preload="metadata"
        className="w-full max-w-2xl rounded-lg border border-border"
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
            "id, status, created_at, frames_sampled, detections_found, error",
          )
          .eq("city_id", city.id)
          .order("created_at", { ascending: false })
          .limit(20),
        db
          .from("detection_clusters")
          .select(
            "id, class, max_confidence, frame_count, status, decision, decision_rationale, best_detection_id, report_id, merged_report_id",
          )
          .eq("city_id", city.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ])
    : [{ data: [] }, { data: [] }];

  // Resolve the evidence-frame path of each cluster's best detection so the
  // "View frame" control can mint a signed URL for it.
  const bestIds = ((clusters ?? []) as ClusterRow[])
    .map((c) => c.best_detection_id)
    .filter((id): id is string => !!id);
  const framePathById = new Map<string, string>();
  if (bestIds.length > 0) {
    const { data: dets } = await db
      .from("damage_detections")
      .select("id, frame_path")
      .in("id", bestIds);
    for (const d of (dets ?? []) as { id: string; frame_path: string }[]) {
      framePathById.set(d.id, d.frame_path);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">
          Video damage mapping — {city.name}
        </h1>
        <p className="mt-1 text-sm opacity-70">
          Clips are scanned by a local detector (no AI-model cost); only
          confident detection clusters trigger an AI decision run, and only
          dispatch decisions create reports.
        </p>
      </header>

      <DemoClipCard />

      <UploadClip slug={slug} />

      <section>
        <h2 className="mb-2 text-sm font-semibold">Recent clips</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Frames</th>
                <th className="px-3 py-2">Detections</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {((clips ?? []) as ClipRow[]).map((clip) => (
                <tr key={clip.id} className="border-b border-border/50">
                  <td className="px-3 py-2">
                    {new Date(clip.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{clip.status}</td>
                  <td className="px-3 py-2">{clip.frames_sampled ?? "—"}</td>
                  <td className="px-3 py-2">{clip.detections_found ?? "—"}</td>
                  <td className="max-w-80 truncate px-3 py-2 text-xs opacity-70">
                    {clip.error ?? ""}
                  </td>
                </tr>
              ))}
              {(clips ?? []).length === 0 && (
                <tr>
                  <td className="px-3 py-3 opacity-70" colSpan={5}>
                    No clips yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Detection clusters</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Frames</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Decision</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {((clusters ?? []) as ClusterRow[]).map((cluster) => (
                <tr
                  key={cluster.id}
                  className="border-b border-border/50 align-top"
                >
                  <td className="px-3 py-2">{cluster.class}</td>
                  <td className="px-3 py-2">
                    {cluster.max_confidence.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">{cluster.frame_count}</td>
                  <td className="px-3 py-2">
                    {STATUS_LABEL[cluster.status] ?? cluster.status}
                    {cluster.report_id && (
                      <div className="text-xs">
                        {/* No per-report detail route exists yet — the grid is
                            the staff surface for dispatched work orders. */}
                        <Link className="underline" href={`/city/${slug}/grid`}>
                          Open in grid
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className="max-w-96 px-3 py-2 text-xs">
                    {cluster.decision ? (
                      <>
                        <span className="font-medium">{cluster.decision}</span>
                        {cluster.decision_rationale && (
                          <p className="mt-1 opacity-70">
                            {cluster.decision_rationale}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="opacity-50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ClusterRowActions
                      slug={slug}
                      clusterId={cluster.id}
                      status={cluster.status}
                      framePath={
                        cluster.best_detection_id
                          ? (framePathById.get(cluster.best_detection_id) ??
                            null)
                          : null
                      }
                    />
                  </td>
                </tr>
              ))}
              {(clusters ?? []).length === 0 && (
                <tr>
                  <td className="px-3 py-3 opacity-70" colSpan={6}>
                    No detections yet — upload a clip above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
