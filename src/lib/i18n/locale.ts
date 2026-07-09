/* ==================================================================
   Locale detection — pure, no deps, unit-testable.

   Priority: ?lang= query param > Accept-Language header > "en".
   Only locales present in the dictionary are accepted; everything
   else falls back to "en".
   ================================================================== */

import { DICTIONARIES, type Locale } from "./dictionary";

const SUPPORTED = new Set<string>(Object.keys(DICTIONARIES));

/** True when `v` is one of our supported locale codes. */
export function isSupportedLocale(v: string | null | undefined): v is Locale {
  return v != null && SUPPORTED.has(v);
}

/**
 * Pick a locale from an optional `?lang=` query value and/or an
 * Accept-Language header string (both optional). Pure function, safe
 * for edge and Node environments.
 *
 * @param acceptHeader - raw value of the Accept-Language header
 * @param queryParam   - value of the `lang` query-string parameter
 * @returns a supported `Locale`, defaulting to `"en"`
 */
export function pickLocale(
  acceptHeader: string | null | undefined,
  queryParam: string | null | undefined,
): Locale {
  // 1. Explicit query param wins
  if (isSupportedLocale(queryParam)) return queryParam;

  // 2. Parse Accept-Language: "es-MX,es;q=0.9,en;q=0.8"
  if (acceptHeader) {
    const tags = acceptHeader
      .split(",")
      .map((part) => {
        const [tag] = part.trim().split(";");
        return tag?.trim() ?? "";
      })
      .filter(Boolean);

    for (const tag of tags) {
      // Full match first (e.g. "es")
      if (isSupportedLocale(tag)) return tag;
      // Language subtag match (e.g. "es" from "es-MX")
      const lang = tag.split("-")[0];
      if (lang && isSupportedLocale(lang)) return lang;
    }
  }

  return "en";
}
