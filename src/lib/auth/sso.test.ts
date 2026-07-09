import { describe, expect, it } from "vitest";
import type { SsoConfig } from "./sso";
import { matchDomainToTenant, parseSamlConfig } from "./sso";

const VALID_INPUT = {
  entityId: "https://idp.example.com/saml",
  ssoUrl: "https://idp.example.com/sso",
  x509cert:
    "-----BEGIN CERTIFICATE-----\nMIICfTCCAWUCBgF...\n-----END CERTIFICATE-----",
  domain: "example.com",
};

describe("parseSamlConfig", () => {
  it("accepts a valid config", () => {
    const result = parseSamlConfig(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.data.domain).toBe("example.com");
    expect(result.data.active).toBe(true);
  });

  it("rejects null / non-object input", () => {
    expect(parseSamlConfig(null).ok).toBe(false);
    expect(parseSamlConfig("string").ok).toBe(false);
    expect(parseSamlConfig(42).ok).toBe(false);
  });

  it("rejects missing entityId", () => {
    const r = parseSamlConfig({ ...VALID_INPUT, entityId: "" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/entityId/);
  });

  it("rejects non-https ssoUrl", () => {
    const r = parseSamlConfig({
      ...VALID_INPUT,
      ssoUrl: "http://idp.example.com/sso",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/HTTPS/);
  });

  it("rejects invalid ssoUrl", () => {
    const r = parseSamlConfig({ ...VALID_INPUT, ssoUrl: "not-a-url" });
    expect(r.ok).toBe(false);
  });

  it("rejects empty x509cert", () => {
    const r = parseSamlConfig({ ...VALID_INPUT, x509cert: "" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/x509cert/);
  });

  it("rejects junk x509cert", () => {
    const r = parseSamlConfig({ ...VALID_INPUT, x509cert: "!@#$%" });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid domain", () => {
    const r = parseSamlConfig({ ...VALID_INPUT, domain: "notadomain" });
    expect(r.ok).toBe(false);
  });

  it("normalizes domain to lowercase", () => {
    const r = parseSamlConfig({ ...VALID_INPUT, domain: "EXAMPLE.COM" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.data.domain).toBe("example.com");
  });

  it("preserves cityId when provided", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const r = parseSamlConfig({ ...VALID_INPUT, cityId: id });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.data.cityId).toBe(id);
  });
});

describe("matchDomainToTenant", () => {
  const configs: SsoConfig[] = [
    { ...VALID_INPUT, domain: "acme.com", active: true },
    { ...VALID_INPUT, domain: "example.com", active: true },
    { ...VALID_INPUT, domain: "inactive.com", active: false },
  ];

  it("matches by email domain", () => {
    const match = matchDomainToTenant("alice@example.com", configs);
    expect(match).not.toBeNull();
    expect(match?.domain).toBe("example.com");
  });

  it("returns null when no match", () => {
    expect(matchDomainToTenant("bob@unknown.org", configs)).toBeNull();
  });

  it("ignores inactive configs", () => {
    expect(matchDomainToTenant("carol@inactive.com", configs)).toBeNull();
  });

  it("returns null for email without @", () => {
    expect(matchDomainToTenant("notanemail", configs)).toBeNull();
  });

  it("is case-insensitive on domain", () => {
    const match = matchDomainToTenant("dave@ACME.COM", configs);
    expect(match).not.toBeNull();
    expect(match?.domain).toBe("acme.com");
  });
});
