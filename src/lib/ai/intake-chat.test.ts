import { describe, expect, it } from "vitest";
import {
  buildIntakePrompt,
  buildIntakeSystemPrompt,
  parseIntakeResponse,
  stripCodeFences,
} from "./intake-chat";

// ── stripCodeFences ───────────────────────────────────────────────────────────

describe("stripCodeFences", () => {
  it("returns plain JSON unchanged", () => {
    const json = '{"a":1}';
    expect(stripCodeFences(json)).toBe(json);
  });

  it("strips ```json fences", () => {
    const raw = '```json\n{"a":1}\n```';
    expect(stripCodeFences(raw)).toBe('{"a":1}');
  });

  it("strips plain ``` fences", () => {
    const raw = '```\n{"a":1}\n```';
    expect(stripCodeFences(raw)).toBe('{"a":1}');
  });

  it("handles fences with extra whitespace", () => {
    const raw = '```json\n  {"a":1}  \n```';
    expect(stripCodeFences(raw)).toBe('{"a":1}');
  });
});

// ── parseIntakeResponse — empty / malformed ───────────────────────────────────

describe("parseIntakeResponse — empty / malformed", () => {
  it("returns ok:false on empty string", () => {
    const result = parseIntakeResponse("");
    expect(result.ok).toBe(false);
  });

  it("returns ok:false on whitespace-only string", () => {
    const result = parseIntakeResponse("   \n  ");
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when sentinel present but JSON is malformed", () => {
    const raw = "__INTAKE_DRAFT__\nnot valid json at all";
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when draft JSON is missing required category", () => {
    const raw = `__INTAKE_DRAFT__\n{"description":"big hole","location_hint":null,"severity_hint":3,"needs_photo":true}`;
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when draft has invalid category", () => {
    const raw = `__INTAKE_DRAFT__\n{"category":"flying_saucer","description":"UFO","location_hint":null,"severity_hint":3,"needs_photo":false}`;
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when draft missing description", () => {
    const raw = `__INTAKE_DRAFT__\n{"category":"pothole","location_hint":null,"severity_hint":2,"needs_photo":false}`;
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when severity_hint is out of range", () => {
    const raw = `__INTAKE_DRAFT__\n{"category":"pothole","description":"big hole","location_hint":null,"severity_hint":9,"needs_photo":false}`;
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(false);
  });
});

// ── parseIntakeResponse — interim (no sentinel) ───────────────────────────────

describe("parseIntakeResponse — interim turns", () => {
  it("returns done:false and the reply text when no sentinel present", () => {
    const raw = "Can you describe where the pothole is located?";
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.done).toBe(false);
    expect(result.data.draft).toBeUndefined();
    expect(result.data.reply).toBe(raw);
  });

  it("handles multi-line conversational reply", () => {
    const raw =
      "Thanks for reporting!\nCould you tell me how severe the issue is?";
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.done).toBe(false);
    expect(result.data.reply).toBe(raw.trim());
  });
});

// ── parseIntakeResponse — final draft ────────────────────────────────────────

describe("parseIntakeResponse — final draft", () => {
  const validDraftJSON = JSON.stringify({
    category: "pothole",
    description: "Large pothole on Main St causing flat tires",
    location_hint: "Main St near Oak Ave",
    severity_hint: 3,
    needs_photo: true,
  });

  it("parses a clean final draft", () => {
    const raw = `Thanks, I have everything I need.\n__INTAKE_DRAFT__\n${validDraftJSON}`;
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.done).toBe(true);
    expect(result.data.draft).toBeDefined();
    expect(result.data.draft?.category).toBe("pothole");
    expect(result.data.draft?.severity_hint).toBe(3);
    expect(result.data.draft?.needs_photo).toBe(true);
    expect(result.data.draft?.location_hint).toBe("Main St near Oak Ave");
  });

  it("parses a draft where JSON is wrapped in code fences", () => {
    const raw = `Great!\n__INTAKE_DRAFT__\n\`\`\`json\n${validDraftJSON}\n\`\`\``;
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.done).toBe(true);
    expect(result.data.draft?.category).toBe("pothole");
  });

  it("sets location_hint to null when empty string", () => {
    const draftWithEmptyLocation = JSON.stringify({
      category: "graffiti",
      description: "Graffiti on wall",
      location_hint: "",
      severity_hint: 1,
      needs_photo: true,
    });
    const raw = `__INTAKE_DRAFT__\n${draftWithEmptyLocation}`;
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.draft?.location_hint).toBeNull();
  });

  it("trims and caps description at 500 chars", () => {
    const longDesc = "x".repeat(600);
    const draftWithLongDesc = JSON.stringify({
      category: "debris",
      description: longDesc,
      location_hint: null,
      severity_hint: 2,
      needs_photo: false,
    });
    const raw = `__INTAKE_DRAFT__\n${draftWithLongDesc}`;
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.draft?.description.length).toBe(500);
  });

  it("provides a default reply when no text precedes the sentinel", () => {
    const raw = `__INTAKE_DRAFT__\n${validDraftJSON}`;
    const result = parseIntakeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reply.length).toBeGreaterThan(0);
    expect(result.data.done).toBe(true);
  });

  it("works with all valid categories", () => {
    const categories = [
      "pothole",
      "streetlight",
      "downed_sign",
      "graffiti",
      "illegal_dump",
      "water_leak",
      "sidewalk_damage",
      "tree_down",
      "debris",
      "drainage",
      "faded_signage",
      "other",
    ] as const;
    for (const category of categories) {
      const draftJSON = JSON.stringify({
        category,
        description: `Test ${category}`,
        location_hint: null,
        severity_hint: 1,
        needs_photo: false,
      });
      const result = parseIntakeResponse(`__INTAKE_DRAFT__\n${draftJSON}`);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.draft?.category).toBe(category);
      }
    }
  });
});

// ── buildIntakePrompt ─────────────────────────────────────────────────────────

describe("buildIntakePrompt", () => {
  it("returns systemInstruction and turns", () => {
    const history = [{ role: "user" as const, content: "There is a pothole" }];
    const result = buildIntakePrompt(history);
    expect(result.systemInstruction).toBeTruthy();
    expect(result.turns).toEqual(history);
  });

  it("systemInstruction mentions the sentinel token", () => {
    const { systemInstruction } = buildIntakePrompt([]);
    expect(systemInstruction).toContain("__INTAKE_DRAFT__");
  });

  it("systemInstruction lists all valid categories", () => {
    const { systemInstruction } = buildIntakeSystemPrompt
      ? { systemInstruction: buildIntakeSystemPrompt() }
      : buildIntakePrompt([]);
    expect(systemInstruction).toContain("pothole");
    expect(systemInstruction).toContain("other");
  });
});
