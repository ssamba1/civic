"use client";

import {
  ArrowRight,
  Bell,
  Camera,
  Cpu,
  GitMerge,
  Link as LinkIcon,
  Truck,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TimelineItem {
  id: number;
  title: string;
  date: string;
  content: string;
  category: string;
  icon: React.ElementType;
  relatedIds: number[];
  status: "completed" | "in-progress" | "pending";
  energy: number;
}

const CIVIC_STEPS: TimelineItem[] = [
  {
    id: 1,
    title: "Capture",
    date: "00:00",
    category: "Resident",
    content:
      "Resident snaps a photo from the PWA. Geolocation, timestamp, and device metadata attach automatically. No dropdowns, no category guessing.",
    icon: Camera,
    relatedIds: [2],
    status: "completed",
    energy: 100,
  },
  {
    id: 2,
    title: "Classify",
    date: "00:02",
    category: "AI",
    content:
      "Gemini 2.5 Flash vision identifies issue type, severity, and the right department. ~$0.0001 per photo, 1.4s average latency.",
    icon: Cpu,
    relatedIds: [1, 3],
    status: "completed",
    energy: 94,
  },
  {
    id: 3,
    title: "Dedupe",
    date: "00:04",
    category: "AI",
    content:
      "Spatial and semantic hashing merges this report with the 14 others filed for the same pothole. The crew is dispatched once, not fourteen times.",
    icon: GitMerge,
    relatedIds: [2, 4],
    status: "in-progress",
    energy: 82,
  },
  {
    id: 4,
    title: "Route",
    date: "00:06",
    category: "Workflow",
    content:
      "An Open311 GeoReport v2 work order is generated with photo, address, and materials list. Pushed to the right crew via Slack, SMS, or the city's existing 311 backend.",
    icon: Workflow,
    relatedIds: [3, 5],
    status: "in-progress",
    energy: 68,
  },
  {
    id: 5,
    title: "Dispatch",
    date: "00:08",
    category: "City Crew",
    content:
      "Foreman opens the order, sees a photo and exact location, loads the right materials. One trip instead of two. Average 41% reduction in rework.",
    icon: Truck,
    relatedIds: [4, 6],
    status: "pending",
    energy: 52,
  },
  {
    id: 6,
    title: "Notify",
    date: "T+3d",
    category: "Resident",
    content:
      "Resident gets a push notification with a before/after photo when the crew marks the job complete. The public dashboard updates in real time.",
    icon: Bell,
    relatedIds: [5, 1],
    status: "pending",
    energy: 40,
  },
];

const RADIUS = 220;

export function OrbitalSteps() {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
  const [rotationAngle, setRotationAngle] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [pulseEffect, setPulseEffect] = useState<Record<number, boolean>>({});
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandedItems({});
      setActiveNodeId(null);
      setPulseEffect({});
      setAutoRotate(true);
    }
  };

  const toggleItem = (id: number) => {
    setExpandedItems((prev) => {
      const next: Record<number, boolean> = {};
      Object.keys(prev).forEach((key) => {
        next[Number(key)] = false;
      });
      next[id] = !prev[id];

      if (!prev[id]) {
        setActiveNodeId(id);
        setAutoRotate(false);
        const item = CIVIC_STEPS.find((i) => i.id === id);
        const pulses: Record<number, boolean> = {};
        item?.relatedIds.forEach((relId) => {
          pulses[relId] = true;
        });
        setPulseEffect(pulses);

        const nodeIndex = CIVIC_STEPS.findIndex((i) => i.id === id);
        const targetAngle = (nodeIndex / CIVIC_STEPS.length) * 360;
        setRotationAngle(270 - targetAngle);
      } else {
        setActiveNodeId(null);
        setAutoRotate(true);
        setPulseEffect({});
      }
      return next;
    });
  };

  useEffect(() => {
    if (!autoRotate) return;
    const id = setInterval(() => {
      setRotationAngle((prev) => Number(((prev + 0.25) % 360).toFixed(3)));
    }, 50);
    return () => clearInterval(id);
  }, [autoRotate]);

  const calculatePosition = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radian = (angle * Math.PI) / 180;
    // Round to fixed precision so SSR (Node V8) and client (any JS engine)
    // emit byte-identical style strings — raw trig differs in the last ULP
    // across engines and trips a hydration mismatch.
    const x = Math.round(RADIUS * Math.cos(radian) * 100) / 100;
    const y = Math.round(RADIUS * Math.sin(radian) * 100) / 100;
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity =
      Math.round(
        Math.max(0.45, Math.min(1, 0.5 + 0.5 * ((1 + Math.sin(radian)) / 2))) * 1000,
      ) / 1000;
    return { x, y, angle, zIndex, opacity };
  };

  const isRelated = (id: number) =>
    activeNodeId !== null &&
    (CIVIC_STEPS.find((i) => i.id === activeNodeId)?.relatedIds.includes(id) ?? false);

  const statusStyle = (status: TimelineItem["status"]) => {
    switch (status) {
      case "completed":
        return "border-[var(--color-primary)] bg-[var(--color-primary)] text-white";
      case "in-progress":
        return "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]";
      case "pending":
        return "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]";
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className="relative flex h-[640px] w-full items-center justify-center overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      {/* faint orbital grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(circle at center, black 30%, transparent 75%)",
        }}
      />

      <div
        ref={orbitRef}
        className="relative flex items-center justify-center"
        style={{ perspective: "1200px" }}
      >
        {/* center hub */}
        <div className="absolute z-10 flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full border border-[var(--color-primary)]/30 opacity-60" />
          <div
            className="absolute inset-0 animate-ping rounded-full border border-[var(--color-primary)]/20"
            style={{ animationDelay: "0.6s" }}
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-foreground)] text-[var(--color-background)] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]">
            <Zap className="h-5 w-5" />
          </div>
        </div>

        {/* orbital ring */}
        <div
          className="absolute rounded-full border border-dashed border-[var(--color-border)]"
          style={{ width: RADIUS * 2, height: RADIUS * 2 }}
        />

        {CIVIC_STEPS.map((item, index) => {
          const pos = calculatePosition(index, CIVIC_STEPS.length);
          const isExpanded = expandedItems[item.id];
          const related = isRelated(item.id);
          const pulsing = pulseEffect[item.id];
          const Icon = item.icon;

          return (
            <div
              key={item.id}
              onClick={(e) => {
                e.stopPropagation();
                toggleItem(item.id);
              }}
              className="absolute cursor-pointer transition-all duration-700"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                zIndex: isExpanded ? 200 : pos.zIndex,
                opacity: isExpanded ? 1 : pos.opacity,
              }}
            >
              {pulsing && (
                <div
                  aria-hidden
                  className="absolute -inset-2 animate-pulse rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(10,132,255,0.18) 0%, transparent 70%)",
                  }}
                />
              )}

              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  isExpanded
                    ? "scale-125 border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-[0_8px_32px_-8px_rgba(10,132,255,0.5)]"
                    : related
                      ? "border-[var(--color-primary)] bg-white text-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)]"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>

              <div
                className={`absolute left-1/2 mt-2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-300 ${
                  isExpanded ? "text-[var(--color-foreground)]" : "text-[var(--color-muted)]"
                }`}
              >
                {item.title}
              </div>

              {isExpanded && (
                <Card
                  className="absolute left-1/2 top-16 w-72 -translate-x-1/2 border-[var(--color-border)] bg-[var(--color-background)] shadow-[0_24px_64px_-24px_rgba(0,0,0,0.18)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge className={statusStyle(item.status)}>{item.category}</Badge>
                      <span className="font-mono text-[11px] text-[var(--color-muted)]">
                        {item.date}
                      </span>
                    </div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-[13px] leading-relaxed text-[var(--color-muted)]">
                      {item.content}
                    </p>

                    <div className="border-t border-[var(--color-border)] pt-3">
                      <div className="mb-1.5 flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
                          <Zap className="h-3 w-3" />
                          Confidence
                        </span>
                        <span className="font-mono text-[var(--color-foreground)]">
                          {item.energy}%
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface)]">
                        <div
                          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-700"
                          style={{ width: `${item.energy}%` }}
                        />
                      </div>
                    </div>

                    {item.relatedIds.length > 0 && (
                      <div className="border-t border-[var(--color-border)] pt-3">
                        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                          <LinkIcon className="h-3 w-3" />
                          Connected
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.relatedIds.map((relId) => {
                            const rel = CIVIC_STEPS.find((i) => i.id === relId);
                            if (!rel) return null;
                            return (
                              <Button
                                key={relId}
                                variant="outline"
                                size="sm"
                                className="h-6 rounded-full px-2.5 text-[11px]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleItem(relId);
                                }}
                              >
                                {rel.title}
                                <ArrowRight className="ml-1 h-3 w-3" />
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
