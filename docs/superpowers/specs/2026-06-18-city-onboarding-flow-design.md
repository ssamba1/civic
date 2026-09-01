# City Onboarding Flow — Design Spec

**Date:** 2026-06-18
**Status:** Approved design, pending implementation plan
**Topic:** Self-serve onboarding wizard that provisions a new city tenant, its teams, its report→team routing, and real staff accounts.

---

## 1. Goal

Let a municipality self-onboard from the landing page: define their city, choose/rename which teams they run, confirm how report categories route to those teams, add their staff roster, and have the app provision real Supabase auth accounts with generated credentials. The new city is immediately usable by its own staff at `/city/[slug]` but is not added to the public marketing showcase.

## 2. Locked product decisions

| Fork | Decision |
|------|----------|
| Real vs demo | **Real provisioning** — writes a `cities` row and creates real Supabase auth accounts. |
| Teams model | **Toggle + rename presets** — city enables which of the 12 built-in teams it runs and renames them; stored per-city in DB. No engine rewrite. |
| Roster granularity | **Admin chooses** — either one login **per person** (individual accounts, full audit trail) or one shared login **per team** (one account per enabled team, shared by the crew). Either/or for the whole roster, not mixed. |
| Credential delivery | **Admin chooses** — email invite (`inviteUserByEmail`) when SMTP is configured, otherwise temp password shown once + CSV export. |
| Entry & activation | **Self-serve, unlisted tenant** — creator becomes the city admin; city is live for its own staff at `/city/[slug]` but absent from the hardcoded `MUNICIPALITIES` showcase. |
| Geography | **Geocode name → center point**; precise boundary polygon deferred. |
| Step 0 auth | **Reuse existing `/login`** (Supabase email/password + Google) with redirect back to `/onboard`. |

## 3. Verified codebase reality (do not re-assume)

- **Real Supabase auth + DB.** Not mock. `cities`, `users` (roles: resident, staff_dispatcher, staff_supervisor, admin), `reports`, `work_orders`, `classifications` tables exist (`supabase/migrations/20260527_001_initial_schema.sql`).
- **`/city/[slug]` is DB-aware.** [`src/app/city/[slug]/page.tsx:60-68`](../../../src/app/city/%5Bslug%5D/page.tsx) tries `fetchCityFromDb(slug)` first, falls back to mock, 404s only if both miss. A DB-created city resolves at its URL. `generateStaticParams` pre-builds only `KNOWN_CITIES`, so new cities render on-demand (acceptable).
- **Account-creation pattern exists.** `supabase/seed/index.ts` already does `auth.admin.createUser({ email, password })` with `randomBytes` passwords — the template for the provisioning engine. Requires the **service-role key** (server-only).
- **Two disconnected routing layers** (the critical finding):
  - *Operational:* report → AI classify → `generateWorkOrder` (`src/lib/ai/work-order-rules.ts`, `RULES`) writes `work_orders.department` (4 departments: public_works, utilities, parks, sanitation) + crew/cost. The staff inbox (`src/app/staff/page.tsx:22-55`, since removed with the `/staff` UI) read `work_orders` by priority and **never called `categoryToTeam`** — the disconnect this section is about. The team views under [`src/app/city/[slug]/`](../../../src/app/city/%5Bslug%5D/) are what replaced it.
  - *Console:* `/city/[slug]` groups/delegates reports via `categoryToTeam` (12 teams), persisted **only to localStorage** (`src/lib/category-overrides.ts`, `src/lib/teams-overrides.ts`). The code comment at `category-overrides.ts:28-30` explicitly anticipates swapping localStorage for a Supabase `routing_overrides` table.
- **`MUNICIPALITIES`** (`src/lib/dashboard-data.ts`) is a hardcoded array driving the public city switcher — independent of the DB. Onboarded cities will not appear there, which is the desired "unlisted" behavior.
- **Teams** (`src/lib/teams.ts`) are compile-time global constants with no `city_id`. `users` has `city_id` + `role` but **no team field**.

## 4. Architecture

**Approach: thin DB + read-boundary reconciliation.** A new `/onboard` route runs a client step-machine (same pattern as `src/app/report/page.tsx`). All real provisioning runs in **server actions** with the service-role key — never on the client. Schema additions are minimal; existing readers change as little as possible.

Rejected alternative: a full city-context refactor threading async per-city config through all 12 `categoryToTeam` consumers and the AI pipeline. Correct long-term, too heavy for v1, and incompatible with the chosen preset-toggle model.

### 4.1 Routing reconciliation (the honest core)

