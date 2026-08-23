import { requireClaimsAdmin } from "@/app/admin/claims/actions";
import { LiabilityConsole } from "@/components/liability/liability-console";
import {
  SWEEP_HORIZONS,
  type SweepHorizon,
  type SweepRow,
} from "@/components/liability/queue-types";
import { currencyForCitySlug, formatCost } from "@/lib/currency";
import { getLedgerTotals, getSweep } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Liability – Admin" };

function LedgerTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-hairline bg-surface px-4 py-3">
      <span className="block text-[11px] uppercase tracking-wider text-faint">
        {label}
      </span>
      <span className="mt-1 block text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </span>
      {hint && (
        <span className="mt-0.5 block text-[11px] text-faint">{hint}</span>
      )}
    </div>
  );
}

export default async function AdminLiabilityPage() {
  const [admin, ledger] = await Promise.all([
    requireClaimsAdmin(),
    getLedgerTotals(),
  ]);
  const sweepResults = await Promise.all(
    SWEEP_HORIZONS.map((h) => getSweep(h)),
  );

  const currency = currencyForCitySlug(admin?.citySlug);
  const sweeps = Object.fromEntries(
    SWEEP_HORIZONS.map((h, i) => [h, sweepResults[i] ?? []]),
  ) as Record<SweepHorizon, SweepRow[]>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Liability &amp; recovery
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Which defects are somebody else&rsquo;s financial problem, and is the
          clock still running. Warranties lapsing soon become a worklist; the
          ledger below is what the city has actually recovered.
        </p>
      </div>

      {/* Recovery ledger (spec 5.4) */}
      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LedgerTile
          label="Recovered"
          value={formatCost(ledger.recoveredCents / 100, currency)}
          hint={`${ledger.resolved} resolved claim${ledger.resolved === 1 ? "" : "s"}`}
        />
        <LedgerTile
          label="In flight"
          value={formatCost(ledger.inFlightCents / 100, currency)}
          hint={`${ledger.sent} sent · ${ledger.accepted} accepted · ${ledger.disputed} disputed`}
        />
        <LedgerTile
          label="Unclaimed"
          value={formatCost(ledger.unclaimedCents / 100, currency)}
          hint={`${ledger.draft} draft${ledger.draft === 1 ? "" : "s"} awaiting review`}
        />
        <LedgerTile
          label="Declined"
          value={String(ledger.declined)}
          hint={`${ledger.dismissed} dismissed by staff`}
        />
      </div>

      <LiabilityConsole sweeps={sweeps} currency={currency} />
    </div>
  );
}
