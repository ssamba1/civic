import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CrewTypesPanel } from "@/components/crews/crew-types-panel";
import { InviteMemberModal } from "@/components/members/invite-member-modal";
import type { CrewOption } from "@/components/members/member-modal";
import { MembersTable } from "@/components/members/members-table";
import { type CrewTypeDef, DEFAULT_CREW_TYPES } from "@/lib/crew-types";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import { listContractors } from "@/lib/db/contractors";
import { fetchCityCrewTypes } from "@/lib/db/crew-types";
import { fetchCrewWorkloads } from "@/lib/db/crew-workloads";
import { fetchCityCrews } from "@/lib/db/crews";
import {
  type CityMembersResult,
  fetchCityMembers,
  maskEmail,
  maskPhone,
} from "@/lib/db/members";
import { getCityAdminContext, getStaffAccessForCity } from "@/lib/staff-access";

// Auth-gated per request (reads cookies via isStaffForCity) and exposes member
// PII — never prerender or cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  if (!city) return { title: "City not found | Civic" };
  return {
    title: `Civic | ${city.name}, ${city.state} — Members`,
    description: `People with access to the ${city.name} console — residents, dispatchers, supervisors, and admins.`,
    // Member emails are PII behind an auth gate; keep this out of search indexes.
    robots: { index: false, follow: false },
  };
}

export default async function CityMembersPage({ params }: PageProps) {
  const { slug } = await params;

  // Resolve the city the way the grid page does: real DB row first, falling
  // back to the synthetic KNOWN_CITIES entry so demo slugs still resolve.
  let dbCity = null;
  try {
    dbCity = await fetchCityFromDb(slug);
  } catch {
    dbCity = null;
  }
  const city = dbCity ?? (await fetchCityMock(slug));
  if (!city) notFound();

  // Access gate. Unlike the grid, there is NO public demo-city bypass here:
  // this page exposes member emails (PII) and must never be public, even for
  // the demo slug. Demo staff sessions may view the roster, but demo
  // credentials are public — so "demo" access gets emails masked server-side
  // (the raw addresses never reach the client). Only "real" staff (an
  // authenticated user whose city matches) see raw emails.
  const access = await getStaffAccessForCity(slug);
  if (!access) {
    redirect(`/login?redirect=/city/${slug}/members`);
  }

  // Management (invite / edit) is gated on a genuine city admin — never a demo
  // session, whose public credentials prove nothing about the visitor.
  const adminCtx = access === "real" ? await getCityAdminContext(slug) : null;
  const canManage = adminCtx !== null;

  // All five datasets depend only on the resolved city id — fetch them in
  // parallel so the page waits one roundtrip, not a five-deep waterfall.
  // Synthetic (non-DB) cities have no rows for any of them.
  const [
    result,
    contractorsResult,
    crewsResult,
    crewWorkloadsResult,
    crewTypesResult,
  ] = dbCity
    ? await Promise.all([
        fetchCityMembers(dbCity.id),
        // City vendors — the Contractors chip. Same PII rule as members:
        // demo sessions get masked emails. Degrades to empty on error.
        listContractors(dbCity.id, { maskPii: access === "demo" }),
        // Crews — the panel below the roster plus the invite/edit pickers.
        // Degrades to empty (e.g. before migration 030).
        fetchCityCrews(dbCity.id),
        // Per-crew workload metrics for the crew panel's load badges.
        fetchCrewWorkloads(dbCity.id),
        // Crew-type catalog (031); unreadable → built-in defaults below.
        fetchCityCrewTypes(dbCity.id),
      ])
    : [
        { ok: true, members: [] } satisfies CityMembersResult,
        null,
        null,
        null,
        null,
      ];
  const members = result.ok
    ? access === "demo"
      ? result.members.map((m) => ({
          ...m,
          email: maskEmail(m.email),
          phone: maskPhone(m.phone),
        }))
      : result.members
    : [];
  const contractors = contractorsResult?.ok ? contractorsResult.data : [];
  const crews = crewsResult?.ok ? crewsResult.crews : [];
  const crewWorkloads = crewWorkloadsResult?.ok
    ? crewWorkloadsResult.workloads
    : {};
  const crewTypeCatalogAvailable = crewTypesResult?.ok ?? false;
  const crewTypeRows = crewTypesResult?.ok ? crewTypesResult.types : [];
  // Defaults apply only when the city has NO catalog (pre-031 DB or a city
  // created after the seed). A catalog where every row is deactivated is a
  // deliberate admin choice — honor it with an empty select, don't silently
  // resurrect the built-ins.
  const activeCrewTypes: CrewTypeDef[] =
    crewTypeCatalogAvailable && crewTypeRows.length > 0
      ? crewTypeRows
          .filter((t) => t.active)
          .map(({ key, label, description }) => ({ key, label, description }))
      : DEFAULT_CREW_TYPES;
  const typeByKey = new Map(
    (crewTypeCatalogAvailable ? crewTypeRows : DEFAULT_CREW_TYPES).map((t) => [
      t.key,
      t,
    ]),
  );

  const crewOptions: CrewOption[] = crews.map((c) => ({
    id: c.id,
    teamKey: c.teamKey,
    name: c.name,
    crewType: c.crewType,
    crewTypeLabel: c.crewType
      ? (typeByKey.get(c.crewType)?.label ?? null)
      : null,
    crewTypeDescription: c.crewType
      ? (typeByKey.get(c.crewType)?.description ?? null)
      : null,
  }));
  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <section className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Members
            </h1>
            <p className="text-[13px] text-faint">
              People with access to {city.name} — residents, dispatchers,
              supervisors, and admins.
              {access === "demo" && " Demo session — member emails are masked."}
            </p>
          </div>
          {canManage && <InviteMemberModal slug={slug} crews={crewOptions} />}
        </section>

        {!result.ok ? (
          <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm font-medium text-foreground">
              Couldn't load members
            </p>
            <p className="mt-1.5 text-[13px] text-faint">
              Something went wrong fetching the roster. Refresh to try again —
              if it persists, check the server logs.
            </p>
          </div>
        ) : dbCity ? (
          <>
            <MembersTable
              members={members}
              slug={slug}
              canManage={canManage}
              crews={crewOptions}
              contractors={contractors}
              crewRows={crews}
              crewWorkloads={crewWorkloads}
              crewTypes={activeCrewTypes}
            />
            <CrewTypesPanel
              slug={slug}
              types={crewTypeRows}
              canManage={canManage}
              catalogAvailable={crewTypeCatalogAvailable}
            />
          </>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm font-medium text-foreground">
              No member data for demo cities
            </p>
            <p className="mt-1.5 text-[13px] text-faint">
              Member records appear for onboarded cities backed by live
              accounts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
