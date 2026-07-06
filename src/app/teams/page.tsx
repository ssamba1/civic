import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { teamIcon } from "@/components/teams/team-icon";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { TEAM_LIST } from "@/lib/teams";

export const metadata: Metadata = {
  title: "Team dashboards | Civic",
  description:
    "Pick a department to open its live queue, map, and analytics for each city on Civic.",
};

// The "all" pseudo-team is an admin aggregate with no standalone team view.
const OPERATIONAL_TEAMS = TEAM_LIST.filter((t) => t.id !== "all");

const CITY_ENTRIES = Object.entries(KNOWN_CITIES);

export default function TeamsIndexPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-hairline bg-glass backdrop-blur-xl supports-[backdrop-filter]:bg-glass pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="group inline-flex shrink-0 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
          >
            <span
              className="h-2 w-2 rounded-full bg-[var(--color-primary)]"
              aria-hidden="true"
            />
            Civic
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
          <section className="mb-8">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
              Team dashboards
            </p>
            <h1 className="mt-2 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
              Pick a department
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-subtle">
              Each team gets its own live queue, map, and analytics — scoped to
              the categories it owns. Choose a department to open its dashboard.
            </p>
          </section>

          {CITY_ENTRIES.map(([slug, city]) => (
            <section key={slug} className="mb-12">
              <div className="mb-4 flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
                  aria-hidden="true"
                />
                <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-subtle">
                  {city.name}, {city.state}
                </h2>
              </div>

              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {OPERATIONAL_TEAMS.map((team) => {
                  const Icon = teamIcon(team.icon);
                  return (
                    <li key={team.id}>
                      <Link
                        href={`/${team.id}/${slug}`}
                        className="group relative flex h-full flex-col gap-3 rounded-xl border border-hairline bg-overlay p-4 outline-none transition-colors hover:bg-overlay-strong focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-subtle">
                            <Icon
                              className="h-4 w-4"
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                          </span>
                          <span className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-foreground">
                            {team.shortLabel}
                          </span>
                          <ArrowUpRight
                            className="ml-auto h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-foreground"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        </div>
                        <p className="line-clamp-2 text-[13px] leading-relaxed text-subtle">
                          {team.duties}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-hairline pb-safe">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-[13px] text-faint sm:flex-row sm:px-6 lg:px-8">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}
