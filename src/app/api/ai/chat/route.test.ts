import { afterEach, describe, expect, it, vi } from "vitest";

// The route reads HELP_ASSISTANT at import time via config; mock it OFF here.
vi.mock("@/lib/ai/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/ai/config")>();
  return { ...actual, HELP_ASSISTANT: false };
});

describe("POST /api/ai/chat (feature flag off)", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns 404 when the assistant is disabled", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
