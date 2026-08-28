import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { createServerClient } from "@/lib/db/client";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/documents/kinds";
import { getStaffAccessForCity } from "@/lib/staff-access";
import { timeAgo } from "@/lib/utils/time-ago";
import {
  DeleteDocumentButton,
  RetrievalTester,
  UploadDocument,
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
}

const EYEBROW =
  "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint";

export default async function CityDocumentsPage({ params }: PageProps) {
  const { slug } = await params;
  const access = await getStaffAccessForCity(slug);
  if (access !== "real") notFound();

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

  const { data: documents } = city.id
    ? await db
        .from("city_documents")
        .select("id, title, filename, doc_kind, chunk_count, created_at")
        .eq("city_id", city.id)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] };

  const rows = (documents ?? []) as DocumentRow[];
  const totalChunks = rows.reduce((sum, row) => sum + row.chunk_count, 0);

  return (
    <main className="mx-auto max-w-[92rem] space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Documents — {city.name}</h1>
        <p className="mt-1 text-sm text-subtle">
          Policies, contracts, and specs that govern repair work. Uploaded text
          is split into indexed chunks so the clause covering a given road or
          defect can be pulled up next to the report it applies to.
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Left column: ingestion + the corpus it produces. */}
        <div className="space-y-4">
          <UploadDocument slug={slug} />

          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <h2 className={EYEBROW}>Corpus</h2>
              <span className="font-mono text-[11px] tabular-nums text-faint">
                {rows.length} docs · {totalChunks} chunks
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
                    <FileText
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-faint"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {row.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-subtle">
                        <span className={EYEBROW}>
                          {DOC_KIND_LABEL[row.doc_kind] ?? row.doc_kind}
                        </span>
                        <span className="tabular-nums">
                          {row.chunk_count} chunks
                        </span>
                        <span className="tabular-nums text-faint">
                          {timeAgo(row.created_at)}
                        </span>
                        <span className="truncate text-faint">
                          {row.filename}
                        </span>
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
              <p className="px-4 py-6 text-[13px] text-subtle">
                No documents yet. Add a maintenance policy or a contractor
                agreement above — retrieval has nothing to match against until
                one is indexed.
              </p>
            )}
          </section>
        </div>

        {/* Right column: proof the mechanism works, sticky beside the corpus. */}
        <div className="lg:sticky lg:top-6">
          <RetrievalTester slug={slug} />
        </div>
      </div>
    </main>
  );
}
