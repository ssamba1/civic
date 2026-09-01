import type { Promotion } from "./promotions";

/**
 * Deterministic mock vendors/contracts for the camera demo. Picked by cluster
 * id hash so cards and detail panels never shuffle between renders. Demo-only
 * fabrications. The real join reads capital_jobs/warranties (migration 062).
 */

export interface MockContract {
  vendor: string;
  contractRef: string;
  jobType: string;
  completedOn: string;
  warrantyType: string;
  windowEndsOn: string;
  daysLeft: number;
  bondRef: string;
  contractValue: string;
}

const CONTRACTS: MockContract[] = [
  {
    vendor: "Blackshear Paving Co.",
    contractRef: "#2024-17",
    jobType: "Resurfacing, 2024 program",
    completedOn: "2024-06-14",
    warrantyType: "Workmanship (1 yr) + pavement performance (3 yr)",
    windowEndsOn: "2026-10-09",
    daysLeft: 47,
    bondRef: "MB-2024-091",
    contractValue: "$412,800",
  },
  {
    vendor: "North GA Asphalt LLC",
    contractRef: "#2023-42",
    jobType: "Mill & overlay, Canton Hwy corridor",
    completedOn: "2023-11-02",
    warrantyType: "Pavement performance (5 yr)",
    windowEndsOn: "2027-01-22",
    daysLeft: 152,
    bondRef: "MB-2023-207",
    contractValue: "$1,108,450",
  },
  {
    vendor: "Sawnee Utilities",
    contractRef: "Permit P-8821",
    jobType: "Utility cut restoration, trench liability",
    completedOn: "2025-03-30",
    warrantyType: "Degradation liability (2 yr)",
    windowEndsOn: "2027-06-20",
    daysLeft: 301,
    bondRef: "-",
    contractValue: "-",
  },
];

export function contractFor(p: Promotion): MockContract {
  const n = Number.parseInt(p.id.replace(/\D/g, ""), 10) || 0;
  return CONTRACTS[n % CONTRACTS.length];
}
