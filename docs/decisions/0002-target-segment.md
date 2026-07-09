# 0002 — Target segment: which customer Civic is for

- Status: **Accepted** (2026-07-08 — owner directed execution of the full
  backlog including the segment-A downstream work; revert to Proposed if that
  read is wrong)
- Date: 2026-07-07
- Branch: `feat/sidebar-shell`
- Scope: go-to-market focus and everything downstream of it — landing copy,
  outreach targeting, billing model, i18n/WhatsApp investment, and which
  deferred engineering (Open311 partner features vs. India readiness) gets
  built next.

---

## Context

The repo currently serves three different customers at once (REVAMP_PLAN 3.1,
MKT audit #1/#3), and each pull is real:

1. **US small cities (Open311)** — what the product is actually built as:
   Open311 GeoReport v2 conformance is a hard rule, the onboarding engine
   ingests TIGER boundaries + ArcGIS/Open311 feeds (US-shaped data sources),
   the pilot target is Cumming, GA, and docs/landing/leadgen all speak
   city-government language. ~19k municipal governments in the US; ACV at the
   $0.50–2/capita norm puts a Cumming-sized city at ~$4–16k/yr.
2. **HOAs / campuses / private communities** — the outreach CSV's
   highest-scoring leads. Faster sales cycle (no procurement), smaller ACV,
   no Open311 requirement at all. The audit called this the
   speed-to-revenue path.
3. **Ahilyanagar, India** — a live branch seeded a real Indian city with INR
   costs. Enormous TAM, but the product is ~zero-ready for it: English-only,
   no WhatsApp intake (the dominant Indian civic channel), US-state
   normalization in onboarding, and Open311 is irrelevant there (MKT #5).

Carrying all three is a tax on every decision: the landing page can't lead
with a sharp claim, outreach can't specialize, and engineering keeps paying
for surface area (e.g. the ₹83 hardcoded FX, US_STATE_ABBR tables, Open311
conformance) that at most one segment needs.

A related market fact (MKT #2): "only AI player" is dead — SeeClickFix/
CivicPlus shipped AI photo classification in Jan 2026. The surviving moat is
the **photo → costed work order → closed-loop resolution** automation, which
this branch just made real (close flow with actual-cost capture, resolution
photo, CSAT loop, DB-backed per-city routing).

## Options

**A. US small cities, Open311-first (recommended).**
The product as built. Open311 conformance + TIGER/ArcGIS onboarding are real
differentiators *only* in this segment — nowhere else do they matter. The
close-the-loop evidence (Boston 311: resolution photos → ~60% more reports)
is a city-government sales argument. Cons: slow procurement cycles;
venture-scale outcome requires many small ACVs or upmarket movement.

**B. HOA / campus wedge.**
Fastest first revenue; the same app minus Open311 works today (teams,
routing, cost model are tenant-generic). Cons: abandons both moats (Open311
conformance and the civic accountability story), fragments the demo/pitch,
and the outreach data suggests interest but not budget size.

**C. India (Ahilyanagar).**
Largest TAM, live civic pain, an existing seeded city. Cons: needs
Hindi/Marathi i18n, WhatsApp intake, non-TIGER boundaries, a different
monetization model, and none of the current moats apply. This is a different
product sharing a codebase.

## Recommendation

**A as the primary segment; B as an opportunistic design-partner side-door;
C parked.**

- Everything hard that's already built (Open311, TIGER onboarding, the loop,
  the cost model) compounds in A and only in A.
- B costs nothing to keep as a side-door: if an HOA/campus signs as a design
  partner, onboard them through the same wizard — do NOT build B-specific
  features or copy until one pays.
- C is parked, not killed: keep the Ahilyanagar branch as proof of
  boundary-agnostic onboarding, but no i18n/WhatsApp investment until A has a
  paying reference city. If the owner's actual ambition is India-first, this
  ADR should be rejected explicitly and 3.4's checklist (i18n, WhatsApp,
  non-US onboarding) becomes the roadmap instead.

## Consequences (once Accepted)

- Landing/outreach reposition (REVAMP 3.2) leads with photo→costed-work-order
  automation for US city operations; classification becomes a feature line.
- Billing model (3.5) prices per-capita against US municipal norms.
- India-readiness (3.4) drops off the roadmap; the ₹/INR paths and any
  India-specific seeds are demo assets only.
- Open311 partner features (api_keys rotation UI, service-request-updates
  feed) rise in priority; they are segment-A table stakes.
- The golden-set eval (3.12) becomes a sales asset: publish category/severity
  accuracy + emergency FNR as buyer-quotable numbers.
