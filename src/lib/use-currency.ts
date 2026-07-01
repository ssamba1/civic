"use client";

import { useParams } from "next/navigation";
import { type CurrencyConfig, currencyForCitySlug } from "@/lib/currency";

/**
 * Resolve the active city's currency from the route.
 * Works on /city/[slug] (param `slug`) and /[team]/[city] (param `city`).
 * Off a city route (e.g. /teams) it falls back to the default currency.
 */
export function useCurrency(): CurrencyConfig {
  const params = useParams<{ slug?: string; city?: string }>();
  return currencyForCitySlug(params?.slug ?? params?.city);
}
