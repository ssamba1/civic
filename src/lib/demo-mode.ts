/* ------------------------------------------------------------------
   Demo-mode switch — one flag, two deployments.

   NEXT_PUBLIC_DEMO_MODE is inlined at build time, and each Vercel
   project builds separately, so the same repo produces two builds:
     - civic-city-demo  (unset / "1") → synthetic corpus, mock analytics,
       demo personas, demo overlay — the hackathon demo experience.
     - civic-testing    ("0")         → everything live: only real
       Supabase rows, real auth, empty dashboards until data arrives.

   Default is ON so existing deployments keep demo behavior unchanged.
   ------------------------------------------------------------------ */

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "0";

// Cross-links for the environment switch button. Overridable per-project
// so preview deployments can point at each other if needed.
export const DEMO_SITE_URL =
  process.env.NEXT_PUBLIC_DEMO_SITE_URL ?? "https://civic-city-demo.vercel.app";
export const TESTING_SITE_URL =
  process.env.NEXT_PUBLIC_TESTING_SITE_URL ??
  "https://civic-testing.vercel.app";
