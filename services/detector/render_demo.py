"""One-off demo renderer: run the pothole model over sample_video.mp4 and
write an annotated video.

DEMO ONLY. Uses the AGPL ultralytics runtime from the local, gitignored
.venv. Never wire this into the product path; the production sidecar contract
(contract.md) stays Apache-licensed ONNX. See spec §4.3.

Usage:  .venv/Scripts/python render_demo.py
"""

from pathlib import Path

import cv2
from ultralytics import YOLO

HERE = Path(__file__).parent
SRC = HERE / "sample_video.mp4"
WEIGHTS = HERE / "model" / "best.pt"
OUT = HERE / "demo_output.mp4"

CONF = 0.35  # same neighborhood as the ingest gate's score threshold


def open_writer(path: Path, fps: float, size: tuple[int, int]) -> cv2.VideoWriter:
    # avc1 (H.264) plays everywhere incl. browsers; mp4v is the fallback if
    # this OpenCV build lacks an H.264 encoder.
    for fourcc in ("avc1", "mp4v"):
        w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*fourcc), fps, size)
        if w.isOpened():
            print(f"writer codec: {fourcc}")
            return w
    raise RuntimeError("no usable mp4 codec in this OpenCV build")


def main() -> None:
    model = YOLO(str(WEIGHTS))
    cap = cv2.VideoCapture(str(SRC))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open {SRC}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    size = (
        int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
    )
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = open_writer(OUT, fps, size)

    frames = 0
    detections = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            result = model(frame, conf=CONF, verbose=False)[0]
            detections += len(result.boxes) if result.boxes is not None else 0
            writer.write(result.plot())
            frames += 1
            if frames % 50 == 0:
                print(f"{frames}/{total} frames, {detections} detections so far")
    finally:
        cap.release()
        writer.release()

    print(f"done: {frames} frames, {detections} detections -> {OUT}")


if __name__ == "__main__":
    main()
