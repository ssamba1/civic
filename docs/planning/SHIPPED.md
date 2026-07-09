# Shipped — PR index

Chronological record of what landed, newest last. Complements `STATE.md`
(current status) and `REVAMP_PLAN.md` (the audit backlog).

| PR | Branch | Summary |
|---|---|---|
| #9 | sidebar-shell | Onboarding merge, close-the-loop, DB-backed team routing, route-tree unification, CSP hash strategy |
| #10 | loop-timeline-deflection | Real resident timelines from `report_updates`; pre-submit duplicate deflection (LCP-19) |
| #11 | crew-types-ai | Per-city crew types + AI-driven crew assignment (migration 031) |
| #12 | backlog-sweep | EXIF strip (LCP-20), api-key scopes (DA-01), SLA due_at + escalation (LCP-16, migration 032), zone-polygon routing (LCP-15, migration 033), a11y focus traps + 44px (LCP-21), landing reposition (3.2), supercluster (LCP-17), ADR 0002 accepted |
| #13 | backlog-sweep-2 | 30 solo items: Open311 lib/db/blur/derive tests, city-config RLS, token + service-definition routes, `expected_datetime`, a11y dot labels, `audit:privacy` script, dead-code deletion, currency `formatLocalDate` + `useCurrency` adoption, staff assistant tools (HAW-03 slice 1), cross-jurisdiction routing (DA-02, migration 034) |
| #14 | backlog-sweep-3 | 40 solo items: +188 unit tests (15 lib modules); Open311 shared HTTP helpers + `.json` rewrites + public-route rate limits; admin/auth rate limits; CI e2e + audit steps + `tsx` dep; ADRs 0003–0008; 4 runbooks; report-detail currency; seed idempotency + `--dry-run`; eval `--mock` |

## Migrations authored (apply order)

024 city_config · 025 close_the_loop · 026 team_routing · 027 upvotes_issue_types ·
028 api_keys · 029 member_phone · 030 crews · 031 crew_types · 032 sla_due_dates ·
033 routing_zones · 034 cross_jurisdiction.

All idempotent + RLS-tested. **Not applied to the live DB by the agent**
(`DATABASE_URL` owner-held) — apply against a shadow DB first.

## Owner-blocked follow-ups

See `STATE.md` → "High Priority": apply migrations, set Resend env, supply
golden photos, run the browser/Lighthouse a11y pass.
