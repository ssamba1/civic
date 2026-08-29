"use client";

/**
 * Client console for the Documents workspace: ingestion (file pick or paste),
 * per-row delete, and the retrieval tester that proves the mechanism works.
 * Utilitarian by design — this is a staff ops surface, not a resident page.
 */
import { Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { DOC_KIND_LABEL, DOC_KINDS, type DocKind } from "@/lib/documents/kinds";
import type { GuidanceChunk } from "@/lib/documents/retrieve";
import { deleteDocument, ingestDocument, testRetrieval } from "./actions";

const EYEBROW =
  "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint";
const FIELD =
  "h-8 w-full rounded-md border border-hairline-strong bg-transparent px-2 text-[13px] text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60";
const BUTTON =
  "inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50";

export function UploadDocument({ slug }: { slug: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const kindId = useId();
  const pasteId = useId();
  const [title, setTitle] = useState("");
  const [docKind, setDocKind] = useState<DocKind>("policy");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file && !pasted.trim()) {
      setMessage("Choose a .txt/.md file or paste the text.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const text = file ? await file.text() : pasted;
      const filename = file?.name ?? "pasted-text.txt";
      const result = await ingestDocument({
        slug,
        title: title.trim() || filename.replace(/\.[^.]+$/, ""),
        filename,
        docKind,
        text,
      });
      if (!result.ok) {
        setMessage(`Ingestion refused: ${result.error}`);
        return;
      }
      setMessage(`Stored — ${result.data.chunkCount} chunks indexed.`);
      setTitle("");
      setPasted("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4">
      <h2 className={`${EYEBROW} mb-3`}>Add document</h2>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem]">
        <div>
          <label className="sr-only" htmlFor={titleId}>
            Document title
          </label>
          <input
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (defaults to the filename)"
            className={FIELD}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor={kindId}>
            Document kind
          </label>
          <select
            id={kindId}
            value={docKind}
            onChange={(e) => setDocKind(e.target.value as DocKind)}
            className={FIELD}
          >
            {DOC_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {DOC_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        aria-label="Document file"
        className="mt-2 w-full text-[13px] text-subtle file:mr-2 file:h-7 file:rounded-md file:border file:border-hairline-strong file:bg-transparent file:px-2 file:text-[12px] file:text-foreground"
      />

      <label className={`${EYEBROW} mt-3 mb-1.5 block`} htmlFor={pasteId}>
        or paste text
      </label>
      <textarea
        id={pasteId}
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        rows={5}
        placeholder={
          "## 4.2 Response times\nPriority-one defects are repaired within 24 hours…"
        }
        className="w-full resize-y rounded-md border border-hairline-strong bg-transparent px-2 py-1.5 text-[13px] leading-relaxed text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className={BUTTON}
        >
          {busy ? "Indexing…" : "Store & index"}
        </button>
        {message && <p className="text-[13px] text-subtle">{message}</p>}
      </div>

      <p className="mt-2 text-[11px] text-faint">
        Plain text and markdown only — PDF is not supported (no PDF parser ships
        with this app). Export or paste the text instead. Markdown headings
        become the section label on each stored chunk.
      </p>
    </section>
  );
}

export function DeleteDocumentButton({
  slug,
  documentId,
  title,
}: {
  slug: string;
  documentId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const result = await deleteDocument({ slug, documentId });
      if (result.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label={`Delete ${title}`}
      title={`Delete ${title}`}
      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-hairline-strong text-faint transition-colors hover:bg-overlay hover:text-foreground disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}

export function RetrievalTester({ slug }: { slug: string }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<GuidanceChunk[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (query.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const result = await testRetrieval({ slug, query });
      if (result.ok) {
        setResults(result.data);
      } else {
        setResults(null);
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4">
      <h2 className={`${EYEBROW} mb-1`}>Test retrieval</h2>
      <p className="mb-3 max-w-[80ch] text-[13px] leading-relaxed text-subtle">
        Type a scenario the way a report would arrive. This runs the same
        city-scoped full-text lookup a report surface uses, so you can see which
        clause would be shown to the dispatcher.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={inputId}>
          Retrieval scenario
        </label>
        <input
          id={inputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder="pothole on Peachtree Industrial Blvd"
          className={`${FIELD} min-w-0 flex-1`}
        />
        <button type="button" onClick={run} disabled={busy} className={BUTTON}>
          <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {busy ? "Searching…" : "Find guidance"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-[13px] text-pastel-blush-strong">
          Lookup failed: {error}
        </p>
      )}

      {!results && !error && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-hairline-strong px-4 py-8 text-center">
          <p className="text-[13px] text-subtle">
            No lookup run yet — matched clauses appear here.
          </p>
          <p className="mt-1 text-[13px] text-faint">
            Full-text ranked, city-scoped, top matches first.
          </p>
        </div>
      )}

      {results && results.length === 0 && (
        <p className="mt-3 text-[13px] text-subtle">
          No matching guidance. Try the road name or the defect type on its own.
        </p>
      )}

      {results && results.length > 0 && (
        <ol className="mt-3 grid gap-2 2xl:grid-cols-2">
          {results.map((chunk) => (
            <li
              key={chunk.chunkId}
              className="rounded-[var(--radius-md)] border border-hairline bg-overlay/40 p-3"
            >
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[13px] font-medium text-foreground">
                  {chunk.documentTitle}
                </span>
                {chunk.heading && (
                  <span className="text-[13px] text-subtle">
                    {chunk.heading}
                  </span>
                )}
                <span className={EYEBROW}>
                  {DOC_KIND_LABEL[chunk.docKind as DocKind]}
                </span>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
                  {chunk.rank.toFixed(4)}
                </span>
              </div>
              <p className="max-w-[90ch] text-[13px] leading-relaxed whitespace-pre-wrap text-subtle">
                {chunk.content}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
