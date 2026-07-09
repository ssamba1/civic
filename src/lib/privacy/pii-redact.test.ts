// @vitest-environment node
import { describe, expect, it } from "vitest";
import { redactPII } from "./pii-redact";

describe("redactPII – emails", () => {
  it("redacts a plain email", () => {
    const { redacted } = redactPII("Contact me at john@example.com for info.");
    expect(redacted).toBe("Contact me at [EMAIL] for info.");
  });

  it("redacts email with plus tag", () => {
    const { redacted } = redactPII("user+tag@mail.example.org");
    expect(redacted).toBe("[EMAIL]");
  });

  it("does NOT redact email inside a URL", () => {
    const url = "https://api.example.com/user/john@example.com/profile";
    const { redacted } = redactPII(url);
    expect(redacted).toBe(url);
  });

  it("returns correct span metadata for email", () => {
    const { spans } = redactPII("Email: bob@civic.gov here.");
    expect(spans).toHaveLength(1);
    expect(spans[0].type).toBe("EMAIL");
    expect(spans[0].original).toBe("bob@civic.gov");
  });
});

describe("redactPII – phones", () => {
  it("redacts dashes format", () => {
    const { redacted } = redactPII("Call 800-555-1234 now.");
    expect(redacted).toBe("Call [PHONE] now.");
  });

  it("redacts dots format", () => {
    const { redacted } = redactPII("800.555.1234");
    expect(redacted).toBe("[PHONE]");
  });

  it("redacts parens format", () => {
    const { redacted } = redactPII("(800) 555-1234");
    expect(redacted).toBe("[PHONE]");
  });

  it("redacts 10-digit bare", () => {
    const { redacted } = redactPII("Call 8005551234 today.");
    expect(redacted).toBe("Call [PHONE] today.");
  });

  it("redacts with +1 country code", () => {
    const { redacted } = redactPII("+1 800-555-1234");
    expect(redacted).toBe("[PHONE]");
  });

  it("does NOT redact a zip code (5 digits)", () => {
    const { redacted } = redactPII("Cumming, GA 30041");
    expect(redacted).not.toContain("[PHONE]");
  });
});

describe("redactPII – SSN", () => {
  it("redacts SSN pattern", () => {
    const { redacted } = redactPII("SSN: 123-45-6789.");
    expect(redacted).toBe("SSN: [SSN].");
  });

  it("SSN takes priority over phone for ddd-dd-dddd", () => {
    // SSN regex should fire before phone regex
    const { spans } = redactPII("123-45-6789");
    expect(spans[0].type).toBe("SSN");
  });

  it("does NOT redact ddd-ddd-dddd as SSN (that's a phone)", () => {
    const { spans } = redactPII("800-555-1234");
    expect(spans[0].type).toBe("PHONE");
  });
});

describe("redactPII – addresses", () => {
  it("redacts a standard street address", () => {
    const { redacted } = redactPII("I live at 123 Main St, please fix it.");
    expect(redacted).toBe("I live at [ADDRESS], please fix it.");
  });

  it("redacts Avenue suffix", () => {
    const { redacted } = redactPII("45 Park Avenue is broken.");
    expect(redacted).toBe("[ADDRESS] is broken.");
  });

  it("redacts Boulevard", () => {
    const { redacted } = redactPII("The pothole is at 999 Sunset Blvd.");
    expect(redacted).toBe("The pothole is at [ADDRESS].");
  });

  it("redacts address with apartment suffix", () => {
    const { redacted } = redactPII("Deliver to 500 Oak Dr Apt 3B.");
    expect(redacted).toBe("Deliver to [ADDRESS].");
  });

  it("does NOT redact a lone ordinal street reference like '42nd Street'", () => {
    // No leading house number → no address match
    const text = "The issue is near 42nd Street";
    const { spans } = redactPII(text);
    const addrSpan = spans.find((s) => s.type === "ADDRESS");
    expect(addrSpan).toBeUndefined();
  });

  it("does NOT redact 'Route 66' (no street suffix)", () => {
    const text = "Driving on Route 66 heading west.";
    const { spans } = redactPII(text);
    expect(spans.find((s) => s.type === "ADDRESS")).toBeUndefined();
  });
});

describe("redactPII – multiple and overlapping", () => {
  it("redacts multiple PIIs in one string", () => {
    const { redacted, spans } = redactPII(
      "Call 800-555-1234 or email me at alice@example.com",
    );
    expect(redacted).toBe("Call [PHONE] or email me at [EMAIL]");
    expect(spans).toHaveLength(2);
  });

  it("redacts combined address and phone", () => {
    const { redacted } = redactPII(
      "Owner at 12 Oak Lane can be reached at (404) 555-9876.",
    );
    expect(redacted).toContain("[ADDRESS]");
    expect(redacted).toContain("[PHONE]");
  });

  it("returns empty spans for clean text", () => {
    const { spans, redacted } = redactPII("Pothole on the corner of 5th and Main.");
    expect(spans).toHaveLength(0);
    expect(redacted).toBe("Pothole on the corner of 5th and Main.");
  });

  it("handles empty string", () => {
    const { redacted, spans } = redactPII("");
    expect(redacted).toBe("");
    expect(spans).toHaveLength(0);
  });
});

describe("redactPII – false-positive guards", () => {
  it("does not mangle a normal URL", () => {
    const url = "https://civic.gov/reports/123";
    const { redacted } = redactPII(url);
    expect(redacted).toBe(url);
  });

  it("does not redact a version number like 3.14.159", () => {
    const text = "Version 3.14.159 released.";
    const { redacted } = redactPII(text);
    expect(redacted).toBe(text);
  });
});
