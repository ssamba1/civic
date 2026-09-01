import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { MemberDetail } from "@/components/members/member-detail";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import {
  fetchMemberDetail,
  type MemberDetail as MemberDetailData,
  maskEmail,
  maskPhone,
} from "@/lib/db/members";
import { getStaffAccessForCity } from "@/lib/staff-access";

// Auth-gated per request (reads cookies via getStaffAccessForCity) and exposes
// member PII (email, phone), never prerender or cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; id: string }>;
}

// Resolve the city the way the roster page does: real DB row first, falling
// back to the synthetic KNOWN_CITIES entry so demo slugs still resolve.
const resolveCity = cache(async (slug: string) => {
  let dbCity = null;
  try {
    dbCity = await fetchCityFromDb(slug);
  } catch {
    dbCity = null;
  }
  const city = dbCity ?? (await fetchCityMock(slug));
  return { dbCity, city };
});

// Memoized so generateMetadata (name for the title) and the page body share a
// single query within the same request render pass instead of hitting the DB
// twice.
const loadMemberDetail = cache(fetchMemberDetail);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, id } = await params;
  const { dbCity, city } = await resolveCity(slug);
  if (!city) return { title: "City not found | Civic" };

  // The member name only resolves into the tab title when the caller actually
  // has access, a no-access request never surfaces PII here (and the page body
  // redirects it away regardless).
  let name: string | null = null;
  const access = await getStaffAccessForCity(slug);
  if (access && dbCity) {
    const result = await loadMemberDetail(dbCity.id, id);
    if (result.ok) name = result.detail.member.displayName;
  }
  return {
    title: `Civic | ${city.name}, ${city.state}, ${name ?? "Member"}`,
    description: `Activity and report history for a member of the ${city.name} console.`,
    // Member profile behind an auth gate. Keep out of search indexes.
    robots: { index: false, follow: false },
  };
}

export default async function CityMemberDetailPage({ params }: PageProps) {
  const { slug, id } = await params;
  const { dbCity, city } = await resolveCity(slug);
  if (!city) notFound();

  // Access gate, mirrors the roster page. Unlike the grid there is NO public
  // demo-city bypass: this page exposes member email + phone (PII) and must
  // never be public. Demo staff may view it, but demo credentials are public,
  // so "demo" access gets email + phone masked server-side (the raw values
  // never reach the client). Only "real" staff see raw contact details.
  const access = await getStaffAccessForCity(slug);
  if (!access) {
    redirect(`/login?redirect=/city/${slug}/members/${id}`);
  }

  let content: React.ReactNode;
  if (!dbCity) {
    // Synthetic (non-DB) cities have no real member rows.
    content = (
      <InfoCard
        title="No member records for demo cities"
        body="Member profiles appear for onboarded cities backed by live accounts."
      />
    );
  } else {
    const result = await loadMemberDetail(dbCity.id, id);
    if (!result.ok) {
      if (result.error === "member_not_found") notFound();
      content = (
        <InfoCard
          title="Couldn't load member"
          body="Something went wrong fetching this profile. Refresh to try again, if it persists, check the server logs."
        />
      );
    } else {
      // Demo sessions never see raw PII, mask email + phone before the detail
      // object crosses into the (client-rendered) component tree.
      const detail: MemberDetailData =
        access === "demo"
          ? {
              ...result.detail,
              member: {
                ...result.detail.member,
                email: maskEmail(result.detail.member.email),
                phone: maskPhone(result.detail.member.phone),
              },
            }
          : result.detail;
      content = (
        <MemberDetail slug={slug} detail={detail} demo={access === "demo"} />
      );
    }
  }

  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <Link
          href={`/city/${slug}/members`}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-[var(--radius-md)]"
        >
          <span aria-hidden="true">←</span> Members
        </Link>
        {content}
      </div>
    </div>
  );
}

// Shared empty/error card. Same surface tokens the roster page uses.
function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1.5 text-[13px] text-faint">{body}</p>
    </div>
  );
}
