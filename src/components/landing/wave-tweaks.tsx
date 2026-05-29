"use client";

import { useState } from "react";
import { Pause, Play, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { DEFAULT_WAVE, type WaveParams } from "./wave-hero";

type Patch = Partial<WaveParams>;

function Row({
  label,
  hint,
  value,
  min,
  max,
  step,
  fmt = (v) => v.toFixed(2),
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-white/85">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-white/55">{fmt(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer accent-[var(--color-primary)]"
      />
      {hint ? <span className="text-[10px] leading-tight text-white/35">{hint}</span> : null}
    </label>
  );
}

export function WaveTweaks({
  params,
  set,
  reset,
}: {
  params: WaveParams;
  set: (patch: Patch) => void;
  reset: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-[84px] right-4 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {/* Panel */}
      <div
        role="dialog"
        aria-label="Wave settings"
        aria-hidden={!open}
        className={cn(
          "w-[268px] origin-bottom-right rounded-2xl border border-white/10 bg-[#0b0f17]/85 p-4 text-white backdrop-blur-xl",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_60px_-24px_rgba(0,0,0,0.7)]",
          "transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          open
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-95 opacity-0",
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
            Wave tweaks
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close wave settings"
            className="-mr-1 rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white active:translate-y-px"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3.5">
          <Row
            label="Speed"
            value={params.speed}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => set({ speed: v })}
          />
          <Row
            label="Intensity"
            value={params.intensity}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => set({ intensity: v })}
          />
          <Row
            label="Tint"
            hint="0 = light blue · 1 = deep blue"
            value={params.tint}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => set({ tint: v })}
          />
          <Row
            label="Contrast"
            value={params.contrast}
            min={0.5}
            max={2.5}
            step={0.05}
            onChange={(v) => set({ contrast: v })}
          />
          <Row
            label="Resolution"
            hint="lower = sharper, heavier on GPU"
            value={params.scale}
            min={1}
            max={6}
            step={1}
            fmt={(v) => `1 / ${v}`}
            onChange={(v) => set({ scale: v })}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => set({ paused: !params.paused })}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-medium text-white/90 transition-colors hover:bg-white/10 active:translate-y-px"
          >
            {params.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {params.paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset wave settings"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white active:translate-y-px"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Wave settings"
        aria-expanded={open}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-full border border-white/15 bg-[#0b0f17]/80 text-white/85 backdrop-blur-xl",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_30px_-10px_rgba(0,0,0,0.6)]",
          "transition-[transform,background-color,color] duration-200 hover:bg-[#0b0f17] hover:text-white active:translate-y-px",
          open && "text-white ring-2 ring-[var(--color-primary)]/60",
        )}
      >
        <SlidersHorizontal className="size-[18px]" />
      </button>
    </div>
  );
}
