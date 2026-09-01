import { HELP_CORPUS, type HelpDoc } from "@/lib/ai/help-corpus";

const STOP = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "do",
  "does",
  "how",
  "what",
  "my",
  "i",
  "in",
  "to",
  "of",
  "and",
  "or",
  "for",
  "on",
  "it",
  "me",
  "can",
  "you",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function docTerms(doc: HelpDoc): string[] {
  return tokenize(`${doc.title} ${doc.tags.join(" ")} ${doc.body}`);
}

/**
 * Lexical top-k over the help corpus. Scores by query-term overlap, weighting
 * title/tag matches higher than body matches. Pure and synchronous. The seam
 * a future pgvector implementation would replace.
 */
export function searchCorpus(query: string, k = 3): HelpDoc[] {
  const qTerms = new Set(tokenize(query));
  if (qTerms.size === 0) return [];

  const scored = HELP_CORPUS.map((doc) => {
    const titleTags = new Set(tokenize(`${doc.title} ${doc.tags.join(" ")}`));
    const all = docTerms(doc);
    let score = 0;
    for (const term of qTerms) {
      if (titleTags.has(term)) score += 3;
      else if (all.includes(term)) score += 1;
    }
    return { doc, score };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.doc);
}
