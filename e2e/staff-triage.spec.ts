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

test("POST /api/admin/sla-escalate is auth-gated (401 without a session)", async ({
  request,
}) => {
  const res = await request.post("/api/admin/sla-escalate");
  // No session + no cron bearer → rejected (401). Never 200 to anon.
  expect([401, 403]).toContain(res.status());
});

test("POST /api/admin/notify-drain is auth-gated (401 without a session)", async ({
  request,
}) => {
  // The email outbox drain (LCP-05) mirrors sla-escalate's auth: no session and
  // no NOTIFY_CRON_SECRET bearer → rejected, never a 200 that would let anon
  // trigger a resend sweep.
  const res = await request.post("/api/admin/notify-drain");
  expect([401, 403]).toContain(res.status());
});

test("POST /api/admin/notify-drain rejects a wrong bearer token", async ({
  request,
}) => {
  const res = await request.post("/api/admin/notify-drain", {
    headers: { authorization: "Bearer not-the-secret" },
  });
  expect([401, 403]).toContain(res.status());
});
