"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_PRESET_ID,
  getPreset,
  type MapInk,
  type MapPreset,
  PRESETS,
} from "./mapPresets";

type MapPresetValue = {
  preset: MapPreset;
  presetId: string;
  presets: MapPreset[];
  setPresetId: (id: string) => void;
  ink: MapInk;
  tweaksVisible: boolean;
  setTweaksVisible: (v: boolean) => void;
};

const MapPresetContext = createContext<MapPresetValue | null>(null);

const LS_PRESET = "civic-map-preset";
const LS_TWEAKS = "civic-map-tweaks";

export function MapPresetProvider({ children }: { children: ReactNode }) {
  // Start at the default so SSR and the first client render agree; hydrate the
  // real value from URL/localStorage in an effect AFTER commit (reading storage
  // during render diverges SSR/CSR and breaks hydration — see memory).
  const [presetId, setPresetIdState] = useState<string>(DEFAULT_PRESET_ID);
  const [tweaksVisible, setTweaksVisibleState] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    // ?mapPreset=<id> is a transient override (used for QA screenshots); it
    // wins over the stored choice but isn't itself persisted.
    const urlPreset = params.get("mapPreset");
    const stored = window.localStorage.getItem(LS_PRESET);
    const next = urlPreset ?? stored;
    if (next && PRESETS.some((p) => p.id === next)) setPresetIdState(next);

    // The chooser is hidden from public visitors. ?tweaks=1 reveals it and
    // latches a flag so it stays available for this browser.
    const urlTweaks = params.get("tweaks");
    if (urlTweaks === "1") {
      setTweaksVisibleState(true);
      window.localStorage.setItem(LS_TWEAKS, "1");
    } else if (urlTweaks === "0") {
      setTweaksVisibleState(false);
      window.localStorage.removeItem(LS_TWEAKS);
    } else if (window.localStorage.getItem(LS_TWEAKS) === "1") {
      setTweaksVisibleState(true);
    }
  }, []);

  const setPresetId = useCallback((id: string) => {
    setPresetIdState(id);
    if (typeof window !== "undefined")
      window.localStorage.setItem(LS_PRESET, id);
  }, []);

  const setTweaksVisible = useCallback((v: boolean) => {
    setTweaksVisibleState(v);
    if (typeof window === "undefined") return;
    if (v) window.localStorage.setItem(LS_TWEAKS, "1");
    else window.localStorage.removeItem(LS_TWEAKS);
  }, []);

  const preset = useMemo(() => getPreset(presetId), [presetId]);

  const value = useMemo<MapPresetValue>(
    () => ({
      preset,
      presetId,
      presets: PRESETS,
      setPresetId,
      ink: preset.ink,
      tweaksVisible,
      setTweaksVisible,
    }),
    [preset, presetId, setPresetId, tweaksVisible, setTweaksVisible],
  );

  return (
    <MapPresetContext.Provider value={value}>
      {children}
    </MapPresetContext.Provider>
  );
}

export function useMapPreset(): MapPresetValue {
  const ctx = useContext(MapPresetContext);
  if (!ctx)
    throw new Error("useMapPreset must be used within a MapPresetProvider");
  return ctx;
}
