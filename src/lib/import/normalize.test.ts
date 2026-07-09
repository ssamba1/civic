import { describe, expect, it } from "vitest";
import { importFromText, mapLegacyRecord, DEFAULT_CSV_CONFIG } from "./normalize";

describe("mapLegacyRecord (seeclickfix_json)", () => {
  it("normalizes a full SeeClickFix row", () => {
    const row = {
      id: 42,
      lat: "34.27",
      lng: "-84.07",
      status: "Open",
      created_at: "2026-01-15T10:00:00Z",
      address: "100 Main St",
      request_type: { title: "Pothole" },
    };
    const result = mapLegacyRecord(row, "seeclickfix_json");
    expect(result).not.toBeNull();
    expect(result!.location).toEqual({ lat: 34.27, lng: -84.07 });
    expect(result!.category).toBe("pothole");
    expect(result!.status).toBe("open");
    expect(result!.sourceExternalId).toBe("42");
    expect(result!.source).toBe("open311");
  });

  it("uses latitude/longitude fallback fields", () => {
    const row = { latitude: 34.27, longitude: -84.07, status: "Closed" };
    const result = mapLegacyRecord(row, "seeclickfix_json");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("closed");
  });

  it("returns null for missing coordinates", () => {
    const row = { id: 1, status: "Open" };
    expect(mapLegacyRecord(row, "seeclickfix_json")).toBeNull();
  });

  it("maps Archived status to closed", () => {
    const row = { lat: 1, lng: 1, status: "Archived" };
    expect(mapLegacyRecord(row, "seeclickfix_json")!.status).toBe("closed");
  });

  it("maps unknown status to open", () => {
    const row = { lat: 1, lng: 1, status: "Pending Review" };
    expect(mapLegacyRecord(row, "seeclickfix_json")!.status).toBe("open");
  });
});

describe("importFromText (csv)", () => {
  const csvText = [
    "id,latitude,longitude,category,status,created_at,address,severity",
    '1,34.27,-84.07,pothole,open,2026-01-01T00:00:00Z,"100 Main St",3',
    '2,34.28,-84.08,graffiti,closed,2026-02-01T00:00:00Z,,2',
    "3,bad,coords,pothole,open,,, ", // skipped — invalid coords
  ].join("\n");

  it("parses valid CSV rows", () => {
    const result = importFromText(csvText, "csv");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.data).toHaveLength(2);
  });

  it("maps category correctly", () => {
    const result = importFromText(csvText, "csv");
    if (!result.ok) throw new Error();
    expect(result.data[0]!.category).toBe("pothole");
    expect(result.data[1]!.category).toBe("graffiti");
  });

  it("skips rows with invalid coordinates", () => {
    const result = importFromText(csvText, "csv");
    if (!result.ok) throw new Error();
    // Row 3 has "bad" coords — should be excluded
    expect(result.data.length).toBe(2);
  });
});

describe("importFromText (seeclickfix_json)", () => {
  it("parses a JSON array", () => {
    const data = JSON.stringify([
      { id: 1, lat: 34.27, lng: -84.07, status: "Open", request_type: { title: "Graffiti" } },
      { id: 2, lat: 34.28, lng: -84.08, status: "Closed" },
    ]);
    const result = importFromText(data, "seeclickfix_json");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.data).toHaveLength(2);
    expect(result.data[0]!.category).toBe("graffiti");
  });

  it("parses { issues: [...] } shape", () => {
    const data = JSON.stringify({
      issues: [{ lat: 34.27, lng: -84.07, status: "Open" }],
    });
    const result = importFromText(data, "seeclickfix_json");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.data).toHaveLength(1);
  });

  it("returns error for invalid JSON", () => {
    const result = importFromText("{not json}", "seeclickfix_json");
    expect(result.ok).toBe(false);
  });

  it("returns empty array for empty issues", () => {
    const result = importFromText("[]", "seeclickfix_json");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.data).toHaveLength(0);
  });
});
