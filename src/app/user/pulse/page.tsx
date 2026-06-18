import type { Metadata } from "next";
import { CommunityPulseInteractive } from "@/components/resident/community-pulse-interactive";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { getCityMorale, getCurrentResident } from "@/lib/resident-data";

export function generateMetadata(): Metadata {
  const name = KNOWN_CITIES.cumming.name;
  return {
    title: `Civic | ${name} — Community Pulse`,
    description: `How ${name} is improving — issues fixed, faster resolution times, and the civic momentum residents are building together.`,
  };
}

export default async function CommunityPulsePage() {
  const { citySlug } = await getCurrentResident();
  const morale = await getCityMorale(citySlug);
  const name = KNOWN_CITIES[citySlug]?.name ?? KNOWN_CITIES.cumming.name;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-6 md:pb-10 lg:px-8">
      <section className="mb-8">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#30d158] shadow-[0_0_6px_rgba(48,209,88,0.6)]"
            aria-hidden="true"
          />
          Community Pulse
        </p>
        <h1 className="mt-2 text-[34px] sm:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
          {name} is getting better every week
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Real progress, made by neighbors. Here&apos;s what your city has been
          fixing.
        </p>
      </section>

      <CommunityPulseInteractive morale={morale} cityName={name} />
    </div>
  );
}
