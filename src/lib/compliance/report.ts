/**
 * Compliance report builder.
 *
 * Pure function, no I/O.  The caller fetches the data and passes it in;
 * this module only assembles the structured report object so it can be
 * unit-tested independently.
 */

export interface ComplianceData {
  /** Average blur coverage across all cities (0-100), or null when unavailable. */
  blurCoveragePercent: number | null;
  /** Raw photo TTL configured for the primary city (days). */
  rawPhotoTtlDays: number;
  /** Free-text description TTL (days). */
  freetextTtlDays: number;
  /**
   * Number of tables with RLS enabled, or null when the query wasn't run
   * (e.g., missing permissions).
   */
  rlsEnabledTablesCount: number | null;
  /** Whether Open311 GeoReport compatibility is active. */
  open311ConformanceEnabled: boolean;
  /** Whether PII redaction is wired into report intake. */
  piiRedactionEnabled: boolean;
}

export interface ComplianceReport {
  generatedAt: string;
  privacy: {
    blurCoveragePercent: number | null;
    rawPhotoTtlDays: number;
    piiRedactionEnabled: boolean;
  };
  security: {
    rlsEnabledTablesCount: number | null;
  };
  open311: {
    conformanceEnabled: boolean;
  };
  dataRetention: {
    rawPhotoTtlDays: number;
    freetextTtlDays: number;
  };
}

/**
 * Assemble a structured compliance report from the supplied data snapshot.
 * Does not perform any I/O.
 */
export function buildComplianceReport(data: ComplianceData): ComplianceReport {
  return {
    generatedAt: new Date().toISOString(),
    privacy: {
      blurCoveragePercent: data.blurCoveragePercent,
      rawPhotoTtlDays: data.rawPhotoTtlDays,
      piiRedactionEnabled: data.piiRedactionEnabled,
    },
    security: {
      rlsEnabledTablesCount: data.rlsEnabledTablesCount,
    },
    open311: {
      conformanceEnabled: data.open311ConformanceEnabled,
    },
    dataRetention: {
      rawPhotoTtlDays: data.rawPhotoTtlDays,
      freetextTtlDays: data.freetextTtlDays,
    },
  };
}
