import { describe, expect, it } from "vitest";
import {
  type AssignCandidate,
  assignBestUnit,
  DEFAULT_WEIGHTS,
  effectiveCategories,
  type OrgUnit,
  resolveCandidates,
  scoreUnit,
} from "./org-units";

function unit(o: Partial<OrgUnit> & { id: string }): OrgUnit {
  return {
    parentId: null,
    kind: "crew",
    categories: null,
    skills: [],
    isContractor: false,
    capacity: null,
    costPerJob: null,
    slaHours: null,
    active: true,
    ...o,
  };
}

function candidate(
  o: Partial<AssignCandidate> & { id: string },
): AssignCandidate {
  return { ...unit(o), openWorkOrders: 0, ...o };
}

describe("effectiveCategories", () => {
  it("inherits from the nearest ancestor that sets categories", () => {
    const team = unit({ id: "t", kind: "team", categories: ["pothole"] });
    const sub = unit({
      id: "s",
      kind: "subteam",
      parentId: "t",
      categories: null,
    });
    const crew = unit({
      id: "c",
      kind: "crew",
      parentId: "s",
      categories: null,
    });
    const byId = new Map([team, sub, crew].map((u) => [u.id, u]));
    expect(effectiveCategories(crew, byId)).toEqual(["pothole"]);
  });

  it("a unit's own categories override the ancestor", () => {
    const team = unit({ id: "t", kind: "team", categories: ["pothole"] });
    const crew = unit({ id: "c", parentId: "t", categories: ["graffiti"] });
    const byId = new Map([team, crew].map((u) => [u.id, u]));
    expect(effectiveCategories(crew, byId)).toEqual(["graffiti"]);
  });

  it("returns empty when no ancestor scopes it", () => {
    const crew = unit({ id: "c", categories: null });
    expect(effectiveCategories(crew, new Map([["c", crew]]))).toEqual([]);
  });
});

describe("resolveCandidates", () => {
  const team = unit({ id: "t", kind: "team", categories: ["pothole"] });
  const crewA = unit({ id: "a", parentId: "t", skills: ["paving"] });
  const crewB = unit({ id: "b", parentId: "t", skills: ["concrete"] });

  it("returns only leaves matching category and skill", () => {
    const got = resolveCandidates([team, crewA, crewB], "pothole", "paving");
    expect(got.map((c) => c.id)).toEqual(["a"]);
  });

  it("excludes the non-leaf team even though it carries the category", () => {
    const got = resolveCandidates([team, crewA, crewB], "pothole", "paving");
    expect(got.some((c) => c.id === "t")).toBe(false);
  });

  it("treats an empty-skills unit as a wildcard (any crew_type)", () => {
    const generic = unit({ id: "g", parentId: "t", skills: [] });
    const got = resolveCandidates([team, generic], "pothole", "paving");
    expect(got.map((c) => c.id)).toEqual(["g"]);
  });

  it("skips inactive units and units whose category does not match", () => {
    const dead = unit({
      id: "d",
      parentId: "t",
      skills: ["paving"],
      active: false,
    });
    const got = resolveCandidates([team, dead, crewA], "graffiti", "paving");
    expect(got).toEqual([]);
  });

  it("a parent with an inactive child still counts as a leaf", () => {
    const parent = unit({
      id: "p",
      kind: "subteam",
      parentId: "t",
      skills: ["paving"],
    });
    const deadChild = unit({ id: "dc", parentId: "p", active: false });
    const got = resolveCandidates(
      [team, parent, deadChild],
      "pothole",
      "paving",
    );
    expect(got.map((c) => c.id)).toEqual(["p"]);
  });
});

describe("scoreUnit / assignBestUnit, load balance", () => {
  it("prefers the less-loaded of two identical crews", () => {
    const busy = candidate({
      id: "busy",
      skills: ["paving"],
      openWorkOrders: 5,
      capacity: 10,
    });
    const idle = candidate({
      id: "idle",
      skills: ["paving"],
      openWorkOrders: 1,
      capacity: 10,
    });
    const best = assignBestUnit([busy, idle], { crewType: "paving" });
    expect(best?.id).toBe("idle");
  });

  it("never assigns to a unit at capacity", () => {
    const full = candidate({
      id: "full",
      skills: ["paving"],
      openWorkOrders: 3,
      capacity: 3,
    });
    const best = assignBestUnit([full], { crewType: "paving" });
    expect(best).toBeNull();
  });

  it("returns null for an empty candidate set", () => {
    expect(assignBestUnit([], { crewType: "paving" })).toBeNull();
  });
});

describe("contractor cost / SLA behavior", () => {
  const internal = candidate({
    id: "internal",
    skills: ["paving"],
    costPerJob: 0,
    slaHours: 48,
    openWorkOrders: 0,
    capacity: 5,
  });
  const contractor = candidate({
    id: "contractor",
    skills: ["paving"],
    isContractor: true,
    costPerJob: 800,
    slaHours: 8,
    openWorkOrders: 0,
    capacity: 5,
  });

  it("picks the cheaper internal crew when both are idle and no deadline pressure", () => {
    const best = assignBestUnit([internal, contractor], { crewType: "paving" });
    expect(best?.id).toBe("internal");
  });

  it("spills to the contractor once the internal crew fills up", () => {
    const full = { ...internal, openWorkOrders: 5 }; // at capacity → filtered out
    const best = assignBestUnit([full, contractor], { crewType: "paving" });
    expect(best?.id).toBe("contractor");
  });

  it("favors the faster contractor when the work order is near-overdue", () => {
    // 2h to deadline: internal (48h turnaround) breaches, contractor (8h) less so.
    // Cost-heavy weights would still pick internal; SLA weight must flip it.
    const slaFirst = { load: 0.1, cost: 0.1, sla: 0.8, skill: 0 };
    const best = assignBestUnit([internal, contractor], {
      crewType: "paving",
      hoursToDue: 2,
      weights: slaFirst,
    });
    expect(best?.id).toBe("contractor");
  });

  it("cost term is normalized against the max cost in the set", () => {
    const ctx = {
      maxCost: 800,
      hoursToDue: null,
      crewType: "paving",
      weights: DEFAULT_WEIGHTS,
      softCap: 10,
    };
    // internal cost 0 → cost term 0; contractor cost 800 → cost term 0.3*1.
    expect(scoreUnit(internal, ctx)).toBeLessThan(scoreUnit(contractor, ctx));
  });
});

describe("determinism", () => {
  it("ties break on id for reproducible picks", () => {
    const b = candidate({ id: "b", skills: ["paving"], capacity: 10 });
    const a = candidate({ id: "a", skills: ["paving"], capacity: 10 });
    expect(assignBestUnit([b, a], { crewType: "paving" })?.id).toBe("a");
    expect(assignBestUnit([a, b], { crewType: "paving" })?.id).toBe("a");
  });
});