The "auto-routing" step must control real behavior, not a per-browser localStorage toy. Resolution:

1. **Persist** enabled-teams + category→team mapping to a DB table per city (the swap `category-overrides.ts` already anticipates).
2. **Keep** `RULES` as the AI's cost/crew/time *estimation* — `department` becomes an estimation bucket, not the routing unit.
3. **Derive team ownership at the staff-inbox read boundary:** each work order already carries `classification.category`; compute its owning team from the city's configured map. The city's routing choices now drive what staff see operationally. `department` stays for cost; `team` becomes the routing/ownership unit shared by inbox + console.

This makes the routing step genuinely real via a small additive change to the inbox, rather than a rewrite.

### 4.2 Wizard steps

| # | Step | Behavior |
|---|------|----------|
| 0 | Account | Unauthenticated visitor → existing `/login` (email/password + Google) with `redirect=/onboard`. Authenticated user becomes the city admin. |
| 1 | City | Name + state → slug auto-derived → geocode to center lat/lng. Boundary deferred. |
| 2 | Teams | Toggle which of 12 presets the city runs; rename them. Persisted per-city. |
| 3 | Routing | Review/adjust category→team map (defaults derived from enabled presets). DB-backed. |
| 4 | Roster | First pick **granularity**: per-person or shared-per-team. **Per-person** → add staff rows (name, email, role, team). **Shared-per-team** → for each enabled team, one account is generated (one email/credential per team; default role `staff_supervisor`); no individual rows. Then pick **delivery mode** (invite vs temp-password+CSV). |
| 5 | Review & provision | Summary → "Create city" → provisioning server action → redirect to `/city/[slug]`. |

**Resumability:** city + config saved as a **draft** (`active=false`) progressively. Auth accounts are created **only** at step 5 (the irreversible external action), so an abandoned wizard leaves a draft city but never orphan accounts.

## 5. Data model changes

- `cities`: insert row — name, state, slug, center point, `active`, `created_by` (admin user id). Table exists; add columns only if `created_by`/center are missing.
- **New `city_teams`** (or equivalent): `city_id`, `team_key` (preset id), `label_override`, `enabled`, per-city category mapping. Stores team config + routing. Schema-shaped so fully-custom teams can be added later without churn.
- `users`: **add `team_key`** (nullable) — staff↔team assignment. In **shared-per-team** mode the account *is* the team: `team_key` set, `role = staff_supervisor`, one user row per enabled team. In **per-person** mode each row is an individual with their own `team_key` + role. An optional `is_shared` flag (or inferring it from one-user-per-team) lets the UI label shared accounts.
- Make the `/city/[slug]` console read this config from DB (swap localStorage path). Make the staff inbox compute each work order's team from `classification.category` + city config (additive, low risk).

## 6. Provisioning engine (server action) + safety

