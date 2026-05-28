import Link from "next/link";
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
    <div className="flex min-h-screen flex-col bg-black text-zinc-100">
      <header className="fixed top-0 inset-x-0 z-40 bg-transparent">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-tight text-white"
          >
            Civic
          </Link>
          <CityNav slug={slug} />
        </div>
      </header>

      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
