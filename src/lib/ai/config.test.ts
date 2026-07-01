import { describe, expect, it } from "vitest";
import { CHAT_HISTORY_LIMIT, CHAT_MAX_STEPS, CHAT_MODEL } from "./config";

describe("chat config", () => {
  it("uses gemini-2.5-flash for chat (not flash-lite)", () => {
    expect(CHAT_MODEL).toBe("gemini-2.5-flash");
  });
  it("bounds tool steps and history", () => {
    expect(CHAT_MAX_STEPS).toBeGreaterThanOrEqual(3);
    expect(CHAT_HISTORY_LIMIT).toBeGreaterThanOrEqual(8);
  });
});
