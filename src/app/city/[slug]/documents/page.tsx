import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { createServerClient } from "@/lib/db/client";
import { listContractorOptions } from "@/lib/db/contractors";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/documents/kinds";
import { getStaffAccessForCity } from "@/lib/staff-access";
import { timeAgo } from "@/lib/utils/time-ago";
import {
  AddDocumentModal,
  DeleteDocumentButton,
  RetrievalTester,
} from "./documents-console";

// Staff-gated per-request surface (cookies) — never prerender or cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "Civic | Documents",
};

interface DocumentRow {
  id: string;
  title: string;
  filename: string;
  doc_kind: DocKind;
  chunk_count: number;
  created_at: string;
  contractor_id: string | null;
}

export default async function CityDocumentsPage({ params }: PageProps) {
  const { slug } = await params;
  // Demo personas count as staff here, same as the contractor detail page.
  // Requiring "real" made this the only nav entry that 404s for every demo
  // login — the sidebar advertises "Documents" and the link dead-ends.
  const access = await getStaffAccessForCity(slug);
  if (access !== "real" && access !== "demo") notFound();

  // DB first (provisioned cities), then the KNOWN_CITIES fallback (demo deploy
  // / local dev without a database) — same convention as the video console.
  // Without a city row there is no id, so the list renders empty and ingestion
  // fails with a visible error rather than the page 404ing.
  const db = createServerClient();
  const { data: dbCity } = await db
    .from("cities")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle<{ id: string; name: string }>();
  const known = KNOWN_CITIES[slug];
  if (!dbCity && !known) notFound();
  const city = dbCity ?? { id: null, name: known.name };

  const [{ data: documents }, contractorOptions] = city.id
    ? await Promise.all([
        db
          .from("city_documents")
          .select(
            "id, title, filename, doc_kind, chunk_count, created_at, contractor_id",
          )
          .eq("city_id", city.id)
          .order("created_at", { ascending: false })
          .limit(100),
        listContractorOptions(city.id),
      ])
    : [{ data: [] }, [] as { id: string; name: string }[]];

  const rows = (documents ?? []) as DocumentRow[];
  const totalChunks = rows.reduce((sum, row) => sum + row.chunk_count, 0);

  // Corpus rows may cite an inactive vendor the (active-only) dropdown no
  // longer offers — resolve those names too so the link never goes blank.
  const contractorName = new Map(contractorOptions.map((c) => [c.id, c.name]));
  const unresolved = [
    ...new Set(
      rows
        .map((r) => r.contractor_id)
        .filter((id): id is string => Boolean(id && !contractorName.has(id))),
    ),
  ];
  if (city.id && unresolved.length > 0) {
    const { data: extra } = await db
      .from("contractors")
      .select("id, name")
      .eq("city_id", city.id)
      .in("id", unresolved);
    for (const c of (extra ?? []) as { id: string; name: string }[]) {
      contractorName.set(c.id, c.name);
    }
  }

  return (
    // Same page shell as the Teams/Analytics tabs: 1800px content column,
    // pt-city-content for the mobile fixed-header offset, hairline footer.
    <div className="flex flex-col min-h-dvh bg-background">
      <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Page header — same shape as Members: title + purpose on the left,
            the primary action on the right. The corpus size is stated here as
            a fact about the shelf rather than as a label above a list. */}
        <section className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
                Documents
              </h1>
              <p className="font-mono text-[12px] tabular-nums text-faint">
                {rows.length} doc{rows.length === 1 ? "" : "s"} · {totalChunks}{" "}
                chunk{totalChunks === 1 ? "" : "s"}
              </p>
            </div>
            <p className="mt-1 max-w-[80ch] text-[13px] leading-relaxed text-faint">
              Policies, contracts, and specs that govern repair work in{" "}
              {city.name}. Uploaded text is split into indexed chunks so the
              clause covering a given road or defect can be pulled up next to
              the report it applies to.
            </p>
          </div>
          <AddDocumentModal slug={slug} contractors={contractorOptions} />
        </section>

        {/* Retrieval — the surface whose output actually needs reading room —
            takes the wide column; the corpus rides a fixed-width right rail. */}
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          <RetrievalTester slug={slug} />

          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
            <div className="flex items-baseline justify-between gap-3 border-b border-hairline px-4 py-3">
              <h2 className="text-[15px] font-semibold leading-tight text-foreground">
                Corpus
              </h2>
              <span className="font-mono text-[11px] tabular-nums text-faint">
                {rows.length} indexed
              </span>
            </div>

            {rows.length > 0 ? (
              <ul>
                {rows.map((row, idx) => (
                  <li
                    key={row.id}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-overlay ${
                      idx > 0 ? "border-t border-hairline" : ""
                    }`}
                  >
                    <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-hairline bg-overlay text-faint">
                      <FileText
                        className="h-3.5 w-3.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </span>

                    <div className="min-w-0 flex-1">
                      {/* Title line carries the type chip so a row can be
                          classified before reading a word of metadata. */}
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="min-w-0 truncate text-[13px] font-medium text-foreground">
                          {row.title}
                        </p>
                        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                          {DOC_KIND_LABEL[row.doc_kind] ?? row.doc_kind}
                        </span>
                      </div>
                      {/* One quiet metadata line — everything text-faint so
                          the title above stays primary; the vendor link is
                          a shade warmer with a hairline dotted underline
                          instead of shouting over its neighbors. */}
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] text-faint">
                        <span className="tabular-nums">
                          {row.chunk_count} chunks
                        </span>
                        {row.contractor_id &&
                          contractorName.has(row.contractor_id) && (
                            <Link
                              href={`/city/${slug}/contractors/${row.contractor_id}`}
                              className="text-subtle underline decoration-hairline-strong decoration-dotted underline-offset-2 transition-colors hover:text-foreground hover:decoration-current"
                            >
                              {contractorName.get(row.contractor_id)}
                            </Link>
                          )}
                        <span className="tabular-nums">
                          {timeAgo(row.created_at)}
                        </span>
                        <span className="min-w-0 truncate">{row.filename}</span>
                      </p>
                    </div>

                    <DeleteDocumentButton
                      slug={slug}
                      documentId={row.id}
                      title={row.title}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-overlay text-faint">
                  <FileText
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </span>
                <p className="mt-3 text-[13px] font-medium text-foreground">
                  Nothing indexed yet
                </p>
                <p className="mt-1 max-w-[42ch] text-[13px] text-faint">
                  Add a maintenance policy or a contractor agreement — retrieval
                  has nothing to match against until one is stored.
                </p>
                <div className="mt-4">
                  <AddDocumentModal
                    slug={slug}
                    contractors={contractorOptions}
                    variant="outline"
                    label="Add the first document"
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <footer className="border-t border-hairline mt-10 pb-safe">
        <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-between gap-3 px-3 py-6 text-[13px] text-faint sm:flex-row sm:px-4 lg:px-6">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}
