"use client";

import { Check, Layers, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useMapPreset } from "./MapPresetContext";

/**
 * Gated hero-look chooser. Hidden from public visitors, revealed only via
 * ?tweaks=1 (which latches a localStorage flag). The selected preset persists
 * per-browser; it does NOT change what other visitors see. To change the
 * shipped default for everyone, edit DEFAULT_PRESET_ID in mapPresets.ts.
 */
export default function MapTweaksMenu() {
  const { preset, presets, setPresetId, setTweaksVisible } = useMapPreset();
  const [open, setOpen] = useState(true);

  // Portal to <body>: the landing wraps content in a transformed .page-enter
  // ancestor, which would otherwise capture position:fixed and drop the menu to
  // the bottom of the (very tall) page instead of the viewport corner.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-auto fixed right-5 bottom-5 z-[60] flex flex-col items-end gap-2 font-sans">
      {open && (
        <div className="w-[min(300px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e14]/85 text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-white/10 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers
                className="h-3.5 w-3.5 text-white/70"
                strokeWidth={1.75}
              />
              <span className="font-medium text-[13px] tracking-tight">
                Hero look
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTweaksVisible(false)}
              className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              title="Hide chooser (re-open with ?tweaks=1)"
              aria-label="Hide chooser"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>

          <div className="flex flex-col p-1.5">
            {presets.map((p) => {
              const active = p.id === preset.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                    active ? "bg-white/12" : "hover:bg-white/6"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-white/15"
                    style={{
                      background: `linear-gradient(135deg, ${p.swatch[0]}, ${p.swatch[1]})`,
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[13px]">
                      {p.label}
                    </span>
                    <span className="block truncate text-[11px] text-white/55">
                      {p.blurb}
                    </span>
                  </span>
                  {active && (
                    <Check
                      className="h-4 w-4 shrink-0 text-white"
                      strokeWidth={2.25}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-[#0c0e14]/85 px-4 text-[13px] text-white shadow-2xl backdrop-blur-xl transition-colors hover:border-white/25"
      >
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-full ring-1 ring-white/20"
          style={{
            background: `linear-gradient(135deg, ${preset.swatch[0]}, ${preset.swatch[1]})`,
          }}
        />
        <span className="font-medium tracking-tight">{preset.label}</span>
      </button>
    </div>,
    document.body,
  );
}
