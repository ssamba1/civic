// @vitest-environment node

import type { ReasoningInput, ReasoningPayload } from "./reasoning-ai";
import { getReasoning } from "./reasoning-ai";

// Hoisted mock fn so the vi.mock factory below can reference it safely
// (vi.mock is hoisted above the imports; vi.hoisted keeps the binding valid).
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({
  // reasoning-ai.ts does `new GoogleGenerativeAI(...)`, so the mock must be
  // constructable — a real class is the simplest constructable shape.
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  },
  // reasoning-ai.ts reads SchemaType at module load to build REASONING_SCHEMA.
  // ResponseSchema is an `import type` and is erased — don't provide it.
  SchemaType: {
    OBJECT: "object",
    STRING: "string",
    ARRAY: "array",
    INTEGER: "integer",
    NUMBER: "number",
    BOOLEAN: "boolean",
  },
}));

// Avoid real env validation (serverEnv is a Proxy that parses process.env on access).
vi.mock("@/lib/env", () => ({
  serverEnv: { GEMINI_API_KEY: "test-key" },
}));

// A payload that passes the module's isReasoningPayload shape guard.
const validPayload: ReasoningPayload = {
  reasoning:
    "Severity 4 pothole drives crew dispatch and emergency patching cost.",
  costBreakdown: [
    { title: "Base Estimate", value: "$1,200" },
    { title: "Crew & Labor", value: "$600" },
  ],
  scoringExplanation: [
    { title: "Classification", value: "Surface hazard." },
    { title: "Public Impact", value: "High traffic road." },
  ],
};

// A clearly distinct payload for the cache test so we can prove identity
// of the returned object rather than just a structural match.
const validPayload2: ReasoningPayload = {
  reasoning: "Distinct reasoning for the cache assertion.",
  costBreakdown: [{ title: "Total Impact", value: "$5,000" }],
  scoringExplanation: [
    { title: "Escalation Trigger", value: "Repeat report." },
  ],
};

function geminiOk(payload: ReasoningPayload) {
  return { response: { text: () => JSON.stringify(payload) } };
}

function makeInput(id: string): ReasoningInput {
  return {
    id,
    category: "pothole",
    severity: 4,
    status: "open",
    address: "100 Main St",
    created_at: "2026-05-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  mockGenerateContent.mockReset();
});

describe("getReasoning", () => {
  it("cache miss -> gemini success returns source 'gemini' and caches the result", async () => {
    mockGenerateContent.mockResolvedValue(geminiOk(validPayload2));
    const templateFallback = vi.fn<() => ReasoningPayload>(() => validPayload);
    const input = makeInput("gemini-success-1");

    const result = await getReasoning(input, 48, "Pothole", templateFallback);

    expect(result.source).toBe("gemini");
    expect(result.payload).toEqual(validPayload2);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(templateFallback).not.toHaveBeenCalled();
  });

  it("second call with same id returns source 'cache' without re-calling gemini", async () => {
    mockGenerateContent.mockResolvedValue(geminiOk(validPayload2));
    const templateFallback = vi.fn<() => ReasoningPayload>(() => validPayload);
    const input = makeInput("cache-hit-1");

    const first = await getReasoning(input, 48, "Pothole", templateFallback);
    expect(first.source).toBe("gemini");

    const second = await getReasoning(input, 48, "Pothole", templateFallback);
    expect(second.source).toBe("cache");
    expect(second.payload).toEqual(validPayload2);

    // gemini hit exactly once across both calls; second served from cache.
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(templateFallback).not.toHaveBeenCalled();
  });

  it("gemini throws -> uses templateFallback, source 'template', and does NOT cache (next call retries gemini)", async () => {
    // "boom" matches no retryable substring (note: "rate" lives inside "generate",
    // so any "generate..." message would wrongly trigger retries + real backoff) and
    // carries no status / AbortError name -> withRetry rethrows on the first attempt.
    mockGenerateContent
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(geminiOk(validPayload));
    const templateFallback = vi.fn<() => ReasoningPayload>(() => validPayload2);
    const input = makeInput("template-then-gemini-1");

    const first = await getReasoning(input, 48, "Pothole", templateFallback);
    expect(first.source).toBe("template");
    expect(first.payload).toEqual(validPayload2);
    expect(templateFallback).toHaveBeenCalledTimes(1);

    // Template results are not cached: the same id must retry gemini and now succeed.
    const second = await getReasoning(input, 48, "Pothole", templateFallback);
    expect(second.source).toBe("gemini");
    expect(second.payload).toEqual(validPayload);

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(templateFallback).toHaveBeenCalledTimes(1);
  });
});
