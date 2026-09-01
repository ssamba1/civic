import type { Metadata } from "next";

import { CameraDemo } from "@/components/camera-demo/camera-demo";

export const metadata: Metadata = {
  title: "Camera pipeline demo | Civic",
  description:
    "Fleet camera feed to detection, clustering, liability attribution, and a drafted contractor claim, scripted demo.",
};

export default function CameraDemoPage() {
  return (
    <main className="min-h-[calc(100vh/var(--app-zoom,1))]">
      <div className="border-b px-4 py-3">
        <h1 className="font-semibold text-base">Camera → claim, end to end</h1>
        <p className="text-muted-foreground text-xs">
          A bus-mounted feed finds damage, a detector gates frames, clusters
          confirm across passes, and an agent assembles the liability trail.
          Scripted demo on precomputed detections. The production pipeline is
          documented in the spec.
        </p>
      </div>
      <CameraDemo />
    </main>
  );
}
