import { SearchX } from "lucide-react";
import Link from "next/link";

// Branded boundary for an invalid/expired public status token, shown instead
// of the generic site 404 when getPublicReport() returns null.
export default function PublicReportNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <div className="mb-8 flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full bg-[var(--color-primary)]"
          aria-hidden="true"
        />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Civic
        </span>
      </div>

      <SearchX
        className="mb-4 h-10 w-10 text-faint"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
        Status link not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-subtle">
        This public status link isn&apos;t valid. It may have been mistyped or
        the report no longer exists. Check the link and try again.
      </p>

      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 text-[14px] font-medium text-[var(--accent-contrast)] outline-none transition-colors hover:bg-[var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Go home
      </Link>
    </main>
  );
}
