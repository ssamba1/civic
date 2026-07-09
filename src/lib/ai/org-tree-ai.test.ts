import { describe, expect, it } from "vitest";
import {
  type OrgTreeProposal,
  type OrgUnitProposal,
  validateTreeShape,
} from "./org-tree-ai";

const CATS = ["pothole", "graffiti"] as const;
const SKILLS = ["paving", "cleanup"] as const;

function u(o: Partial<OrgUnitProposal> & { key: string }): OrgUnitProposal {
  return {
    label: o.key,
    kind: "crew",
    parentKey: null,
    categories: null,
    skills: [],
    isContractor: false,
    capacity: null,
    costPerJob: null,
    slaHours: null,
    ...o,
  };
}

function tree(units: OrgUnitProposal[]): OrgTreeProposal {
  return { units, notes: "" };
}

describe("validateTreeShape", () => {
  it("accepts a valid team → crew tree", () => {
    const t = tree([
      u({ key: "roads", kind: "team", categories: ["pothole"] }),
      u({ key: "north", parentKey: "roads", skills: ["paving"] }),
    ]);
    expect(validateTreeShape(t, CATS, SKILLS).ok).toBe(true);
  });

  it("rejects duplicate keys", () => {
    const t = tree([u({ key: "x" }), u({ key: "x" })]);
    const r = validateTreeShape(t, CATS, SKILLS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("duplicate");
  });

  it("rejects an unknown parentKey", () => {
    const t = tree([u({ key: "a", parentKey: "ghost" })]);
    const r = validateTreeShape(t, CATS, SKILLS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unknown parentKey");
  });

  it("rejects a contractor with no cost", () => {
    const t = tree([
      u({ key: "roads", kind: "team", categories: ["pothole"] }),
      u({
        key: "vendor",
        kind: "contractor",
        parentKey: "roads",
        isContractor: true,
      }),
    ]);
    const r = validateTreeShape(t, CATS, SKILLS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("costPerJob");
  });

  it("accepts a priced contractor", () => {
    const t = tree([
      u({ key: "roads", kind: "team", categories: ["pothole"] }),
      u({
        key: "vendor",
        kind: "contractor",
        parentKey: "roads",
        isContractor: true,
        costPerJob: 500,
        skills: ["paving"],
      }),
    ]);
    expect(validateTreeShape(t, CATS, SKILLS).ok).toBe(true);
  });

  it("rejects categories / skills outside the allowed lists", () => {
    const badCat = tree([u({ key: "a", categories: ["nope"] })]);
    expect(validateTreeShape(badCat, CATS, SKILLS).ok).toBe(false);
    const badSkill = tree([u({ key: "a", skills: ["welding"] })]);
    expect(validateTreeShape(badSkill, CATS, SKILLS).ok).toBe(false);
  });

  it("detects a parentKey cycle", () => {
    const t = tree([
      u({ key: "a", parentKey: "b" }),
      u({ key: "b", parentKey: "a" }),
    ]);
    const r = validateTreeShape(t, CATS, SKILLS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("cycle");
  });
});
