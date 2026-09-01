"use client";

/**
 * Client console for the Documents workspace: the add-document dialog
 * (ingestion by file pick or paste), per-row delete, and the retrieval tester
 * that proves the mechanism works.
 *
 * Chrome and controls come from the staff-console dialog kit
 * (MemberModalShell / FormError / MenuSelect / Button) so this surface
 * speaks the same visual language as the New Team and Invite member dialogs
 * rather than inventing a second one.
 */
import { Check, FileUp, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { FormError, MemberModalShell } from "@/components/members/member-modal";
import { Button } from "@/components/ui/button";
import { MenuSelect } from "@/components/ui/menu-select";
import { DOC_KIND_LABEL, DOC_KINDS, type DocKind } from "@/lib/documents/kinds";
import type { GuidanceChunk } from "@/lib/documents/retrieve";
import { cn } from "@/lib/utils/cn";
import { deleteDocument, ingestDocument, testRetrieval } from "./actions";

/** Section heading inside the dialog — the reference dialogs' own eyebrow. */
const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wide text-faint";
const FIELD_LABEL = "text-[12px] font-medium text-subtle";
const CONTROL =
  "h-9 w-full rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 text-[13px] text-foreground placeholder:text-faint outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

type SourceMode = "file" | "paste";

interface Contractor {
  id: string;
  name: string;
}

/* ==================================================================
   Add document — trigger + dialog.

   Self-manages open state so the page (a server component) can drop the
   trigger straight into its header, exactly like InviteMemberModal.
   ================================================================== */

export function AddDocumentModal({
  slug,
  contractors = [],
  variant = "accent",
  label = "Add document",
}: {
  slug: string;
  /** Active vendors for the optional "concerns contractor" link (066). */
  contractors?: Contractor[];
  variant?: "accent" | "outline";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" strokeWidth={2} />
        {label}
      </Button>
      {open && (
        <AddDocumentDialog
          slug={slug}
          contractors={contractors}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddDocumentDialog({
  slug,
  contractors,
  onClose,
}: {
  slug: string;
  contractors: Contractor[];
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const kindId = useId();
  const pasteId = useId();
  const fileId = useId();
  const contractorId = useId();
  const [title, setTitle] = useState("");
  const [docKind, setDocKind] = useState<DocKind>("policy");
  const [contractor, setContractor] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Chunk count of the last successful ingest — drives the success panel. */
  const [indexed, setIndexed] = useState<number | null>(null);
  const [mode, setMode] = useState<SourceMode>("file");
  /** Mirrors the picked file's name for the custom picker's readout. */
  const [fileName, setFileName] = useState<string | null>(null);

  // Both source panels stay mounted (the inactive one is display:none) so the
  // staged FileList survives a tab switch and the resolution below — a picked
  // file wins over pasted text — stays exactly what it always was.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file && !pasted.trim()) {
      setError("Choose a .txt/.md file or paste the text.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const text = file ? await file.text() : pasted;
      const filename = file?.name ?? "pasted-text.txt";
      const result = await ingestDocument({
        slug,
        title: title.trim() || filename.replace(/\.[^.]+$/, ""),
        filename,
        docKind,
        text,
        contractorId: contractor || null,
      });
      if (!result.ok) {
        setError(`Ingestion refused: ${result.error}`);
        return;
      }
      setIndexed(result.data.chunkCount);
      setTitle("");
      setPasted("");
      setContractor("");
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const stagedFileWinsOverPaste = mode === "paste" && fileName !== null;

  return (
    <MemberModalShell
      title="Add document"
      subtitle="Stored, split into chunks, and indexed for retrieval"
      icon={<FileUp className="h-4 w-4" strokeWidth={1.75} />}
      onClose={onClose}
    >
      {indexed !== null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-overlay text-foreground">
            <Check className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">
              Stored &amp; indexed
            </h3>
            <p className="mt-1 text-[13px] text-subtle">
              <span className="font-medium tabular-nums text-foreground">
                {indexed}
              </span>{" "}
              chunk{indexed === 1 ? "" : "s"} are now searchable from the
              retrieval panel.
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Done
            </Button>
            <Button variant="accent" size="sm" onClick={() => setIndexed(null)}>
              Add another
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar p-5">
            {error && <FormError message={error} />}

            <section className="space-y-4">
              <h3 className={SECTION_LABEL}>Document</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor={titleId} className="flex flex-col gap-1.5">
                  <span className={FIELD_LABEL}>Title</span>
                  <input
                    id={titleId}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Defaults to the filename"
                    autoComplete="off"
                    className={CONTROL}
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={kindId} className={FIELD_LABEL}>
                    Type
                  </label>
                  <MenuSelect
                    id={kindId}
                    value={docKind}
                    // Options are exactly the DocKind union, so the cast is total.
                    onChange={(v) => setDocKind(v as DocKind)}
                    options={DOC_KINDS.map((kind) => ({
                      value: kind,
                      label: DOC_KIND_LABEL[kind],
                    }))}
                  />
                </div>
              </div>

              {contractors.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={contractorId} className={FIELD_LABEL}>
                    Contractor
                  </label>
                  <MenuSelect
                    id={contractorId}
                    value={contractor || null}
                    onChange={(v) => setContractor(v ?? "")}
                    placeholder="No contractor — general city document"
                    options={contractors.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                  />
                  <p className="text-[11px] text-faint">
                    Files the document against one vendor's agreement instead of
                    the city's general policy shelf.
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={SECTION_LABEL}>Source</h3>
                {/* One of two — the segmented register the filter bar uses. */}
                <div className="inline-flex items-center rounded-[10px] border border-hairline bg-overlay p-0.5">
                  {(
                    [
                      ["file", "Upload file"],
                      ["paste", "Paste text"],
                    ] as const
                  ).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={mode === value}
                      onClick={() => setMode(value)}
                      className={cn(
                        "rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]",
                        mode === value
                          ? "bg-foreground text-background"
                          : "text-subtle hover:text-foreground",
                      )}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hidden, not unmounted: the staged file must survive a switch. */}
              <div className={cn("space-y-2", mode !== "file" && "hidden")}>
                <input
                  ref={fileRef}
                  id={fileId}
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={(e) =>
                    setFileName(e.target.files?.[0]?.name ?? null)
                  }
                  className="peer sr-only"
                />
                {/* The real input is sr-only; its focus ring is projected onto
                    this row so keyboard users still see where they are. */}
                <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-hairline-strong bg-overlay/50 px-3 py-3 transition-colors peer-focus-visible:border-[var(--color-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60">
                  <label
                    htmlFor={fileId}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-hairline-strong bg-surface px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-overlay"
                  >
                    <FileUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Choose file
                  </label>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px]",
                      fileName ? "text-foreground" : "text-faint",
                    )}
                  >
                    {fileName ?? "No file chosen"}
                  </span>
                  {/* Without this the staged-file note in the paste tab would
                      name an action the picker cannot perform. */}
                  {fileName && (
                    <button
                      type="button"
                      aria-label="Clear selected file"
                      onClick={() => {
                        if (fileRef.current) fileRef.current.value = "";
                        setFileName(null);
                      }}
                      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-faint outline-offset-2 transition-colors hover:bg-overlay-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-faint">
                  Plain text and markdown only — PDF is not supported (no PDF
                  parser ships with this app). Export or paste the text instead.
                </p>
              </div>

              <div className={cn("space-y-2", mode !== "paste" && "hidden")}>
                <label htmlFor={pasteId} className="sr-only">
                  Document text
                </label>
                <textarea
                  id={pasteId}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={8}
                  placeholder={
                    "## 4.2 Response times\nPriority-one defects are repaired within 24 hours…"
                  }
                  className={cn(
                    CONTROL,
                    "h-auto resize-y py-2 leading-relaxed",
                  )}
                />
                <p className="text-[11px] text-faint">
                  Markdown headings become the section label on each stored
                  chunk.
                </p>
                {stagedFileWinsOverPaste && (
                  <p className="text-[11px] text-subtle">
                    <span className="font-medium text-foreground">
                      {fileName}
                    </span>{" "}
                    is still selected and will be stored instead of this text.
                    Clear it on the upload tab to paste instead.
                  </p>
                )}
              </div>
            </section>
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-hairline px-5 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              isPending={busy}
              disabled={busy}
            >
              {busy ? "Indexing…" : "Store & index"}
            </Button>
          </div>
        </form>
      )}
    </MemberModalShell>
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
      className="inline-flex h-8 min-h-11 w-8 min-w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-transparent text-faint md:min-h-0 md:min-w-0 outline-offset-2 transition-colors hover:border-hairline-strong hover:bg-overlay hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

/* ==================================================================
   Test retrieval — a search surface, not a form.

   The query box is the first thing in the panel; everything below it is
   the result region, which always holds a shaped block (idle, empty,
   error, or matches) so the panel never collapses.
   ================================================================== */

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
    <section className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
      <div className="border-b border-hairline px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-[15px] font-semibold leading-tight text-foreground">
            Test retrieval
          </h2>
          {results && results.length > 0 && (
            <span className="text-[12px] tabular-nums text-faint">
              {results.length} match{results.length === 1 ? "" : "es"}
            </span>
          )}
        </div>
        <p className="mt-1 max-w-[80ch] text-[13px] leading-relaxed text-subtle">
          Type a scenario the way a report would arrive. This runs the same
          city-scoped full-text lookup a report surface uses, so you can see
          which clause would be shown to the dispatcher.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={inputId}>
            Retrieval scenario
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              id={inputId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
              placeholder="pothole on Peachtree Industrial Blvd"
              className={cn(CONTROL, "h-10 pl-9")}
            />
          </div>
          <Button
            type="button"
            variant="accent"
            onClick={run}
            isPending={busy}
            disabled={busy}
            className="h-10"
          >
            {busy ? "Searching…" : "Find guidance"}
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {error ? (
          <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-4 py-3">
            <p role="alert" className="text-[13px] text-foreground">
              Lookup failed: {error}
            </p>
          </div>
        ) : !results ? (
          <div className="flex flex-col items-center rounded-[var(--radius-md)] border border-dashed border-hairline-strong px-6 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-overlay text-faint">
              <Search
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <p className="mt-3 text-[13px] font-medium text-foreground">
              No lookup run yet
            </p>
            <p className="mt-1 max-w-[46ch] text-[13px] text-faint">
              Matched clauses appear here — full-text ranked, city-scoped, top
              matches first.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center rounded-[var(--radius-md)] border border-dashed border-hairline-strong px-6 py-12 text-center">
            <p className="text-[13px] font-medium text-foreground">
              No matching guidance
            </p>
            <p className="mt-1 max-w-[46ch] text-[13px] text-faint">
              Try the road name or the defect type on its own.
            </p>
          </div>
        ) : (
          <ol className="grid gap-3 2xl:grid-cols-2">
            {results.map((chunk, idx) => (
              <li
                key={chunk.chunkId}
                className="overflow-hidden rounded-[var(--radius-md)] border border-hairline bg-overlay/40"
              >
                {/* Rank rail: the ordinal and score sit in their own strip so
                    "0.0973" reads as a score, not a stray number in the title. */}
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-hairline px-3 py-2">
                  <span className="font-mono text-[11px] tabular-nums text-faint">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 text-[13px] font-medium text-foreground">
                    {chunk.documentTitle}
                  </span>
                  {chunk.heading && (
                    <span className="min-w-0 truncate text-[13px] text-subtle">
                      {chunk.heading}
                    </span>
                  )}
                  <span className="ml-auto flex items-baseline gap-2">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                      {DOC_KIND_LABEL[chunk.docKind as DocKind]}
                    </span>
                    <span
                      className="font-mono text-[11px] tabular-nums text-faint"
                      title="Full-text match score — higher ranks first"
                    >
                      {chunk.rank.toFixed(3)}
                    </span>
                  </span>
                </div>
                <p className="max-w-[90ch] px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-subtle">
                  {chunk.content}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
