import { Suspense } from "react";
import { ContractorDashboard } from "@/components/contractor/contractor-dashboard";
import { listMyWorkOrders } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Work Orders – Contractor Portal" };

async function WorkOrdersLoader() {
  const workOrders = await listMyWorkOrders();
  return <ContractorDashboard initialWorkOrders={workOrders} />;
}

export default function ContractorPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          My Work Orders
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Only work orders assigned to you are shown. Update your progress
          below.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"
              />
            ))}
          </div>
        }
      >
        <WorkOrdersLoader />
      </Suspense>
    </div>
  );
}
