"""Civic detector sidecar — scaffold only, no model shipped.

Why a sidecar at all: an LLM call per dashcam frame is economically impossible
(one bus, one route, one day is tens of thousands of frames). This service is
the gate that throws ~95% of them away before Gemini is ever involved, and it
keeps the ONNX model runtime out of the Next.js process so the detector can be
scaled and swapped independently.

Endpoints (see contract.md for the wire format):
  POST /detect  -> road-damage boxes + crops.  STUB: returns [].
  POST /blur    -> face/plate-redacted image bytes.  STUB: 501.
  GET  /health  -> liveness + whether a model is actually loaded.

Both stubs are deliberately honest:
  * /detect returning [] means every frame is dropped — no detections, no
    reports, no unblurred bytes. Safe default.
  * /blur returning 501 makes blurServerSide() fail, and the Next app DROPS the
    crop. There is no unblurred fallback anywhere in the chain, so an
    unimplemented blur cannot leak a face or a plate — it can only lose data.

Run: uvicorn app:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

MODEL_PATH = os.environ.get("DETECTOR_MODEL_PATH", "")
BLUR_MODEL_PATH = os.environ.get("BLUR_MODEL_PATH", "")

# Bumped whenever the blur model changes, so crops can be re-blurred in place.
# Mirrors the `blur_version` column added in migration 040.
BLUR_VERSION = "server-blur-v1"

app = FastAPI(title="civic-detector", version="0.1.0")


class DetectRequest(BaseModel):
    """One frame. `image` is base64 bytes or an https URL the sidecar may fetch."""

    image: str
    captured_at: str | None = None
    speed_mps: float | None = None
    min_score: float = Field(default=0.5, ge=0.0, le=1.0)


class Detection(BaseModel):
    # RDD2022 damage classes.
    cls: Literal[
        "longitudinal_crack",
        "transverse_crack",
        "alligator_crack",
        "pothole",
    ] = Field(alias="class")
    score: float = Field(ge=0.0, le=1.0)
    # [x, y, w, h] in pixels, origin top-left.
    bbox: list[float]
    # Base64 crop of the bbox. The Next app blurs this before it is stored;
    # the sidecar must never be asked for the full frame.
    crop_base64: str

    model_config = {"populate_by_name": True}


class DetectResponse(BaseModel):
    detections: list[Detection] = []
    model_version: str = "stub"


def _model_present(path: str) -> bool:
    """Whether `path` names a file that is actually there.

    Not `bool(path)`. A configured-but-wrong path — a typo, a relative path
    resolved from the wrong working directory, a volume that did not mount — is
    the most likely way a deployment ends up with no model, and it is exactly
    the case a truthiness check on the env var reports as healthy. A liveness
    probe that answers "loaded" for a model that is not on disk is worse than
    no probe: the operator stops looking here.
    """
    return bool(path) and Path(path).is_file()


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        # These describe the files, not the env vars. `*_configured` is what was
        # asked for; `*_loaded` is what is actually on disk. When they disagree,
        # the path is wrong — which is the whole reason to report both.
        "detector_configured": bool(MODEL_PATH),
        "detector_loaded": _model_present(MODEL_PATH),
        "blur_configured": bool(BLUR_MODEL_PATH),
        "blur_loaded": _model_present(BLUR_MODEL_PATH),
        "blur_version": BLUR_VERSION,
    }


@app.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest) -> DetectResponse:
    """Road-damage detection gate.

    TODO(deploy): load an Apache-2.0/BSD, RDD2022-trained ONNX model from
    DETECTOR_MODEL_PATH via onnxruntime, run inference, filter by
    ``req.min_score``, and crop each surviving bbox. See README.md — AGPL
    Ultralytics checkpoints are excluded by license, not by preference.

    Until then this returns no detections, which drops every frame. That is the
    correct failure direction: a silent stream of empty results costs nothing,
    while a stub that invented boxes would fabricate city work orders.
    """
    _ = req  # scaffold: input intentionally unused until a model is wired
    return DetectResponse(detections=[], model_version="stub")


@app.post("/blur")
async def blur(request: Request) -> Response:
    """Face + license-plate redaction.

    Request body: raw image bytes (Content-Type from the caller).
    Success response: raw redacted image bytes, plus headers
    ``x-blur-regions`` (count) and ``x-blur-version``.

    TODO(deploy): load a face/plate detector from BLUR_MODEL_PATH and paint over
    every detected region before returning. NEVER return the input bytes
    unchanged as a fallback — the caller treats a 2xx as "these bytes are safe
    to publish", so an unimplemented model must fail, and it does: 501 makes
    blurServerSide() return {ok: false} and the crop is dropped.
    """
    await request.body()  # drain so the connection closes cleanly
    return JSONResponse(
        status_code=501,
        content={
            "error": "blur_model_not_configured",
            "detail": (
                "No blur model is loaded. Refusing to return image bytes: an "
                "unblurred crop must never reach photos-public."
            ),
        },
    )
