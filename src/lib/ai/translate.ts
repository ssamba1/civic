import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL } from "@/lib/ai/config";
import { withRetry } from "@/lib/ai/retry";
import { createLogger } from "@/lib/logger";

/* ==================================================================
   LLM-native translation (NEXT_100 #31 / #9).

   Two uses: translate the resident status page into the reporter's language,
   and normalize a foreign-language intake description to English for staff.
   Gemini is our classifier already, so translation is free of a new dependency.

   Graceful by contract: no key, empty text, target === source, or any model
   failure returns the ORIGINAL text. A translation miss must never blank a
   page or drop a report's description.
   ================================================================== */

const logger = createLogger("[translate]");
const TRANSLATE_TIMEOUT_MS = 8000;

// Languages offered on the resident status page. Kept small and GA-pilot
// relevant; `en` is the untranslated source.
export const SUPPORTED_LANGS = {
  en: "English",
  es: "Español",
  fr: "Français",
  vi: "Tiếng Việt",
  zh: "中文",
  ko: "한국어",
} as const;

export type LangCode = keyof typeof SUPPORTED_LANGS;

export function isLangCode(v: string | undefined | null): v is LangCode {
  return v != null && v in SUPPORTED_LANGS;
}

// Process-lifetime cache keyed by (lang, text). Status copy is highly
// repetitive across requests, so this collapses almost all calls to one.
//
// BOUNDED on purpose: the key contains attacker-supplied text (the translate
// route accepts arbitrary strings), so an unbounded Map is a memory-exhaustion
// vector, every distinct input pins a new entry for the life of the process.
// Insertion-ordered eviction gives us a cheap LRU-ish policy: Map iterates in
// insertion order, so the oldest key is always first.
const CACHE_MAX_ENTRIES = 2000;
const cache = new Map<string, string>();

function cachePut(key: string, value: string): void {
  // Re-inserting moves the key to the end, keeping hot entries alive.
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

async function translateOne(text: string, target: LangCode): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  const trimmed = text.trim();
  if (!key || !trimmed || target === "en") return text;

  const cacheKey = `${target}:${trimmed}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    cachePut(cacheKey, cached); // refresh recency
    return cached;
  }

  try {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({
      model: GEMINI_MODEL,
    });
    const prompt =
      `Translate the following civic-service message into ${SUPPORTED_LANGS[target]}. ` +
      "Return ONLY the translation. No notes, no quotes, no markdown. Keep it " +
      `natural and plain.\n\n${trimmed}`;
    const result = await withRetry(
      (signal) =>
        model.generateContent(prompt, {
          signal,
          timeout: TRANSLATE_TIMEOUT_MS,
        }),
      { timeoutMs: TRANSLATE_TIMEOUT_MS },
    );
    const out = (result.response?.text?.() ?? "")
      .trim()
      .replace(/^```[a-z]*\n?|\n?```$/g, "")
      .trim();
    const value = out || text;
    cachePut(cacheKey, value);
    return value;
  } catch (err) {
    logger.warn("translate_failed_fallback_to_source", {
      target,
      detail: err instanceof Error ? err.message : String(err),
    });
    return text;
  }
}

/**
 * Translate a batch of strings into `target`, preserving order. English (or a
 * missing key) returns the inputs untouched. Individual failures fall back to
 * the source string, so the returned array is always the same length.
 */
export async function translateBatch(
  texts: string[],
  target: LangCode,
): Promise<string[]> {
  if (target === "en") return texts;
  return Promise.all(texts.map((t) => translateOne(t, target)));
}

/** Translate one string into `target` (English/empty → unchanged). */
export function translateText(text: string, target: LangCode): Promise<string> {
  return translateOne(text, target);
}
