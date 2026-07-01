import { describe, expect, it } from "vitest";
import { pickPendingNavigation } from "./pick-navigation";

const msg = (id: string, parts: unknown[]) => ({ id, role: "assistant", parts });

describe("pickPendingNavigation", () => {
  it("returns the route + a stable key from a completed navigateTo part", () => {
    const messages = [
      msg("m1", [
        { type: "tool-navigateTo", toolCallId: "c1", state: "output-available", output: { navigate: "/report" } },
      ]),
    ];
    expect(pickPendingNavigation(messages as never)).toEqual({
      key: "c1",
      route: "/report",
    });
  });
  it("ignores incomplete or errored parts", () => {
    const messages = [
      msg("m1", [{ type: "tool-navigateTo", toolCallId: "c1", state: "input-available" }]),
      msg("m2", [{ type: "tool-navigateTo", toolCallId: "c2", state: "output-available", output: { error: "no" } }]),
    ];
    expect(pickPendingNavigation(messages as never)).toBeNull();
  });
  it("returns the most recent navigation when several exist", () => {
    const messages = [
      msg("m1", [{ type: "tool-navigateTo", toolCallId: "c1", state: "output-available", output: { navigate: "/report" } }]),
      msg("m2", [{ type: "tool-navigateTo", toolCallId: "c2", state: "output-available", output: { navigate: "/user/my-reports" } }]),
    ];
    expect(pickPendingNavigation(messages as never)?.route).toBe("/user/my-reports");
  });
});
