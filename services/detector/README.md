# Civic detector sidecar

Python service that fronts two models for camera ingest:

1. **Road-damage detection** — the cost gate. One bus on one route produces tens
   of thousands of frames a day; an LLM call per frame is economically
   impossible. This detector drops ~95% of frames before Gemini is involved.
2. **Face / license-plate blur** — camera ingest has no client to blur in, and
   street footage is saturated with faces and plates.

It is a **scaffold**: no model is shipped, `/detect` returns `[]`, `/blur`
returns 501. See `contract.md` for the wire format both endpoints must honor.

## Run

```bash
cd services/detector
python -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Then point the Next app at it:

```bash
# .env.local
DETECTOR_URL=http://localhost:8000
```

`DETECTOR_URL` is the only wiring. It is consumed by
`src/lib/camera/ingest.ts` (`/detect`) and `src/lib/privacy/blur-server.ts`
(`/blur`). Unset means camera ingest answers `503 { retryable: true }` — it does
not crash, and it does not fall back to storing anything.

Optional: `DETECTOR_MODEL_PATH`, `BLUR_MODEL_PATH` (ONNX files).

## Model selection — licensing is a gate, not a preference

The detector is trained on the **RDD2022 / Crowdsensing Road Damage Detection**
family, the standard public corpus for this task, with many published
fine-tunes. Selection happens **at deploy time**, and the license is a hard
filter:

- **Ship: Apache-2.0 / BSD / MIT** architectures and checkpoints — YOLOX,
  RT-DETR family, or an in-house fine-tune on a permissively licensed backbone.
- **Excluded: Ultralytics YOLOv8 / YOLOv11 (AGPL-3.0)**, and any checkpoint
  derived from them. AGPL's network-use clause reaches a commercial hosted
  product. This is not negotiable by convenience — a faster mAP number does not
  buy the right to relicense the product.

Verify the license of whatever checkpoint you pick **at the moment you pick
it**; do not treat any model named in the spec or in this file as settled. Record
the choice, its license, and its source in an ADR under `docs/decisions/`.

## Why a separate service

Keeps the ONNX runtime out of the Node process, lets the model scale and be
swapped independently of app deploys, and means a detector OOM cannot take down
report intake. The frame contract also stays identical if detection later moves
to the edge (a Jetson in the vehicle pre-filtering before upload) — the device
simply uploads fewer frames.

## Privacy posture

`/blur` failing is a **safe** outcome by construction: the app drops the crop
and nothing is persisted. There is no unblurred fallback anywhere in the chain,
and raw frames are never stored at all — only blurred crops reach
`photos-public`. Do not add a "return the original on error" path here or in the
app; that is the one change that turns this service into a privacy incident.
