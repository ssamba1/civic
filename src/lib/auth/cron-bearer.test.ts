import { describe, expect, it } from "vitest";
import { bearerMatches } from "./cron-bearer";

describe("bearerMatches", () => {
  it("accepts the exact bearer header for the configured secret", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects the wrong secret", () => {
    expect(bearerMatches("Bearer nope", "s3cret")).toBe(false);
  });

  it("rejects a correct prefix — the case a timing oracle would have grown", () => {
    expect(bearerMatches("Bearer s3cre", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer s3cretx", "s3cret")).toBe(false);
  });

  it("requires the Bearer scheme, and is case-sensitive about it", () => {
    expect(bearerMatches("s3cret", "s3cret")).toBe(false);
    expect(bearerMatches("bearer s3cret", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer  s3cret", "s3cret")).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    // The routes fall through to the staff-session check in this case; what
    // must never happen is an unconfigured deployment accepting any header.
    expect(bearerMatches("Bearer anything", undefined)).toBe(false);
    expect(bearerMatches("Bearer anything", "")).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
  });

  it("fails closed when no header is presented", () => {
    expect(bearerMatches(null, "s3cret")).toBe(false);
    expect(bearerMatches("", "s3cret")).toBe(false);
  });

  it("compares unequal-length inputs without throwing", () => {
    // timingSafeEqual rejects buffers of differing length, so the raw values
    // can't be passed to it directly — hashing first is what makes this safe.
    expect(() =>
      bearerMatches("Bearer x", "a-much-longer-secret"),
    ).not.toThrow();
    expect(bearerMatches("Bearer x", "a-much-longer-secret")).toBe(false);
  });
});
