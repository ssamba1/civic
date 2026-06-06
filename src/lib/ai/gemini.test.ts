// @vitest-environment node
import { classifyPhoto } from "./gemini";

/**
 * Shared mock state, hoisted so it is initialized before the vi.mock factory
 * for "@google/generative-ai" runs (vi.mock is hoisted to the top of the file).
 *
 * - `textReturn` controls what `result.response.text()` yields per test.
 * - `lastRequest` captures the request array passed to `generateContent` so we
 *   can assert the inlineData / mimeType wiring.
 * - `generateContent` is the spy the SDK model exposes.
 */
const mocks = vi.hoisted(() => {
  return {
    textReturn: "" as string,
    lastRequest: undefined as unknown,
    generateContent: vi.fn(),
  };
});

vi.mock("@/lib/env", () => ({
  serverEnv: { GEMINI_API_KEY: "test-key" },
}));

// Partial mock: override GoogleGenerativeAI but keep the real SchemaType /
// type exports, which classification-schema.ts (transitively imported) needs.
vi.mock("@google/generative-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/generative-ai")>();
  class GoogleGenerativeAI {
    apiKey: string;
    constructor(apiKey: string) {
      this.apiKey = apiKey;
    }
    getGenerativeModel() {
      return {
        generateContent: mocks.generateContent,
      };
    }
  }
  return { ...actual, GoogleGenerativeAI };
});

const VALID_CLASSIFICATION = {
  category: "pothole",
  subcategory: "deep edge crack",
  severity: 3,
  hazard_radius_m: 1.5,
  visible_size_estimate: "0.5m x 0.5m",
  is_emergency: false,
  confidence: 0.82,
  reasoning: "Visible pavement break with exposed depth.",
} as const;

beforeEach(() => {
  mocks.textReturn = "";
  mocks.lastRequest = undefined;
  mocks.generateContent.mockReset();
  // Default impl: capture the request and return an object whose
  // `response.text()` yields the per-test `textReturn`.
  mocks.generateContent.mockImplementation(async (request: unknown) => {
    mocks.lastRequest = request;
    return {
      response: {
        text: () => mocks.textReturn,
      },
    };
  });
});

describe("classifyPhoto", () => {
  it("returns ok with classification + rawText for clean structured JSON", async () => {
    const raw = JSON.stringify(VALID_CLASSIFICATION);
    mocks.textReturn = raw;

    const result = await classifyPhoto("BASE64DATA", "image/jpeg");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.classification).toEqual(VALID_CLASSIFICATION);
      // rawText is the exact model text.
      expect(result.data.rawText).toBe(raw);
    }
  });

  it("parses fenced ```json output via the stripCodeFences fallback", async () => {
    const inner = JSON.stringify(VALID_CLASSIFICATION);
    const fenced = ["```json", inner, "```"].join("\n");
    mocks.textReturn = fenced;

    const result = await classifyPhoto("BASE64DATA", "image/png");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.classification).toEqual(VALID_CLASSIFICATION);
      // rawText must be the UNCLEANED model text (fences preserved).
      expect(result.data.rawText).toBe(fenced);
      expect(result.data.rawText).toContain("```");
    }
  });

  it("returns ok:false with an invalid-JSON error for non-JSON text", async () => {
    mocks.textReturn = "I'm sorry, I cannot classify this image.";

    const result = await classifyPhoto("BASE64DATA", "image/jpeg");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("invalid JSON");
    }
  });

  it("returns ok:false with a validation error for valid JSON that fails zod (bad enum)", async () => {
    const badEnum = { ...VALID_CLASSIFICATION, category: "alien_invasion" };
    mocks.textReturn = JSON.stringify(badEnum);

    const result = await classifyPhoto("BASE64DATA", "image/jpeg");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("validation failed");
    }
  });

  it("sends a request containing inlineData with the passed mimeType and base64 data", async () => {
    mocks.textReturn = JSON.stringify(VALID_CLASSIFICATION);

    await classifyPhoto("ABC123", "image/webp");

    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    const request = mocks.lastRequest as Array<unknown>;
    expect(Array.isArray(request)).toBe(true);

    const inlinePart = request.find(
      (part): part is { inlineData: { data: string; mimeType: string } } =>
        typeof part === "object" && part !== null && "inlineData" in part,
    );
    expect(inlinePart).toBeDefined();
    if (!inlinePart)
      throw new Error("expected an inlineData part in the request");
    expect(inlinePart.inlineData.mimeType).toBe("image/webp");
    expect(inlinePart.inlineData.data).toBe("ABC123");
  });
});
