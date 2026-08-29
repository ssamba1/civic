import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { createServerClient } from "@/lib/db/client";
import { listContractors } from "@/lib/db/contractors";
import { getStaffAccessForCity } from "@/lib/staff-access";
import { ContractorsConsole } from "./contractors-console";

// Staff-gated per-request surface (cookies) — never prerender or cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "Civic | Contractors",
};

export default async function CityContractorsPage({ params }: PageProps) {
  const { slug } = await params;
  // Demo-grade staff may browse (the liability badge links here from the
  // grid, which demo personas can see) — they just get masked vendor emails,
  // same PII rule as the Members tab.
  const access = await getStaffAccessForCity(slug);
  if (access !== "real" && access !== "demo") notFound();

  const db = createServerClient();
  const { data: dbCity } = await db
    .from("cities")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle<{ id: string; name: string }>();
  const known = KNOWN_CITIES[slug];
  if (!dbCity && !known) notFound();

  const rows = dbCity
    ? await listContractors(dbCity.id, { maskPii: access === "demo" })
    : { ok: true as const, data: [] };
  const cityName = dbCity?.name ?? known.name;

  return (
    // Same page shell as the Members tab — the two rosters read as one
    // surface.
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <section className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
            Contractors
          </h1>
          <p className="text-[13px] text-faint">
            Vendors under agreement with {cityName} — capital jobs, warranty
            windows, filed documents, attributed reports.
            {access === "demo" && " Demo session — vendor emails are masked."}
          </p>
        </section>

        <ContractorsConsole
          slug={slug}
          rows={rows.ok ? rows.data : []}
          loadError={rows.ok ? null : rows.error}
        />
      </div>
    </div>
  );
}
