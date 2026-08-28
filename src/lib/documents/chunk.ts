/**
 * Deterministic document chunker for the Documents workspace.
 *
 * The same text always produces the same chunks — no model, no randomness — so
 * a re-upload of an amended policy diffs cleanly against the previous one.
 *
 * Strategy, in order of preference:
 *   1. Split on markdown headings. A heading is a real semantic boundary in a
 *      municipal policy ("6.2 Warranty period"), and it becomes the chunk's
 *      `heading` so a retrieved fragment can say where it came from.
 *   2. Within a section, pack whole paragraphs up to MAX_CHARS.
 *   3. Only a paragraph that is itself larger than MAX_CHARS is cut, and then
 *      always at a word boundary — never mid-word.
 *
 * Consecutive chunks WITHIN a section overlap by ~OVERLAP_CHARS so a sentence
 * straddling a boundary is still fully present in one of them. Overlap does not
 * cross a heading boundary: carrying section 5's tail into section 6 would
 * attribute the wrong clause to the wrong heading.
 */

/** Upper bound before a chunk is flushed (overlap is added on top of this). */
const MAX_CHARS = 900;
/** Preferred size when an oversized paragraph has to be cut. */
const TARGET_CHARS = 800;
/** Trailing context carried into the next chunk of the same section. */
const OVERLAP_CHARS = 100;

export interface DocumentChunk {
  /** 0-based position in the document; restores reading order. */
  ordinal: number;
  content: string;
  /** Nearest enclosing markdown heading, or null above the first one. */
  heading: string | null;
}

interface Section {
  heading: string | null;
  body: string;
}

const HEADING_RE = /^\s{0,3}#{1,6}\s+(.*\S)\s*$/;

/** Split on ATX markdown headings. Text above the first heading is a section. */
function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let heading: string | null = null;
  let lines: string[] = [];

  const push = () => {
    const body = lines.join("\n").trim();
    if (body) sections.push({ heading, body });
    lines = [];
  };

  for (const line of text.split("\n")) {
    const match = HEADING_RE.exec(line);
    if (match) {
      push();
      heading = match[1];
    } else {
      lines.push(line);
    }
  }
  push();

  // Headings with no body under them produce no section: the heading text is
  // already indexed on every chunk it governs, so an empty one adds nothing.
  return sections;
}

/** Blank-line-separated paragraphs, whitespace-normalized, empties dropped. */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+\n/g, "\n").trim())
    .filter(Boolean);
}

/**
 * Cut an oversized paragraph into <= MAX_CHARS pieces at word boundaries.
 * A single unbroken token longer than the limit is emitted whole rather than
 * severed — a URL or a parcel id stays usable.
 */
function splitLongParagraph(paragraph: string): string[] {
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > MAX_CHARS) {
    // Prefer a sentence end inside the target window, else the last space.
    const window = rest.slice(0, MAX_CHARS);
    const sentence = window.lastIndexOf(". ");
    const space = window.lastIndexOf(" ");
    const cut =
      sentence >= TARGET_CHARS / 2
        ? sentence + 1
        : space > 0
          ? space
          : MAX_CHARS;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/**
 * Tail of `chunk` to repeat at the head of the next chunk, snapped forward to
 * a word boundary so the overlap never begins mid-word.
 */
function overlapTail(chunk: string): string {
  if (chunk.length <= OVERLAP_CHARS) return chunk;
  const tail = chunk.slice(chunk.length - OVERLAP_CHARS);
  const space = tail.indexOf(" ");
  return space === -1 ? "" : tail.slice(space + 1).trim();
}

/**
 * Chunk a plain-text or markdown document. Returns [] for empty input.
 */
export function chunkDocument(text: string): DocumentChunk[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const chunks: DocumentChunk[] = [];

  for (const section of splitSections(normalized)) {
    const units = splitParagraphs(section.body).flatMap((p) =>
      p.length > MAX_CHARS ? splitLongParagraph(p) : [p],
    );

    let buffer = "";
    let carry = "";

    const flush = () => {
      if (!buffer) return;
      const content = (carry ? `${carry} ${buffer}` : buffer).trim();
      chunks.push({
        ordinal: chunks.length,
        content,
        heading: section.heading,
      });
      carry = overlapTail(content);
      buffer = "";
    };

    for (const unit of units) {
      const candidate = buffer ? `${buffer}\n\n${unit}` : unit;
      if (buffer && candidate.length > MAX_CHARS) {
        flush();
        buffer = unit;
      } else {
        buffer = candidate;
      }
    }
    flush();
  }

  return chunks;
}

export const CHUNK_PARAMS = {
  maxChars: MAX_CHARS,
  targetChars: TARGET_CHARS,
  overlapChars: OVERLAP_CHARS,
} as const;
