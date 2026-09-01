# Detector sidecar: wire contract

The Next.js app talks to this service over plain HTTP at `DETECTOR_URL`. It is
the only network dependency of camera ingest, and it is allowed to be down: the
ingest route answers `503 { retryable: true }` and the depot uploader re-sends
the identical batch.

Callers in the app:

| Endpoint | Caller |
|---|---|
| `POST /detect` | `src/lib/camera/ingest.ts` |
| `POST /blur` | `src/lib/privacy/blur-server.ts` |
| `GET /health` | ops / readiness probe |

---

## POST /detect

Detect road damage in one frame. Returns zero or more boxes, each with a crop.

**Request**: `application/json`

```jsonc
{
  "image": "<base64 bytes | https URL>",
  "captured_at": "2026-08-23T14:02:11.000Z",  // nullable
  "speed_mps": 12.4,                           // nullable; used to reject blur
  "min_score": 0.5                             // caller's drop threshold
}
```

**Response 200**: `application/json`

```jsonc
{
  "detections": [
    {
      "class": "pothole",         // longitudinal_crack | transverse_crack | alligator_crack | pothole
      "score": 0.81,              // 0..1
      "bbox": [412, 300, 96, 74], // [x, y, w, h] px, origin top-left
      "crop_base64": "<base64>"   // the bbox crop ONLY, never the full frame
    }
  ],
  "model_version": "rdd2022-x-2026.08"
}
```

Rules:

- Boxes below `min_score` must be omitted server-side; the app filters again,
  but the point of the gate is to not ship them over the wire.
- `crop_base64` is mandatory. The app cannot blur a box it has no pixels for, so
  a crop-less box is discarded outright.
- Return an empty `detections` array for a clean frame. Do **not** 404 or error
  - an empty result is the expected outcome for ~95% of frames.
- Any non-2xx is treated as "sidecar unavailable": the whole batch is retried.

**Response 5xx**: the app aborts the batch and retries it later. Partially
ingesting a route is worse than a clean replay.

---

## POST /blur

Redact faces and license plates in a crop.

**Request**: raw image bytes, `Content-Type` set by the caller
(`application/octet-stream` by default).

**Response 200**: raw redacted image bytes.

| Header | Meaning |
|---|---|
| `x-blur-regions` | count of regions painted over; `0` is legal (nothing to redact) |
| `x-blur-version` | stamped onto the crop so a model upgrade can trigger a re-blur |

**Response non-2xx / empty body**: the app returns `{ ok: false }` and **drops
the crop**. Nothing is persisted.

### The hard rule

A 2xx from this endpoint is a promise that the returned bytes are safe to
publish to a public bucket. Therefore:

- **Never** echo the input bytes back as a fallback when the model fails.
- **Never** return 200 with the original image because "no faces were found but
  the model errored". Model error → non-2xx.
- Failing is always correct. Losing one crop costs nothing; publishing one face
  or plate is a privacy incident.

The app has no unblurred path at all. There is nowhere for unredacted bytes to
land even if this service misbehaves, and that property must not be weakened on
either side.

---

## GET /health

```jsonc
{
  "ok": true,
  "detector_loaded": false,   // false while running the scaffold
  "blur_loaded": false,
  "blur_version": "server-blur-v1"
}
```

`detector_loaded: false` means every frame will be dropped. That is a valid
running state, not an outage. Alert on it, don't fail closed the whole app.
