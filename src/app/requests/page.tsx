import type { Metadata } from "next";
import Link from "next/link";
import type { RequestKind } from "@/lib/requests/types";
import { RequestForm } from "./request-form";

export const metadata: Metadata = {
  title: "Requests | Civic",
  description:
    "Request a feature, a quality-of-life improvement, or hands-on help setting up your city on Civic.",
};

export const dynamic = "force-dynamic";

const VALID_KINDS = new Set(["feature", "qol", "setup", "help", "other"]);

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; city?: string }>;
}) {
  const sp = await searchParams;
  const kind: RequestKind = VALID_KINDS.has(sp.kind ?? "")
    ? (sp.kind as RequestKind)
    : "feature";

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8">
        <p className="text-sm font-medium text-[var(--color-primary)]">
          Talk to us
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Requests &amp; help
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-subtle">
          Want a feature, a small quality-of-life fix, or a hand getting your
          city live on Civic? Tell us here — a real person reads every request.
          Already ready to self-serve?{" "}
          <Link
            href="/onboard"
            className="text-[var(--color-primary)] underline"
          >
            Set up your city
          </Link>
          .
        </p>
      </div>

      <RequestForm
        defaultKind={kind}
        defaultCity={sp.city ?? ""}
        source="/requests"
      />
    </main>
  );
}
