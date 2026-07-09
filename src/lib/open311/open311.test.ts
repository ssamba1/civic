import { describe, expect, it } from "vitest";
import type { City, Classification, Report } from "@/lib/types";
import { getAllServices } from "./services";
import {
  expandStatus,
  mapStatus,
  type Open311Request,
  reportToOpen311,
} from "./transform";
import {
  toErrorXml,
  toOpen311SingleXml,
  toOpen311Xml,
  toServicesXml,
} from "./xml";

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "req-1",
    city_id: "city-1",
    reporter_id: "user-1",
    location: { lat: 34.207654, lng: -84.140321 },
    photo_public_url: "https://example.com/photo.webp",
    photo_raw_url: null,
    status: "open",
    address: "123 Main St",
    description: "Big pothole",
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-02T10:00:00.000Z",
    ...overrides,
  };
}

function classification(
  overrides: Partial<Classification> = {},
): Classification {
  return {
    category: "pothole",
    subcategory: "deep edge crack",
    severity: 4,
    hazard_radius_m: 1.5,
    visible_size_estimate: "0.5m x 0.5m",
    is_emergency: false,
    confidence: 0.82,
    reasoning: "Visible pavement break",
    no_issue_detected: false,
    alternate_categories: [],
    ...overrides,
  };
}

const CITY = { id: "city-1", name: "Cumming" } as City;

describe("mapStatus / expandStatus", () => {
  it("collapses internal statuses to open/closed", () => {
    expect(mapStatus("open")).toBe("open");
    expect(mapStatus("dispatched")).toBe("open");
    expect(mapStatus("in_progress")).toBe("open");
    expect(mapStatus("closed")).toBe("closed");
    expect(mapStatus("merged")).toBe("closed");
    expect(mapStatus("rejected")).toBe("closed");
  });

  it("expandStatus is the inverse partition", () => {
    expect(expandStatus("open")).toEqual(["open", "dispatched", "in_progress"]);
    expect(expandStatus("closed")).toEqual(["closed", "merged", "rejected"]);
  });
});

describe("reportToOpen311", () => {
  it("maps core fields and coarsens coordinates to ~3dp", () => {
    const o = reportToOpen311(report(), classification(), CITY);
    expect(o.service_request_id).toBe("req-1");
    expect(o.status).toBe("open");
    expect(o.service_code).toBe("pothole");
    expect(o.service_name).toBe("Pothole");
    expect(o.agency_responsible).toBe("Cumming Public Works");
    // 34.207654 -> 34.208, -84.140321 -> -84.14 (privacy coarsening)
    expect(o.lat).toBe(34.208);
    expect(o.long).toBe(-84.14);
    expect(o.requested_datetime).toBe("2026-07-01T10:00:00.000Z");
  });

  it("carries internal state in status_notes for merged/rejected/closed", () => {
    expect(
      reportToOpen311(report({ status: "merged" }), null, CITY).status_notes,
    ).toMatch(/duplicate/i);
    expect(
      reportToOpen311(report({ status: "rejected" }), null, CITY).status_notes,
    ).toMatch(/without dispatch/i);
    expect(
      reportToOpen311(report({ status: "closed" }), null, CITY).status_notes,
    ).toMatch(/resolved/i);
    expect(
      reportToOpen311(report({ status: "open" }), null, CITY).status_notes,
    ).toBe("");
  });

  it("falls back to 'other' when unclassified, omitting extended_attributes", () => {
    const o = reportToOpen311(report(), null, CITY);
    expect(o.service_code).toBe("other");
    expect(o.extended_attributes).toBeUndefined();
  });

  it("attaches extended_attributes when classified", () => {
    const o = reportToOpen311(
      report(),
      classification({ severity: 5, is_emergency: true }),
      CITY,
    );
    expect(o.extended_attributes).toMatchObject({
      civic_category: "pothole",
      civic_severity: 5,
      civic_is_emergency: true,
    });
  });

  it("projects expected_datetime from the SLA window for open requests", () => {
    // pothole SLA = 72h from created_at 2026-07-01T10:00Z → 2026-07-04T10:00Z
    const o = reportToOpen311(
      report({ status: "open" }),
      classification(),
      CITY,
    );
    expect(o.expected_datetime).toBe("2026-07-04T10:00:00.000Z");
  });

  it("leaves expected_datetime null for resolved (closed/merged/rejected) requests", () => {
    expect(
      reportToOpen311(report({ status: "closed" }), null, CITY)
        .expected_datetime,
    ).toBeNull();
    expect(
      reportToOpen311(report({ status: "merged" }), null, CITY)
        .expected_datetime,
    ).toBeNull();
  });
});

describe("XML serialization (GeoReport v2 shape)", () => {
  it("wraps requests in <service_requests><request>… with a declaration", () => {
    const o = reportToOpen311(report(), classification(), CITY);
    const xml = toOpen311Xml([o]);
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain("<service_requests>");
    expect(xml).toContain("<service_request_id>req-1</service_request_id>");
    expect(xml).toContain("<status>open</status>");
    expect(xml).toContain("<extended_attributes>");
    expect(xml.trim().endsWith("</service_requests>")).toBe(true);
  });

  it("single serializer wraps one request", () => {
    const o = reportToOpen311(report(), null, CITY);
    const xml = toOpen311SingleXml(o);
    expect((xml.match(/<request>/g) ?? []).length).toBe(1);
  });

  it("escapes XML metacharacters in field values", () => {
    const o: Open311Request = {
      ...reportToOpen311(report({ address: 'A & B <"road">' }), null, CITY),
    };
    const xml = toOpen311Xml([o]);
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;");
    expect(xml).not.toContain('<"road"');
  });

  it("renders expected_datetime as an empty tag when null (resolved request)", () => {
    const o = reportToOpen311(report({ status: "closed" }), null, CITY);
    const xml = toOpen311Xml([o]);
    expect(xml).toContain("<expected_datetime></expected_datetime>");
  });

  it("services XML lists every service with a group", () => {
    const xml = toServicesXml(getAllServices());
    expect(xml).toContain("<services>");
    expect(xml).toContain("<service_code>pothole</service_code>");
    expect((xml.match(/<service>/g) ?? []).length).toBe(
      getAllServices().length,
    );
  });

  it("error XML carries code + description", () => {
    const xml = toErrorXml(404, "Not found");
    expect(xml).toContain("<code>404</code>");
    expect(xml).toContain("<description>Not found</description>");
    expect(xml).toContain("<errors>");
  });
});
