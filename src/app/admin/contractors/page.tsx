import { ContractorManager } from "@/components/admin/contractor-manager";
import { listContractors } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contractors – Admin" };

export default async function AdminContractorsPage() {
  const contractors = await listContractors();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Contractors
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Manage external vendors. Each contractor logs in with their email and
          sees only the work orders explicitly assigned to them — no reports, no
          other contractors&rsquo; data.
        </p>
      </div>

      <ContractorManager contractors={contractors} />
    </div>
  );
}
