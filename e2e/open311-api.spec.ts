import { expect, test } from "playwright/test";

/**
 * Open311 GeoReport v2 API smoke (B16). Pure HTTP, no UI, no data mutation, no
 * live partner, so it's stable regardless of seed state or feature flags.
 * Asserts the public GET surface plus the auth guard on POST.
 */

test("GET /services returns a JSON service list", async ({ request }) => {
  const res = await request.get("/api/open311/v2/services");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body.length).toBeGreaterThan(0);
  expect(body[0]).toHaveProperty("service_code");
  expect(body[0]).toHaveProperty("service_name");
});

test("GET /services?format=xml negotiates XML", async ({ request }) => {
  const res = await request.get("/api/open311/v2/services?format=xml");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("xml");
  expect(await res.text()).toContain("<services>");
});

test("GET /services/[service_code] returns a definition, 404s unknown", async ({
  request,
}) => {
  const ok = await request.get("/api/open311/v2/services/pothole");
  expect(ok.ok()).toBeTruthy();
  expect(await ok.json()).toMatchObject({ service_code: "pothole" });

  const missing = await request.get("/api/open311/v2/services/not_a_service");
  expect(missing.status()).toBe(404);
});

test("GET /requests returns a service-request array", async ({ request }) => {
  const res = await request.get("/api/open311/v2/requests");
  expect(res.ok()).toBeTruthy();
  expect(Array.isArray(await res.json())).toBe(true);
});

test("GET /tokens/[token] 404s an unknown token", async ({ request }) => {
  const res = await request.get(
    "/api/open311/v2/tokens/00000000-0000-4000-8000-000000000000",
  );
  expect(res.status()).toBe(404);
});

test("POST /requests without an api_key is rejected 401", async ({
  request,
}) => {
  const res = await request.post("/api/open311/v2/requests", {
    form: { service_code: "pothole", lat: "34.2", long: "-84.1" },
  });
  expect(res.status()).toBe(401);
});

test("canonical .json URLs resolve (proxy rewrite → ?format=json)", async ({
  request,
}) => {
  const services = await request.get("/api/open311/v2/services.json");
  expect(services.ok()).toBeTruthy();
  expect(Array.isArray(await services.json())).toBe(true);

  const def = await request.get("/api/open311/v2/services/pothole.json");
  expect(def.ok()).toBeTruthy();
  expect(await def.json()).toMatchObject({ service_code: "pothole" });

  const requests = await request.get("/api/open311/v2/requests.json");
  expect(requests.ok()).toBeTruthy();
  expect(Array.isArray(await requests.json())).toBe(true);
});

test("GET /requests?jurisdiction_id filters without error", async ({
  request,
}) => {
  const res = await request.get(
    "/api/open311/v2/requests?jurisdiction_id=cumming.ga.us",
  );
  expect(res.ok()).toBeTruthy();
  expect(Array.isArray(await res.json())).toBe(true);
});

test("GET /requests?status rejects an invalid status with 400", async ({
  request,
}) => {
  const res = await request.get("/api/open311/v2/requests?status=bogus");
  expect(res.status()).toBe(400);
});
