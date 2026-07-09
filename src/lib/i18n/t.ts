/* ==================================================================
   Typed translation helper — zero deps, en fallback.
   ================================================================== */

import { DICTIONARIES, type Dictionary, type Locale } from "./dictionary";

/**
 * Return the UI string for `key` in `locale`.
 * Falls back to English when:
 *   - `locale` is unrecognised
 *   - the key is missing from the locale dict (shouldn't happen with
 *     full dicts, but guards future partial additions)
 */
export function t(locale: Locale | string, key: keyof Dictionary): string {
  const dict = DICTIONARIES[locale as Locale] ?? DICTIONARIES.en;
  return (dict[key] as string | undefined) ?? DICTIONARIES.en[key];
}
