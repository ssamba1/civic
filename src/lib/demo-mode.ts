/* ------------------------------------------------------------------
   Demo-mode switch, one flag, two deployments.

   NEXT_PUBLIC_DEMO_MODE is inlined at build time, and each Vercel
   project builds separately, so the same repo produces two builds:
     - civic-city-demo  (unset / "1") → synthetic corpus, mock analytics,
       demo personas, demo overlay. The hackathon demo experience.
     - civic-testing    ("0")         → everything live: only real
       Supabase rows, real auth, empty dashboards until data arrives.

   Default is ON so existing deployments keep demo behavior unchanged.
   ------------------------------------------------------------------ */

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "0";

// Cross-links for the environment switch button, set per deployment.
//
// These used to carry hardcoded fallbacks naming two specific Vercel
// deployments. EnvSwitch renders in the resident nav on every build, so any
// deployment that had not overridden them showed a viewer a button that
// navigated them off this install entirely. Onto someone else's. A
// single-deployment install is the normal case, and a cross-link with no
// counterpart is worse than an absent one, so unset now means undefined and
// EnvSwitch renders nothing.
export const DEMO_SITE_URL = process.env.NEXT_PUBLIC_DEMO_SITE_URL || undefined;
export const TESTING_SITE_URL =
  process.env.NEXT_PUBLIC_TESTING_SITE_URL || undefined;
