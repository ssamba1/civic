"""Export per-frame detections from sample_video.mp4 as JSON for the site's
camera-demo page. DEMO ONLY (AGPL runtime, gitignored venv) — see render_demo.py.

Output: detections.json
  { fps, width, height, frames: [ { i, boxes: [ { x, y, w, h, conf } ] } ] }
Coordinates normalized 0..1 so the client can scale to any player size.
"""

import json
from pathlib import Path

import cv2
from ultralytics import YOLO

HERE = Path(__file__).parent
SRC = HERE / "sample_video.mp4"
WEIGHTS = HERE / "model" / "best.pt"
OUT = HERE / "detections.json"
CONF = 0.35


def main() -> None:
    model = YOLO(str(WEIGHTS))
    cap = cv2.VideoCapture(str(SRC))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open {SRC}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    frames = []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        r = model(frame, conf=CONF, verbose=False)[0]
        boxes = []
        if r.boxes is not None:
            for b in r.boxes:
                x1, y1, x2, y2 = (float(v) for v in b.xyxy[0])
                boxes.append(
                    {
                        "x": round(x1 / w, 4),
                        "y": round(y1 / h, 4),
                        "w": round((x2 - x1) / w, 4),
                        "h": round((y2 - y1) / h, 4),
                        "conf": round(float(b.conf[0]), 3),
                    }
                )
        frames.append({"i": i, "boxes": boxes})
        i += 1
    cap.release()

    OUT.write_text(
        json.dumps({"fps": fps, "width": w, "height": h, "frames": frames})
    )
    print(f"wrote {OUT}: {i} frames, {sum(len(f['boxes']) for f in frames)} boxes")


if __name__ == "__main__":
    main()
