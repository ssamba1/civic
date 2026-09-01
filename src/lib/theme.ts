"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createReactiveStore } from "@/lib/utils/reactive-store";

/* ==================================================================
   Theme store, light ⇄ dark, class-driven.

   Mirrors the house store pattern (demo-reports.ts, category-overrides.ts):
   a module-level snapshot + useSyncExternalStore for React reactivity,
   persisted to localStorage. The single source of truth is the `dark`
   class on <html>; every themeable surface keys off it (globals.css
   `@custom-variant dark`). A no-flash inline script in app/layout.tsx
   sets that class before first paint; this store keeps it in sync after.

   Default = light (first-open experience; the toggle reveals dark). No DB
   writes.
   ================================================================== */

export type Theme = "light" | "dark";

const STORAGE_KEY = "civic.theme";
const DEFAULT_THEME: Theme = "light";

let theme: Theme = DEFAULT_THEME;
let hydrated = false;

// Server always renders the default so SSR markup matches the <html class>
// the layout stamps; the client snapshot takes over after hydration.
const store = createReactiveStore<Theme>(() => theme, DEFAULT_THEME);
const { subscribe, getSnapshot, getServerSnapshot, emit } = store;

function readStorage(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyClass(next: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", next === "dark");
}

// Sync the in-memory snapshot to whatever the no-flash init script already
// applied. Runs once at client module-eval, before any component reads it.
function hydrateOnce() {
  if (hydrated || typeof window === "undefined") return;
  theme = readStorage();
  applyClass(theme);
  hydrated = true;
}
hydrateOnce();

export function getThemeSnapshot(): Theme {
  return theme;
}

export function setTheme(next: Theme) {
  if (next === theme && hydrated) return;
  theme = next;
  applyClass(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode / quota. In-memory + the live class still drive the UI.
  }
  emit();
}

export function toggleTheme() {
  setTheme(theme === "dark" ? "light" : "dark");
}

interface UseThemeReturn {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

export function useTheme(): UseThemeReturn {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => toggleTheme(), []);
  const set = useCallback((t: Theme) => setTheme(t), []);
  return { theme: value, toggle, setTheme: set };
}
