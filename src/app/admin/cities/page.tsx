import { ExternalLink, PlusCircle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type CityListItem,
  cityStatus,
  listCities,
} from "@/lib/onboarding/cities";

export const dynamic = "force-dynamic";

function StatusBadge({ city }: { city: CityListItem }) {
  const status = cityStatus(city);
  return status === "live" ? (
    <Badge variant="success">● Live</Badge>
  ) : (
    <Badge variant="default">○ Draft</Badge>
  );
}

export default async function AdminCitiesPage() {
  const cities = await listCities();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
            Cities
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Every tenant. Live and in-progress.
          </p>
        </div>
        <Button asChild variant="accent">
          <Link href="/admin/onboard">
            <PlusCircle className="size-4" aria-hidden="true" />
            Onboard a city
          </Link>
        </Button>
      </div>

      {cities.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--color-border)] p-12 text-center">
          <p className="text-sm text-[var(--color-muted)]">No cities yet.</p>
          <Button asChild variant="accent" className="mt-4">
            <Link href="/admin/onboard">Onboard your first city</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
                <th scope="col" className="px-4 py-3 font-medium">
                  City
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  State
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Dashboard
                </th>
              </tr>
            </thead>
            <tbody>
              {cities.map((city) => (
                <tr
                  key={city.id}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <th
                    scope="row"
                    className="px-4 py-3 text-left font-medium text-[var(--color-foreground)]"
                  >
                    {city.name}
                  </th>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {city.state}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge city={city} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/city/${city.slug}`}
                      className="inline-flex items-center gap-1 rounded-md text-[var(--color-primary)] outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
                    >
                      Open
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
