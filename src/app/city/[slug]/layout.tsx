import Link from "next/link";
import { MapPin } from "lucide-react";

export default function CityDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur-md">
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
          <nav className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
            >
              Home
            </Link>
            <Link
              href="/report"
              className="inline-flex h-9 items-center rounded-full bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Report Issue
            </Link>
          </nav>
        </div>
      </header>

      {/* main */}
      <main className="flex-1">{children}</main>

      {/* footer */}
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-zinc-500 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white">
              C
            </span>
            <span>Powered by Civic</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
              Open311 Compatible
            </span>
            <span>&copy; {new Date().getFullYear()} Civic</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
