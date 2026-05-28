import { Suspense } from "react";
import Link from "next/link";
import { CityNav } from "@/components/city-nav";
import { FilterProvider } from "@/lib/filters/context";
import { getReportCorpus } from "@/lib/dashboard-data";

export default async function CityDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const corpus = getReportCorpus();
  const now = Date.now();

  return (
    <div className="flex min-h-screen flex-col bg-black text-zinc-100">
      <header className="fixed top-0 inset-x-0 z-40 border-b border-white/[0.06] bg-black/60 backdrop-blur-xl supports-[backdrop-filter]:bg-black/50">
        <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-white outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
          >
            <span
              className="h-2 w-2 rounded-full bg-[#0a84ff] shadow-[0_0_8px_rgba(10,132,255,0.6)]"
              aria-hidden="true"
            />
            Civic
          </Link>
          <CityNav slug={slug} />
        </div>
      </header>

      <Suspense fallback={null}>
        <FilterProvider corpus={corpus} now={now}>
          <main className="flex-1 flex flex-col">{children}</main>
        </FilterProvider>
      </Suspense>
    </div>
  );
}
