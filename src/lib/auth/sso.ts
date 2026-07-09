// SSO / SAML scaffolding (NEXT_100 #83)
// Pure helpers for SAML config validation and domain-to-tenant resolution.
// No live IdP integration — full SAML assertion validation is TODO (see below).
//
// TODO (before production SSO):
// 1. Integrate a SAML library (e.g. `@node-saml/node-saml` or `samlify`) to
//    parse and cryptographically verify SAML assertions in the callback route.
// 2. Implement SP-initiated redirect: generate AuthnRequest, sign it with the
//    SP private key, redirect to ssoUrl.
// 3. Parse the IdP response: decrypt NameID, validate NotBefore/NotOnOrAfter,
//    verify the XML signature against x509cert.
// 4. Map the SAML NameID (email) to a Supabase auth user; create if not exists.
// 5. Issue a Supabase session (use the admin API or a custom JWT).
// 6. Handle SLO (Single Logout) — optional but important for enterprise.
// 7. Rotate x509cert without downtime (overlapping cert window).

import type { Result } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SsoConfig {
  /** SAML EntityId of the IdP (e.g. https://accounts.google.com/...). */
  entityId: string;
  /** IdP SSO redirect URL. */
  ssoUrl: string;
  /** PEM or base-64 DER x509 certificate for signature verification. */
  x509cert: string;
  /** Email domain that maps to this config (e.g. "example.com"). */
  domain: string;
  /** Whether this config is active. */
  active?: boolean;
  /** Civic city_id this tenant belongs to. */
  cityId?: string | null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an SSO config shape.
 * Returns ok:true with the coerced config, or ok:false with an error message.
 */
export function parseSamlConfig(input: unknown): Result<SsoConfig> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "input_not_object" };
  }
  const obj = input as Record<string, unknown>;

  const entityId = typeof obj.entityId === "string" ? obj.entityId.trim() : "";
  if (!entityId) return { ok: false, error: "entityId is required" };

  const ssoUrl = typeof obj.ssoUrl === "string" ? obj.ssoUrl.trim() : "";
  if (!ssoUrl) return { ok: false, error: "ssoUrl is required" };
  try {
    const u = new URL(ssoUrl);
    if (u.protocol !== "https:") {
      return { ok: false, error: "ssoUrl must use HTTPS" };
    }
  } catch {
    return { ok: false, error: "ssoUrl is not a valid URL" };
  }

  const x509cert = typeof obj.x509cert === "string" ? obj.x509cert.trim() : "";
  if (!x509cert) return { ok: false, error: "x509cert is required" };
  // Basic sanity: must look like PEM or at least be non-empty base64
  const isValidCert =
    x509cert.includes("BEGIN CERTIFICATE") ||
    /^[A-Za-z0-9+/=\r\n]+$/.test(x509cert);
  if (!isValidCert) {
    return {
      ok: false,
      error: "x509cert does not look like a PEM certificate or base64 DER",
    };
  }

  const domain =
    typeof obj.domain === "string" ? obj.domain.trim().toLowerCase() : "";
  if (!domain) return { ok: false, error: "domain is required" };
  // Simple domain format check
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { ok: false, error: `domain '${domain}' is not a valid domain` };
  }

  return {
    ok: true,
    data: {
      entityId,
      ssoUrl,
      x509cert,
      domain,
      active: obj.active !== false,
      cityId: typeof obj.cityId === "string" ? obj.cityId : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Domain → tenant resolution
// ---------------------------------------------------------------------------

/**
 * Match an email address to a tenant SSO config by its domain.
 * Returns the first active config whose domain matches the email's domain,
 * or null if no match.
 */
export function matchDomainToTenant(
  email: string,
  configs: SsoConfig[],
): SsoConfig | null {
  const atIdx = email.lastIndexOf("@");
  if (atIdx < 0) return null;
  const emailDomain = email.slice(atIdx + 1).toLowerCase();
  for (const cfg of configs) {
    if (cfg.active === false) continue;
    if (cfg.domain === emailDomain) return cfg;
  }
  return null;
}
