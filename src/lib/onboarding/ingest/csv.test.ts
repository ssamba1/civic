// @vitest-environment node
import { type CsvConfig, parseCsv, parseCsvReports } from "./csv";

const NOW = 1_700_000_000_000;

const cfg: CsvConfig = {
  lngField: "lng",
  latField: "lat",
  categoryField: "type",
  categoryMap: { pothole: "pothole", light: "streetlight" },
  statusField: "state",
  statusMap: { open: "open", done: "closed" },
  dateField: "reported",
  idField: "id",
  addressField: "addr",
  severityField: "sev",
};

describe("parseCsv", () => {
  it("handles quoted fields with commas and escaped quotes", () => {
    const text = 'a,b,c\n1,"x, y","he said ""hi"""\n2,p,q';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", 'he said "hi"'],
      ["2", "p", "q"],
    ]);
  });

  it("handles CRLF and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvReports", () => {
  it("maps rows with field/value mapping", () => {
    const csv = [
      "id,lng,lat,type,state,reported,addr,sev",
      `INC1,-84.13,34.2,Pothole,Done,${NOW - 86_400_000},"123 Main St, Apt 2",4`,
    ].join("\n");
    const res = parseCsvReports(csv, cfg, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      source: "csv",
      sourceExternalId: "INC1",
      location: { lng: -84.13, lat: 34.2 },
      category: "pothole",
      status: "closed",
      severity: 4,
      address: "123 Main St, Apt 2",
    });
  });

  it("defaults unknown category to 'other' and skips rows with bad coords", () => {
    const csv = [
      "lng,lat,type",
      "-84.1,34.2,Mystery",
      "not-a-number,34.2,Pothole",
    ].join("\n");
    const res = parseCsvReports(csv, cfg, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1); // bad-coord row skipped
    expect(res.data[0].category).toBe("other");
    expect(res.data[0].status).toBe("open"); // no/unmapped status
  });

  it("errors when required columns are missing", () => {
    const res = parseCsvReports("foo,bar\n1,2", cfg, NOW);
    expect(res.ok).toBe(false);
  });

  it("returns [] for header-only or empty input", () => {
    expect(parseCsvReports("lng,lat,type", cfg, NOW)).toEqual({
      ok: true,
      data: [],
    });
    expect(parseCsvReports("", cfg, NOW)).toEqual({ ok: true, data: [] });
  });
});
