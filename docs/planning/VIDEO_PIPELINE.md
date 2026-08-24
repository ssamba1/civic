# Video damage mapping — two-stage pipeline (NEXT_100 #70)

Status: **phase 1 shipped dark** (branch `claude/vision-model-full-reports-x421ha`, flag `VIDEO_PIPELINE`).

## Why

Resident photo intake only sees what residents bother to report. Camera feeds
(dashcams on city trucks, fixed CCTV, phone-as-dashcam) see every street on
every pass — but running a hosted vision model over hours of video is cost-
prohibitive and unnecessary. The fix is a two-stage split:

1. **Stage 1 — LLM-free damage mapping (continuous, ~free).** ffmpeg samples
   frames; a local ONNX road-damage detector (YOLOv8-style, RDD2022 classes)
   flags candidates; aHash + PostGIS clustering collapses repeat sightings of
   the same defect into one `detection_cluster`. No model API is ever called.
2. **Stage 2 — LLM decision run (rare, on escalation only).** A cluster
   crossing `VIDEO_ESCALATE_MIN_CONF` gets ONE Gemini call over the best
   evidence frame plus in-DB context — nearby open reports (merge candidates),
   SLA targets, the city's crew catalog, past staff corrections. The model
   returns a **cited decision** (`dispatch` / `merge` / `monitor` / `dismiss`)
   with severity, category, cost band, and citations; everything persists as
   the cluster's `decision_dossier`. A `dispatch` decision spins off a normal
   `reports` row that flows through the existing classify/work-order pipeline
   unchanged (work order, SLA stamp, crew assign, Open311 export all free).

Competitive note: vialytics does drive-by road assessment but creates work
orders manually and has no resident channel. This pipeline plus the existing
resident intake is the moat combination (leadgen/civic_research_findings.md).

## Phase 1 (this PR)

- Migration `20260824_056_video_pipeline.sql`: `video_feeds` (kind =
  `upload | rtsp | phone` from day one), `video_clips`, `damage_detections`,
  `detection_clusters`; staff-only RLS; private `video-clips` /
  `video-frames` buckets; `find_nearby_detection_cluster` PostGIS RPC.
- `src/lib/video/*`: frame extraction (system ffmpeg), ONNX detector
  (`onnxruntime-node`, optionalDependency, graceful degrade), server-side
  aHash, GPS-track interpolation, clustering, stage-2 decision run.
- Staff console at `/city/[slug]/video` (flag-gated, real-staff-only):
  direct-to-storage clip upload, clip/cluster status, manual decision
  trigger, signed-URL frame viewer.
- Privacy: unblurred camera frames never leave private buckets; dispatched
  reports carry `/video-detection-placeholder.svg` publicly and the frame in
  `photos-raw` (30-day TTL bucket) for the classify pipeline.

## Phase 2 — planned

- **RTSP puller worker.** A long-running process outside Next.js that chunks
  live streams into `video_clips` rows (kind `rtsp`) and calls `processClip`.
  Schema is already in place; the worker is deploy infra.
- **City-uploaded docs + RAG in the dossier.** Maintenance manuals / policy
  PDFs per city, embedded with the existing embeddings infra, retrieved into
  the stage-2 prompt so citations can point at policy text, not just DB rows.
- **Move processing off the request lifecycle** (queue + worker) once clip
  volume outgrows `after()`.

## Phase 3 — planned

- **Phone-as-dashcam PWA**: record while driving, chunked uploads with a GPS
  track (kind `phone`). Battery/permission constraints on iOS are the risk.
- Golden-set eval for the detector (mirror `pnpm eval` for classifications).

## Operational requirements

See `docs/runbooks/video-pipeline.md` — ffmpeg on the host, model fetch via
`scripts/fetch-video-model.mjs`, and the `VIDEO_*` env flags.
