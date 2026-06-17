// @vitest-environment node
import type { Classification } from "@/lib/types";
import { generateWorkOrderAI } from "./work-order-ai";

/**
 * Shared mock state, hoisted so it is initialized before the vi.mock factory
 * for "@google/generative-ai" runs. Mirrors gemini.test.ts.
 */
const mocks = vi.hoisted(() => ({
  textReturn: "" as string,
  lastRequest: undefined as unknown,
  generateContent: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  serverEnv: { GEMINI_API_KEY: "test-key" },
}));

// Partial mock: override GoogleGenerativeAI but keep real SchemaType exports,
// which work-order-schema.ts (transitively imported) needs.
vi.mock("@google/generative-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/generative-ai")>();
  class GoogleGenerativeAI {
    apiKey: string;
    constructor(apiKey: string) {
      this.apiKey = apiKey;
    }
    getGenerativeModel() {
      return { generateContent: mocks.generateContent };
    }
  }
  return { ...actual, GoogleGenerativeAI };
});

const CLASSIFICATION: Classification = {
  category: "pothole",
  subcategory: "deep edge crack",
  severity: 4,
  hazard_radius_m: 2,
  visible_size_estimate: "0.6m x 0.3m",
  is_emergency: false,
  confidence: 0.88,
  reasoning: "Deep pavement break.",
  no_issue_detected: false,
  alternate_categories: [],
};

const VALID_WO = {
  department: "public_works",
  crew_type: "paving",
  est_minutes: 45,
  materials: [
    { item: "cold patch", qty: 2 },
    { item: "tamper", qty: 1 },
  ],
  est_cost: 116,
  rationale:
    "Two-person paving crew, ~45 min; cost is labor plus two bags of cold patch.",
} as const;

beforeEach(() => {
  mocks.textReturn = "";
  mocks.lastRequest = undefined;
  mocks.generateContent.mockReset();
  mocks.generateContent.mockImplementation(async (request: unknown) => {
    mocks.lastRequest = request;
    return { response: { text: () => mocks.textReturn } };
  });
});

describe("generateWorkOrderAI", () => {
  it("returns ok with flattened materials and rounded cost for clean JSON", async () => {
    mocks.textReturn = JSON.stringify(VALID_WO);

    const result = await generateWorkOrderAI(CLASSIFICATION);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.department).toBe("public_works");
      expect(result.data.crew_type).toBe("paving");
      expect(result.data.est_minutes).toBe(45);
      // {item, qty} flattened: qty>1 -> "item ×qty", qty 1 -> bare item.
      expect(result.data.materials).toEqual(["cold patch ×2", "tamper"]);
      expect(result.data.est_cost).toBe(116);
      expect(result.data.rationale).toContain("paving crew");
    }
  });

  it("rounds a fractional est_cost to a whole dollar", async () => {
    mocks.textReturn = JSON.stringify({ ...VALID_WO, est_cost: 116.7 });

    const result = await generateWorkOrderAI(CLASSIFICATION);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.est_cost).toBe(117);
  });

  it("accepts a null crew_type (category 'other')", async () => {
    mocks.textReturn = JSON.stringify({
      ...VALID_WO,
      department: "other",
      crew_type: null,
    });

    const result = await generateWorkOrderAI(CLASSIFICATION);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.crew_type).toBeNull();
  });

  it("parses fenced ```json output", async () => {
    const fenced = ["```json", JSON.stringify(VALID_WO), "```"].join("\n");
    mocks.textReturn = fenced;

    const result = await generateWorkOrderAI(CLASSIFICATION);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.est_cost).toBe(116);
  });

  it("returns ok:false for non-JSON text", async () => {
    mocks.textReturn = "Sorry, I cannot produce a work order.";

    const result = await generateWorkOrderAI(CLASSIFICATION);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("invalid JSON");
  });

  it("returns ok:false when zod rejects a bad crew enum", async () => {
    mocks.textReturn = JSON.stringify({ ...VALID_WO, crew_type: "spaceforce" });

    const result = await generateWorkOrderAI(CLASSIFICATION);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("validation failed");
  });

  it("sends a request containing the classification category", async () => {
    mocks.textReturn = JSON.stringify(VALID_WO);

    await generateWorkOrderAI(CLASSIFICATION);

    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    expect(String(mocks.lastRequest)).toContain("pothole");
  });
});
