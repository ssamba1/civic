// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ComplianceData } from "./report";
import { buildComplianceReport } from "./report";

const baseData: ComplianceData = {
  blurCoveragePercent: 99.5,
  rawPhotoTtlDays: 30,
  freetextTtlDays: 365,
  rlsEnabledTablesCount: 12,
  open311ConformanceEnabled: true,
  piiRedactionEnabled: true,
};

describe("buildComplianceReport", () => {
  it("returns a generatedAt ISO timestamp", () => {
    const report = buildComplianceReport(baseData);
    expect(() => new Date(report.generatedAt)).not.toThrow();
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("maps privacy fields correctly", () => {
    const report = buildComplianceReport(baseData);
    expect(report.privacy.blurCoveragePercent).toBe(99.5);
    expect(report.privacy.rawPhotoTtlDays).toBe(30);
    expect(report.privacy.piiRedactionEnabled).toBe(true);
  });

  it("maps security fields correctly", () => {
    const report = buildComplianceReport(baseData);
    expect(report.security.rlsEnabledTablesCount).toBe(12);
  });

  it("maps open311 field correctly", () => {
    const report = buildComplianceReport(baseData);
    expect(report.open311.conformanceEnabled).toBe(true);
  });

  it("maps dataRetention fields correctly", () => {
    const report = buildComplianceReport(baseData);
    expect(report.dataRetention.rawPhotoTtlDays).toBe(30);
    expect(report.dataRetention.freetextTtlDays).toBe(365);
  });

  it("handles null blurCoveragePercent", () => {
    const report = buildComplianceReport({
      ...baseData,
      blurCoveragePercent: null,
    });
    expect(report.privacy.blurCoveragePercent).toBeNull();
  });

  it("handles null rlsEnabledTablesCount", () => {
    const report = buildComplianceReport({
      ...baseData,
      rlsEnabledTablesCount: null,
    });
    expect(report.security.rlsEnabledTablesCount).toBeNull();
  });

  it("sets piiRedactionEnabled false when disabled", () => {
    const report = buildComplianceReport({
      ...baseData,
      piiRedactionEnabled: false,
    });
    expect(report.privacy.piiRedactionEnabled).toBe(false);
  });

  it("sets open311 conformance false when disabled", () => {
    const report = buildComplianceReport({
      ...baseData,
      open311ConformanceEnabled: false,
    });
    expect(report.open311.conformanceEnabled).toBe(false);
  });

  it("dataRetention mirrors rawPhotoTtlDays from privacy", () => {
    const report = buildComplianceReport({ ...baseData, rawPhotoTtlDays: 7 });
    expect(report.dataRetention.rawPhotoTtlDays).toBe(7);
    expect(report.privacy.rawPhotoTtlDays).toBe(7);
  });
});
