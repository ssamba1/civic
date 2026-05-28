import Link from "next/link";
import { MapPin } from "lucide-react";
import { CityNav } from "@/components/city-nav";

export default async function CityDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      {/* header */}
      <header className="sticky top-0 z-45 border-b border-zinc-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-900"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <MapPin className="h-4 w-4" />
            </span>
            Civic
          </Link>
          <CityNav slug={slug} />
        </div>
      </header>

      {/* main */}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
