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
    title: `Civic | ${CITY_NAME}, Updates`,
    description: `Status changes on community reports and city-wide announcements for ${CITY_NAME}.`,
  };
}

export default async function UpdatesPage() {
  const { citySlug } = await getCurrentResident();
  const items = await getResidentNotifications(citySlug);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-4 md:pb-10">
      <section className="mb-6">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
            aria-hidden="true"
          />
          {CITY_NAME}
        </p>
        <h1 className="mt-2 text-[34px] sm:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
          Updates
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Progress on community reports and what&apos;s happening across the
          city.
        </p>
      </section>

      <NotificationsFeed items={items} />
    </div>
  );
}
