export type LiabilityVerdict =
  | "contractor_warranty"
  | "utility_restoration"
  | "city_cost"
  | "unknown";

export interface LiabilityEvaluation {
  verdict: LiabilityVerdict;
  capitalJobId: string | null;
  warrantyId: string | null;
  utilityPermitId: string | null;
  liableContractorId: string | null;
  windowEndsOn: string | null; // ISO date
  matchDistanceM: number | null;
  confidence: number; // 0..1
}

export interface CapitalJobRow {
  id: string;
  contractor_id: string | null;
  contract_ref: string | null;
  job_type: "resurfacing" | "sidewalk" | "signal" | "streetlight" | "other";
  completed_at: string; // date
  source: "manual" | "csv" | "arcgis";
  distance_m: number; // computed by the candidate query
}

export interface WarrantyRow {
  id: string;
  capital_job_id: string;
  warranty_type:
    | "workmanship"
    | "pavement_performance"
    | "manufacturer"
    | "maintenance_bond";
  starts_on: string;
  ends_on: string;
  covers_categories: string[] | null;
}

export interface UtilityPermitRow {
  id: string;
  permittee_name: string;
  permittee_contractor_id: string | null;
  permit_ref: string | null;
  liability_ends_on: string | null;
  distance_m: number;
}

export interface ClaimPacket {
  reportId: string;
  basis: "warranty" | "utility_restoration";
  defect: {
    category: string;
    severity: number | null;
    hazardSeverity: string | null;
    address: string | null;
    lng: number;
    lat: number;
    photoUrls: string[];
    observedAt: string;
    observationCount: number; // 1 for resident reports; cluster count for camera
  };
  liability: {
    contractorId: string | null;
    contractorName: string | null;
    contractRef: string | null;
    permitRef: string | null;
    jobCompletedAt: string | null;
    warrantyType: string | null;
    windowEndsOn: string | null;
    matchDistanceM: number | null;
    confidence: number;
  };
  requestedAction: string;
  generatedAt: string;
}

/**
 * The report-side inputs `pickVerdict` needs. `hasSourceData` is the
 * empty-table guard from spec §3.2 step 6: a city with NO capital_jobs and NO
 * utility_permits rows must get `unknown`, never a fake `city_cost`.
 */
export interface LiabilityReportInput {
  /** Civic report category (from the classification row). */
  category: string;
  /** Report creation timestamp, ISO. The warranty clock is read at this instant. */
  createdAt: string;
  /** True when the city has at least one capital_jobs OR utility_permits row. */
  hasSourceData: boolean;
}
