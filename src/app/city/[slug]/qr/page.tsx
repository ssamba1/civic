import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WalkupPoster } from "@/components/qr/walkup-poster";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { buildWalkupUrl, renderWalkupQrSvg } from "@/lib/qr/walkup";

/* ==================================================================
   Staff-facing walk-up QR poster page (NEXT_100 #16).

   Staff navigate to /city/<slug>/qr?lat=...&lng=...&asset=... and
   print the page (Cmd/Ctrl+P). The @media print styles in
   WalkupPoster hide screen chrome and expand the poster to fill the
   page for clean physical printing.

   lat/lng default to the city centre so the page is not blank when
   visited without params (useful for testing).
   ================================================================== */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    lat?: string;
    lng?: string;
    asset?: string;
    label?: string;
  }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const city = KNOWN_CITIES[slug];
  const name = city?.name ?? slug;
  return {
    title: `Civic | ${name} — Walk-up QR Poster`,
    description: `Printable QR poster for ${name}. Scan to report an issue without an account.`,
    robots: { index: false, follow: false },
  };
}

export default async function CityQrPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const known = KNOWN_CITIES[slug];
  if (!known) notFound();

  // Coordinates: query params or city centre
  const lat = sp.lat != null ? Number(sp.lat) : known.center[1];
  const lng = sp.lng != null ? Number(sp.lng) : known.center[0];

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-8">
        <p className="text-center text-sm text-faint">
          Invalid coordinates. Provide valid <code>lat</code> and{" "}
          <code>lng</code> query parameters.
        </p>
      </main>
    );
  }

  const reportUrl = buildWalkupUrl({ lat, lng, asset: sp.asset ?? null });
  const qrSvg = await renderWalkupQrSvg(reportUrl);

  return (
    <main className="min-h-dvh bg-background print:bg-white">
      {/* Screen wrapper — centers the poster and provides a print button */}
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-16 print:p-0">
        {/* Print instructions — hidden on print */}
        <div
          data-tour="qr-instructions"
          className="w-full rounded-lg border border-hairline bg-surface p-4 text-[13px] text-subtle print:hidden"
        >
          <p className="font-medium text-foreground">Print this poster</p>
          <p className="mt-1">
            Use{" "}
            <kbd className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[11px]">
              Ctrl+P
            </kbd>{" "}
            /
            <kbd className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[11px]">
              ⌘P
            </kbd>{" "}
            to print. Select "Fit to page" for best results. Laminate and affix
            to the asset or kiosk.
          </p>
          <p className="mt-2 text-[12px] text-faint">
            Location: {lat.toFixed(5)}, {lng.toFixed(5)}
            {sp.asset ? ` · Asset: ${sp.asset}` : ""}
          </p>
        </div>

        <WalkupPoster
          cityName={known.name}
          qrSvg={qrSvg}
          locationLabel={sp.label ?? sp.asset ?? undefined}
          reportUrl={reportUrl}
        />
      </div>
    </main>
  );
}
