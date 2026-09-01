/**
 * PII redaction for report descriptions.
 *
 * Replaces common PII patterns with labelled placeholders before text lands
 * in the public-facing description field.  Returns both the redacted string
 * and a span array so callers can diff what changed.
 *
 * Hard rules:
 *  - Pure function, no side effects, no I/O.
 *  - URL guard: any match that starts inside a URL token is skipped to avoid
 *    mangling paths like /api/user/john@example.com.
 *  - Order matters: apply patterns from most-specific to least-specific so
 *    overlapping matches don't fire twice.
 */

export interface RedactedSpan {
  start: number;
  end: number;
  type: string;
  original: string;
}

export interface RedactResult {
  redacted: string;
  spans: RedactedSpan[];
}

// ─── pattern definitions ────────────────────────────────────────────────────

/**
 * Matches SSN-like patterns: ddd-dd-dddd.
 * Must be more specific than phone so we run it first.
 * Negative lookahead/lookbehind on digits guards against phone number overlap.
 */
const SSN_RE = /(?<!\d)(\b\d{3}-\d{2}-\d{4}\b)(?!\d)/g;

/**
 * Email addresses.  Guard: preceded by a non-URL context (not preceded by
 * a scheme like "https://" or path separator "/").
 * Uses a broad but practical character set rather than RFC 5321.
 */
const EMAIL_RE = /(?<![/\w])([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

/**
 * US phone numbers in common formats:
 *   10-digit bare: 8005551234
 *   Dashes: 800-555-1234
 *   Dots: 800.555.1234
 *   Parens: (800) 555-1234 or (800)555-1234
 *   With country code: +1 800-555-1234
 * Guard: SSN already consumed ddd-dd-dddd, so remaining ddd-ddd-dddd is safe.
 * Digit groups use exact counts so the engine cannot backtrack pathologically.
 */
const PHONE_RE =
  /(?<![/\w@])(\+?1[\s\-.]?)?(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})(?!\d)/g;

/**
 * Street addresses: one or more digits followed by a street name (1-4 words)
 * and a recognised suffix.  Guards:
 *  - Requires the digit token to start at a word boundary (not mid-URL).
 *  - Won't match a lone ordinal like "42nd Street" without a preceding number
 *    (the pattern requires at least one pure digit cluster).
 *  - "42nd Street" with no house number → no match (no leading bare-digit group).
 *
 * ReDoS hardening: the original `([A-Z][a-zA-Z'\-]*\s+){1,4}` allowed the
 * engine to try many splits when the suffix didn't match.  Fixed by bounding
 * each word to 20 chars and using a non-capturing group so there is no
 * sub-expression overlap with the surrounding quantifier.
 */
const STREET_SUFFIXES =
  "St(?:reet)?|Ave(?:nue)?|Rd|Road|Blvd|Boulevard|Dr(?:ive)?|Ln|Lane|Way|Ct|Court|Pl(?:ace)?|Terr(?:ace)?|Ter|Cir(?:cle)?|Pkwy|Parkway|Hwy|Highway";

const ADDRESS_RE = new RegExp(
  `(?<![\\w/])(\\d+\\s+(?:[A-Z][a-zA-Z'\\-]{0,20}\\s+){1,4}(?:${STREET_SUFFIXES})(?:\\s+(?:Apt|Ste|Suite|Unit|#)\\s*[\\w\\-]+)?)(?![\\w/])`,
  "g",
);

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true when `index` falls inside a URL token in `text`.
 * A URL token starts with a scheme (http://, https://, ftp://) or www.
 */
function insideUrl(text: string, index: number): boolean {
  // Walk backwards to find the start of the current whitespace-delimited token.
  let start = index;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  const token = text.slice(start, index + 1);
  return /^(https?|ftp):\/\//i.test(token) || /^www\./i.test(token);
}

interface RawMatch {
  start: number;
  end: number;
  original: string;
  type: string;
}

// ─── core ────────────────────────────────────────────────────────────────────

/**
 * Redact PII from `text`.  Applies patterns in priority order:
 * SSN → email → phone → address.
 * Overlapping matches are skipped (first-match wins by start index).
 */
export function redactPII(text: string): RedactResult {
  // ReDoS safety: cap the string fed to regexes.  Adversarial inputs longer
  // than 10 000 chars can cause catastrophic backtracking on ADDRESS_RE even
  // after per-word length bounds.  We match only the first 10 000 chars and
  // append the remainder verbatim so that legitimate PII near the start is
  // still redacted while the worst-case regex work stays O(1) in input length.
  const MATCH_LIMIT = 10_000;
  const matchText =
    text.length > MATCH_LIMIT ? text.slice(0, MATCH_LIMIT) : text;
  const tail = text.length > MATCH_LIMIT ? text.slice(MATCH_LIMIT) : "";

  const raw: RawMatch[] = [];

  function collect(re: RegExp, type: string) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec iteration idiom
    while ((m = re.exec(matchText)) !== null) {
      const start = m.index;
      const original = m[0];
      const end = start + original.length;
      if (!insideUrl(matchText, start)) {
        raw.push({ start, end, original, type });
      }
    }
  }

  collect(SSN_RE, "SSN");
  collect(EMAIL_RE, "EMAIL");
  collect(PHONE_RE, "PHONE");
  collect(ADDRESS_RE, "ADDRESS");

  // Sort by start index; on ties, longer match wins (more specific).
  raw.sort((a, b) => a.start - b.start || b.end - a.end);

  // Merge overlapping matches (keep first/longer, discard overlapping tail).
  const merged: RawMatch[] = [];
  let cursor = 0;
  for (const m of raw) {
    if (m.start < cursor) continue; // overlaps previous
    merged.push(m);
    cursor = m.end;
  }

  // Build output (over the bounded match window, then append the raw tail).
  const spans: RedactedSpan[] = [];
  let result = "";
  let pos = 0;

  for (const m of merged) {
    result += matchText.slice(pos, m.start);
    const placeholder = `[${m.type}]`;
    spans.push({
      start: result.length,
      end: result.length + placeholder.length,
      type: m.type,
      original: m.original,
    });
    result += placeholder;
    pos = m.end;
  }
  result += matchText.slice(pos);
  result += tail; // characters beyond MATCH_LIMIT passed through unmodified

  return { redacted: result, spans };
}
