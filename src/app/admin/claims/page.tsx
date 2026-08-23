import { ClaimsQueue } from "@/components/liability/claims-queue";
import { currencyForCitySlug } from "@/lib/currency";
import { listClaims, requireClaimsAdmin } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Claims – Admin" };

export default async function AdminClaimsPage() {
  const [admin, claims] = await Promise.all([
    requireClaimsAdmin(),
    listClaims(),
  ]);
  const currency = currencyForCitySlug(admin?.citySlug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Claim review queue
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Defects attributed to a contractor warranty or a utility restoration
          window are drafted here as claim packets. Nothing is sent
          automatically — review the evidence, then approve. Approving assigns
          the work order to the contractor and delivers one batched letter per
          vendor.
        </p>
      </div>

      <ClaimsQueue rows={claims} currency={currency} />
    </div>
  );
}
