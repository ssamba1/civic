// @vitest-environment node
import { stepState } from "./stepper";

describe("stepState", () => {
  it("classifies steps relative to the current index", () => {
    // current = 2
    expect(stepState(0, 2)).toBe("complete");
    expect(stepState(1, 2)).toBe("complete");
    expect(stepState(2, 2)).toBe("current");
    expect(stepState(3, 2)).toBe("upcoming");
  });

  it("handles the first and last steps", () => {
    expect(stepState(0, 0)).toBe("current");
    expect(stepState(5, 0)).toBe("upcoming");
  });
});
