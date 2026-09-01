// SSO SAML callback route, scaffold only (NEXT_100 #83).
//
// TODO (required before enabling production SSO):
// 1. Parse the `SAMLResponse` from the POST body (URL-decoded base64 XML).
// 2. Load the matching SsoConfig from sso_configs (by entityId in the assertion).
// 3. Validate the XML signature against x509cert using @node-saml/node-saml
//    or samlify (do NOT roll your own XML signature verification).
// 4. Extract the NameID (email) and verify NotBefore / NotOnOrAfter timestamps.
// 5. Look up the user in Supabase by email; create if missing (with city scoping).
// 6. Exchange for a Supabase session and set the auth cookie.
// 7. Redirect to the staff dashboard for the matched city.
// 8. Implement state parameter (CSRF) to prevent open-redirect attacks.
// 9. Log assertion failures to Sentry for monitoring.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "sso_not_enabled",
      message:
        "SSO is scaffolded but not yet enabled. Full SAML assertion validation " +
        "must be implemented before this endpoint can process login responses. " +
        "See src/app/auth/sso/callback/route.ts for the implementation checklist.",
    },
    { status: 501 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: "sso_not_enabled",
      message:
        "SSO is scaffolded but not yet enabled. Full SAML assertion validation " +
        "must be implemented before this endpoint can process login responses. " +
        "See src/app/auth/sso/callback/route.ts for the implementation checklist.",
    },
    { status: 501 },
  );
}
