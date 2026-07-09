# Loop State — Civic / Social Impact

Last run: 2026-07-08 (backlog sweep session)
Branch scanned: `main` @ e8280eb (PRs #9, #10, #11 all merged)

## High Priority (waiting on human)

- **Live DB is 8+ migrations behind the repo.** `20260707_024_city_config.sql`
  through `20260707_031_crew_types.sql` are authored, tested, and merged to
  main but NOT applied to the live database. Close-the-loop, DB routing,
  upvotes, api_keys, crews, and crew-types features all no-op or
  graceful-degrade against live until applied.
  - *Next action (human):* `DATABASE_URL='postgresql://…' node scripts/run-migrations.mjs`
    (DB password is not in the repo — owner-held).
  - *Effort:* 10 min + smoke test.

- **Email leg dead: Resend env unset.** `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`
  must be set (`NEXT_PUBLIC_SITE_URL` exists in `.env.local`). Resolution
  emails + CSAT loop silently skip until then.

- **Golden-set eval blocked on photos.** `tests/golden/images/` is empty;
  manifest + runner (`pnpm eval`) exist. Owner must supply labeled photos.
  Gates: category ≥85%, severity ±1 ≥90%, emergency FNR ≤5%.

## Watch List

- **ADR 0002 marked Accepted (segment A: US small cities, Open311-first)**
  during the 2026-07-08 sweep, on the strength of the owner's "do all of it"
  directive. Revert to Proposed if that read is wrong — landing copy and
  priority ordering downstream depend on it.
- **Two `023_*` migrations** (`cost_prediction`, `photo_phash`) share a number.
  Runner sorts lexicographically so both apply, but the next migration author
  should not reuse numbers.
- **Live-DB drift pattern.** DB needed manual reconcile migration 021 on
  6-30. The 024–031 batch is the biggest single apply yet — run against a
  shadow DB first per BUILD_PLAN verification gates.

## Resolved since last run (2026-07-01)

- CI gate exists and runs green (`test` workflow, node 22 / pnpm 11).
- `civic-ahilyanagar` divergence: superseded — its features were rebuilt on
  main via the sidebar-shell line (PR #9).
- Issue #6 (data-driven issue types): closed by migration 027 + issue_types
  work in PR #9.

---
Run log: 2026-07-08 — PRs #10/#11 merged; backlog sweep branch `feat/backlog-sweep` carries EXIF strip, SLA due_at, a11y, supercluster, zone routing, landing reposition.
