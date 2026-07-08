/* ------------------------------------------------------------------
   Per-city currency.

   The whole app stores costs in a single base currency (USD) — the
   rules engine, AI prompts, and seed all produce USD-magnitude numbers.
   These configs convert that base to a city's local currency at DISPLAY
   time only. Nothing is ever stored converted, so cross-value math
   (e.g. the impact-export fix-vs-estimate accuracy metric) stays valid.

   To localize a city: add one entry to CITY_CURRENCY. Unlisted cities
   default to USD.
   ------------------------------------------------------------------ */

export interface CurrencyConfig {
  /** ISO 4217 code — drives the Intl currency symbol (e.g. $, ₹). */
  code: string;
  /** BCP-47 locale — drives digit grouping (en-IN uses lakh grouping). */
  locale: string;
  /** Multiplier from the USD cost base into this currency. */
  rateFromUsd: number;
}

// Fixed FX rate — NOT live. ~₹83 per USD (2026). Tune here if it drifts;
// nothing else references the raw number.
export const USD_TO_INR = 83;

export const USD: CurrencyConfig = {
  code: "USD",
  locale: "en-US",
  rateFromUsd: 1,
};

export const INR: CurrencyConfig = {
  code: "INR",
  locale: "en-IN",
  rateFromUsd: USD_TO_INR,
};

export const DEFAULT_CURRENCY: CurrencyConfig = USD;

/**
 * City slug → currency. The single place that maps a municipality to its
 * money. Cities not listed render in DEFAULT_CURRENCY (USD).
 */
export const CITY_CURRENCY: Record<string, CurrencyConfig> = {
  ahilyanagar: INR, // Ahilyanagar, Maharashtra, India
};

export function currencyForCitySlug(slug?: string | null): CurrencyConfig {
  if (!slug) return DEFAULT_CURRENCY;
  return CITY_CURRENCY[slug.toLowerCase()] ?? DEFAULT_CURRENCY;
}

/**
 * Format a USD-denominated cost into a city's currency, whole units.
 * Returns an em dash for null/NaN so callers never print "$NaN" or "₹NaN".
 */
export function formatCost(
  usdAmount: number | null | undefined,
  cfg: CurrencyConfig = DEFAULT_CURRENCY,
): string {
  if (usdAmount == null || !Number.isFinite(usdAmount)) return "—";
  return new Intl.NumberFormat(cfg.locale, {
    style: "currency",
    currency: cfg.code,
    maximumFractionDigits: 0,
  }).format(usdAmount * cfg.rateFromUsd);
}

/**
 * Format a timestamp in the city's locale (drives day/month order and script).
 * Same config object as formatCost so a single currencyForCitySlug() lookup
 * localizes both money and dates. Returns an em dash for missing/invalid input.
 */
export function formatLocalDate(
  iso: string | null | undefined,
  cfg: CurrencyConfig = DEFAULT_CURRENCY,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat(cfg.locale, opts).format(t);
}
