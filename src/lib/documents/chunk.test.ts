import { describe, expect, it } from "vitest";
import { CHUNK_PARAMS, chunkDocument } from "./chunk";

/** Deterministic filler that never repeats a word, so overlap is checkable. */
function words(count: number, prefix = "w"): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`).join(" ");
}

describe("chunkDocument", () => {
  it("returns nothing for empty or whitespace-only input", () => {
    expect(chunkDocument("")).toEqual([]);
    expect(chunkDocument("   \n\n \t ")).toEqual([]);
  });

  it("keeps a single short paragraph as one heading-less chunk", () => {
    const text = "Potholes deeper than two inches are a priority-one repair.";
    expect(chunkDocument(text)).toEqual([
      { ordinal: 0, content: text, heading: null },
    ]);
  });

  it("splits on markdown headings and tags each chunk with its heading", () => {
    const chunks = chunkDocument(
      [
        "Preamble text before any heading.",
        "",
        "## Response times",
        "",
        "Priority one is repaired within 24 hours.",
        "",
        "### Warranty",
        "",
        "Contractor work carries a two year warranty.",
      ].join("\n"),
    );

    expect(chunks.map((c) => c.heading)).toEqual([
      null,
      "Response times",
      "Warranty",
    ]);
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2]);
    expect(chunks[1].content).toBe("Priority one is repaired within 24 hours.");
  });

  it("packs paragraphs up to the max and never exceeds it by more than the overlap", () => {
    // Six ~200-char paragraphs: too big for one chunk, several per chunk.
    const body = Array.from({ length: 6 }, (_, i) => words(33, `p${i}s`)).join(
      "\n\n",
    );
    const chunks = chunkDocument(body);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(
        CHUNK_PARAMS.maxChars + CHUNK_PARAMS.overlapChars + 1,
      );
    }
    expect(chunks.map((c) => c.ordinal)).toEqual(
      chunks.map((_, index) => index),
    );
  });

  it("carries overlapping tail text into the next chunk of the same section", () => {
    const chunks = chunkDocument(
      Array.from({ length: 6 }, (_, i) => words(33, `p${i}s`)).join("\n\n"),
    );
    const [first, second] = chunks;

    // Longest tail of chunk 1 that chunk 2 opens with, that is the overlap.
    let carried = 0;
    for (let k = CHUNK_PARAMS.overlapChars; k > 0; k--) {
      if (second.content.startsWith(first.content.slice(-k))) {
        carried = k;
        break;
      }
    }
    expect(carried).toBeGreaterThan(CHUNK_PARAMS.overlapChars / 2);
    // Word-boundary rule: the overlap starts after a space, not mid-word.
    expect(first.content[first.content.length - carried - 1]).toBe(" ");
  });

  it("does not carry overlap across a heading boundary", () => {
    const chunks = chunkDocument(
      [
        "## Alpha",
        "",
        words(60, "alpha"),
        "",
        "## Beta",
        "",
        "Beta section body.",
      ].join("\n"),
    );
    const beta = chunks.find((c) => c.heading === "Beta");
    expect(beta?.content).toBe("Beta section body.");
    expect(beta?.content).not.toContain("alpha");
  });

  it("cuts an oversized paragraph at word boundaries, never mid-word", () => {
    const chunks = chunkDocument(words(400, "tok"));

    expect(chunks.length).toBeGreaterThan(1);
    const tokens = new Set(
      chunks.flatMap((c) => c.content.split(/\s+/)).filter(Boolean),
    );
    // Every emitted token is a whole `tokN` from the source, no severed words.
    for (const token of tokens) {
      expect(token).toMatch(/^tok\d+$/);
    }
    // And nothing was dropped.
    for (let i = 0; i < 400; i++) expect(tokens.has(`tok${i}`)).toBe(true);
  });

  it("is deterministic across runs", () => {
    const text = ["# Policy", "", words(200), "", "## Claims", "", words(90)]
      .join("\n")
      .toString();
    expect(chunkDocument(text)).toEqual(chunkDocument(text));
  });
});