- **Service-role key** server-only; confirm it is set in the deployed Vercel env and is **not** `NEXT_PUBLIC_*`. If absent, real provisioning cannot ship — surface this as a prerequisite.
- **Email collisions:** a roster email may already exist in `auth.users` (existing resident, other-city staff, the admin's own email, duplicates in the list). `createUser` fails on duplicates → dedup the list and define skip/link/error behavior per row.
- **Partial-batch failure:** city insert + N account creations + N invites is non-transactional across the Auth API and Postgres. Per-account try/catch; report exactly which rows succeeded; make retry idempotent (don't double-create on re-run). The repo ships a `silent-failure-hunter` reviewer — this path must not swallow errors.
- **Role bootstrap vs RLS:** a fresh signup is a `resident`. Elevating them to their new city's `admin` and setting `city_id` is a privilege elevation that RLS will block from the client — it must happen inside the service-role server action. Handle the onboarder who already has an account and/or an existing city.
- **Authz:** validate the authenticated session inside the provisioning action before any write. Consider a per-account cap on cities created to limit abuse (self-serve is ungated by design).
- **Shared-login trade-off (accountability):** a shared-per-team account collapses all actions (delegation events in `delegation-history.ts`, `work_orders.assigned_crew_id`) to a single team identity — no per-person audit trail, no per-person revocation, and the shared password is harder to rotate. This is an accepted, explicit trade chosen by the admin; surface a short warning in the wizard when shared mode is selected. Shared mode pairs most naturally with temp-password+CSV delivery.

## 7. Landing entry points

- Hero ([`src/components/landing/riven/ZampHero.tsx:234-245`](../../../src/components/landing/riven/ZampHero.tsx)): **replace** the primary "Report an issue" CTA with "Set up your city" → `/onboard` (keep the "See the live dashboard" ghost CTA). Citizens still reach `/report` via the footer. **(Done — primary CTA swapped; `/onboard` placeholder page added at `src/app/onboard/page.tsx`, to be replaced by the wizard.)**
- Footer ([`src/components/landing/riven/Footer.tsx:9-14`](../../../src/components/landing/riven/Footer.tsx)): repoint the existing "For cities" link from `/streets_roads/cumming` → `/onboard`. *(Pending.)*
- Note: removing the citizen "Report an issue" primary CTA pivots the hero toward city acquisition (B2G). The citizen report path remains reachable from the footer "Report" link.

## 8. v1 non-goals (explicit)

- Fully custom teams (presets only).
- Per-city AI department/crew `RULES` (stays global; team ownership is the configurable layer).
- Drawing/uploading a precise boundary polygon (geocoded center point only).
- Auto-listing onboarded cities in the public showcase (`MUNICIPALITIES` untouched).
- Super-admin approval surface (self-serve).

## 9. Testing approach

- Unit: slug derivation, geocode response handling, category→team default derivation from enabled presets, roster dedup/collision logic.
- Server action: provisioning happy path; partial-batch failure (account 3 of 5 fails) reports correct per-row status; idempotent retry; duplicate-email handling; role elevation only via service-role.
- Integration/manual: full wizard → new city resolves at `/city/[slug]`; staff inbox groups work orders by the city's configured teams; invited user can log in; temp-password user is forced to reset.
- Verify via the repo's established pattern: `next build` + `next start -p 3100`, then a Playwright script under `scripts/` (Playwright is a repo dep).

## 10. Implementation status (2026-06-18)

**Built on branch `feat/city-onboarding`.** Verified: `tsc --noEmit` ✓, `biome lint` ✓, `next build` ✓.

Files:
- `supabase/migrations/20260618_019_city_onboarding.sql` — `city_teams` table; `users.team_key` + `users.is_shared`; `cities.center` + `cities.created_by`; RLS select policy. **Must be applied** (`npm run db:migrate` / `supabase db push`) before the feature works against a real DB.
- `src/lib/onboarding/{types,presets,city-teams}.ts` — data contract, team presets + routing helpers, per-city team reader.
- `src/app/onboard/actions.ts` — `geocodeCity` (Nominatim) + `provisionCity` (service-role, saga-style compensation).
- `src/app/onboard/{page.tsx,onboard-wizard.tsx}` — auth-gated 6-step wizard + result screen (CSV export).
- Landing: hero CTA, footer link, footer CTA pills all repoint to `/onboard`.

Hardening applied from adversarial review (silent-failure-hunter + code-reviewer):
- City inserted `active:false`, flipped to `active:true` only after admin access is set; city is deleted (slug freed) if admin setup fails.
- Per-account saga compensation: a failed `public.users` insert deletes the orphaned auth user (no poison-pill retry).
- `city_teams` written via upsert (idempotent); failure surfaced as a non-fatal `warning`, not a fake success.
- Guard: an existing staff/admin can't silently lose their city by re-onboarding.
- Email normalized (lowercase) for dedup + storage; blank roster rows filtered client-side; result keys de-collisioned.
- Double-submit blocked (`disabled` on pending buttons).

## 11. Remaining follow-ups (explicitly deferred)

- **Consumer wiring (routing reconciliation):** `fetchCityTeams`/`resolveCategoryTeam` exist and are correct, but the staff inbox + `/city/[slug]` console still render the global team defaults. Wiring them to derive each work order's team from the city's `city_teams` config (and threading a team label through `work-order-row`) is the next integration. Until then, per-city routing config is persisted but not yet displayed in those surfaces.
- **`app_metadata.role` reconciliation (M2):** the `/admin/*` proxy guard reads `user.app_metadata.role`, which provisioning does not set (it sets `public.users.role`, which the staff console + RLS use). No `/admin` pages exist yet, so this is latent; reconcile before adding any.
- **Abuse throttling:** self-serve is ungated by product decision; add a per-account city cap / rate limit if abuse appears.
- **Email-invite delivery** depends on SMTP configured in the Supabase project; temp-password+CSV is the no-SMTP fallback.
- **Service-role key in prod:** confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel (server-only) — provisioning cannot run without it.

## 12. Open risks

- SMTP configuration in the Supabase project gates the email-invite delivery mode; temp-password mode is the fallback.
- The staff inbox currently reads `work_orders` against a separate operational corpus from the dashboard/console's report corpus; verify the team-derivation change presents consistently across both surfaces during implementation.
