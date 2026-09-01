import { expect, test } from "playwright/test";

/**
 * Staff dashboard reachability smoke (B15). Asserts the staff-facing surfaces
 * render their shell without a crash. Full triage interactions (edit category,
 * assign crew, change status) mutate data + need a demo-auth session and seeded
 * rows, so they're covered by unit/integration tests rather than this smoke.
 */
test("/teams renders the department picker", async ({ page }) => {
  await page.goto("/teams");
  await expect(
    page.getByRole("heading", { name: /pick a department/i }),
  ).toBeVisible();
  // At least one team links through to a dashboard.
  expect(await page.getByRole("link").count()).toBeGreaterThan(0);
});

test("/city/cumming public dashboard loads without a client crash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto("/city/cumming");
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/Civic|Cumming/i);
  expect(errors).toEqual([]);
});

/**
 * Cron-bearer admin endpoints.
 *
 * Four routes take a shared `Authorization: Bearer <secret>` INSTEAD of a staff
 * session, so a systemd timer can drive them headlessly. That makes each one a
 * door with no session behind it, and the two things worth asserting over HTTP
 * are the same for all four: anon never gets a 2xx, and a wrong bearer is not
 * mistaken for a right one.
 *
 * Table-driven rather than four hand-written pairs, because the previous
 * hand-written version covered two of the four routes and only one of them for
 * a wrong bearer — and the two it missed (surge, drift) are the two whose auth
 * is written differently from the others. surge in particular allows via an
 * early `return null` from a helper, which is the shape most likely to fall
 * open under an edit.
 */
const CRON_BEARER_ROUTES = [
  {
    path: "/api/admin/sla-escalate",
    method: "post" as const,
    // Rewrites work-order priority and appends to report timelines.
    secret: "SLA_CRON_SECRET",
  },
  {
    path: "/api/admin/notify-drain",
    method: "post" as const,
    // Re-sends resident email (LCP-05). A 200 to anon is a resend sweep.
    secret: "NOTIFY_CRON_SECRET",
  },
  {
    path: "/api/admin/surge",
    method: "post" as const,
    // Applies a city-wide storm priority bump.
    secret: "STORM_CRON_SECRET",
  },
  {
    path: "/api/admin/drift",
    method: "get" as const,
    // Reads classification override rates (#37).
    secret: "DRIFT_CRON_SECRET",
  },
];

for (const route of CRON_BEARER_ROUTES) {
  test(`${route.method.toUpperCase()} ${route.path} is auth-gated (no session, no bearer)`, async ({
    request,
  }) => {
    const res = await request[route.method](route.path);
    expect([401, 403]).toContain(res.status());
  });

  test(`${route.method.toUpperCase()} ${route.path} rejects a wrong bearer token`, async ({
    request,
  }) => {
    // Not the value of process.env[route.secret], whatever that is here.
    const res = await request[route.method](route.path, {
      headers: { authorization: "Bearer not-the-secret" },
    });
    expect([401, 403]).toContain(res.status());
  });
}

test("GET /api/admin/surge is auth-gated too, not just POST", async ({
  request,
}) => {
  // surge is the only one of the four with a read verb, and its GET and POST
  // share a single authorize() helper — so a change that opens one opens both.
  const res = await request.get("/api/admin/surge");
  expect([401, 403]).toContain(res.status());
});
