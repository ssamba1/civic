# Runbook: video damage-mapping pipeline

## Enable

1. Apply migration `20260824_056_video_pipeline.sql` (`pnpm db:migrate`).
2. Install **ffmpeg** on the deploy host (`ffmpeg -version` must work for the
   Node process). Frame sampling, detector preprocessing, and aHash all run
   through it. There is no node-level image dependency.
3. Fetch a detector model (YOLOv8-style 640×640 ONNX export trained on
   RDD2022; check the license fits your deployment):

   ```bash
   node scripts/fetch-video-model.mjs <model-url> models/road-damage.onnx
   ```

4. Ensure `onnxruntime-node` installed (it is an optionalDependency, on an
   unsupported platform `pnpm install` skips it and clip processing will fail
   with `detector_unavailable`).
5. Set env and restart:

   ```bash
   VIDEO_PIPELINE=1
   VIDEO_DETECT_MODEL_PATH=/abs/path/models/road-damage.onnx
   # optional overrides:
   # VIDEO_DETECT_CLASSES=longitudinal_crack,transverse_crack,alligator_crack,pothole
   # VIDEO_FRAME_FPS=1
   # VIDEO_ESCALATE_MIN_CONF=0.55
   ```

6. Staff console: `/city/<slug>/video` (real staff of that city only; 404
   when the flag is off).

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Clip `failed`: `ffmpeg binary not found` | ffmpeg missing on host | install ffmpeg |
| Clip `failed`: `detector_not_configured` | `VIDEO_DETECT_MODEL_PATH` unset | fetch model, set env |
| Clip `failed`: `detector_unavailable` | onnxruntime-node not installed / wrong platform | `pnpm rebuild onnxruntime-node`, check platform support |
| Clusters stuck `candidate`, no decisions | confidence below `VIDEO_ESCALATE_MIN_CONF` or Gemini failing (see `error_log`, context `video-decide`) | staff "Run decision" button retries; check `GEMINI_API_KEY` / rate limits |
| Cluster `escalated` after a dispatch decision | cluster has no location, or source clip has no `created_by` | staff dispatches manually from the decision dossier |

All pipeline failures land in `error_log` with contexts `video-pipeline` /
`video-decide`, and on the clip row's `error` column (shown in the console).

## Privacy invariants (do not weaken)

- `video-clips` and `video-frames` buckets stay **private**; frames are
  unblurred city-camera footage. Staff access is via 10-minute signed URLs.
- A dispatched report's `photo_public_url` is the static placeholder
  (`/video-detection-placeholder.svg`). Never a frame. The frame goes to
  `photos-raw` only (restricted, 30-day TTL) for the classify pipeline.

## Cost model

Stage 1 is CPU-only (no API spend) and runs in-process via `after()`. Fine
for manual upload volumes. Stage 2 is at most ONE Gemini call per cluster
per escalation, behind the same global rate limiter as classification.
