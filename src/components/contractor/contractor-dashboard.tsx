"use client";

import { useState } from "react";
import type { ContractorWorkOrder } from "@/app/contractor/actions";
import { WorkOrderCard } from "./work-order-card";

interface Props {
  initialWorkOrders: ContractorWorkOrder[];
}

export function ContractorDashboard({ initialWorkOrders }: Props) {
  const [workOrders, setWorkOrders] = useState(initialWorkOrders);

  function handleUpdated(updated: ContractorWorkOrder) {
    setWorkOrders((prev) =>
      prev.map((wo) => (wo.id === updated.id ? updated : wo)),
    );
  }

  if (workOrders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-600">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          No work orders assigned to you yet.
        </p>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          Check back later or contact your city administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {workOrders.map((wo) => (
        <WorkOrderCard key={wo.id} workOrder={wo} onUpdated={handleUpdated} />
      ))}
    </div>
  );
}
