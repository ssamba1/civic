import type { Metadata } from "next";
import { NotificationsFeed } from "@/components/resident/notifications-feed";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  getCurrentResident,
  getResidentNotifications,
} from "@/lib/resident-data";

const CITY_NAME = KNOWN_CITIES.cumming.name;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Civic | ${CITY_NAME} — Updates`,
    description: `Status changes on your reports and city-wide announcements for ${CITY_NAME}.`,
  };
}

export default async function UpdatesPage() {
  const { citySlug } = await getCurrentResident();
  const items = await getResidentNotifications(citySlug);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-6 md:pb-10">
      <section className="mb-6">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#0a84ff] shadow-[0_0_6px_rgba(10,132,255,0.6)]"
            aria-hidden="true"
          />
          {CITY_NAME}
        </p>
        <h1 className="mt-2 text-[34px] sm:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
          Updates
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          Progress on your reports and what&apos;s happening across the city.
        </p>
      </section>

      <NotificationsFeed items={items} />
    </div>
  );
}
