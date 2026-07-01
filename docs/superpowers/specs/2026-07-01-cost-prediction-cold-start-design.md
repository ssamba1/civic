# Cost Prediction — Cold Start → Learned Estimates

**Date:** 2026-07-01
**Status:** Design — reviewed ([issue #8](https://github.com/28gugales-dev/-Social-Impact-/issues/8)), decisions folded in
**Branch:** civic-ahilyanagar

## Problem

Today `work_orders.est_cost` is fabricated from a static rules table
(`estimateCost` in `src/lib/ai/work-order-rules.ts`: `labor_rate * minutes/60 +
material_cost`), optionally overwritten by a Gemini guess when `AI_WORK_ORDER=1`.
Neither is grounded in what repairs actually cost this city. It presents a
confident number with zero empirical backing.

We want the opposite honesty: **admit "unknown" until we have real data, then
learn from actuals — per city.**

## Goal

1. A category with too few completed jobs shows cost as **Unknown — not enough
   data**, not a fabricated number.
2. When a worker closes a job, capture the **actual cost** spent.
3. Once a category (in that city) has enough actuals, **predict** a new report's
   cost from them, adjusted for severity, with a **reliability score** so the
   number is never mistaken for certainty.

## Decisions (locked with user)

| Decision | Choice |
|---|---|
| Cold-start scope | **Per category**, **per city** — each (city, category) warms up independently |
| Minimum sample size (X) | **5** accepted actuals before predicting |
| Predictor | **Severity-weighted mean** |
| Outlier handling | **Reject** any actual `> 5×` the category's running median; flag for supervisor, exclude from training |
| Confidence | **Reliability score** 0–1 → Low / Medium / High; Low at n=5 |
| Freshness | **Compute live at read** — no frozen cost columns; unknown rows auto-upgrade |
| Currency | **Whole dollars, `numeric(12,2)`**, unit enforced at capture |
| Actual capture point | At **closeWorkOrder** (job completion) |

## Data model

New/changed columns (additive, `ADD COLUMN IF NOT EXISTS`, not auto-applied —
`npm run db:migrate`, matching the repo convention):

- `work_orders.actual_cost numeric(12,2)` — real spend in **whole dollars**,
  entered by the worker at close. Null until reported. **The only training
  signal.** `numeric(12,2)` pins the unit (no cents/dollars 100× ambiguity).
- `work_orders.actual_cost_excluded boolean NOT NULL DEFAULT false` — set true at
  capture when the value exceeds `5×` the category's running median (outlier).
  Training filters these out; a supervisor can clear the flag to re-admit.

**Not stored** (consequence of *compute-live*): no frozen `est_cost` /
`cost_reliability` / `n` for the prediction. The legacy `est_cost` column
(migration 010) is left in place but **the new cost display ignores it** — cost is
computed live from actuals at render. `wo_source` is likewise not used by the new
display.

Historical rows have `actual_cost = NULL` → excluded from training. At launch
every (city, category) is cold → everything reads "Unknown" until workers report
5 accepted closes. Intended.

## Training set (per city)

```
SELECT wo.actual_cost, c.severity, c.category, r.city_id
FROM work_orders wo
JOIN reports r         ON r.id = wo.report_id
JOIN classifications c ON c.report_id = r.id
WHERE wo.actual_cost IS NOT NULL
  AND wo.actual_cost_excluded = false
```

Grouped by `(r.city_id, c.category)`.

## Predictor — severity-weighted mean

Per (city, category) aggregate: `base = mean(actual_cost)`, `avgSev =
mean(severity)`, `stddev`, `n`. For a new report of severity `s`:

```
mult      = clamp(s / avgSev, 0.6, 1.8)         -- bound extrapolation
predicted = round(base * mult)
predicted = max(predicted, material_floor(C))   -- lower guardrail only
```

Requires `n >= 5`. Worked example — City A potholes, actuals `[80, 95, 98, 110,
130]`, sev `[2, 3, 3, 4, 3]`: base 102.6, avgSev 3.0 → sev-5 ≈ **$171**, sev-1 ≈
**$62**.

**Outlier rejection at capture:** when `actual > 5 * median(existing accepted
actuals in that city+category)`, store it with `actual_cost_excluded = true` and
flag for supervisor review — it never enters `base`. A `$60k` pothole typo is
rejected instead of moving base from $102 to $10,085.

## Reliability score

```
sampleConf     = n / (n + K)                 -- K = 10; saturates toward 1
CV             = stddev(actuals) / mean(actuals)
dispersionConf = clamp(1 - CV, 0, 1)
reliability    = sampleConf * dispersionConf         -- in [0, 1)
```

Tiers: `< 0.34` Low · `0.34–0.66` Medium · `≥ 0.66` High. At **n = 5**,
`sampleConf = 0.33` → **Low** regardless. Medium ≈ n10 (tight), High ≈ n20+.

## Delivery — one aggregate query, live

A set-returning RPC / view `category_cost_stats(_city_id uuid)` returns one row
per category for that city: `base, avg_severity, stddev, n, reliability, tier`.
The render layer (staff grid, work-order detail) calls it **once per page**, then
derives each report's `predicted` from its category row + the report's severity
(the `mult` clamp above). No per-row RPC fan-out; no frozen columns.

- `n < 5` → render **Unknown — not enough data (n/5)**.
- `n >= 5` → render **$predicted · reliability chip (n=N)**.

Because it's computed live, a row classified when the category had 4 actuals
**auto-upgrades** to a real number the moment the 5th accepted actual lands — no
re-classification, no stale "unknown".

RPC is `SECURITY DEFINER`, `SET search_path = public`, and **must be city-scoped**:
`EXECUTE` granted to `authenticated`/`service_role` but the function only ever
reads `_city_id`'s rows (callers pass `staff.city_id`; no cross-city enumeration).
Un-migrated-safe: a missing RPC makes the display fall back to "Unknown", never
throws (guarded like `bump_work_order_priority`).

## Capture flow changes

- `closeWorkOrder(workOrderId, resolutionPhotoUrl, actualCost)` — add `actualCost`.
  Validate: number, `> 0`, `<= 5_000_000` dollars, 2-decimal. Staff-role gated
  (already is). Compute the outlier flag vs the city+category running median,
  write `actual_cost` + `actual_cost_excluded`.
- Completion UI (`work-order-detail.tsx` close dialog): required **"Actual cost
  spent ($)"** input, `step=0.01`, dollar-labeled, client-validated.
- `fix_cost_estimate` (from `markUnderFix`) is the worker's *start* guess — **not**
  the training signal. Same `$` unit, documented.

## UI surfaces

- **Staff grid** (`work-order-grid`): Est Cost cell renders the two live states —
  "Unknown (n/5)" muted, or "$X" + a Low/Med/High reliability chip (chip label from
  the stats row's `tier`, not recomputed). NULL/unknown sorts last. Currency via
  `use-currency.ts`, never hardcoded `$`.
- **Work order detail**: same, plus the actual-cost input on close and an
  "outlier — pending review" note when `actual_cost_excluded`.

## Related existing bugs (verified in review — fix alongside or track separately)

These predate this feature; the predictor interacts with them:

- **[HIGH]** Emergencies short-circuit before `generateWorkOrder` → no work order,
  no priority, no cost, and can never contribute an actual. The `+50` emergency
  priority term is therefore dead. Decide: give emergencies a work order so they
  participate (recommended), or remove the dead term. (`classify-pipeline.ts:246-265`)
- **[MEDIUM]** `cost_accuracy_pct` compares `est_cost` vs `fix_cost_estimate` (start
  guess), not `actual_cost`. Repoint it to `actual_cost` once we capture it.
  (`20260616_017_baselines_and_metrics.sql:292-301`, `impact-export/route.ts:671`)
- **[MEDIUM]** AI `est_cost` has only `min(0)`, no ceiling — a hallucinated
  `999999` persists. Add an upper clamp if the AI path stays.
  (`work-order-schema.ts:40,79`, `work-order-ai.ts:123`)
- **[MEDIUM]** Legacy `est_cost` "floor" is replaced (not `Math.max`-ed) by the AI
  value. Moot for the new display (which ignores `est_cost`) but note if that path
  is kept for anything.

## Non-goals (YAGNI)

- Regression on multiple features (minutes, hazard radius, location). Severity
  ratio only for v1.
- Recency weighting / time decay of actuals.
- Cross-city / global blending.
- Currency other than USD.
