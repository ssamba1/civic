"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapGL, Marker } from "react-map-gl/maplibre";

import { AgentFeed } from "@/components/camera-demo/agent-feed";
import { ClaimDetail } from "@/components/camera-demo/claim-detail";
import { SATELLITE_STYLE } from "@/components/map/satellite-style";
import type { DetectionExport, Promotion } from "@/lib/camera-demo/promotions";
import { derivePromotions } from "@/lib/camera-demo/promotions";
import {
  BUS_ROUTE,
  positionAt,
  ROUTE_CENTER,
} from "@/lib/camera-demo/route-path";

/**
 * Scripted end-to-end theater for the camera pipeline (spec: CAMERA_LIABILITY
 * _PIPELINE.md). Detections were precomputed offline over the demo clip
 * (services/detector/export_detections.py); the page replays them client-side:
 * boxes over the video, the bus tracing a Cumming route, an agent card per
 * promoted cluster. No live model, no DB writes, demo only, and labeled so.
 */

const VIDEO_SRC = "/camera-demo/bus-feed.mp4";
const DATA_SRC = "/camera-demo/detections.json";

export function CameraDemo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [data, setData] = useState<DetectionExport | null>(null);
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<Promotion | null>(null);

  // Opening a claim pauses the feed so the evidence frame matches what the
  // viewer just saw; closing does not auto-resume (their call).
  const openClaim = (p: Promotion) => {
    videoRef.current?.pause();
    setSelected(p);
  };

  useEffect(() => {
    let alive = true;
    fetch(DATA_SRC)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: DetectionExport) => {
        if (alive) setData(d);
      })
      .catch(() => {
        // Demo page degrades to plain video playback if the JSON is missing.
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const promotions: Promotion[] = useMemo(
    () => (data ? derivePromotions(data) : []),
    [data],
  );

  // rAF loop: draw boxes at video rate, tick React state at ~8Hz for the
  // sidebar/map (full-rate setState would re-render the world every frame).
  useEffect(() => {
    if (!data) return;
    let raf = 0;
    let lastTick = 0;
    const draw = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (
            canvas.width !== video.clientWidth ||
            canvas.height !== video.clientHeight
          ) {
            canvas.width = video.clientWidth;
            canvas.height = video.clientHeight;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const frame =
            data.frames[
              Math.min(
                Math.floor(video.currentTime * data.fps),
                data.frames.length - 1,
              )
            ];
          if (frame) {
            for (const b of frame.boxes) {
              const x = b.x * canvas.width;
              const y = b.y * canvas.height;
              const w = b.w * canvas.width;
              const h = b.h * canvas.height;
              ctx.strokeStyle = "rgba(255,255,255,0.95)";
              ctx.lineWidth = 2;
              ctx.strokeRect(x, y, w, h);
              ctx.fillStyle = "rgba(0,0,0,0.65)";
              const label = `pothole ${(b.conf * 100).toFixed(0)}%`;
              ctx.font = "11px ui-sans-serif, system-ui";
              const tw = ctx.measureText(label).width + 8;
              ctx.fillRect(x, Math.max(y - 16, 0), tw, 15);
              ctx.fillStyle = "#fff";
              ctx.fillText(label, x + 4, Math.max(y - 4, 11));
            }
          }
          if (
            video.currentTime - lastTick > 0.125 ||
            video.currentTime < lastTick
          ) {
            lastTick = video.currentTime;
            setNow(video.currentTime);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [data]);

  const duration = data ? data.frames.length / data.fps : 1;
  const bus = positionAt(duration === 0 ? 0 : now / duration);
  const dropped = promotions.filter((p) => p.time <= now);

  return (
    // Below lg the three panels stack and the page scrolls: each gets its own
    // readable height instead of a third of one viewport. The old
    // `h-[calc(100vh…)]` applied at every width, so on a phone the feed was a
    // letterbox strip, the map a postage stamp, and the agent feed was clipped
    // by overflow-hidden with no way to scroll it. 100vh also sits under iOS
    // Safari's URL bar; the desktop height uses dvh for the same reason.
    <div className="grid grid-cols-1 gap-3 p-3 lg:h-[calc(100dvh/var(--app-zoom,1)-4rem)] lg:grid-cols-[1.15fr_1fr_340px]">
      {/* Feed */}
      <section className="relative flex min-h-[46vh] flex-col overflow-hidden rounded-lg border bg-card lg:min-h-0">
        <header className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="font-medium text-sm">Bus 12, forward camera</h2>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            demo footage · precomputed detections
          </span>
        </header>
        <div className="relative flex-1 bg-black">
          {/* biome-ignore lint/a11y/useMediaCaption: silent demo footage, no speech */}
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            className="absolute inset-0 h-full w-full object-contain"
            autoPlay
            muted
            loop
            playsInline
            controls
            // rAF pauses when the tab isn't composited; timeupdate (~4Hz) keeps
            // the map + agent clock honest even in a backgrounded tab.
            onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
            // Click anywhere on the feed to pause/resume (native control-bar
            // clicks don't reach the element, so no double-toggle).
            onClick={(e) => {
              const v = e.currentTarget;
              if (v.paused) void v.play();
              else v.pause();
            }}
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 m-auto h-full w-full object-contain"
          />
        </div>
      </section>

      {/* Map */}
      <section className="min-h-[38vh] overflow-hidden rounded-lg border lg:min-h-0">
        <MapGL
          initialViewState={{
            longitude: ROUTE_CENTER.lng,
            latitude: ROUTE_CENTER.lat,
            zoom: 13.4,
          }}
          mapStyle={SATELLITE_STYLE}
          attributionControl={false}
        >
          {/* Route breadcrumb */}
          {BUS_ROUTE.map((p) => (
            <Marker
              key={`${p.lng},${p.lat}`}
              longitude={p.lng}
              latitude={p.lat}
            >
              <span className="block size-1.5 rounded-full bg-white/60" />
            </Marker>
          ))}
          {/* Dropped defect pins */}
          {dropped.map((p) => (
            <Marker
              key={p.id}
              longitude={p.location.lng}
              latitude={p.location.lat}
            >
              <button
                type="button"
                onClick={() => openClaim(p)}
                title={`cluster ${p.id} · conf ${(p.peakConf * 100).toFixed(0)}%`}
                aria-label={`Open claim detail for ${p.id}`}
                className="block size-3 cursor-pointer rounded-full border-2 border-white bg-foreground shadow"
              />
            </Marker>
          ))}
          {/* Bus */}
          <Marker longitude={bus.lng} latitude={bus.lat}>
            <span className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-background text-[11px] shadow">
              🚌
            </span>
          </Marker>
        </MapGL>
      </section>

      {/* Agents */}
      <section className="max-h-[70vh] overflow-y-auto rounded-lg border bg-card p-3 lg:max-h-none lg:overflow-hidden">
        <AgentFeed promotions={promotions} now={now} onSelect={openClaim} />
      </section>

      {selected && data && (
        <ClaimDetail
          promotion={selected}
          data={data}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
