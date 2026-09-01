import type { ClaimPacket } from "@/lib/liability/types";

/* ==================================================================
   Claim packet assembly (spec §5.1).

   Pure, synchronous, DB-free: `claims.packet` is an immutable jsonb
   SNAPSHOT of what the city asserted at send time. If a capital job row is
   corrected six months later, the claim as sent must still be reproducible,
   so nothing here may read live data, and field order is fixed so two
   assemblies of the same input serialize byte-identically.
   ================================================================== */

/** Days a contractor gets to acknowledge before staff escalates. */
export const DEFAULT_RESPONSE_WINDOW_DAYS = 14;

/** Only these two verdicts produce a claim; 'city_cost'/'unknown' never do. */
export type ClaimableVerdict = "contractor_warranty" | "utility_restoration";

export interface PacketObservation {
  /** Detections in the promoted cluster. <= 0 is treated as a single sighting. */
  count: number;
  distinctDays: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface PacketInput {
  report: {
    id: string;
    category: string;
    severity: number | null;
    hazardSeverity: string | null;
    address: string | null;
    lng: number;
    lat: number;
    /** Capture time, reports.created_at, or the cluster's last sighting. */
    observedAt: string;
    /** reports.source; 'camera' unlocks the observation-history line. */
    source?: string | null;
  };
  /** Blurred, publicly-readable photo URLs. Order is preserved. */
  photoUrls: string[];
  liability: {
    verdict: ClaimableVerdict;
    contractorId: string | null;
    contractRef: string | null;
    permitRef: string | null;
    jobCompletedAt: string | null;
    warrantyType: string | null;
    windowEndsOn: string | null;
    matchDistanceM: number | null;
    confidence: number;
  };
  contractorName: string | null;
  observation?: PacketObservation | null;
  responseWindowDays?: number;
  /** Injectable for deterministic tests; defaults to now. */
  generatedAt?: string;
}

function isoDate(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Camera evidence is materially stronger than one citizen photo. N passes over
 * M days is a persistence argument, not a snapshot. Say so, but only when the
 * cluster actually has repeat sightings.
 */
function observationLine(
  observation: PacketObservation | null | undefined,
  count: number,
): string | null {
  if (count <= 1) return null;
  const days = Math.max(1, observation?.distinctDays ?? 1);
  const first = isoDate(observation?.firstSeenAt ?? null);
  const last = isoDate(observation?.lastSeenAt ?? null);
  const span = first && last ? ` (${first} to ${last})` : "";
  return `Observed ${count} times across ${plural(days, "day")}${span} by city fleet cameras.`;
}

function requestedAction(input: PacketInput, observationCount: number): string {
  const { liability } = input;
  const windowDays = input.responseWindowDays ?? DEFAULT_RESPONSE_WINDOW_DAYS;
  const parts: string[] = [];

  if (liability.verdict === "utility_restoration") {
    const permit = liability.permitRef
      ? ` under permit ${liability.permitRef}`
      : "";
    parts.push(
      `Repair the defect described below as permittee restoration${permit}, at no cost to the City.`,
    );
  } else {
    const warranty = liability.warrantyType ?? "contract";
    const contract = liability.contractRef
      ? ` on contract ${liability.contractRef}`
      : "";
    parts.push(
      `Repair the defect described below under the ${warranty} warranty${contract}, at no cost to the City.`,
    );
  }

  const observed = observationLine(input.observation, observationCount);
  if (observed) parts.push(observed);

  if (liability.windowEndsOn) {
    parts.push(`Liability window ends ${isoDate(liability.windowEndsOn)}.`);
  }
  parts.push(
    `Please acknowledge this claim within ${plural(windowDays, "day")}.`,
  );
  return parts.join(" ");
}

/**
 * Build the immutable claim packet. Field order below is the wire order.
 * Keep it stable; `claims.packet` rows written by earlier releases are
 * compared against it.
 */
export function assemblePacket(input: PacketInput): ClaimPacket {
  const rawCount = input.observation?.count ?? 1;
  const observationCount = Number.isFinite(rawCount)
    ? Math.max(1, Math.trunc(rawCount))
    : 1;

  return {
    reportId: input.report.id,
    basis:
      input.liability.verdict === "utility_restoration"
        ? "utility_restoration"
        : "warranty",
    defect: {
      category: input.report.category,
      severity: input.report.severity,
      hazardSeverity: input.report.hazardSeverity,
      address: input.report.address,
      lng: input.report.lng,
      lat: input.report.lat,
      photoUrls: [...input.photoUrls],
      observedAt: input.report.observedAt,
      observationCount,
    },
    liability: {
      contractorId: input.liability.contractorId,
      contractorName: input.contractorName,
      contractRef: input.liability.contractRef,
      permitRef: input.liability.permitRef,
      jobCompletedAt: input.liability.jobCompletedAt,
      warrantyType: input.liability.warrantyType,
      windowEndsOn: input.liability.windowEndsOn,
      matchDistanceM: input.liability.matchDistanceM,
      confidence: input.liability.confidence,
    },
    requestedAction: requestedAction(input, observationCount),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
