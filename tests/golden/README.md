# Golden-set classification eval

Measures whether Civic's **production** classifier (the real prompt + schema in
`src/lib/ai/`) is *correct* — not just that the pipeline runs. Closes the D6 /
PR3 gap from `civic_research_findings.md`.

## Why this exists

`scripts/verify-classify.mjs` uploads a 1×1-pixel JPEG. It proves the pipeline
executes end-to-end; it measures **zero** accuracy. Meanwhile `is_emergency`
**auto-dispatches** a report ([classify-pipeline.ts](../../src/lib/ai/classify-pipeline.ts)),
so a missed emergency is a real liability event — and nothing measured the miss
rate. This harness does.

## Setup

1. Collect real infrastructure photos (potholes, downed signs, water leaks, …).
2. Drop them in `tests/golden/images/` (git-ignored — local data only).
3. Label each in `manifest.json`:

```json
{
  "samples": [
    { "image": "pothole-deep-01.jpg",
      "expected": { "category": "pothole", "severity": 4, "is_emergency": false } }
  ]
}
```

`category` must be one of the 12 in [classification-schema.ts](../../src/lib/ai/classification-schema.ts).
`severity` is your human ground-truth (1–5). `is_emergency` is your human label.

## Run

```bash
pnpm eval     # needs GEMINI_API_KEY (auto-loads .env.local)
```

Samples whose image file is missing are skipped (so the committed example
manifest is harmless until you add photos).

## Output

Console summary + `tests/golden/results.json`:

- **category accuracy** — exact-match rate
- **severity MAE** + **within ±1** — how close severity calls land
- **emergency recall / precision** and the headline **false-negative rate** —
  the share of real emergencies the model missed (auto-dispatch would never see them)
- **confidence calibration** — mean confidence when right vs. wrong

## Targets (suggested gates before quoting accuracy to a buyer)

| Metric | Floor |
|--------|-------|
| category accuracy | ≥ 85% |
| severity within ±1 | ≥ 90% |
| emergency false-negative rate | ≤ 5% (ideally 0) |

Aim for ≥ 30 labeled samples, ≥ 2 per category, before trusting the numbers.
