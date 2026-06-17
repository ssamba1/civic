import type { StormAdvisory } from "./storm-advisory";

const TTL_MS = 5 * 60_000;

let cached: { data: StormAdvisory; fetchedAt: number } | null = null;

export function getCachedAdvisory(): StormAdvisory | null {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.data;
  return null;
}

export function setCachedAdvisory(data: StormAdvisory): void {
  cached = { data, fetchedAt: Date.now() };
}
