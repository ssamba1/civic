import Link from "next/link";
import {
  Camera,
  Cpu,
  MapPin,
  ArrowRight,
  Search,
  Wrench,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
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
              href="/city/cumming"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
            >
              Dashboard
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

      {/* hero */}
      <section className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4 py-24 text-center sm:py-32">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
            <Cpu className="h-4 w-4" />
            AI-powered infrastructure reporting
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl">
            See it. Snap it.
            <br />
            <span className="text-blue-600">Your city fixes it.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-zinc-600">
            Report potholes, broken streetlights, and other infrastructure
            issues. AI classifies and routes them to the right crew instantly.
          </p>

          {/* city search */}
          <div className="mx-auto mt-10 max-w-md">
            <label htmlFor="city-search" className="sr-only">
              Search for your city
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                id="city-search"
                type="text"
                placeholder="Search for your city..."
                className="h-12 w-full rounded-full border border-zinc-300 bg-white pl-12 pr-4 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* featured city */}
          <div className="mt-6">
            <Link
              href="/city/cumming"
              className="group inline-flex items-center gap-2 text-sm font-medium text-blue-600 transition-colors hover:text-blue-800"
            >
              <MapPin className="h-4 w-4" />
              View Cumming, GA dashboard
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/report"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-blue-600 px-8 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/30"
            >
              <Camera className="h-5 w-5" />
              Report an Issue
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/city/cumming"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-zinc-300 bg-white px-8 text-base font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="border-t border-zinc-200 bg-white px-4 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            How it works
          </h2>
          <p className="mt-3 text-zinc-500">
            Three steps. From photo to fixed.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.number} className="flex flex-col items-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  {step.icon}
                </span>
                <span className="mt-3 text-xs font-bold uppercase tracking-widest text-blue-600">
                  Step {step.number}
                </span>
                <h3 className="mt-2 text-lg font-semibold text-zinc-900">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-zinc-500 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white">
              C
            </span>
            <span>Civic &mdash; AI-native citizen infrastructure platform</span>
          </div>
          <span>&copy; {new Date().getFullYear()} Civic</span>
        </div>
      </footer>
    </div>
  );
}

const STEPS = [
  {
    number: 1,
    title: "Photo",
    description:
      "Snap a photo of the issue — pothole, broken light, downed sign, anything.",
    icon: <Camera className="h-6 w-6" />,
  },
  {
    number: 2,
    title: "AI Classifies",
    description:
      "Our AI identifies the problem type, severity, and routes it to the right department.",
    icon: <Cpu className="h-6 w-6" />,
  },
  {
    number: 3,
    title: "City Fixes",
    description:
      "The assigned crew gets dispatched with all the context they need to resolve it fast.",
    icon: <Wrench className="h-6 w-6" />,
  },
];
